import { beforeEach, describe, expect, it, vi } from 'vitest';

type FakeRedisSetOptions = {
    EX?: number;
};

function createFakeRedisClient() {
    const values = new Map<string, string>();
    const client = {
        isOpen: false,
        on: vi.fn(),
        connect: vi.fn(async () => {
            client.isOpen = true;
        }),
        set: vi.fn(async (key: string, value: string, _options?: FakeRedisSetOptions) => {
            values.set(key, value);
            return 'OK';
        }),
        get: vi.fn(async (key: string) => values.get(key) ?? null),
        del: vi.fn(async (key: string) => (values.delete(key) ? 1 : 0)),
        exists: vi.fn(async (key: string) => (values.has(key) ? 1 : 0)),
        mGet: vi.fn(async (keys: string[]) => keys.map((key) => values.get(key) ?? null)),
        sendCommand: vi.fn(async (args: string[]) => {
            const [command, ...keys] = args;
            if (command.toUpperCase() === 'MGET') {
                return keys.map((key) => values.get(key) ?? null);
            }
            throw new Error(`Unsupported command: ${command}`);
        }),
        scanIterator: vi.fn((options?: { MATCH?: string }) => {
            const pattern = options?.MATCH || '*';
            const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern;
            const keys = Array.from(values.keys()).filter((key) => key.startsWith(prefix));

            async function* generator() {
                for (const key of keys) {
                    yield key;
                }
            }

            return generator();
        }),
        quit: vi.fn(async () => {
            client.isOpen = false;
        }),
    };

    return {
        client,
        setRaw(key: string, value: string) {
            values.set(key, value);
        },
    };
}

function makeSessionData() {
    return {
        userIdentity: 'user_1',
        sessionId: 'session-1',
        createdAt: '2026-02-23T00:00:00.000Z',
    };
}

describe('RedisSessionStore', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('stores, reads, lists, and deletes sessions', async () => {
        const fakeRedis = createFakeRedisClient();
        const { RedisSessionStore } = await import('../dist/adapters/sessionStore/redisSessionStore.js');

        const store = new RedisSessionStore(
            {
                redisUrl: 'redis://example.invalid:6379',
                keyPrefix: 'lk-session:',
            },
            { redisClient: fakeRedis.client as never }
        );

        const sessionData = makeSessionData();
        await store.set('room-1', sessionData);

        expect(fakeRedis.client.connect).toHaveBeenCalledTimes(1);
        expect(await store.has('room-1')).toBe(true);
        expect(await store.get('room-1')).toEqual(sessionData);
        expect(await store.entries()).toEqual([['room-1', sessionData]]);
        expect(await store.delete('room-1')).toBe(true);
        expect(await store.get('room-1')).toBeUndefined();
    });

    it('applies EX ttl to redis writes when ttlSeconds is configured', async () => {
        const fakeRedis = createFakeRedisClient();
        const { RedisSessionStore } = await import('../dist/adapters/sessionStore/redisSessionStore.js');

        const store = new RedisSessionStore(
            {
                redisUrl: 'redis://example.invalid:6379',
                ttlSeconds: 120,
            },
            { redisClient: fakeRedis.client as never }
        );

        const sessionData = makeSessionData();
        await store.set('room-ttl', sessionData);

        expect(fakeRedis.client.set).toHaveBeenCalledWith(
            'session:room-ttl',
            JSON.stringify(sessionData),
            { EX: 120 }
        );
    });

    it('skips malformed redis entries when listing sessions', async () => {
        const fakeRedis = createFakeRedisClient();
        const { RedisSessionStore } = await import('../dist/adapters/sessionStore/redisSessionStore.js');

        fakeRedis.setRaw('lk-session:room-valid', JSON.stringify(makeSessionData()));
        fakeRedis.setRaw('lk-session:room-invalid', '{"unexpected":"shape"}');

        const store = new RedisSessionStore(
            {
                redisUrl: 'redis://example.invalid:6379',
                keyPrefix: 'lk-session:',
            },
            { redisClient: fakeRedis.client as never }
        );

        expect(await store.entries()).toEqual([['room-valid', makeSessionData()]]);
    });

    it('returns undefined when get reads malformed JSON', async () => {
        const fakeRedis = createFakeRedisClient();
        const { RedisSessionStore } = await import('../dist/adapters/sessionStore/redisSessionStore.js');

        fakeRedis.setRaw('session:room-bad-json', 'not-json');
        const store = new RedisSessionStore(
            {
                redisUrl: 'redis://example.invalid:6379',
            },
            { redisClient: fakeRedis.client as never }
        );

        await expect(store.get('room-bad-json')).resolves.toBeUndefined();
    });

    it('propagates redis entries command failures', async () => {
        const fakeRedis = createFakeRedisClient();
        const { RedisSessionStore } = await import('../dist/adapters/sessionStore/redisSessionStore.js');

        fakeRedis.setRaw('session:room-1', JSON.stringify(makeSessionData()));
        fakeRedis.client.sendCommand.mockRejectedValueOnce(new Error('redis down'));
        const store = new RedisSessionStore(
            {
                redisUrl: 'redis://example.invalid:6379',
            },
            { redisClient: fakeRedis.client as never }
        );

        await expect(store.entries()).rejects.toThrow('redis down');
    });

    it('propagates connection failures', async () => {
        const fakeRedis = createFakeRedisClient();
        const { RedisSessionStore } = await import('../dist/adapters/sessionStore/redisSessionStore.js');

        fakeRedis.client.connect.mockRejectedValueOnce(new Error('connection refused'));
        const store = new RedisSessionStore(
            {
                redisUrl: 'redis://example.invalid:6379',
            },
            { redisClient: fakeRedis.client as never }
        );

        await expect(store.set('room-1', makeSessionData())).rejects.toThrow('connection refused');
    });
});
