import { describe, expect, it, vi } from 'vitest';

import { setRequiredEnv } from './testUtils';

function createStore() {
    const map = new Map<string, any>();
    return {
        set: (k: string, v: any) => void map.set(k, v),
        get: (k: string) => map.get(k),
        delete: (k: string) => map.delete(k),
        has: (k: string) => map.has(k),
        size: () => map.size,
    };
}

describe('sessionService (unit)', () => {
    it('creates a session, dispatches agent, and stores metadata', async () => {
        vi.resetModules();
        setRequiredEnv();

        const createUserToken = vi.fn().mockResolvedValue('token-1');
        const dispatchAgent = vi.fn().mockResolvedValue(undefined);

        vi.doMock('../dist/services/tokenService.js', () => ({
            tokenService: { createUserToken },
        }));
        vi.doMock('../dist/services/agentService.js', () => ({
            agentService: { dispatchAgent },
        }));

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const store = createStore();
        const svc = createSessionService({ store });

        const agentConfig = {
            tools: ['get_weather', 'get_weather', 'unknown_tool'],
            knowledge_base: {
                enabled: true,
                lyzr_rag: { base_url: 'x', rag_id: 'r', rag_name: 'n' },
            } as any,
        } as any;

        const result = await svc.createSession({ userIdentity: 'user_1', agentConfig });

        expect(result.userToken).toBe('token-1');
        expect(result.roomName).toMatch(/^room-/);
        expect(result.agentDispatched).toBe(true);
        expect(result.agentConfig.tools).toEqual(['get_weather', 'search_knowledge_base']);

        expect(dispatchAgent).toHaveBeenCalledTimes(1);
        const [roomName, dispatchedConfig] = dispatchAgent.mock.calls[0];
        expect(roomName).toBe(result.roomName);
        expect(dispatchedConfig.user_id).toBe('user_1');
        expect(dispatchedConfig.session_id).toBe(result.roomName);
        expect(dispatchedConfig.tools).toEqual(['get_weather', 'search_knowledge_base']);

        expect(store.has(result.roomName)).toBe(true);
        expect(store.get(result.roomName).userIdentity).toBe('user_1');
    });

    it('wraps agent dispatch failures as 502 and does not store the session', async () => {
        vi.resetModules();
        setRequiredEnv();

        vi.doMock('../dist/services/tokenService.js', () => ({
            tokenService: { createUserToken: vi.fn().mockResolvedValue('token-1') },
        }));
        vi.doMock('../dist/services/agentService.js', () => ({
            agentService: { dispatchAgent: vi.fn().mockRejectedValue(new Error('nope')) },
        }));

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const { HttpError } = await import('../dist/lib/httpErrors.js');

        const store = createStore();
        const svc = createSessionService({ store });

        await expect(svc.createSession({ userIdentity: 'user_1' })).rejects.toBeInstanceOf(HttpError);
        expect(store.size()).toBe(0);
    });

    it('endSession throws 404 when session is missing', async () => {
        vi.resetModules();
        setRequiredEnv();

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const { HttpError } = await import('../dist/lib/httpErrors.js');
        const store = createStore();
        const svc = createSessionService({ store });

        try {
            await svc.endSession('room-x');
            throw new Error('expected endSession to throw');
        } catch (err) {
            expect(err).toBeInstanceOf(HttpError);
            expect((err as any).status).toBe(404);
        }
    });

    it('endSession deletes the room and clears the store entry', async () => {
        vi.resetModules();
        setRequiredEnv();

        const deleteRoom = vi.fn().mockResolvedValue(undefined);
        vi.doMock('../dist/services/roomService.js', () => ({
            roomService: { deleteRoom },
        }));

        const { createSessionService } = await import('../dist/services/sessionService.js');
        const store = createStore();
        store.set('room-1', { userIdentity: 'u', createdAt: new Date().toISOString() });
        const svc = createSessionService({ store });

        await svc.endSession('room-1');
        expect(deleteRoom).toHaveBeenCalledWith('room-1');
        expect(store.has('room-1')).toBe(false);
    });
});
