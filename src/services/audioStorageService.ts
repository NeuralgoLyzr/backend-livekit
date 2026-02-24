import { mkdir, writeFile, access } from 'fs/promises';
import path from 'path';
import { logger } from '../lib/logger.js';

const DEFAULT_RECORDINGS_DIR = 'data/recordings';

export function createAudioStorageService(recordingsDir?: string) {
    const dir = path.resolve(recordingsDir ?? DEFAULT_RECORDINGS_DIR);

    let ensured = false;
    async function ensureDir(): Promise<void> {
        if (ensured) return;
        await mkdir(dir, { recursive: true });
        ensured = true;
    }

    return {
        async save(sessionId: string, audioBuffer: Buffer): Promise<string> {
            await ensureDir();
            const filename = `${sessionId}.ogg`;
            const filePath = path.join(dir, filename);
            await writeFile(filePath, audioBuffer);
            logger.info(
                {
                    event: 'audio_recording_saved',
                    sessionId,
                    path: filePath,
                    sizeBytes: audioBuffer.length,
                },
                'Saved audio recording'
            );
            return filename;
        },

        async getFilePath(sessionId: string): Promise<string | null> {
            const filePath = path.join(dir, `${sessionId}.ogg`);
            try {
                await access(filePath);
                return filePath;
            } catch {
                return null;
            }
        },
    };
}

export type AudioStorageService = ReturnType<typeof createAudioStorageService>;
