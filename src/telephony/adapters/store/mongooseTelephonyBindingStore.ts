import mongoose from 'mongoose';

import { connectMongo } from '../../../db/mongoose.js';
import { logger } from '../../../lib/logger.js';
import { normalizeE164 } from '../../core/e164.js';
import {
    getBindingModel,
    type TelephonyBindingDocument,
} from '../../../models/telephonyBindingModel.js';
import { AgentConfigSchema } from '../../../types/index.js';
import type { AgentConfig } from '../../../types/index.js';
import type {
    StoredBinding,
    TelephonyBindingStorePort,
    UpsertBindingInput,
} from '../../ports/telephonyBindingStorePort.js';

function toStoredBinding(row: TelephonyBindingDocument): StoredBinding {
    let agentConfig: AgentConfig | null = null;
    if (row.agentConfig != null) {
        const parsed = AgentConfigSchema.safeParse(row.agentConfig);
        if (parsed.success) {
            agentConfig = parsed.data;
        } else {
            logger.warn(
                { event: 'telephony.binding.invalid_agent_config', bindingId: row._id.toString() },
                'Stored agentConfig failed validation, treating as null'
            );
        }
    }

    return {
        id: row._id.toString(),
        integrationId: row.integrationId.toString(),
        provider: row.provider,
        providerNumberId: row.providerNumberId,
        e164: row.e164,
        agentId: row.agentId,
        agentConfig,
        enabled: row.enabled,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

export class MongooseTelephonyBindingStore implements TelephonyBindingStorePort {
    async upsertBinding(input: UpsertBindingInput): Promise<StoredBinding> {
        await connectMongo();
        const Binding = getBindingModel();

        const e164 = normalizeE164(input.e164);

        const row = await Binding.findOneAndUpdate(
            { e164, deletedAt: null },
            {
                $set: {
                    integrationId: new mongoose.Types.ObjectId(input.integrationId),
                    provider: input.provider,
                    providerNumberId: input.providerNumberId,
                    agentId: input.agentId ?? null,
                    agentConfig: input.agentConfig ?? null,
                    enabled: true,
                },
            },
            { new: true, upsert: true, runValidators: true }
        ).lean<TelephonyBindingDocument>();

        return toStoredBinding(row!);
    }

    async getBindingByE164(e164: string): Promise<StoredBinding | null> {
        await connectMongo();
        const Binding = getBindingModel();

        const row = await Binding.findOne({
            e164,
            enabled: true,
            deletedAt: null,
        }).lean<TelephonyBindingDocument>();

        if (!row) return null;
        return toStoredBinding(row);
    }

    async getBindingById(id: string): Promise<StoredBinding | null> {
        await connectMongo();
        const Binding = getBindingModel();

        if (!mongoose.Types.ObjectId.isValid(id)) return null;
        const _id = new mongoose.Types.ObjectId(id);

        const row = await Binding.findOne({
            _id,
            deletedAt: null,
        }).lean<TelephonyBindingDocument>();

        if (!row) return null;
        return toStoredBinding(row);
    }

    async listBindings(): Promise<StoredBinding[]> {
        await connectMongo();
        const Binding = getBindingModel();

        const rows = await Binding.find({ deletedAt: null })
            .sort({ updatedAt: -1 })
            .lean<TelephonyBindingDocument[]>();

        return rows.map(toStoredBinding);
    }

    async disableBinding(id: string): Promise<boolean> {
        await connectMongo();
        const Binding = getBindingModel();

        if (!mongoose.Types.ObjectId.isValid(id)) return false;
        const _id = new mongoose.Types.ObjectId(id);

        const res = await Binding.updateOne(
            { _id, deletedAt: null },
            { $set: { enabled: false } }
        );
        return res.modifiedCount > 0;
    }
}
