import { beforeEach, describe, expect, it, vi } from 'vitest';

type IntegrationRow = {
    _id: { toString(): string };
    orgId: string;
    provider: 'telnyx' | 'twilio' | 'plivo';
    name: string | null;
    encryptedApiKey: string;
    apiKeyFingerprint: string;
    status: 'active' | 'disabled';
    providerResources: Record<string, unknown>;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

type BindingRow = {
    _id: { toString(): string };
    orgId: string;
    integrationId: { toString(): string };
    provider: string;
    providerNumberId: string;
    e164: string;
    agentId: string | null;
    enabled: boolean;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

type Query<T> = {
    sort: (value: unknown) => Query<T>;
    lean: () => Promise<T>;
};

const connectMongo = vi.fn().mockResolvedValue(undefined);

const IntegrationModel = {
    create: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn(),
    find: vi.fn(),
};

const BindingModel = {
    findOneAndUpdate: vi.fn(),
    findOne: vi.fn(),
    find: vi.fn(),
    deleteOne: vi.fn(),
};

vi.mock('../src/db/mongoose.js', () => ({ connectMongo }));
vi.mock('../src/models/telephonyIntegrationModel.js', () => ({
    getIntegrationModel: () => IntegrationModel,
}));
vi.mock('../src/models/telephonyBindingModel.js', () => ({
    getBindingModel: () => BindingModel,
}));

describe('telephony mongoose stores enforce org scope', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('scopes integration queries by orgId', async () => {
        const now = new Date();
        const row: IntegrationRow = {
            _id: { toString: () => '507f1f77bcf86cd799439011' },
            orgId: 'org-a',
            provider: 'telnyx',
            name: 'Tenant A',
            encryptedApiKey: 'enc',
            apiKeyFingerprint: 'fp',
            status: 'active',
            providerResources: {},
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
        };

        const findQuery: Query<IntegrationRow[]> = {
            sort: vi.fn(() => findQuery),
            lean: vi.fn(async () => [row]),
        };
        IntegrationModel.find.mockReturnValue(findQuery);
        IntegrationModel.findOne.mockReturnValue({ lean: vi.fn(async () => row) });
        IntegrationModel.findOneAndUpdate.mockReturnValue({ lean: vi.fn(async () => row) });
        IntegrationModel.deleteOne.mockResolvedValue({ deletedCount: 1 });
        IntegrationModel.create.mockResolvedValue({
            toObject: () => row,
        });

        const { MongooseTelephonyIntegrationStore } = await import(
            '../src/telephony/adapters/store/mongooseTelephonyIntegrationStore.js'
        );
        const store = new MongooseTelephonyIntegrationStore();

        await store.listByProvider('telnyx', { orgId: 'org-a' });
        await store.getById('507f1f77bcf86cd799439011', { orgId: 'org-a' });
        await store.updateProviderResources(
            '507f1f77bcf86cd799439011',
            { trunkSid: 'trunk_1' },
            { orgId: 'org-a' }
        );
        await store.deleteById('507f1f77bcf86cd799439011', { orgId: 'org-a' });

        expect(IntegrationModel.find).toHaveBeenCalledWith({
            orgId: 'org-a',
            provider: 'telnyx',
            deletedAt: null,
            status: 'active',
        });
        expect(IntegrationModel.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-a',
                deletedAt: null,
                status: 'active',
            })
        );
        expect(IntegrationModel.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-a',
                deletedAt: null,
            }),
            expect.any(Object),
            expect.any(Object)
        );
        expect(IntegrationModel.deleteOne).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-a',
                deletedAt: null,
            })
        );
        expect(connectMongo).toHaveBeenCalled();
    });

    it('scopes binding write/read/delete queries by orgId', async () => {
        const now = new Date();
        const row: BindingRow = {
            _id: { toString: () => '507f1f77bcf86cd799439012' },
            orgId: 'org-a',
            integrationId: { toString: () => '507f1f77bcf86cd799439011' },
            provider: 'telnyx',
            providerNumberId: 'pn_1',
            e164: '+15551234567',
            agentId: null,
            enabled: true,
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
        };

        const findQuery: Query<BindingRow[]> = {
            sort: vi.fn(() => findQuery),
            lean: vi.fn(async () => [row]),
        };
        BindingModel.find.mockReturnValue(findQuery);
        BindingModel.findOneAndUpdate.mockReturnValue({ lean: vi.fn(async () => row) });
        BindingModel.findOne.mockReturnValue({ lean: vi.fn(async () => row) });
        BindingModel.deleteOne.mockResolvedValue({ deletedCount: 1 });

        const { MongooseTelephonyBindingStore } = await import(
            '../src/telephony/adapters/store/mongooseTelephonyBindingStore.js'
        );
        const store = new MongooseTelephonyBindingStore();

        await store.upsertBinding({
            orgId: 'org-a',
            integrationId: '507f1f77bcf86cd799439011',
            provider: 'telnyx',
            providerNumberId: 'pn_1',
            e164: '15551234567',
        });
        await store.getBindingById('507f1f77bcf86cd799439012', { orgId: 'org-a' });
        await store.listBindings({ orgId: 'org-a' });
        await store.listBindingsByIntegrationId('507f1f77bcf86cd799439011', { orgId: 'org-a' });
        await store.deleteBinding('507f1f77bcf86cd799439012', { orgId: 'org-a' });

        expect(BindingModel.findOneAndUpdate).toHaveBeenCalledWith(
            {
                orgId: 'org-a',
                e164: '+15551234567',
                deletedAt: null,
            },
            expect.objectContaining({
                $set: expect.objectContaining({
                    orgId: 'org-a',
                    provider: 'telnyx',
                    providerNumberId: 'pn_1',
                }),
            }),
            expect.objectContaining({ upsert: true })
        );
        expect(BindingModel.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-a',
                deletedAt: null,
            })
        );
        expect(BindingModel.find).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-a',
                deletedAt: null,
            })
        );
        expect(BindingModel.deleteOne).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-a',
                deletedAt: null,
            })
        );
    });
});
