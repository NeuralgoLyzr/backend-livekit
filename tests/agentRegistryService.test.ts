import { describe, expect, it, vi } from 'vitest';
import { setRequiredEnv } from './testUtils';

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
        create: vi
            .fn()
            .mockImplementation(async (input: Record<string, unknown>) =>
                makeStoredAgent({ config: input.config })
            ),
        update: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(false),
        ...overrides,
    };
}

describe('agentRegistryService (unit)', () => {
    it('listAgents delegates to store.list', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../dist/services/agentRegistryService.js');

        const agents = [makeStoredAgent()];
        const store = makeStore({ list: vi.fn().mockResolvedValue(agents) });
        const svc = createAgentRegistryService({ store });

        const result = await svc.listAgents({ limit: 5, offset: 0 });
        expect(store.list).toHaveBeenCalledWith({ limit: 5, offset: 0 });
        expect(result).toEqual(agents);
    });

    it('getAgent delegates to store.getById', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../dist/services/agentRegistryService.js');

        const agent = makeStoredAgent();
        const store = makeStore({ getById: vi.fn().mockResolvedValue(agent) });
        const svc = createAgentRegistryService({ store });

        const result = await svc.getAgent('507f1f77bcf86cd799439011');
        expect(store.getById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
        expect(result).toEqual(agent);
    });

    it('getAgent returns null when agent not found', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../dist/services/agentRegistryService.js');

        const store = makeStore();
        const svc = createAgentRegistryService({ store });

        const result = await svc.getAgent('507f1f77bcf86cd799439011');
        expect(result).toBeNull();
    });

    it('createAgent trims agent_name and delegates to store.create', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../dist/services/agentRegistryService.js');

        const store = makeStore();
        const svc = createAgentRegistryService({ store });

        await svc.createAgent({ config: { agent_name: '  My Agent  ', tools: [] } });
        expect(store.create).toHaveBeenCalledTimes(1);
        const passedConfig = (store.create as ReturnType<typeof vi.fn>).mock.calls[0][0].config;
        expect(passedConfig.agent_name).toBe('My Agent');
    });

    it('createAgent throws 400 when agent_name is empty', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../dist/services/agentRegistryService.js');
        const { HttpError } = await import('../dist/lib/httpErrors.js');

        const store = makeStore();
        const svc = createAgentRegistryService({ store });

        await expect(
            svc.createAgent({ config: { agent_name: '   ', tools: [] } })
        ).rejects.toBeInstanceOf(HttpError);
    });

    it('createAgent throws 400 when agent_name is missing', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../dist/services/agentRegistryService.js');
        const { HttpError } = await import('../dist/lib/httpErrors.js');

        const store = makeStore();
        const svc = createAgentRegistryService({ store });

        await expect(svc.createAgent({ config: { tools: [] } })).rejects.toBeInstanceOf(HttpError);
    });

    it('updateAgent trims agent_name', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../dist/services/agentRegistryService.js');

        const updated = makeStoredAgent({ config: { agent_name: 'Updated' } });
        const store = makeStore({ update: vi.fn().mockResolvedValue(updated) });
        const svc = createAgentRegistryService({ store });

        const result = await svc.updateAgent('507f1f77bcf86cd799439011', {
            config: { agent_name: '  Updated  ', tools: [] },
        });
        expect(result).toEqual(updated);
        const passedConfig = (store.update as ReturnType<typeof vi.fn>).mock.calls[0][1].config;
        expect(passedConfig.agent_name).toBe('Updated');
    });

    it('updateAgent throws 400 when agent_name is empty', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../dist/services/agentRegistryService.js');
        const { HttpError } = await import('../dist/lib/httpErrors.js');

        const store = makeStore();
        const svc = createAgentRegistryService({ store });

        await expect(
            svc.updateAgent('507f1f77bcf86cd799439011', { config: { agent_name: '', tools: [] } })
        ).rejects.toBeInstanceOf(HttpError);
    });

    it('deleteAgent returns false when agent not found', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../dist/services/agentRegistryService.js');

        const store = makeStore({ delete: vi.fn().mockResolvedValue(false) });
        const svc = createAgentRegistryService({ store });

        const result = await svc.deleteAgent('507f1f77bcf86cd799439011');
        expect(result).toBe(false);
    });

    it('deleteAgent returns true on success', async () => {
        setRequiredEnv();
        const { createAgentRegistryService } =
            await import('../dist/services/agentRegistryService.js');

        const store = makeStore({ delete: vi.fn().mockResolvedValue(true) });
        const svc = createAgentRegistryService({ store });

        const result = await svc.deleteAgent('507f1f77bcf86cd799439011');
        expect(result).toBe(true);
        expect(store.delete).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    });
});
