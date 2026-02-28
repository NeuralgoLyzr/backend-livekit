import type { SessionStorePort } from '../ports/sessionStorePort.js';
import { InMemorySessionStore } from '../adapters/sessionStore/inMemorySessionStore.js';
import { RedisSessionStore } from '../adapters/sessionStore/redisSessionStore.js';
import { logger } from '../lib/logger.js';

export interface SessionStoreConfig {
    provider: 'local' | 'redis';
    redis: {
        url: string;
        keyPrefix: string;
        ttlSeconds?: number;
    };
}

export function createSessionStore(config: SessionStoreConfig): SessionStorePort {
    if (config.provider === 'redis') {
        logger.info(
            {
                event: 'session_store_provider_selected',
                provider: 'redis',
                keyPrefix: config.redis.keyPrefix,
                ttlSeconds: config.redis.ttlSeconds ?? null,
            },
            'Using Redis session store'
        );
        return new RedisSessionStore({
            redisUrl: config.redis.url,
            keyPrefix: config.redis.keyPrefix,
            ttlSeconds: config.redis.ttlSeconds,
        });
    }
    logger.info(
        {
            event: 'session_store_provider_selected',
            provider: 'local',
        },
        'Using in-memory session store'
    );
    return new InMemorySessionStore();
}
