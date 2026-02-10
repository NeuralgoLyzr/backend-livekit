import { describe, expect, it, vi } from 'vitest';
import { setRequiredEnv } from './testUtils';

describe('agentService (unit)', () => {
    it('dispatches agent with correct metadata', async () => {
        setRequiredEnv();
        const { createAgentService } = await import('../dist/services/agentService.js');

        const createDispatch = vi.fn().mockResolvedValue({ id: 'dispatch-1' });
        const svc = createAgentService({
            client: { createDispatch } as any,
            agentName: 'test-agent',
        });

        await svc.dispatchAgent('room-1', {
            prompt: 'Be helpful',
            tools: ['get_weather'],
            vad_enabled: true,
            user_id: 'user-1',
            session_id: 'session-1',
        });

        expect(createDispatch).toHaveBeenCalledTimes(1);
        const [roomName, agentName, opts] = createDispatch.mock.calls[0];
        expect(roomName).toBe('room-1');
        expect(agentName).toBe('test-agent');

        const metadata = JSON.parse(opts.metadata);
        expect(metadata.prompt).toBe('Be helpful');
        expect(metadata.tools).toEqual(['get_weather']);
        expect(metadata.vad_enabled).toBe(true);
        expect(metadata.user_id).toBe('user-1');
        expect(metadata.session_id).toBe('session-1');
    });

    it('applies AGENT_DEFAULTS for missing fields in metadata', async () => {
        setRequiredEnv();
        const { createAgentService } = await import('../dist/services/agentService.js');
        const { AGENT_DEFAULTS } = await import('../dist/CONSTS.js');

        const createDispatch = vi.fn().mockResolvedValue({ id: 'd-2' });
        const svc = createAgentService({
            client: { createDispatch } as any,
            agentName: 'test-agent',
        });

        await svc.dispatchAgent('room-2', {});

        const metadata = JSON.parse(createDispatch.mock.calls[0][2].metadata);
        expect(metadata.engine).toEqual(AGENT_DEFAULTS.engine);
        expect(metadata.prompt).toBe(AGENT_DEFAULTS.prompt);
        expect(metadata.turn_detection).toBe(AGENT_DEFAULTS.turn_detection);
        expect(metadata.tools).toEqual(AGENT_DEFAULTS.tools);
        expect(metadata.vad_enabled).toBe(AGENT_DEFAULTS.vad_enabled);
    });

    it('forwards background_audio only when enabled', async () => {
        setRequiredEnv();
        const { createAgentService } = await import('../dist/services/agentService.js');

        const createDispatch = vi.fn().mockResolvedValue({ id: 'd-3' });
        const svc = createAgentService({
            client: { createDispatch } as any,
            agentName: 'test-agent',
        });

        // Disabled
        await svc.dispatchAgent('room-3', {
            background_audio: { enabled: false, ambient: { enabled: true, source: 's' } },
        });
        let metadata = JSON.parse(createDispatch.mock.calls[0][2].metadata);
        expect(metadata.background_audio).toBeUndefined();

        // Enabled
        await svc.dispatchAgent('room-4', {
            background_audio: {
                enabled: true,
                ambient: { enabled: true, source: 'rain.mp3', volume: 0.5 },
            },
        });
        metadata = JSON.parse(createDispatch.mock.calls[1][2].metadata);
        expect(metadata.background_audio).toBeDefined();
        expect(metadata.background_audio.ambient.source).toBe('rain.mp3');
    });

    it('forwards avatar config when provided', async () => {
        setRequiredEnv();
        const { createAgentService } = await import('../dist/services/agentService.js');

        const createDispatch = vi.fn().mockResolvedValue({ id: 'd-4' });
        const svc = createAgentService({
            client: { createDispatch } as any,
            agentName: 'test-agent',
        });

        await svc.dispatchAgent('room-5', {
            avatar: {
                enabled: true,
                provider: 'anam',
                anam: { name: 'Maya', avatarId: 'av-1' },
                avatar_participant_name: 'avatar-worker',
            },
        });

        const metadata = JSON.parse(createDispatch.mock.calls[0][2].metadata);
        expect(metadata.avatar).toBeDefined();
        expect(metadata.avatar.enabled).toBe(true);
        expect(metadata.avatar.anam.avatarId).toBe('av-1');
        expect(metadata.avatar.avatar_participant_name).toBe('avatar-worker');
    });

    it('omits avatar when not provided', async () => {
        setRequiredEnv();
        const { createAgentService } = await import('../dist/services/agentService.js');

        const createDispatch = vi.fn().mockResolvedValue({ id: 'd-5' });
        const svc = createAgentService({
            client: { createDispatch } as any,
            agentName: 'test-agent',
        });

        await svc.dispatchAgent('room-6', {});
        const metadata = JSON.parse(createDispatch.mock.calls[0][2].metadata);
        expect(metadata.avatar).toBeUndefined();
    });

    it('forwards managed_agents only when enabled', async () => {
        setRequiredEnv();
        const { createAgentService } = await import('../dist/services/agentService.js');

        const createDispatch = vi.fn().mockResolvedValue({ id: 'd-6' });
        const svc = createAgentService({
            client: { createDispatch } as any,
            agentName: 'test-agent',
        });

        // Disabled
        await svc.dispatchAgent('room-7', {
            managed_agents: {
                enabled: false,
                agents: [{ id: 'a', name: 'A', usage_description: 'd' }],
            },
        });
        let metadata = JSON.parse(createDispatch.mock.calls[0][2].metadata);
        expect(metadata.managed_agents).toBeUndefined();

        // Enabled
        await svc.dispatchAgent('room-8', {
            managed_agents: {
                enabled: true,
                agents: [{ id: 'a', name: 'A', usage_description: 'd' }],
            },
        });
        metadata = JSON.parse(createDispatch.mock.calls[1][2].metadata);
        expect(metadata.managed_agents).toEqual([{ id: 'a', name: 'A', usage_description: 'd' }]);
    });

    it('rethrows client errors', async () => {
        setRequiredEnv();
        const { createAgentService } = await import('../dist/services/agentService.js');

        const createDispatch = vi.fn().mockRejectedValue(new Error('network fail'));
        const svc = createAgentService({
            client: { createDispatch } as any,
            agentName: 'test-agent',
        });

        await expect(svc.dispatchAgent('room-x', {})).rejects.toThrow('network fail');
    });

    it('maps apiKey correctly in metadata', async () => {
        setRequiredEnv();
        const { createAgentService } = await import('../dist/services/agentService.js');

        const createDispatch = vi.fn().mockResolvedValue({ id: 'd-7' });
        const svc = createAgentService({
            client: { createDispatch } as any,
            agentName: 'test-agent',
        });

        await svc.dispatchAgent('room-9', { api_key: 'secret-key-123' });
        const metadata = JSON.parse(createDispatch.mock.calls[0][2].metadata);
        expect(metadata.apiKey).toBe('secret-key-123');
    });

    it('forwards pronunciation fields', async () => {
        setRequiredEnv();
        const { createAgentService } = await import('../dist/services/agentService.js');

        const createDispatch = vi.fn().mockResolvedValue({ id: 'd-8' });
        const svc = createAgentService({
            client: { createDispatch } as any,
            agentName: 'test-agent',
        });

        await svc.dispatchAgent('room-10', {
            pronunciation_correction: true,
            pronunciation_rules: { AI: 'A.I.' },
        });

        const metadata = JSON.parse(createDispatch.mock.calls[0][2].metadata);
        expect(metadata.pronunciation_correction).toBe(true);
        expect(metadata.pronunciation_rules).toEqual({ AI: 'A.I.' });
    });
});
