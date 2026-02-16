import mongoose from 'mongoose';

import { connectMongo } from '../../../db/mongoose.js';
import {
    getIntegrationModel,
    type TelephonyIntegrationDocument,
} from '../../../models/telephonyIntegrationModel.js';
import type {
    CreateIntegrationInput,
    StoredIntegration,
    TelephonyIntegrationStorePort,
    TelephonyProvider,
} from '../../ports/telephonyIntegrationStorePort.js';

function toStoredIntegration(row: TelephonyIntegrationDocument): StoredIntegration {
    return {
        id: row._id.toString(),
        provider: row.provider,
        name: row.name,
        apiKeyFingerprint: row.apiKeyFingerprint,
        status: row.status,
        providerResources: row.providerResources,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

export class MongooseTelephonyIntegrationStore implements TelephonyIntegrationStorePort {
    async create(input: CreateIntegrationInput): Promise<StoredIntegration> {
        await connectMongo();
        const Integration = getIntegrationModel();

        const created = await Integration.create({
            provider: input.provider,
            name: input.name ?? null,
            encryptedApiKey: input.encryptedApiKey,
            apiKeyFingerprint: input.apiKeyFingerprint,
            status: 'active',
            providerResources: {},
            deletedAt: null,
        });

        return toStoredIntegration(created.toObject() as TelephonyIntegrationDocument);
    }

    async getById(
        id: string
    ): Promise<(StoredIntegration & { encryptedApiKey: string }) | null> {
        await connectMongo();
        const Integration = getIntegrationModel();

        if (!mongoose.Types.ObjectId.isValid(id)) return null;
        const _id = new mongoose.Types.ObjectId(id);

        const row = await Integration.findOne({
            _id,
            deletedAt: null,
            status: 'active',
        }).lean<TelephonyIntegrationDocument>();
        if (!row) return null;

        return {
            ...toStoredIntegration(row),
            encryptedApiKey: row.encryptedApiKey,
        };
    }

    async updateProviderResources(
        id: string,
        resources: Record<string, unknown>
    ): Promise<StoredIntegration | null> {
        await connectMongo();
        const Integration = getIntegrationModel();

        if (!mongoose.Types.ObjectId.isValid(id)) return null;
        const _id = new mongoose.Types.ObjectId(id);

        const updated = await Integration.findOneAndUpdate(
            { _id, deletedAt: null },
            { $set: { providerResources: resources } },
            { new: true, runValidators: true }
        ).lean<TelephonyIntegrationDocument>();

        if (!updated) return null;
        return toStoredIntegration(updated);
    }

    async deleteById(id: string): Promise<boolean> {
        await connectMongo();
        const Integration = getIntegrationModel();

        if (!mongoose.Types.ObjectId.isValid(id)) return false;
        const _id = new mongoose.Types.ObjectId(id);

        const res = await Integration.deleteOne({ _id, deletedAt: null });
        return res.deletedCount > 0;
    }

    async listByProvider(provider: TelephonyProvider): Promise<StoredIntegration[]> {
        await connectMongo();
        const Integration = getIntegrationModel();

        const rows = await Integration.find({ provider, deletedAt: null, status: 'active' })
            .sort({ updatedAt: -1 })
            .lean<TelephonyIntegrationDocument[]>();

        return rows.map(toStoredIntegration);
    }
}
