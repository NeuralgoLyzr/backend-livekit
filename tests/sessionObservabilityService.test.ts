import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Crypto from 'crypto';

import { setRequiredEnv } from './testUtils.js';

function makePayload(overrides?: Record<string, unknown>) {
    return {
        roomName: 'room-abc',
        sessionId: '00000000-0000-4000-8000-000000000000',
        orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
        closeReason: null,
        sessionReport: {
            job_id: 'job-1',
            room_id: 'rid-1',
            room: 'room-abc',
            events: [{ type: 'unknown_event', created_at: 1 }],
            timestamp: 2,
        },
        ...overrides,
    };
}

describe('sessionObservabilityService (unit)', () => {
    beforeEach(() => {
        setRequiredEnv();
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it('resolves session data, persists transcript, and runs cleanup', async () => {
        const saveFromObservability = vi.fn().mockResolvedValue(null);
        const cleanupSession = vi.fn().mockResolvedValue(undefined);
        const get = vi.fn().mockResolvedValue({
            sessionId: '00000000-0000-4000-8000-000000000099',
            orgId: '96f0cee4-bb87-4477-8eff-577ef2780615',
            createdByUserId: 'member_1',
            createdAt: new Date().toISOString(),
            userIdentity: 'user_1',
            agentConfig: {
                agent_id: '507f1f77bcf86cd799439011',
                prompt: 'x',
            },
        });

        const { createSessionObservabilityService } = await import(
            '../src/services/sessionObservabilityService.ts'
        );

        const service = createSessionObservabilityService({
            sessionService: { cleanupSession } as never,
            transcriptService: { saveFromObservability } as never,
            sessionStore: { get } as never,
        });

        await service.ingestObservability({
            payload: makePayload({ orgId: '96f0cee4-bb87-4477-8eff-577ef2780614' }),
        });

        expect(get).toHaveBeenCalledWith('room-abc');
        expect(saveFromObservability).toHaveBeenCalledWith(
            expect.objectContaining({
                roomName: 'room-abc',
                sessionId: '00000000-0000-4000-8000-000000000000',
                orgId: '96f0cee4-bb87-4477-8eff-577ef2780615',
                createdByUserId: 'member_1',
                agentId: '507f1f77bcf86cd799439011',
            })
        );
        expect(cleanupSession).toHaveBeenCalledWith('room-abc');
    });

    it('falls back to randomUUID when no sessionId is available', async () => {
        vi.doMock('crypto', async () => {
            const actual = await vi.importActual<Crypto>('crypto');
            return {
                ...actual,
                randomUUID: () => '00000000-0000-4000-8000-000000000123',
            };
        });

        const saveFromObservability = vi.fn().mockResolvedValue(null);
        const cleanupSession = vi.fn().mockResolvedValue(undefined);
        const get = vi.fn().mockResolvedValue(undefined);

        const { createSessionObservabilityService } = await import(
            '../src/services/sessionObservabilityService.ts'
        );

        const service = createSessionObservabilityService({
            sessionService: { cleanupSession } as never,
            transcriptService: { saveFromObservability } as never,
            sessionStore: { get } as never,
        });

        await service.ingestObservability({
            payload: makePayload({ sessionId: undefined }),
        });

        expect(saveFromObservability).toHaveBeenCalledWith(
            expect.objectContaining({
                sessionId: '00000000-0000-4000-8000-000000000123',
            })
        );
    });

    it('skips transcript persistence when orgId cannot be resolved', async () => {
        const saveFromObservability = vi.fn().mockResolvedValue(null);
        const cleanupSession = vi.fn().mockResolvedValue(undefined);
        const saveAudio = vi.fn().mockResolvedValue('audio.ogg');
        const get = vi.fn().mockResolvedValue(undefined);

        const { createSessionObservabilityService } = await import(
            '../src/services/sessionObservabilityService.ts'
        );

        const service = createSessionObservabilityService({
            sessionService: { cleanupSession } as never,
            transcriptService: { saveFromObservability } as never,
            sessionStore: { get } as never,
            audioStorageService: { save: saveAudio } as never,
        });

        await service.ingestObservability({
            payload: makePayload({ orgId: undefined }),
            audioBuffer: Buffer.from('fake-ogg-data'),
        });

        expect(saveFromObservability).not.toHaveBeenCalled();
        expect(saveAudio).not.toHaveBeenCalled();
        expect(cleanupSession).toHaveBeenCalledWith('room-abc');
    });

    it('saves audio when available and transcript persistence is possible', async () => {
        const saveFromObservability = vi.fn().mockResolvedValue(null);
        const cleanupSession = vi.fn().mockResolvedValue(undefined);
        const saveAudio = vi.fn().mockResolvedValue('audio.ogg');

        const { createSessionObservabilityService } = await import(
            '../src/services/sessionObservabilityService.ts'
        );

        const service = createSessionObservabilityService({
            sessionService: { cleanupSession } as never,
            transcriptService: { saveFromObservability } as never,
            sessionStore: { get: vi.fn().mockResolvedValue(undefined) } as never,
            audioStorageService: { save: saveAudio } as never,
        });

        await service.ingestObservability({
            payload: makePayload(),
            audioBuffer: Buffer.from('fake-ogg-data'),
        });

        expect(saveAudio).toHaveBeenCalledWith(
            '00000000-0000-4000-8000-000000000000',
            expect.any(Buffer)
        );
        expect(cleanupSession).toHaveBeenCalledWith('room-abc');
    });

    it('swallows and logs audio save failures', async () => {
        const saveFromObservability = vi.fn().mockResolvedValue(null);
        const cleanupSession = vi.fn().mockResolvedValue(undefined);
        const saveAudio = vi.fn().mockRejectedValue(new Error('disk full'));

        const { logger } = await import('../src/lib/logger.ts');
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

        const { createSessionObservabilityService } = await import(
            '../src/services/sessionObservabilityService.ts'
        );

        const service = createSessionObservabilityService({
            sessionService: { cleanupSession } as never,
            transcriptService: { saveFromObservability } as never,
            sessionStore: { get: vi.fn().mockResolvedValue(undefined) } as never,
            audioStorageService: { save: saveAudio } as never,
        });

        await expect(
            service.ingestObservability({
                payload: makePayload(),
                audioBuffer: Buffer.from('fake-ogg-data'),
            })
        ).resolves.toBeUndefined();

        expect(errorSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'audio_recording_save_failed',
                sessionId: '00000000-0000-4000-8000-000000000000',
            }),
            'Failed to save audio recording'
        );
    });

    it('swallows and logs transcript persistence failures and still cleans up', async () => {
        const saveFromObservability = vi.fn().mockRejectedValue(new Error('db down'));
        const cleanupSession = vi.fn().mockResolvedValue(undefined);

        const { logger } = await import('../src/lib/logger.ts');
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

        const { createSessionObservabilityService } = await import(
            '../src/services/sessionObservabilityService.ts'
        );

        const service = createSessionObservabilityService({
            sessionService: { cleanupSession } as never,
            transcriptService: { saveFromObservability } as never,
            sessionStore: { get: vi.fn().mockResolvedValue(undefined) } as never,
        });

        await expect(
            service.ingestObservability({
                payload: makePayload(),
            })
        ).resolves.toBeUndefined();

        expect(errorSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'transcript_persist_failed',
                roomName: 'room-abc',
            })
        );
        expect(cleanupSession).toHaveBeenCalledWith('room-abc');
    });

    it('swallows and logs cleanup failures', async () => {
        const saveFromObservability = vi.fn().mockResolvedValue(null);
        const cleanupSession = vi.fn().mockRejectedValue(new Error('redis down'));

        const { logger } = await import('../src/lib/logger.ts');
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

        const { createSessionObservabilityService } = await import(
            '../src/services/sessionObservabilityService.ts'
        );

        const service = createSessionObservabilityService({
            sessionService: { cleanupSession } as never,
            transcriptService: { saveFromObservability } as never,
            sessionStore: { get: vi.fn().mockResolvedValue(undefined) } as never,
        });

        await expect(
            service.ingestObservability({
                payload: makePayload(),
            })
        ).resolves.toBeUndefined();

        expect(errorSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'session_cleanup_failed',
                roomName: 'room-abc',
            })
        );
    });

    it('does not persist or cleanup when sessionReport is missing', async () => {
        const saveFromObservability = vi.fn().mockResolvedValue(null);
        const cleanupSession = vi.fn().mockResolvedValue(undefined);
        const get = vi.fn().mockResolvedValue(undefined);

        const { createSessionObservabilityService } = await import(
            '../src/services/sessionObservabilityService.ts'
        );

        const service = createSessionObservabilityService({
            sessionService: { cleanupSession } as never,
            transcriptService: { saveFromObservability } as never,
            sessionStore: { get } as never,
        });

        await service.ingestObservability({
            payload: makePayload({ sessionReport: undefined }),
        });

        expect(get).not.toHaveBeenCalled();
        expect(saveFromObservability).not.toHaveBeenCalled();
        expect(cleanupSession).not.toHaveBeenCalled();
    });
});
