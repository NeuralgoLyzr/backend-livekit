import { describe, expect, it, vi } from 'vitest';

import { setRequiredEnv } from './testUtils.js';

async function loadConfig(overrides?: Record<string, string | undefined>) {
    vi.resetModules();
    setRequiredEnv(overrides);
    return import('../src/config/index.ts');
}

describe('storage provider config validation', () => {
    it('uses local session store + local recording storage by default', async () => {
        const mod = await loadConfig({
            SESSION_STORE_PROVIDER: undefined,
            RECORDING_STORAGE_PROVIDER: undefined,
        });

        expect(mod.config.sessionStore.provider).toBe('local');
        expect(mod.config.recordingStorage.provider).toBe('local');
    });

    it('requires REDIS_URL when SESSION_STORE_PROVIDER=redis', async () => {
        await expect(
            loadConfig({
                SESSION_STORE_PROVIDER: 'redis',
                REDIS_URL: undefined,
            })
        ).rejects.toThrow('REDIS_URL is required when SESSION_STORE_PROVIDER=redis');
    });

    it('rejects invalid SESSION_STORE_PROVIDER', async () => {
        await expect(
            loadConfig({
                SESSION_STORE_PROVIDER: 'postgres',
            })
        ).rejects.toThrow('SESSION_STORE_PROVIDER must be "local" or "redis"');
    });

    it('requires bucket + region when RECORDING_STORAGE_PROVIDER=s3', async () => {
        await expect(
            loadConfig({
                RECORDING_STORAGE_PROVIDER: 's3',
                S3_RECORDINGS_BUCKET: undefined,
                S3_REGION: 'us-east-1',
            })
        ).rejects.toThrow('S3_RECORDINGS_BUCKET is required when RECORDING_STORAGE_PROVIDER=s3');

        await expect(
            loadConfig({
                RECORDING_STORAGE_PROVIDER: 's3',
                S3_RECORDINGS_BUCKET: 'test-bucket',
                S3_REGION: undefined,
            })
        ).rejects.toThrow('S3_REGION is required when RECORDING_STORAGE_PROVIDER=s3');
    });

    it('rejects invalid RECORDING_STORAGE_PROVIDER', async () => {
        await expect(
            loadConfig({
                RECORDING_STORAGE_PROVIDER: 'gcs',
            })
        ).rejects.toThrow('RECORDING_STORAGE_PROVIDER must be "local" or "s3"');
    });

    it('validates static S3 credentials as a pair', async () => {
        await expect(
            loadConfig({
                RECORDING_STORAGE_PROVIDER: 's3',
                S3_RECORDINGS_BUCKET: 'test-bucket',
                S3_REGION: 'us-east-1',
                S3_ACCESS_KEY_ID: 'akid',
                S3_SECRET_ACCESS_KEY: undefined,
            })
        ).rejects.toThrow(
            'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must both be set when using static S3 credentials'
        );

        await expect(
            loadConfig({
                RECORDING_STORAGE_PROVIDER: 's3',
                S3_RECORDINGS_BUCKET: 'test-bucket',
                S3_REGION: 'us-east-1',
                S3_ACCESS_KEY_ID: undefined,
                S3_SECRET_ACCESS_KEY: 'secret',
            })
        ).rejects.toThrow(
            'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must both be set when using static S3 credentials'
        );
    });

    it('defaults REDIS_SESSION_TTL_SECONDS to 3600 when unset', async () => {
        const mod = await loadConfig({
            SESSION_STORE_PROVIDER: 'redis',
            REDIS_URL: 'redis://localhost:6379',
            REDIS_SESSION_TTL_SECONDS: undefined,
        });

        expect(mod.config.sessionStore.redis.ttlSeconds).toBe(3600);
    });

    it('parses valid redis + s3 configuration', async () => {
        const mod = await loadConfig({
            SESSION_STORE_PROVIDER: 'redis',
            REDIS_URL: 'redis://localhost:6379',
            REDIS_SESSION_KEY_PREFIX: 'lk-session:',
            REDIS_SESSION_TTL_SECONDS: '3600',
            RECORDING_STORAGE_PROVIDER: 's3',
            S3_RECORDINGS_BUCKET: 'test-bucket',
            S3_REGION: 'us-east-1',
            S3_FORCE_PATH_STYLE: 'true',
            S3_ACCESS_KEY_ID: 'akid',
            S3_SECRET_ACCESS_KEY: 'secret',
        });

        expect(mod.config.sessionStore.provider).toBe('redis');
        expect(mod.config.sessionStore.redis.url).toBe('redis://localhost:6379');
        expect(mod.config.sessionStore.redis.keyPrefix).toBe('lk-session:');
        expect(mod.config.sessionStore.redis.ttlSeconds).toBe(3600);
        expect(mod.config.recordingStorage.provider).toBe('s3');
        expect(mod.config.recordingStorage.s3.bucket).toBe('test-bucket');
        expect(mod.config.recordingStorage.s3.region).toBe('us-east-1');
        expect(mod.config.recordingStorage.s3.forcePathStyle).toBe(true);
    });
});
