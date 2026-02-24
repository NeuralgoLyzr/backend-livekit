import type { AudioStoragePort } from '../ports/audioStoragePort.js';
import { createLocalAudioStorage } from '../adapters/audioStorage/localAudioStorage.js';
import { createS3AudioStorage } from '../adapters/audioStorage/s3AudioStorage.js';

export interface AudioStorageConfig {
    provider: 'local' | 's3';
    local: {
        recordingsDir: string;
    };
    s3: {
        bucket: string;
        region: string;
        keyPrefix: string;
        endpoint?: string;
        forcePathStyle?: boolean;
        accessKeyId?: string;
        secretAccessKey?: string;
        sessionToken?: string;
    };
}

export function createAudioStorageService(config: AudioStorageConfig): AudioStoragePort {
    if (config.provider === 's3') {
        return createS3AudioStorage({
            bucket: config.s3.bucket,
            region: config.s3.region,
            keyPrefix: config.s3.keyPrefix,
            endpoint: config.s3.endpoint,
            forcePathStyle: config.s3.forcePathStyle,
            accessKeyId: config.s3.accessKeyId,
            secretAccessKey: config.s3.secretAccessKey,
            sessionToken: config.s3.sessionToken,
        });
    }

    return createLocalAudioStorage({
        recordingsDir: config.local.recordingsDir,
    });
}

export type AudioStorageService = AudioStoragePort;
