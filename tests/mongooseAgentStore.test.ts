import { beforeEach, describe, expect, it, vi } from 'vitest';

type AgentVersionRow = {
    versionId: string;
    config: unknown;
    active: boolean;
    createdAt: Date;
};

type AgentRow = {
    _id: { toString(): string };
    orgId: string;
    createdByUserId: string;
    config: unknown;
    versions: AgentVersionRow[];
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
};

type FindQuery<T> = {
    sort: (value: unknown) => FindQuery<T>;
    skip: (value: number) => FindQuery<T>;
    limit: (value: number) => FindQuery<T>;
    lean: () => Promise<T>;
};

type AgentModelStub = {
    find: (filter: unknown) => FindQuery<AgentRow[]>;
    findOne: (filter: unknown) => { lean: () => Promise<AgentRow | null> };
    findOneAndUpdate: (
        filter: unknown,
        update: unknown,
        options: unknown
    ) => { lean: () => Promise<AgentRow | null> };
    updateOne: (filter: unknown, update: unknown) => Promise<{ modifiedCount: number }>;
    create: (doc: unknown) => Promise<{ toObject: () => AgentRow }>;
};

const connectMongo = vi.fn().mockResolvedValue(undefined);

const Agent: {
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    findOneAndUpdate: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
} = {
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn(),
    create: vi.fn(),
};

vi.mock('../src/db/mongoose.js', () => ({ connectMongo }));
vi.mock('../src/models/agentModel.js', () => ({
    getAgentModel: () => Agent as unknown as AgentModelStub,
}));

describe('MongooseAgentStore (unit)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('lists only scoped, non-deleted agents and maps fields', async () => {
        const now = new Date();
        const rows: AgentRow[] = [
            {
                _id: { toString: () => '507f1f77bcf86cd799439011' },
                orgId: 'org-a',
                createdByUserId: 'user-a',
                config: { tools: ['get_weather'] },
                versions: [],
                createdAt: now,
                updatedAt: now,
                deletedAt: null,
            },
        ];

        const findQuery: FindQuery<AgentRow[]> = {
            sort: vi.fn(() => findQuery),
            skip: vi.fn(() => findQuery),
            limit: vi.fn(() => findQuery),
            lean: vi.fn(async () => rows),
        };
        Agent.find.mockReturnValue(findQuery);

        const { MongooseAgentStore } =
            await import('../src/adapters/mongoose/mongooseAgentStore.js');
        const store = new MongooseAgentStore();

        const result = await store.list({
            limit: 10,
            offset: 5,
            scope: { orgId: 'org-a', createdByUserId: 'user-a' },
        });
        expect(connectMongo).toHaveBeenCalledTimes(1);
        expect(Agent.find).toHaveBeenCalledWith({
            orgId: 'org-a',
            createdByUserId: 'user-a',
            deletedAt: null,
        });
        expect(findQuery.sort).toHaveBeenCalledWith({ updatedAt: -1 });
        expect(findQuery.skip).toHaveBeenCalledWith(5);
        expect(findQuery.limit).toHaveBeenCalledWith(10);

        expect(result).toEqual([
            {
                id: '507f1f77bcf86cd799439011',
                config: { tools: ['get_weather'] },
                createdAt: now.toISOString(),
                updatedAt: now.toISOString(),
            },
        ]);
    });

    it('applies scope on getById', async () => {
        const now = new Date();
        const row: AgentRow = {
            _id: { toString: () => '507f1f77bcf86cd799439011' },
            orgId: 'org-a',
            createdByUserId: 'user-a',
            config: { tools: [] },
            versions: [],
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
        };
        Agent.findOne.mockReturnValue({ lean: vi.fn(async () => row) });

        const { MongooseAgentStore } =
            await import('../src/adapters/mongoose/mongooseAgentStore.js');
        const store = new MongooseAgentStore();

        await store.getById('507f1f77bcf86cd799439011', {
            orgId: 'org-a',
            createdByUserId: 'user-a',
        });

        expect(Agent.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-a',
                createdByUserId: 'user-a',
                deletedAt: null,
            })
        );
    });

    it('returns null when updating a missing agent', async () => {
        Agent.findOne.mockReturnValue({ lean: vi.fn(async () => null) });

        const { MongooseAgentStore } =
            await import('../src/adapters/mongoose/mongooseAgentStore.js');
        const store = new MongooseAgentStore();

        const result = await store.update(
            '507f1f77bcf86cd799439011',
            {
                config: { agent_name: 'new' },
            },
            { orgId: 'org-a', createdByUserId: 'user-a' }
        );
        expect(result).toBeNull();
        expect(Agent.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('persists ownership fields on create', async () => {
        const now = new Date();
        const storedRow: AgentRow = {
            _id: { toString: () => '507f1f77bcf86cd799439011' },
            orgId: 'org-a',
            createdByUserId: 'user-a',
            config: { nested: { x: 1 } },
            versions: [],
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
        };
        Agent.create.mockResolvedValue({ toObject: () => storedRow });

        const { MongooseAgentStore } =
            await import('../src/adapters/mongoose/mongooseAgentStore.js');
        const store = new MongooseAgentStore();

        const created = await store.create({
            orgId: 'org-a',
            createdByUserId: 'user-a',
            config: { nested: { x: 1 } } as unknown as Record<string, unknown>,
        });

        expect(Agent.create).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-a',
                createdByUserId: 'user-a',
                versions: [
                    expect.objectContaining({
                        versionId: expect.any(String),
                        active: true,
                        config: { nested: { x: 1 } },
                    }),
                ],
            })
        );
        expect(created.config).toEqual({ nested: { x: 1 } });
    });

    it('creates a new active snapshot on config update', async () => {
        const now = new Date();
        const existing: AgentRow = {
            _id: { toString: () => '507f1f77bcf86cd799439011' },
            orgId: 'org-a',
            createdByUserId: 'user-a',
            config: { agent_name: 'before' },
            versions: [
                {
                    versionId: 'version-1',
                    active: true,
                    config: { agent_name: 'before' },
                    createdAt: now,
                },
            ],
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
        };
        const updated: AgentRow = {
            ...existing,
            config: { agent_name: 'after' },
            versions: [
                {
                    versionId: 'version-1',
                    active: false,
                    config: { agent_name: 'before' },
                    createdAt: now,
                },
                {
                    versionId: 'version-2',
                    active: true,
                    config: { agent_name: 'after' },
                    createdAt: now,
                },
            ],
        };
        Agent.findOne.mockReturnValue({ lean: vi.fn(async () => existing) });
        Agent.findOneAndUpdate.mockReturnValue({ lean: vi.fn(async () => updated) });

        const { MongooseAgentStore } =
            await import('../src/adapters/mongoose/mongooseAgentStore.js');
        const store = new MongooseAgentStore();

        await store.update(
            '507f1f77bcf86cd799439011',
            { config: { agent_name: 'after' } as unknown as Record<string, unknown> },
            { orgId: 'org-a', createdByUserId: 'user-a' }
        );

        expect(Agent.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-a',
                createdByUserId: 'user-a',
                deletedAt: null,
            }),
            {
                $set: {
                    config: { agent_name: 'after' },
                    versions: [
                        {
                            versionId: 'version-1',
                            active: false,
                            config: { agent_name: 'before' },
                            createdAt: now,
                        },
                        expect.objectContaining({
                            versionId: expect.any(String),
                            active: true,
                            config: { agent_name: 'after' },
                            createdAt: expect.any(Date),
                        }),
                    ],
                },
            },
            { new: true, runValidators: true }
        );
    });

    it('lists versions for an agent in descending createdAt order', async () => {
        const newer = new Date('2026-02-19T09:00:00.000Z');
        const older = new Date('2026-02-18T09:00:00.000Z');
        Agent.findOne.mockReturnValue({
            lean: vi.fn(async () => ({
                _id: { toString: () => '507f1f77bcf86cd799439011' },
                orgId: 'org-a',
                createdByUserId: 'user-a',
                config: { agent_name: 'latest' },
                versions: [
                    {
                        versionId: 'version-older',
                        active: false,
                        config: { agent_name: 'older' },
                        createdAt: older,
                    },
                    {
                        versionId: 'version-newer',
                        active: true,
                        config: { agent_name: 'latest' },
                        createdAt: newer,
                    },
                ],
                createdAt: older,
                updatedAt: newer,
                deletedAt: null,
            })),
        });

        const { MongooseAgentStore } =
            await import('../src/adapters/mongoose/mongooseAgentStore.js');
        const store = new MongooseAgentStore();

        const versions = await store.listVersions('507f1f77bcf86cd799439011', {
            orgId: 'org-a',
            createdByUserId: 'user-a',
        });

        expect(versions).toEqual([
            {
                versionId: 'version-newer',
                active: true,
                config: { agent_name: 'latest' },
                createdAt: newer.toISOString(),
            },
            {
                versionId: 'version-older',
                active: false,
                config: { agent_name: 'older' },
                createdAt: older.toISOString(),
            },
        ]);
    });

    it('activates an existing version and updates root config', async () => {
        const now = new Date();
        Agent.findOne.mockReturnValue({
            lean: vi.fn(async () => ({
                _id: { toString: () => '507f1f77bcf86cd799439011' },
                orgId: 'org-a',
                createdByUserId: 'user-a',
                config: { agent_name: 'new' },
                versions: [
                    {
                        versionId: 'version-old',
                        active: false,
                        config: { agent_name: 'old' },
                        createdAt: now,
                    },
                    {
                        versionId: 'version-new',
                        active: true,
                        config: { agent_name: 'new' },
                        createdAt: now,
                    },
                ],
                createdAt: now,
                updatedAt: now,
                deletedAt: null,
            })),
        });
        Agent.findOneAndUpdate.mockReturnValue({
            lean: vi.fn(async () => ({
                _id: { toString: () => '507f1f77bcf86cd799439011' },
                orgId: 'org-a',
                createdByUserId: 'user-a',
                config: { agent_name: 'old' },
                versions: [
                    {
                        versionId: 'version-old',
                        active: true,
                        config: { agent_name: 'old' },
                        createdAt: now,
                    },
                    {
                        versionId: 'version-new',
                        active: false,
                        config: { agent_name: 'new' },
                        createdAt: now,
                    },
                ],
                createdAt: now,
                updatedAt: now,
                deletedAt: null,
            })),
        });

        const { MongooseAgentStore } =
            await import('../src/adapters/mongoose/mongooseAgentStore.js');
        const store = new MongooseAgentStore();

        const activated = await store.activateVersion(
            '507f1f77bcf86cd799439011',
            'version-old',
            {
                orgId: 'org-a',
                createdByUserId: 'user-a',
            }
        );

        expect(activated?.config).toEqual({ agent_name: 'old' });
        expect(Agent.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-a',
                createdByUserId: 'user-a',
                deletedAt: null,
            }),
            {
                $set: {
                    config: { agent_name: 'old' },
                    versions: [
                        {
                            versionId: 'version-old',
                            active: true,
                            config: { agent_name: 'old' },
                            createdAt: now,
                        },
                        {
                            versionId: 'version-new',
                            active: false,
                            config: { agent_name: 'new' },
                            createdAt: now,
                        },
                    ],
                },
            },
            { new: true, runValidators: true }
        );
    });

    it('applies scope when deleting', async () => {
        Agent.updateOne.mockResolvedValue({ modifiedCount: 1 });

        const { MongooseAgentStore } =
            await import('../src/adapters/mongoose/mongooseAgentStore.js');
        const store = new MongooseAgentStore();

        const deleted = await store.delete('507f1f77bcf86cd799439011', {
            orgId: 'org-a',
            createdByUserId: 'user-a',
        });

        expect(deleted).toBe(true);
        expect(Agent.updateOne).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-a',
                createdByUserId: 'user-a',
                deletedAt: null,
            }),
            expect.any(Object)
        );
    });
});
