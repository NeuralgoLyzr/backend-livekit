import type { SessionStorePort } from '../ports/sessionStorePort.js';
import { InMemorySessionStore } from '../adapters/sessionStore/inMemorySessionStore.js';
import { RedisSessionStore } from '../adapters/sessionStore/redisSessionStore.js';

export interface SessionStoreConfig {
    provider: 'memory' | 'redis';
    redis: {
        url: string;
        keyPrefix: string;
        ttlSeconds?: number;
    };
}

export function createSessionStore(config: SessionStoreConfig): SessionStorePort {
    if (config.provider === 'redis') {
        return new RedisSessionStore({
            redisUrl: config.redis.url,
            keyPrefix: config.redis.keyPrefix,
            ttlSeconds: config.redis.ttlSeconds,
        });
    }
    return new InMemorySessionStore();
}
