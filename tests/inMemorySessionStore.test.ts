import { describe, expect, it } from 'vitest';

function makeSessionData(overrides?: { sessionId?: string }) {
    return {
        userIdentity: 'user_1',
        sessionId: overrides?.sessionId ?? 'session-1',
        createdAt: '2026-02-23T00:00:00.000Z',
    };
}

describe('InMemorySessionStore', () => {
    it('supports lookup by sessionId', async () => {
        const { InMemorySessionStore } = await import('../dist/adapters/sessionStore/inMemorySessionStore.js');
        const store = new InMemorySessionStore();

        const data = makeSessionData();
        await store.set('room-1', data);

        expect(await store.getBySessionId('session-1')).toEqual({
            roomName: 'room-1',
            data,
        });
    });

    it('updates sessionId index when room sessionId changes', async () => {
        const { InMemorySessionStore } = await import('../dist/adapters/sessionStore/inMemorySessionStore.js');
        const store = new InMemorySessionStore();

        await store.set('room-1', makeSessionData({ sessionId: 'session-old' }));
        await store.set('room-1', makeSessionData({ sessionId: 'session-new' }));

        expect(await store.getBySessionId('session-old')).toBeUndefined();
        expect(await store.getBySessionId('session-new')).toEqual({
            roomName: 'room-1',
            data: makeSessionData({ sessionId: 'session-new' }),
        });
    });

    it('clears sessionId index on delete', async () => {
        const { InMemorySessionStore } = await import('../dist/adapters/sessionStore/inMemorySessionStore.js');
        const store = new InMemorySessionStore();

        await store.set('room-1', makeSessionData());
        await store.delete('room-1');

        expect(await store.getBySessionId('session-1')).toBeUndefined();
    });
});
