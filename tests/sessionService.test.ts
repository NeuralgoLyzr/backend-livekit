import { describe, expect, it, vi } from 'vitest';

import { setRequiredEnv } from './testUtils';

const ORG_ID_A = '96f0cee4-bb87-4477-8eff-577ef2780614';
const ORG_ID_B = 'f1a1e7aa-12b5-4ad7-bec6-fb2db2c3f3fa';

const MEMBER_AUTH = { orgId: ORG_ID_A, userId: 'member_user_1', isAdmin: false };
const ADMIN_AUTH = { orgId: ORG_ID_A, userId: 'admin_user_1', isAdmin: true };

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

    it('normalizes userIdentity, roomName, and sessionId by trimming whitespace', async () => {
        vi.resetModules();
        setRequiredEnv();

        const createUserToken = vi.fn().mockResolvedValue('token-trimmed');
        const dispatchAgent = vi.fn().mockResolvedValue(undefined);
        const deps = buildDeps({ createUserToken, dispatchAgent });

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const svc = createSessionService(deps);

        const result = await svc.createSession({
            userIdentity: '  user_trim  ',
            roomName: '  room-trim  ',
            sessionId: '  00000000-0000-4000-8000-000000000000  ',
            agentConfig: {},
        });

        expect(result.roomName).toBe('room-trim');
        expect(result.sessionId).toBe('00000000-0000-4000-8000-000000000000');
        expect(createUserToken).toHaveBeenCalledWith('user_trim', 'room-trim');

        const [dispatchRoomName, dispatchedConfig] = dispatchAgent.mock.calls[0] as [
            string,
            Record<string, unknown>,
        ];
        expect(dispatchRoomName).toBe('room-trim');
        expect(dispatchedConfig.user_id).toBe('user_trim');
        expect(dispatchedConfig.session_id).toBe('00000000-0000-4000-8000-000000000000');

        const stored = deps.store.get('room-trim') as Record<string, unknown>;
        expect(stored.userIdentity).toBe('user_trim');
        expect(stored.sessionId).toBe('00000000-0000-4000-8000-000000000000');
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

    it('resolves agentId with tenant scope before dispatch', async () => {
        vi.resetModules();
        setRequiredEnv();

        const resolveByAgentId = vi.fn().mockResolvedValue({
            prompt: 'Resolved config',
            tools: ['get_weather'],
        });
        const dispatchAgent = vi.fn().mockResolvedValue(undefined);
        const deps = buildDeps({ resolveByAgentId, dispatchAgent });

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const svc = createSessionService(deps);

        await svc.createSession({
            userIdentity: 'user_1',
            agentId: '507f1f77bcf86cd799439011',
            orgId: ORG_ID_A,
            createdByUserId: 'member_user_1',
            requesterIsAdmin: false,
            agentConfig: {
                prompt: 'Override prompt',
            },
        });

        expect(resolveByAgentId).toHaveBeenCalledWith({
            agentId: '507f1f77bcf86cd799439011',
            overrides: { prompt: 'Override prompt' },
            accessScope: {
                orgId: ORG_ID_A,
                userId: 'member_user_1',
                isAdmin: false,
            },
        });
        expect(dispatchAgent).toHaveBeenCalledTimes(1);
    });

    it('rejects agentId session creation when auth context is missing', async () => {
        vi.resetModules();
        setRequiredEnv();

        const resolveByAgentId = vi.fn().mockResolvedValue({});
        const deps = buildDeps({ resolveByAgentId });

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const { HttpError } = await import('../dist/lib/httpErrors.js');
        const svc = createSessionService(deps);

        await expect(
            svc.createSession({
                userIdentity: 'user_1',
                agentId: '507f1f77bcf86cd799439011',
            })
        ).rejects.toBeInstanceOf(HttpError);
        expect(resolveByAgentId).not.toHaveBeenCalled();
    });

    it('endSession marks session as ended', async () => {
        vi.resetModules();
        setRequiredEnv();

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const deps = buildDeps();
        deps.store.set('room-1', {
            userIdentity: 'u',
            sessionId: 's',
            orgId: ORG_ID_A,
            createdByUserId: 'member_user_1',
            createdAt: new Date().toISOString(),
        });
        const svc = createSessionService(deps);

        await svc.endSession({ roomName: 'room-1', auth: MEMBER_AUTH });
        const stored = deps.store.get('room-1') as Record<string, unknown>;
        expect(stored.endedAt).toBeDefined();
    });

    it('endSession trims roomName before lookup', async () => {
        vi.resetModules();
        setRequiredEnv();

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const deps = buildDeps();
        deps.store.set('room-trim-end', {
            userIdentity: 'u',
            sessionId: 's-trim',
            orgId: ORG_ID_A,
            createdByUserId: 'member_user_1',
            createdAt: new Date().toISOString(),
        });
        const svc = createSessionService(deps);

        await svc.endSession({ roomName: '  room-trim-end  ', auth: MEMBER_AUTH });
        const stored = deps.store.get('room-trim-end') as Record<string, unknown>;
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
            await svc.endSession({ roomName: 'room-x', auth: MEMBER_AUTH });
            throw new Error('expected endSession to throw');
        } catch (err) {
            expect(err).toBeInstanceOf(HttpError);
            expect((err as { status?: number }).status).toBe(404);
        }
    });

    it('endSession denies cross-user access for non-admin in same org', async () => {
        vi.resetModules();
        setRequiredEnv();

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const { HttpError } = await import('../dist/lib/httpErrors.js');
        const deps = buildDeps();
        deps.store.set('room-1', {
            userIdentity: 'u',
            sessionId: 's',
            orgId: ORG_ID_A,
            createdByUserId: 'different_user',
            createdAt: new Date().toISOString(),
        });
        const svc = createSessionService(deps);

        await expect(
            svc.endSession({ roomName: 'room-1', auth: MEMBER_AUTH })
        ).rejects.toBeInstanceOf(HttpError);
        const stored = deps.store.get('room-1') as Record<string, unknown>;
        expect(stored.endedAt).toBeUndefined();
    });

    it('endSession denies cross-org access by sessionId', async () => {
        vi.resetModules();
        setRequiredEnv();

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const { HttpError } = await import('../dist/lib/httpErrors.js');
        const deps = buildDeps();
        deps.store.set('room-1', {
            userIdentity: 'u',
            sessionId: 'session-1',
            orgId: ORG_ID_B,
            createdByUserId: 'member_user_1',
            createdAt: new Date().toISOString(),
        });
        const svc = createSessionService(deps);

        await expect(
            svc.endSession({ sessionId: 'session-1', auth: MEMBER_AUTH })
        ).rejects.toBeInstanceOf(HttpError);
        const stored = deps.store.get('room-1') as Record<string, unknown>;
        expect(stored.endedAt).toBeUndefined();
    });

    it('endSession allows same-org admins to end another user session by sessionId', async () => {
        vi.resetModules();
        setRequiredEnv();

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const deps = buildDeps();
        deps.store.set('room-1', {
            userIdentity: 'u',
            sessionId: 'session-1',
            orgId: ORG_ID_A,
            createdByUserId: 'member_user_2',
            createdAt: new Date().toISOString(),
        });
        const svc = createSessionService(deps);

        await svc.endSession({ sessionId: 'session-1', auth: ADMIN_AUTH });
        const stored = deps.store.get('room-1') as Record<string, unknown>;
        expect(stored.endedAt).toBeDefined();
    });

    it('endSession trims sessionId before lookup', async () => {
        vi.resetModules();
        setRequiredEnv();

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const deps = buildDeps();
        deps.store.set('room-trim-sid', {
            userIdentity: 'u',
            sessionId: 'session-trim',
            orgId: ORG_ID_A,
            createdByUserId: 'member_user_1',
            createdAt: new Date().toISOString(),
        });
        const svc = createSessionService(deps);

        await svc.endSession({ sessionId: '  session-trim  ', auth: MEMBER_AUTH });
        const stored = deps.store.get('room-trim-sid') as Record<string, unknown>;
        expect(stored.endedAt).toBeDefined();
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

    it('cleanupSession trims roomName before deleting room', async () => {
        vi.resetModules();
        setRequiredEnv();

        const deleteRoom = vi.fn().mockResolvedValue(undefined);
        const deps = buildDeps({ deleteRoom });
        deps.store.set('room-trim-clean', {
            userIdentity: 'u',
            sessionId: 's',
            createdAt: new Date().toISOString(),
        });

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const svc = createSessionService(deps);

        await svc.cleanupSession('  room-trim-clean  ');
        expect(deleteRoom).toHaveBeenCalledWith('room-trim-clean');
        expect(deps.store.has('room-trim-clean')).toBe(false);
    });
});
