import { describe, expect, it, vi } from 'vitest';

import { setRequiredEnv } from './testUtils';

function createStore() {
    const map = new Map<string, unknown>();
    return {
        set: (k: string, v: unknown) => void map.set(k, v),
        get: (k: string): unknown => map.get(k),
        delete: (k: string) => map.delete(k),
        has: (k: string) => map.has(k),
        entries: () => Array.from(map.entries()),
        size: () => map.size,
    };
}

function buildDeps(overrides?: {
    createUserToken?: ReturnType<typeof vi.fn>;
    dispatchAgent?: ReturnType<typeof vi.fn>;
    deleteRoom?: ReturnType<typeof vi.fn>;
    resolveByAgentId?: ReturnType<typeof vi.fn>;
    store?: ReturnType<typeof createStore>;
}) {
    return {
        store: overrides?.store ?? createStore(),
        tokenService: {
            createUserToken: overrides?.createUserToken ?? vi.fn().mockResolvedValue('token-1'),
        },
        agentService: {
            dispatchAgent: overrides?.dispatchAgent ?? vi.fn().mockResolvedValue(undefined),
        },
        roomService: {
            deleteRoom: overrides?.deleteRoom ?? vi.fn().mockResolvedValue(undefined),
        },
        agentConfigResolver: {
            resolveByAgentId: overrides?.resolveByAgentId ?? vi.fn(),
        },
        livekitUrl: 'wss://example.livekit.invalid',
    };
}

describe('sessionService (unit)', () => {
    it('creates a session, dispatches agent, and stores metadata', async () => {
        vi.resetModules();
        setRequiredEnv();

        const dispatchAgent = vi.fn().mockResolvedValue(undefined);
        const deps = buildDeps({ dispatchAgent });

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const svc = createSessionService(deps);

        const agentConfig: Record<string, unknown> = {
            tools: ['get_weather', 'get_weather', 'unknown_tool'],
            knowledge_base: {
                enabled: true,
                lyzr_rag: { base_url: 'x', rag_id: 'r', rag_name: 'n' },
            },
        };

        const result = await svc.createSession({ userIdentity: 'user_1', agentConfig });

        expect(result.userToken).toBe('token-1');
        expect(result.roomName).toMatch(/^room-/);
        expect(result.agentDispatched).toBe(true);
        expect(result.agentConfig.tools).toEqual(['get_weather', 'search_knowledge_base']);

        expect(dispatchAgent).toHaveBeenCalledTimes(1);
        const [roomName, dispatchedConfig] = dispatchAgent.mock.calls[0];
        expect(roomName).toBe(result.roomName);
        expect((dispatchedConfig as Record<string, unknown>).user_id).toBe('user_1');
        expect((dispatchedConfig as Record<string, unknown>).tools).toEqual([
            'get_weather',
            'search_knowledge_base',
        ]);

        expect(deps.store.has(result.roomName)).toBe(true);
        const stored = deps.store.get(result.roomName) as Record<string, unknown>;
        expect(stored.userIdentity).toBe('user_1');
    });

    it('wraps agent dispatch failures as 502 and does not store the session', async () => {
        vi.resetModules();
        setRequiredEnv();

        const deps = buildDeps({
            dispatchAgent: vi.fn().mockRejectedValue(new Error('nope')),
        });

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const { HttpError } = await import('../dist/lib/httpErrors.js');

        const svc = createSessionService(deps);

        await expect(svc.createSession({ userIdentity: 'user_1' })).rejects.toBeInstanceOf(
            HttpError
        );
        expect(deps.store.size()).toBe(0);
    });

    it('endSession marks session as ended', async () => {
        vi.resetModules();
        setRequiredEnv();

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const deps = buildDeps();
        deps.store.set('room-1', {
            userIdentity: 'u',
            sessionId: 's',
            createdAt: new Date().toISOString(),
        });
        const svc = createSessionService(deps);

        await svc.endSession({ roomName: 'room-1' });
        const stored = deps.store.get('room-1') as Record<string, unknown>;
        expect(stored.endedAt).toBeDefined();
    });

    it('endSession throws 404 when session is missing', async () => {
        vi.resetModules();
        setRequiredEnv();

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const { HttpError } = await import('../dist/lib/httpErrors.js');
        const deps = buildDeps();
        const svc = createSessionService(deps);

        try {
            await svc.endSession({ roomName: 'room-x' });
            throw new Error('expected endSession to throw');
        } catch (err) {
            expect(err).toBeInstanceOf(HttpError);
            expect((err as { status?: number }).status).toBe(404);
        }
    });

    it('cleanupSession deletes the room and clears the store entry', async () => {
        vi.resetModules();
        setRequiredEnv();

        const deleteRoom = vi.fn().mockResolvedValue(undefined);
        const deps = buildDeps({ deleteRoom });
        deps.store.set('room-1', {
            userIdentity: 'u',
            sessionId: 's',
            createdAt: new Date().toISOString(),
        });

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const svc = createSessionService(deps);

        await svc.cleanupSession('room-1');
        expect(deleteRoom).toHaveBeenCalledWith('room-1');
        expect(deps.store.has('room-1')).toBe(false);
    });
});
