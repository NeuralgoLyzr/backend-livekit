import { beforeEach, describe, expect, it, vi } from 'vitest';

type AgentRow = {
    _id: { toString(): string };
    orgId: string;
    createdByUserId: string;
    config: unknown;
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

vi.mock('../dist/db/mongoose.js', () => ({ connectMongo }));
vi.mock('../dist/models/agentModel.js', () => ({
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
            await import('../dist/adapters/mongoose/mongooseAgentStore.js');
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
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
        };
        Agent.findOne.mockReturnValue({ lean: vi.fn(async () => row) });

        const { MongooseAgentStore } =
            await import('../dist/adapters/mongoose/mongooseAgentStore.js');
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
        const updateQuery = { lean: vi.fn(async () => null) };
        Agent.findOneAndUpdate.mockReturnValue(updateQuery);

        const { MongooseAgentStore } =
            await import('../dist/adapters/mongoose/mongooseAgentStore.js');
        const store = new MongooseAgentStore();

        const result = await store.update(
            '507f1f77bcf86cd799439011',
            {
                config: { agent_name: 'new' },
            },
            { orgId: 'org-a', createdByUserId: 'user-a' }
        );
        expect(result).toBeNull();
    });

    it('persists ownership fields on create', async () => {
        const now = new Date();
        const storedRow: AgentRow = {
            _id: { toString: () => '507f1f77bcf86cd799439011' },
            orgId: 'org-a',
            createdByUserId: 'user-a',
            config: { nested: { x: 1 } },
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
        };
        Agent.create.mockResolvedValue({ toObject: () => storedRow });

        const { MongooseAgentStore } =
            await import('../dist/adapters/mongoose/mongooseAgentStore.js');
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
            })
        );
        expect(created.config).toEqual({ nested: { x: 1 } });
    });

    it('applies scope when deleting', async () => {
        Agent.updateOne.mockResolvedValue({ modifiedCount: 1 });

        const { MongooseAgentStore } =
            await import('../dist/adapters/mongoose/mongooseAgentStore.js');
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
