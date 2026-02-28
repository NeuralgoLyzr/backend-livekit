import { createClient, type RedisClientType } from 'redis';
import type { SessionStorePort } from '../../ports/sessionStorePort.js';
import { SessionDataSchema, type SessionData } from '../../types/index.js';
import { logger } from '../../lib/logger.js';

interface RedisSessionStoreDeps {
    redisClient?: RedisClientType;
}

export interface RedisSessionStoreOptions {
    redisUrl: string;
    keyPrefix?: string;
    ttlSeconds?: number;
}

const DEFAULT_KEY_PREFIX = 'session:';
const DEFAULT_SCAN_COUNT = 100;

export class RedisSessionStore implements SessionStorePort {
    private readonly client: RedisClientType;
    private readonly keyPrefix: string;
    private readonly sessionIdIndexPrefix: string;
    private readonly ttlSeconds?: number;
    private connectPromise: Promise<void> | null;

    constructor(options: RedisSessionStoreOptions, deps?: RedisSessionStoreDeps) {
        this.keyPrefix = options.keyPrefix?.trim() || DEFAULT_KEY_PREFIX;
        this.sessionIdIndexPrefix = `session-id-index:${this.keyPrefix}`;
        this.ttlSeconds =
            typeof options.ttlSeconds === 'number' && options.ttlSeconds > 0
                ? Math.floor(options.ttlSeconds)
                : undefined;
        this.connectPromise = null;

        this.client =
            deps?.redisClient ??
            createClient({
                url: options.redisUrl,
            });

        this.client.on('error', (error) => {
            logger.error(
                {
                    err: error,
                    event: 'session_store_redis_error',
                },
                'Redis session store client error'
            );
        });
    }

    async set(roomName: string, data: SessionData): Promise<void> {
        await this.ensureConnected();

        const key = this.keyFor(roomName);
        const existingRaw = await this.client.get(key);
        const existingSessionId = existingRaw ? this.parseSessionData(existingRaw)?.sessionId : undefined;
        const payload = JSON.stringify(data);

        if (this.ttlSeconds) {
            await this.client.set(key, payload, { EX: this.ttlSeconds });
            await this.client.set(this.sessionIdKeyFor(data.sessionId), roomName, { EX: this.ttlSeconds });
        } else {
            await this.client.set(key, payload);
            await this.client.set(this.sessionIdKeyFor(data.sessionId), roomName);
        }

        if (existingSessionId && existingSessionId !== data.sessionId) {
            await this.client.del(this.sessionIdKeyFor(existingSessionId));
        }
    }

    async get(roomName: string): Promise<SessionData | undefined> {
        await this.ensureConnected();

        const value = await this.client.get(this.keyFor(roomName));
        if (!value) {
            return undefined;
        }
        return this.parseSessionData(value);
    }

    async getBySessionId(
        sessionId: string
    ): Promise<{ roomName: string; data: SessionData } | undefined> {
        await this.ensureConnected();

        const roomName = await this.client.get(this.sessionIdKeyFor(sessionId));
        if (!roomName) {
            return undefined;
        }

        const data = await this.get(roomName);
        if (!data || data.sessionId !== sessionId) {
            await this.client.del(this.sessionIdKeyFor(sessionId));
            return undefined;
        }

        return { roomName, data };
    }

    async delete(roomName: string): Promise<boolean> {
        await this.ensureConnected();
        const existingRaw = await this.client.get(this.keyFor(roomName));
        const existingSessionId = existingRaw ? this.parseSessionData(existingRaw)?.sessionId : undefined;
        const deletedCount = await this.client.del(this.keyFor(roomName));
        if (existingSessionId) {
            await this.client.del(this.sessionIdKeyFor(existingSessionId));
        }
        return deletedCount > 0;
    }

    async has(roomName: string): Promise<boolean> {
        await this.ensureConnected();
        const count = await this.client.exists(this.keyFor(roomName));
        return count > 0;
    }

    async entries(): Promise<Array<[roomName: string, data: SessionData]>> {
        await this.ensureConnected();

        const keys: string[] = [];
        for await (const keyChunk of this.client.scanIterator({
            MATCH: `${this.keyPrefix}*`,
            COUNT: DEFAULT_SCAN_COUNT,
        }) as AsyncIterable<string | string[]>) {
            if (Array.isArray(keyChunk)) {
                keys.push(...keyChunk);
            } else {
                keys.push(keyChunk);
            }
        }

        if (keys.length === 0) {
            return [];
        }

        const values: Array<string | null> = await this.client.sendCommand(['MGET', ...keys]);
        const entries: Array<[roomName: string, data: SessionData]> = [];

        for (const [index, raw] of values.entries()) {
            if (!raw) {
                continue;
            }
            const sessionData = this.parseSessionData(raw);
            if (!sessionData) {
                continue;
            }
            const roomName = this.roomNameFromKey(keys[index]);
            entries.push([roomName, sessionData]);
        }

        return entries;
    }

    async close(): Promise<void> {
        if (!this.client.isOpen) {
            return;
        }
        await this.client.quit();
    }

    private keyFor(roomName: string): string {
        return `${this.keyPrefix}${roomName}`;
    }

    private roomNameFromKey(key: string): string {
        if (!key.startsWith(this.keyPrefix)) {
            return key;
        }
        return key.slice(this.keyPrefix.length);
    }

    private sessionIdKeyFor(sessionId: string): string {
        return `${this.sessionIdIndexPrefix}${sessionId}`;
    }

    private parseSessionData(raw: string): SessionData | undefined {
        try {
            const parsed = JSON.parse(raw) as unknown;
            const result = SessionDataSchema.safeParse(parsed);
            if (result.success) {
                return result.data;
            }

            logger.warn(
                {
                    event: 'session_store_invalid_data',
                    issues: result.error.issues,
                },
                'Skipping invalid session data read from Redis'
            );
            return undefined;
        } catch (error) {
            logger.warn(
                {
                    err: error,
                    event: 'session_store_invalid_json',
                },
                'Skipping malformed session data read from Redis'
            );
            return undefined;
        }
    }

    private async ensureConnected(): Promise<void> {
        if (this.client.isOpen) {
            return;
        }

        if (!this.connectPromise) {
            this.connectPromise = this.client
                .connect()
                .then(() => undefined)
                .finally(() => {
                    this.connectPromise = null;
                });
        }

        await this.connectPromise;
    }
}
