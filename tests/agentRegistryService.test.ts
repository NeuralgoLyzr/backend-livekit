import { describe, expect, it, vi } from 'vitest';

import { setRequiredEnv } from './testUtils';

const MEMBER_AUTH = {
    orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
    userId: 'member_user_1',
    isAdmin: false,
};

const ADMIN_AUTH = {
    orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
    userId: 'admin_user_1',
    isAdmin: true,
};

function makeStoredAgent(overrides?: Record<string, unknown>) {
    return {
        id: '507f1f77bcf86cd799439011',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        config: {
            agent_name: 'Test Agent',
            tools: ['get_weather'],
        },
        ...overrides,
    };
}

function makeStore(overrides?: Record<string, unknown>) {
    return {
        list: vi.fn().mockResolvedValue([]),
        getById: vi.fn().mockResolvedValue(null),
        listVersions: vi.fn().mockResolvedValue([]),
        create: vi
            .fn()
            .mockImplementation(async (input: Record<string, unknown>) =>
                makeStoredAgent({ config: input.config })
            ),
        update: vi.fn().mockResolvedValue(null),
        activateVersion: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(false),
        ...overrides,
    };
}

describe('agentRegistryService (unit)', () => {
    it('listAgents scopes members by orgId + createdByUserId', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');

        const agents = [makeStoredAgent()];
        const store = makeStore({ list: vi.fn().mockResolvedValue(agents) });
        const svc = createAgentRegistryService({ store });

        const result = await svc.listAgents(MEMBER_AUTH, { limit: 5, offset: 0 });
        expect(store.list).toHaveBeenCalledWith({
            limit: 5,
            offset: 0,
            scope: {
                orgId: MEMBER_AUTH.orgId,
                createdByUserId: MEMBER_AUTH.userId,
            },
        });
        expect(result).toEqual(agents);
    });

    it('listAgents scopes admins only by orgId', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');

        const store = makeStore();
        const svc = createAgentRegistryService({ store });

        await svc.listAgents(ADMIN_AUTH, { limit: 10 });
        expect(store.list).toHaveBeenCalledWith({
            limit: 10,
            scope: {
                orgId: ADMIN_AUTH.orgId,
            },
        });
    });

    it('listAgents merges shared agents and marks shared=true for collaborators', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');

        const owned = makeStoredAgent({
            id: '507f1f77bcf86cd799439011',
            updatedAt: '2026-02-20T10:00:00.000Z',
        });
        const shared = makeStoredAgent({
            id: '507f1f77bcf86cd799439012',
            updatedAt: '2026-02-21T10:00:00.000Z',
        });

        const store = makeStore({
            list: vi.fn().mockResolvedValue([owned]),
            getById: vi
                .fn()
                .mockResolvedValueOnce(shared)
                .mockResolvedValueOnce(null),
        });
        const access = {
            listSharedAgentIds: vi.fn().mockResolvedValue(new Set(['507f1f77bcf86cd799439012'])),
            hasSharedAccess: vi.fn().mockResolvedValue(false),
            listSharedUserIdsForAgent: vi.fn().mockResolvedValue([]),
            shareAgent: vi.fn(),
            unshareAgent: vi.fn(),
        };
        const svc = createAgentRegistryService({ store, access });

        const result = await svc.listAgents(MEMBER_AUTH, { limit: 10, offset: 0 });
        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({
            id: '507f1f77bcf86cd799439012',
            shared: true,
        });
        expect(result[1]).toMatchObject({
            id: '507f1f77bcf86cd799439011',
        });
    });

    it('listAgents for members with shared IDs stops owned pagination once page is satisfied', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');

        const firstOwnedPage = Array.from({ length: 200 }, (_, index) =>
            makeStoredAgent({
                id: (index + 1).toString(16).padStart(24, '0'),
                updatedAt: new Date(2026, 1, 20, 12, 0, 0, 0 - index).toISOString(),
            })
        );
        const secondOwnedPage = Array.from({ length: 200 }, (_, index) =>
            makeStoredAgent({
                id: (index + 201).toString(16).padStart(24, '0'),
                updatedAt: new Date(2026, 1, 19, 12, 0, 0, 0 - index).toISOString(),
            })
        );
        const finalOwnedPage = [
            makeStoredAgent({
                id: (401).toString(16).padStart(24, '0'),
                updatedAt: '2026-02-18T12:00:00.000Z',
            }),
        ];
        const shared = makeStoredAgent({
            id: '507f1f77bcf86cd799439099',
            updatedAt: '2026-02-10T10:00:00.000Z',
        });

        const store = makeStore({
            list: vi
                .fn()
                .mockResolvedValueOnce(firstOwnedPage)
                .mockResolvedValueOnce(secondOwnedPage)
                .mockResolvedValueOnce(finalOwnedPage),
            getById: vi.fn().mockResolvedValue(shared),
        });
        const access = {
            listSharedAgentIds: vi.fn().mockResolvedValue(new Set(['507f1f77bcf86cd799439099'])),
            hasSharedAccess: vi.fn().mockResolvedValue(false),
            listSharedUserIdsForAgent: vi.fn().mockResolvedValue([]),
            shareAgent: vi.fn(),
            unshareAgent: vi.fn(),
        };
        const svc = createAgentRegistryService({ store, access });

        const result = await svc.listAgents(MEMBER_AUTH, { limit: 5, offset: 0 });

        expect(result).toHaveLength(5);
        expect(store.list).toHaveBeenCalledTimes(1);
        expect(store.list).toHaveBeenNthCalledWith(1, {
            limit: 200,
            offset: 0,
            scope: {
                orgId: MEMBER_AUTH.orgId,
                createdByUserId: MEMBER_AUTH.userId,
            },
        });
    });

    it('getAgent delegates to store.getById with member scope', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');

        const agent = makeStoredAgent();
        const store = makeStore({ getById: vi.fn().mockResolvedValue(agent) });
        const svc = createAgentRegistryService({ store });

        const result = await svc.getAgent(MEMBER_AUTH, '507f1f77bcf86cd799439011');
        expect(store.getById).toHaveBeenCalledWith('507f1f77bcf86cd799439011', {
            orgId: MEMBER_AUTH.orgId,
            createdByUserId: MEMBER_AUTH.userId,
        });
        expect(result).toEqual(agent);
    });

    it('getAgent returns null when agent not found', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');

        const store = makeStore();
        const svc = createAgentRegistryService({ store });

        const result = await svc.getAgent(MEMBER_AUTH, '507f1f77bcf86cd799439011');
        expect(result).toBeNull();
    });

    it('getAgent allows shared read access and marks shared=true', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');

        const shared = makeStoredAgent({ id: '507f1f77bcf86cd799439011' });
        const store = makeStore({
            getById: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(shared),
        });
        const access = {
            listSharedAgentIds: vi.fn().mockResolvedValue(new Set()),
            hasSharedAccess: vi.fn().mockResolvedValue(true),
            listSharedUserIdsForAgent: vi.fn().mockResolvedValue([]),
            shareAgent: vi.fn(),
            unshareAgent: vi.fn(),
        };
        const svc = createAgentRegistryService({ store, access });

        const result = await svc.getAgent(MEMBER_AUTH, '507f1f77bcf86cd799439011');
        expect(result).toMatchObject({
            id: '507f1f77bcf86cd799439011',
            shared: true,
        });
        expect(access.hasSharedAccess).toHaveBeenCalledWith(
            MEMBER_AUTH,
            '507f1f77bcf86cd799439011',
            'read'
        );
    });

    it('listAgentVersions delegates to store.listVersions with member scope', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');

        const versions = [
            {
                versionId: '6ca631d2-7f1f-4dbd-9b66-d3c0ecae0136',
                active: true,
                createdAt: new Date().toISOString(),
                config: { agent_name: 'Test Agent', tools: [] },
            },
        ];
        const store = makeStore({ listVersions: vi.fn().mockResolvedValue(versions) });
        const svc = createAgentRegistryService({ store });

        const result = await svc.listAgentVersions(MEMBER_AUTH, '507f1f77bcf86cd799439011');
        expect(store.listVersions).toHaveBeenCalledWith('507f1f77bcf86cd799439011', {
            orgId: MEMBER_AUTH.orgId,
            createdByUserId: MEMBER_AUTH.userId,
        });
        expect(result).toEqual(versions);
    });

    it('createAgent trims agent_name and persists org/user ownership', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');

        const store = makeStore();
        const svc = createAgentRegistryService({ store });

        await svc.createAgent(MEMBER_AUTH, {
            config: { agent_name: '  My Agent  ', tools: [] },
        });
        expect(store.create).toHaveBeenCalledTimes(1);
        expect(store.create).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: MEMBER_AUTH.orgId,
                createdByUserId: MEMBER_AUTH.userId,
                config: expect.objectContaining({ agent_name: 'My Agent' }),
            })
        );
    });

    it('createAgent throws 400 when agent_name is empty', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');
        const { HttpError } = await import('../src/lib/httpErrors.ts');

        const store = makeStore();
        const svc = createAgentRegistryService({ store });

        await expect(
            svc.createAgent(MEMBER_AUTH, { config: { agent_name: '   ', tools: [] } })
        ).rejects.toBeInstanceOf(HttpError);
    });

    it('createAgent throws 400 when agent_name is missing', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');
        const { HttpError } = await import('../src/lib/httpErrors.ts');

        const store = makeStore();
        const svc = createAgentRegistryService({ store });

        await expect(
            svc.createAgent(MEMBER_AUTH, { config: { tools: [] } })
        ).rejects.toBeInstanceOf(HttpError);
    });

    it('updateAgent trims agent_name and applies member scope', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');

        const updated = makeStoredAgent({ config: { agent_name: 'Updated' } });
        const store = makeStore({ update: vi.fn().mockResolvedValue(updated) });
        const svc = createAgentRegistryService({ store });

        const result = await svc.updateAgent(MEMBER_AUTH, '507f1f77bcf86cd799439011', {
            config: { agent_name: '  Updated  ', tools: [] },
        });
        expect(result).toEqual(updated);
        expect(store.update).toHaveBeenCalledWith(
            '507f1f77bcf86cd799439011',
            expect.objectContaining({
                config: expect.objectContaining({ agent_name: 'Updated' }),
            }),
            {
                orgId: MEMBER_AUTH.orgId,
                createdByUserId: MEMBER_AUTH.userId,
            }
        );
    });

    it('updateAgent throws 400 when agent_name is empty', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');
        const { HttpError } = await import('../src/lib/httpErrors.ts');

        const store = makeStore();
        const svc = createAgentRegistryService({ store });

        await expect(
            svc.updateAgent(MEMBER_AUTH, '507f1f77bcf86cd799439011', {
                config: { agent_name: '', tools: [] },
            })
        ).rejects.toBeInstanceOf(HttpError);
    });

    it('activateAgentVersion returns null when agent is not found in scope', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');

        const store = makeStore({
            activateVersion: vi.fn().mockResolvedValue(null),
        });
        const svc = createAgentRegistryService({ store });

        const result = await svc.activateAgentVersion(
            MEMBER_AUTH,
            '507f1f77bcf86cd799439011',
            '6ca631d2-7f1f-4dbd-9b66-d3c0ecae0136'
        );
        expect(result).toBeNull();
        expect(store.activateVersion).toHaveBeenCalledWith(
            '507f1f77bcf86cd799439011',
            '6ca631d2-7f1f-4dbd-9b66-d3c0ecae0136',
            {
                orgId: MEMBER_AUTH.orgId,
                createdByUserId: MEMBER_AUTH.userId,
            }
        );
    });

    it('activateAgentVersion delegates to store.activateVersion with member scope', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');

        const updated = makeStoredAgent({ config: { agent_name: 'Version Active', tools: [] } });
        const store = makeStore({
            activateVersion: vi.fn().mockResolvedValue(updated),
        });
        const svc = createAgentRegistryService({ store });

        const result = await svc.activateAgentVersion(
            MEMBER_AUTH,
            '507f1f77bcf86cd799439011',
            '6ca631d2-7f1f-4dbd-9b66-d3c0ecae0136'
        );

        expect(result).toEqual(updated);
        expect(store.activateVersion).toHaveBeenCalledWith(
            '507f1f77bcf86cd799439011',
            '6ca631d2-7f1f-4dbd-9b66-d3c0ecae0136',
            {
                orgId: MEMBER_AUTH.orgId,
                createdByUserId: MEMBER_AUTH.userId,
            }
        );
    });

    it('deleteAgent returns false when agent not found', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');

        const store = makeStore({ delete: vi.fn().mockResolvedValue(false) });
        const svc = createAgentRegistryService({ store });

        const result = await svc.deleteAgent(MEMBER_AUTH, '507f1f77bcf86cd799439011');
        expect(result).toBe(false);
    });

    it('deleteAgent returns true on success', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');

        const store = makeStore({ delete: vi.fn().mockResolvedValue(true) });
        const svc = createAgentRegistryService({ store });

        const result = await svc.deleteAgent(MEMBER_AUTH, '507f1f77bcf86cd799439011');
        expect(result).toBe(true);
        expect(store.delete).toHaveBeenCalledWith('507f1f77bcf86cd799439011', {
            orgId: MEMBER_AUTH.orgId,
            createdByUserId: MEMBER_AUTH.userId,
        });
    });

    it('shareAgent delegates to access service for owner/admin', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');

        const store = makeStore({
            getById: vi.fn().mockResolvedValue(makeStoredAgent()),
        });
        const access = {
            listSharedAgentIds: vi.fn().mockResolvedValue(new Set()),
            hasSharedAccess: vi.fn().mockResolvedValue(false),
            listSharedUserIdsForAgent: vi.fn().mockResolvedValue([]),
            shareAgent: vi.fn().mockResolvedValue({ message: 'ok' }),
            unshareAgent: vi.fn().mockResolvedValue({ message: 'ok' }),
        };
        const svc = createAgentRegistryService({ store, access });

        await svc.shareAgent(MEMBER_AUTH, '507f1f77bcf86cd799439011', {
            emailIds: ['a@example.com'],
        });

        expect(access.shareAgent).toHaveBeenCalledWith({
            auth: MEMBER_AUTH,
            agentId: '507f1f77bcf86cd799439011',
            emailIds: ['a@example.com'],
            adminUserId: undefined,
            bearerToken: undefined,
        });
    });

    it('shareAgent throws 403 for non-owner', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');
        const { HttpError } = await import('../src/lib/httpErrors.ts');

        const store = makeStore({
            getById: vi.fn().mockResolvedValue(null),
        });
        const access = {
            listSharedAgentIds: vi.fn().mockResolvedValue(new Set()),
            hasSharedAccess: vi.fn().mockResolvedValue(false),
            listSharedUserIdsForAgent: vi.fn().mockResolvedValue([]),
            shareAgent: vi.fn(),
            unshareAgent: vi.fn(),
        };
        const svc = createAgentRegistryService({ store, access });

        await expect(
            svc.shareAgent(MEMBER_AUTH, '507f1f77bcf86cd799439011', {
                emailIds: ['a@example.com'],
            })
        ).rejects.toBeInstanceOf(HttpError);
    });

    it('unshareAgent delegates to access service for owner/admin', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');

        const store = makeStore({
            getById: vi.fn().mockResolvedValue(makeStoredAgent()),
        });
        const access = {
            listSharedAgentIds: vi.fn().mockResolvedValue(new Set()),
            hasSharedAccess: vi.fn().mockResolvedValue(false),
            listSharedUserIdsForAgent: vi.fn().mockResolvedValue([]),
            shareAgent: vi.fn().mockResolvedValue({ message: 'ok' }),
            unshareAgent: vi.fn().mockResolvedValue({ message: 'ok' }),
        };
        const svc = createAgentRegistryService({ store, access });

        await svc.unshareAgent(MEMBER_AUTH, '507f1f77bcf86cd799439011', {
            emailIds: ['a@example.com'],
        });

        expect(store.getById).toHaveBeenCalledWith('507f1f77bcf86cd799439011', {
            orgId: MEMBER_AUTH.orgId,
            createdByUserId: MEMBER_AUTH.userId,
        });
        expect(access.unshareAgent).toHaveBeenCalledWith({
            auth: MEMBER_AUTH,
            agentId: '507f1f77bcf86cd799439011',
            emailIds: ['a@example.com'],
            adminUserId: undefined,
            bearerToken: undefined,
        });
    });

    it('unshareAgent throws 403 for non-owner', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../src/services/agentRegistryService.ts');
        const { HttpError } = await import('../src/lib/httpErrors.ts');

        const store = makeStore({
            getById: vi.fn().mockResolvedValue(null),
        });
        const access = {
            listSharedAgentIds: vi.fn().mockResolvedValue(new Set()),
            hasSharedAccess: vi.fn().mockResolvedValue(false),
            listSharedUserIdsForAgent: vi.fn().mockResolvedValue([]),
            shareAgent: vi.fn(),
            unshareAgent: vi.fn(),
        };
        const svc = createAgentRegistryService({ store, access });

        await expect(
            svc.unshareAgent(MEMBER_AUTH, '507f1f77bcf86cd799439011', {
                emailIds: ['a@example.com'],
            })
        ).rejects.toBeInstanceOf(HttpError);
    });
});
