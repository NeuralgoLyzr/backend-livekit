import mongoose from 'mongoose';

import { connectMongo } from '../../../db/mongoose.js';
import { normalizeE164 } from '../../core/e164.js';
import {
    getBindingModel,
    type TelephonyBindingDocument,
} from '../../../models/telephonyBindingModel.js';
import type {
    StoredBinding,
    TelephonyBindingStorePort,
    UpsertBindingInput,
} from '../../ports/telephonyBindingStorePort.js';

function toStoredBinding(row: TelephonyBindingDocument): StoredBinding {
    return {
        id: row._id.toString(),
        integrationId: row.integrationId.toString(),
        provider: row.provider,
        providerNumberId: row.providerNumberId,
        e164: row.e164,
        agentId: row.agentId,
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
                    enabled: true,
                },
            },
            { new: true, upsert: true, runValidators: true }
        ).lean<TelephonyBindingDocument>();

        return toStoredBinding(row);
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

    async listBindingsByIntegrationId(integrationId: string): Promise<StoredBinding[]> {
        await connectMongo();
        const Binding = getBindingModel();

        if (!mongoose.Types.ObjectId.isValid(integrationId)) return [];
        const _integrationId = new mongoose.Types.ObjectId(integrationId);

        const rows = await Binding.find({
            integrationId: _integrationId,
            deletedAt: null,
        })
            .sort({ updatedAt: -1 })
            .lean<TelephonyBindingDocument[]>();

        return rows.map(toStoredBinding);
    }

    async deleteBinding(id: string): Promise<boolean> {
        await connectMongo();
        const Binding = getBindingModel();

        if (!mongoose.Types.ObjectId.isValid(id)) return false;
        const _id = new mongoose.Types.ObjectId(id);

        const res = await Binding.deleteOne({ _id, deletedAt: null });
        return res.deletedCount > 0;
    }
}
