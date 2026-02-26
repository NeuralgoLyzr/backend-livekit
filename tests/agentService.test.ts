import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setRequiredEnv } from './testUtils';

type AgentDispatchClient = {
    createDispatch: (
        roomName: string,
        agentName: string,
        opts: { metadata: string }
    ) => Promise<unknown>;
};

describe('agentService (unit)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it('dispatches agent with correct metadata', async () => {
        setRequiredEnv();
        const { createAgentService } = await import('../dist/services/agentService.js');

        const createDispatch = vi.fn().mockResolvedValue({ id: 'dispatch-1' });
        const svc = createAgentService({
            client: { createDispatch } as unknown as AgentDispatchClient,
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
            client: { createDispatch } as unknown as AgentDispatchClient,
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
            client: { createDispatch } as unknown as AgentDispatchClient,
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
            client: { createDispatch } as unknown as AgentDispatchClient,
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
            client: { createDispatch } as unknown as AgentDispatchClient,
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
            client: { createDispatch } as unknown as AgentDispatchClient,
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
        expect(metadata.managed_agents).toEqual({
            enabled: true,
            agents: [{ id: 'a', name: 'A', usage_description: 'd' }],
        });
    });

    it('rethrows client errors', async () => {
        setRequiredEnv();
        const { createAgentService } = await import('../dist/services/agentService.js');

        const createDispatch = vi.fn().mockRejectedValue(new Error('network fail'));
        const svc = createAgentService({
            client: { createDispatch } as unknown as AgentDispatchClient,
            agentName: 'test-agent',
        });

        await expect(svc.dispatchAgent('room-x', {})).rejects.toThrow('network fail');
    });

    it('maps apiKey correctly in metadata', async () => {
        setRequiredEnv();
        const { createAgentService } = await import('../dist/services/agentService.js');

        const createDispatch = vi.fn().mockResolvedValue({ id: 'd-7' });
        const svc = createAgentService({
            client: { createDispatch } as unknown as AgentDispatchClient,
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
            client: { createDispatch } as unknown as AgentDispatchClient,
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

    it('forwards audio_recording_enabled flag', async () => {
        setRequiredEnv();
        const { createAgentService } = await import('../dist/services/agentService.js');

        const createDispatch = vi.fn().mockResolvedValue({ id: 'd-9' });
        const svc = createAgentService({
            client: { createDispatch } as unknown as AgentDispatchClient,
            agentName: 'test-agent',
        });

        await svc.dispatchAgent('room-11', { audio_recording_enabled: true });
        const metadata = JSON.parse(createDispatch.mock.calls[0][2].metadata);
        expect(metadata.audio_recording_enabled).toBe(true);
    });

    it('logs dispatch attempt only in development mode', async () => {
        setRequiredEnv({ APP_ENV: 'production' });
        const { logger } = await import('../dist/lib/logger.js');
        const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => undefined);
        const { createAgentService } = await import('../dist/services/agentService.js');

        const createDispatch = vi.fn().mockResolvedValue({ id: 'd-prod' });
        const svc = createAgentService({
            client: { createDispatch } as unknown as AgentDispatchClient,
            agentName: 'test-agent',
        });

        await svc.dispatchAgent('room-prod', {
            user_id: 'user-prod',
            session_id: 'session-prod',
        });
        expect(debugSpy).not.toHaveBeenCalled();

        setRequiredEnv({ APP_ENV: 'dev' });
        await svc.dispatchAgent('room-dev', {
            user_id: 'user-dev',
            session_id: 'session-dev',
            api_key: 'dev-key',
        });
        expect(debugSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'livekit_agent_dispatch_attempt',
                roomName: 'room-dev',
                agentName: 'test-agent',
                userId: 'user-dev',
                sessionId: 'session-dev',
                agentConfig: expect.any(Object),
            }),
            'Dispatching agent (dev)'
        );
    });

    it('logs successful dispatch details with dispatch id and duration', async () => {
        setRequiredEnv();
        const { logger } = await import('../dist/lib/logger.js');
        const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
        const nowSpy = vi.spyOn(Date, 'now');
        nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1250);

        const { createAgentService } = await import('../dist/services/agentService.js');
        const createDispatch = vi.fn().mockResolvedValue({ id: 'dispatch-42' });
        const svc = createAgentService({
            client: { createDispatch } as unknown as AgentDispatchClient,
            agentName: 'test-agent',
        });

        await svc.dispatchAgent('room-log-success', {
            user_id: 'user-42',
            session_id: 'session-42',
        });

        expect(infoSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'livekit_agent_dispatch',
                roomName: 'room-log-success',
                agentName: 'test-agent',
                userId: 'user-42',
                sessionId: 'session-42',
                dispatchId: 'dispatch-42',
                durationMs: 250,
                outcome: 'success',
                agentConfig: expect.any(Object),
            }),
            'Dispatched agent to room'
        );
    });

    it('logs fallback dispatchId when client returns undefined', async () => {
        setRequiredEnv();
        const { logger } = await import('../dist/lib/logger.js');
        const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
        const nowSpy = vi.spyOn(Date, 'now');
        nowSpy.mockReturnValueOnce(2000).mockReturnValueOnce(2060);

        const { createAgentService } = await import('../dist/services/agentService.js');
        const createDispatch = vi.fn().mockResolvedValue(undefined);
        const svc = createAgentService({
            client: { createDispatch } as unknown as AgentDispatchClient,
            agentName: 'test-agent',
        });

        await svc.dispatchAgent('room-log-unknown', {
            user_id: 'user-u',
            session_id: 'session-u',
        });

        expect(infoSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'livekit_agent_dispatch',
                roomName: 'room-log-unknown',
                dispatchId: 'unknown',
                durationMs: 60,
                outcome: 'success',
            }),
            'Dispatched agent to room'
        );
    });

    it('logs failure details and rethrows errors from dispatch client', async () => {
        setRequiredEnv();
        const { logger } = await import('../dist/lib/logger.js');
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
        const nowSpy = vi.spyOn(Date, 'now');
        nowSpy.mockReturnValueOnce(3000).mockReturnValueOnce(3330);

        const { createAgentService } = await import('../dist/services/agentService.js');
        const dispatchError = new Error('network fail');
        const createDispatch = vi.fn().mockRejectedValue(dispatchError);
        const svc = createAgentService({
            client: { createDispatch } as unknown as AgentDispatchClient,
            agentName: 'test-agent',
        });

        await expect(
            svc.dispatchAgent('room-log-error', {
                user_id: 'user-e',
                session_id: 'session-e',
            })
        ).rejects.toThrow('network fail');

        expect(errorSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'livekit_agent_dispatch',
                roomName: 'room-log-error',
                agentName: 'test-agent',
                userId: 'user-e',
                sessionId: 'session-e',
                durationMs: 330,
                outcome: 'error',
                agentConfig: expect.any(Object),
                err: dispatchError,
            }),
            'Failed to dispatch agent to room'
        );
    });
});
