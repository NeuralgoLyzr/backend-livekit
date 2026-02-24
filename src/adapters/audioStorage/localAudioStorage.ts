import { access, mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import type { AudioStoragePort, StoredAudioObject } from '../../ports/audioStoragePort.js';
import { logger } from '../../lib/logger.js';

const DEFAULT_RECORDINGS_DIR = 'data/recordings';
const DEFAULT_CONTENT_TYPE = 'audio/ogg';

export interface LocalAudioStorageOptions {
    recordingsDir?: string;
}

export function createLocalAudioStorage(
    options?: LocalAudioStorageOptions
): AudioStoragePort {
    const dir = path.resolve(options?.recordingsDir ?? DEFAULT_RECORDINGS_DIR);

    let ensured = false;
    async function ensureDir(): Promise<void> {
        if (ensured) return;
        await mkdir(dir, { recursive: true });
        ensured = true;
    }

    function filePathFor(sessionId: string): string {
        return path.join(dir, `${sessionId}.ogg`);
    }

    return {
        async save(sessionId: string, audioBuffer: Buffer): Promise<string> {
            await ensureDir();
            const filename = `${sessionId}.ogg`;
            const filePath = filePathFor(sessionId);
            await writeFile(filePath, audioBuffer);
            logger.info(
                {
                    event: 'audio_recording_saved',
                    sessionId,
                    path: filePath,
                    sizeBytes: audioBuffer.length,
                    storageBackend: 'local',
                },
                'Saved audio recording'
            );
            return filename;
        },

        async get(sessionId: string): Promise<StoredAudioObject | null> {
            const filePath = filePathFor(sessionId);
            try {
                await access(filePath);
            } catch {
                return null;
            }

            const data = await readFile(filePath);
            return {
                data,
                contentType: DEFAULT_CONTENT_TYPE,
            };
        },
    };
}
