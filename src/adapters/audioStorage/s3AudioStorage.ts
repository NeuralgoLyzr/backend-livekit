import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { AudioStoragePort, StoredAudioObject } from '../../ports/audioStoragePort.js';
import { logger } from '../../lib/logger.js';

const DEFAULT_CONTENT_TYPE = 'audio/ogg';
const DEFAULT_KEY_PREFIX = 'recordings/';

type S3LikeClient = Pick<S3Client, 'send'>;

interface ByteArrayBody {
    transformToByteArray: () => Promise<Uint8Array>;
}

function isByteArrayBody(body: unknown): body is ByteArrayBody {
    return (
        typeof body === 'object' &&
        body !== null &&
        'transformToByteArray' in body &&
        typeof (body as { transformToByteArray?: unknown }).transformToByteArray === 'function'
    );
}

function isS3ObjectNotFoundError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
        return false;
    }
    const name = String((error as { name?: unknown }).name ?? '');
    return name === 'NoSuchKey' || name === 'NotFound';
}

export interface S3AudioStorageOptions {
    bucket: string;
    region: string;
    keyPrefix?: string;
    endpoint?: string;
    forcePathStyle?: boolean;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
}

export interface S3AudioStorageDeps {
    client?: S3LikeClient;
}

export function createS3AudioStorage(
    options: S3AudioStorageOptions,
    deps?: S3AudioStorageDeps
): AudioStoragePort {
    const keyPrefix = options.keyPrefix?.trim() || DEFAULT_KEY_PREFIX;

    const client =
        deps?.client ??
        new S3Client({
            region: options.region,
            ...(options.endpoint ? { endpoint: options.endpoint } : {}),
            ...(typeof options.forcePathStyle === 'boolean'
                ? { forcePathStyle: options.forcePathStyle }
                : {}),
            ...(options.accessKeyId && options.secretAccessKey
                ? {
                      credentials: {
                          accessKeyId: options.accessKeyId,
                          secretAccessKey: options.secretAccessKey,
                          ...(options.sessionToken ? { sessionToken: options.sessionToken } : {}),
                      },
                  }
                : {}),
        });

    function keyFor(sessionId: string): string {
        return `${keyPrefix}${sessionId}.ogg`;
    }

    return {
        async save(sessionId: string, audioBuffer: Buffer): Promise<string> {
            const key = keyFor(sessionId);
            await client.send(
                new PutObjectCommand({
                    Bucket: options.bucket,
                    Key: key,
                    Body: audioBuffer,
                    ContentType: DEFAULT_CONTENT_TYPE,
                })
            );

            logger.info(
                {
                    event: 'audio_recording_saved',
                    sessionId,
                    s3Bucket: options.bucket,
                    s3Key: key,
                    sizeBytes: audioBuffer.length,
                    storageBackend: 's3',
                },
                'Saved audio recording'
            );

            return key;
        },

        async get(sessionId: string): Promise<StoredAudioObject | null> {
            const key = keyFor(sessionId);

            try {
                const output = await client.send(
                    new GetObjectCommand({
                        Bucket: options.bucket,
                        Key: key,
                    })
                );

                if (!isByteArrayBody(output.Body)) {
                    logger.warn(
                        {
                            event: 'audio_recording_read_invalid_body',
                            sessionId,
                            s3Bucket: options.bucket,
                            s3Key: key,
                        },
                        'S3 object body is not readable'
                    );
                    return null;
                }

                const byteArray = await output.Body.transformToByteArray();
                return {
                    data: Buffer.from(byteArray),
                    contentType: output.ContentType || DEFAULT_CONTENT_TYPE,
                };
            } catch (error) {
                if (isS3ObjectNotFoundError(error)) {
                    return null;
                }
                throw error;
            }
        },
    };
}
