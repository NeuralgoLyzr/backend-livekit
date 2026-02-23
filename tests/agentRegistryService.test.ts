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
            await import('../dist/services/agentRegistryService.js');

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
            await import('../dist/services/agentRegistryService.js');

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

    it('getAgent delegates to store.getById with member scope', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../dist/services/agentRegistryService.js');

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
            await import('../dist/services/agentRegistryService.js');

        const store = makeStore();
        const svc = createAgentRegistryService({ store });

        const result = await svc.getAgent(MEMBER_AUTH, '507f1f77bcf86cd799439011');
        expect(result).toBeNull();
    });

    it('listAgentVersions delegates to store.listVersions with member scope', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../dist/services/agentRegistryService.js');

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
            await import('../dist/services/agentRegistryService.js');

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
            await import('../dist/services/agentRegistryService.js');
        const { HttpError } = await import('../dist/lib/httpErrors.js');

        const store = makeStore();
        const svc = createAgentRegistryService({ store });

        await expect(
            svc.createAgent(MEMBER_AUTH, { config: { agent_name: '   ', tools: [] } })
        ).rejects.toBeInstanceOf(HttpError);
    });

    it('createAgent throws 400 when agent_name is missing', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../dist/services/agentRegistryService.js');
        const { HttpError } = await import('../dist/lib/httpErrors.js');

        const store = makeStore();
        const svc = createAgentRegistryService({ store });

        await expect(
            svc.createAgent(MEMBER_AUTH, { config: { tools: [] } })
        ).rejects.toBeInstanceOf(HttpError);
    });

    it('updateAgent trims agent_name and applies member scope', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../dist/services/agentRegistryService.js');

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
            await import('../dist/services/agentRegistryService.js');
        const { HttpError } = await import('../dist/lib/httpErrors.js');

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
            await import('../dist/services/agentRegistryService.js');

        const store = makeStore({
            getById: vi.fn().mockResolvedValue(null),
            activateVersion: vi.fn(),
        });
        const svc = createAgentRegistryService({ store });

        const result = await svc.activateAgentVersion(
            MEMBER_AUTH,
            '507f1f77bcf86cd799439011',
            '6ca631d2-7f1f-4dbd-9b66-d3c0ecae0136'
        );
        expect(result).toBeNull();
        expect(store.activateVersion).not.toHaveBeenCalled();
    });

    it('activateAgentVersion delegates to store.activateVersion with member scope', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../dist/services/agentRegistryService.js');

        const updated = makeStoredAgent({ config: { agent_name: 'Version Active', tools: [] } });
        const store = makeStore({
            getById: vi.fn().mockResolvedValue(makeStoredAgent()),
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
            await import('../dist/services/agentRegistryService.js');

        const store = makeStore({ delete: vi.fn().mockResolvedValue(false) });
        const svc = createAgentRegistryService({ store });

        const result = await svc.deleteAgent(MEMBER_AUTH, '507f1f77bcf86cd799439011');
        expect(result).toBe(false);
    });

    it('deleteAgent returns true on success', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../dist/services/agentRegistryService.js');

        const store = makeStore({ delete: vi.fn().mockResolvedValue(true) });
        const svc = createAgentRegistryService({ store });

        const result = await svc.deleteAgent(MEMBER_AUTH, '507f1f77bcf86cd799439011');
        expect(result).toBe(true);
        expect(store.delete).toHaveBeenCalledWith('507f1f77bcf86cd799439011', {
            orgId: MEMBER_AUTH.orgId,
            createdByUserId: MEMBER_AUTH.userId,
        });
    });
});
