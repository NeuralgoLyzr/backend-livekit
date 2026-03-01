import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('audio storage adapters', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('local adapter persists and reads back audio recordings', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lk-audio-local-'));
        try {
            const { createLocalAudioStorage } = await import(
                '../src/adapters/audioStorage/localAudioStorage.js'
            );
            const storage = createLocalAudioStorage({
                recordingsDir: tempDir,
            });

            await storage.save('00000000-0000-4000-8000-000000000000', Buffer.from('fake-ogg-data'));
            const audio = await storage.get('00000000-0000-4000-8000-000000000000');

            expect(audio).not.toBeNull();
            expect(audio?.contentType).toBe('audio/ogg');
            expect(audio?.data.toString('utf8')).toBe('fake-ogg-data');
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    it('s3 adapter uploads and reads audio recordings using configured key prefix', async () => {
        const send = vi.fn(async (command: unknown) => {
            if (command instanceof PutObjectCommand) {
                return {};
            }
            if (command instanceof GetObjectCommand) {
                return {
                    ContentType: 'audio/ogg',
                    Body: {
                        transformToByteArray: async () => Uint8Array.from(Buffer.from('from-s3')),
                    },
                };
            }
            throw new Error('Unexpected command type');
        });

        const { createS3AudioStorage } = await import('../src/adapters/audioStorage/s3AudioStorage.js');
        const storage = createS3AudioStorage(
            {
                bucket: 'test-bucket',
                region: 'us-east-1',
                keyPrefix: 'voice-recordings/',
            },
            { client: { send } as never }
        );

        await storage.save('00000000-0000-4000-8000-000000000000', Buffer.from('payload'));
        const audio = await storage.get('00000000-0000-4000-8000-000000000000');

        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({
                input: expect.objectContaining({
                    Bucket: 'test-bucket',
                    Key: 'voice-recordings/00000000-0000-4000-8000-000000000000.ogg',
                }),
            })
        );
        expect(audio?.contentType).toBe('audio/ogg');
        expect(audio?.data.toString('utf8')).toBe('from-s3');
    });

    it('s3 adapter returns null when object is missing', async () => {
        const send = vi.fn(async (command: unknown) => {
            if (command instanceof GetObjectCommand) {
                const error = new Error('missing');
                (error as { name?: string }).name = 'NoSuchKey';
                throw error;
            }
            return {};
        });

        const { createS3AudioStorage } = await import('../src/adapters/audioStorage/s3AudioStorage.js');
        const storage = createS3AudioStorage(
            {
                bucket: 'test-bucket',
                region: 'us-east-1',
            },
            { client: { send } as never }
        );

        await expect(storage.get('00000000-0000-4000-8000-000000000000')).resolves.toBeNull();
    });
});
