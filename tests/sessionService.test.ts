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

    it('records rounded non-negative step timings for successful session creation', async () => {
        vi.resetModules();
        setRequiredEnv();

        const deps = buildDeps();
        const timingsMs: Record<string, number> = {};
        const nowValues = [1000.2, 1001.0, 1003.9, 1005.2, 1008.6, 1010.1, 1015.4, 1020.2, 1026.8, 1030.3, 1035.9, 1040.4];
        const now = vi.fn(() => nowValues.shift() ?? 1040.4);

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const svc = createSessionService(deps);

        await svc.createSession({ userIdentity: 'user_timing' }, { timingsMs, now });

        expect(timingsMs).toEqual({
            resolveConfigMs: 3,
            finalizeConfigMs: 3,
            tokenMintMs: 5,
            dispatchMs: 7,
            storeWriteMs: 6,
            totalMs: 40,
        });
    });

    it('wraps agent dispatch failures as 502 and does not store the session', async () => {
        vi.resetModules();
        setRequiredEnv();

        const deps = buildDeps({
            dispatchAgent: vi.fn().mockRejectedValue(new Error('nope')),
        });

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const svc = createSessionService(deps);

        await expect(svc.createSession({ userIdentity: 'user_1' })).rejects.toMatchObject({
            name: 'HttpError',
            status: 502,
            message: 'Failed to dispatch agent',
            details: 'nope',
        });
        expect(deps.store.size()).toBe(0);
    });

    it('records dispatch and total timings on dispatch failure', async () => {
        vi.resetModules();
        setRequiredEnv();

        const deps = buildDeps({
            dispatchAgent: vi.fn().mockRejectedValue(new Error('nope')),
        });
        const timingsMs: Record<string, number> = {};
        const nowValues = [2000, 2001, 2004, 2005, 2008, 2010, 2012, 2015, 2022, 2025];
        const now = vi.fn(() => nowValues.shift() ?? 2025);

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const svc = createSessionService(deps);

        await expect(
            svc.createSession({ userIdentity: 'user_1' }, { timingsMs, now })
        ).rejects.toMatchObject({
            status: 502,
            details: 'nope',
        });

        expect(timingsMs.resolveConfigMs).toBe(3);
        expect(timingsMs.finalizeConfigMs).toBe(3);
        expect(timingsMs.tokenMintMs).toBe(2);
        expect(timingsMs.dispatchMs).toBe(7);
        expect(timingsMs.totalMs).toBe(25);
        expect(deps.store.size()).toBe(0);
    });

    it('logs dispatch attempt only in development mode', async () => {
        vi.resetModules();
        setRequiredEnv({ APP_ENV: 'production' });

        const { logger } = await import('../dist/lib/logger.js');
        const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => undefined);

        const deps = buildDeps();
        const { createSessionService } = await import('../dist/services/sessionService.js');
        const svc = createSessionService(deps);

        await svc.createSession({ userIdentity: 'user_prod', agentConfig: {} });
        expect(debugSpy).not.toHaveBeenCalled();

        setRequiredEnv({ APP_ENV: 'dev' });
        await svc.createSession({
            userIdentity: 'user_dev',
            agentConfig: { api_key: 'dev-api-key' },
        });
        expect(debugSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'session_create_dispatch_attempt',
                userIdentity: 'user_dev',
                hasApiKey: true,
                agentConfig: expect.any(Object),
            }),
            'Dispatching agent (dev)'
        );
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

    it('defaults requesterIsAdmin to false when omitted for agentId resolution scope', async () => {
        vi.resetModules();
        setRequiredEnv();

        const resolveByAgentId = vi.fn().mockResolvedValue({
            prompt: 'Resolved config',
        });
        const deps = buildDeps({ resolveByAgentId });

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const svc = createSessionService(deps);

        await svc.createSession({
            userIdentity: 'user_1',
            agentId: '507f1f77bcf86cd799439011',
            orgId: ORG_ID_A,
            createdByUserId: 'member_user_1',
        });

        expect(resolveByAgentId).toHaveBeenCalledWith(
            expect.objectContaining({
                accessScope: expect.objectContaining({
                    isAdmin: false,
                }),
            })
        );
    });

    it('rejects agentId session creation when auth context is missing', async () => {
        vi.resetModules();
        setRequiredEnv();

        const resolveByAgentId = vi.fn().mockResolvedValue({});
        const deps = buildDeps({ resolveByAgentId });

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const svc = createSessionService(deps);

        await expect(
            svc.createSession({
                userIdentity: 'user_1',
                agentId: '507f1f77bcf86cd799439011',
            })
        ).rejects.toMatchObject({
            name: 'HttpError',
            status: 401,
            message: 'Missing auth context',
        });
        expect(resolveByAgentId).not.toHaveBeenCalled();
    });

    it('endSession requires roomName or sessionId', async () => {
        vi.resetModules();
        setRequiredEnv();

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const deps = buildDeps();
        const svc = createSessionService(deps);

        await expect(svc.endSession({ auth: MEMBER_AUTH })).rejects.toMatchObject({
            status: 400,
            message: 'Must provide roomName or sessionId',
        });
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
        const deps = buildDeps();
        const svc = createSessionService(deps);

        await expect(
            svc.endSession({ roomName: 'room-x', auth: MEMBER_AUTH })
        ).rejects.toMatchObject({
            name: 'HttpError',
            status: 404,
            message: 'Session not found for room',
        });
    });

    it('endSession denies cross-user access for non-admin in same org', async () => {
        vi.resetModules();
        setRequiredEnv();

        const { createSessionService } = await import('../dist/services/sessionService.js');
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
        ).rejects.toMatchObject({
            name: 'HttpError',
            status: 404,
            message: 'Session not found for room',
        });
        const stored = deps.store.get('room-1') as Record<string, unknown>;
        expect(stored.endedAt).toBeUndefined();
    });

    it('endSession denies cross-org access by sessionId', async () => {
        vi.resetModules();
        setRequiredEnv();

        const { createSessionService } = await import('../dist/services/sessionService.js');
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
        ).rejects.toMatchObject({
            name: 'HttpError',
            status: 404,
            message: 'Session not found for sessionId',
        });
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

    it('endSession by sessionId updates only the matching session entry', async () => {
        vi.resetModules();
        setRequiredEnv();

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const deps = buildDeps();
        deps.store.set('room-a', {
            userIdentity: 'u',
            sessionId: 'session-a',
            orgId: ORG_ID_A,
            createdByUserId: 'member_user_1',
            createdAt: new Date().toISOString(),
        });
        deps.store.set('room-b', {
            userIdentity: 'u',
            sessionId: 'session-b',
            orgId: ORG_ID_A,
            createdByUserId: 'member_user_1',
            createdAt: new Date().toISOString(),
        });
        const svc = createSessionService(deps);

        await svc.endSession({ sessionId: 'session-b', auth: MEMBER_AUTH });
        const roomA = deps.store.get('room-a') as Record<string, unknown>;
        const roomB = deps.store.get('room-b') as Record<string, unknown>;

        expect(roomA.endedAt).toBeUndefined();
        expect(roomB.endedAt).toBeDefined();
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

    it('cleanupSession throws 502 with context when room deletion fails', async () => {
        vi.resetModules();
        setRequiredEnv();

        const deleteRoom = vi.fn().mockRejectedValue(new Error('lk delete failed'));
        const deps = buildDeps({ deleteRoom });
        deps.store.set('room-delete-fail', {
            userIdentity: 'u',
            sessionId: 's',
            createdAt: new Date().toISOString(),
        });

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const svc = createSessionService(deps);

        await expect(svc.cleanupSession('room-delete-fail')).rejects.toMatchObject({
            status: 502,
            message: 'Failed to delete LiveKit room "room-delete-fail"',
            details: 'lk delete failed',
        });
        expect(deps.store.has('room-delete-fail')).toBe(true);
    });
});
