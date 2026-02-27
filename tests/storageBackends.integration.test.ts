import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';

function parseBoolean(v: string | undefined): boolean | undefined {
    if (!v) return undefined;
    const normalized = v.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return undefined;
}

const redisTestUrl = process.env.REDIS_TEST_URL?.trim();
const hasRedisIntegration = Boolean(redisTestUrl);

const s3TestBucket = process.env.S3_TEST_BUCKET?.trim();
const s3TestRegion = process.env.S3_TEST_REGION?.trim();
const hasS3Integration = Boolean(s3TestBucket && s3TestRegion);

const describeRedisIntegration = hasRedisIntegration ? describe : describe.skip;
const describeS3Integration = hasS3Integration ? describe : describe.skip;

describeRedisIntegration('RedisSessionStore integration', () => {
    it('persists and reads session records against a real Redis instance', async () => {
        const { RedisSessionStore } = await import('../src/adapters/sessionStore/redisSessionStore.ts');
        const keyPrefix = `it:session:${randomUUID()}:`;

        const store = new RedisSessionStore({
            redisUrl: redisTestUrl!,
            keyPrefix,
            ttlSeconds: 60,
        });

        const roomName = `room-${randomUUID()}`;
        const data = {
            userIdentity: 'integration-user',
            sessionId: randomUUID(),
            createdAt: new Date().toISOString(),
        };

        try {
            await store.set(roomName, data);
            expect(await store.has(roomName)).toBe(true);
            expect(await store.get(roomName)).toEqual(data);
            expect(await store.getBySessionId(data.sessionId)).toEqual({
                roomName,
                data,
            });

            const entries = await store.entries();
            expect(entries).toEqual(expect.arrayContaining([[roomName, data]]));

            expect(await store.delete(roomName)).toBe(true);
            expect(await store.get(roomName)).toBeUndefined();
            expect(await store.getBySessionId(data.sessionId)).toBeUndefined();
        } finally {
            if ('close' in store && typeof store.close === 'function') {
                await store.close();
            }
        }
    });
});

describeS3Integration('S3 audio storage integration', () => {
    it('writes and reads recordings against a real S3-compatible backend', async () => {
        const { createS3AudioStorage } = await import('../src/adapters/audioStorage/s3AudioStorage.ts');

        const keyPrefix = `it/recordings/${randomUUID()}/`;
        const sessionId = randomUUID();
        const storage = createS3AudioStorage({
            bucket: s3TestBucket!,
            region: s3TestRegion!,
            keyPrefix,
            endpoint: process.env.S3_TEST_ENDPOINT?.trim() || undefined,
            forcePathStyle: parseBoolean(process.env.S3_TEST_FORCE_PATH_STYLE),
            accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID?.trim() || undefined,
            secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY?.trim() || undefined,
            sessionToken: process.env.S3_TEST_SESSION_TOKEN?.trim() || undefined,
        });

        const s3Client = new S3Client({
            region: s3TestRegion!,
            endpoint: process.env.S3_TEST_ENDPOINT?.trim() || undefined,
            forcePathStyle: parseBoolean(process.env.S3_TEST_FORCE_PATH_STYLE),
            ...(process.env.S3_TEST_ACCESS_KEY_ID && process.env.S3_TEST_SECRET_ACCESS_KEY
                ? {
                      credentials: {
                          accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID,
                          secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY,
                          ...(process.env.S3_TEST_SESSION_TOKEN
                              ? { sessionToken: process.env.S3_TEST_SESSION_TOKEN }
                              : {}),
                      },
                  }
                : {}),
        });

        const audioPayload = Buffer.from('integration-ogg-bytes');
        let objectKey: string | null = null;

        try {
            objectKey = await storage.save(sessionId, audioPayload);
            const audioObject = await storage.get(sessionId);

            expect(audioObject).not.toBeNull();
            expect(audioObject?.contentType).toBe('audio/ogg');
            expect(audioObject?.data.equals(audioPayload)).toBe(true);
        } finally {
            if (objectKey) {
                await s3Client.send(
                    new DeleteObjectCommand({
                        Bucket: s3TestBucket!,
                        Key: objectKey,
                    })
                );
            }
            s3Client.destroy();
        }
    });
});
