import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Crypto from 'crypto';

import { importFreshApp } from './testUtils';

function makeObservabilityPayload(overrides?: Record<string, unknown>) {
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

describe('POST /session/observability (transcripts)', () => {
    afterEach(() => {
        vi.doUnmock('crypto');
    });

    it('generates a random UUID sessionId when missing and persists transcript', async () => {
        vi.doMock('crypto', async () => {
            const actual = await vi.importActual<Crypto>('crypto');
            return {
                ...actual,
                randomUUID: () => '00000000-0000-4000-8000-000000000000',
            };
        });

        const saveFromObservability = vi.fn().mockResolvedValue(null);
        const cleanupSession = vi.fn().mockResolvedValue(undefined);
        const sessionStoreGet = vi.fn().mockReturnValue(undefined);

        const app = await importFreshApp({
            sessionServiceMock: { cleanupSession },
            transcriptServiceMock: { saveFromObservability },
            sessionStoreMock: { get: sessionStoreGet },
        });

        await request(app)
            .post('/session/observability')
            .send({
                roomName: 'room-abc',
                orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                closeReason: null,
                sessionReport: {
                    job_id: 'job-1',
                    room_id: 'rid-1',
                    room: 'room-abc',
                    events: [{ type: 'unknown_event', created_at: 1 }],
                    timestamp: 2,
                },
            })
            .expect(204);

        expect(sessionStoreGet).toHaveBeenCalledWith('room-abc');
        expect(saveFromObservability).toHaveBeenCalledTimes(1);
        expect(saveFromObservability).toHaveBeenCalledWith(
            expect.objectContaining({
                roomName: 'room-abc',
                sessionId: '00000000-0000-4000-8000-000000000000',
            })
        );
        expect(cleanupSession).toHaveBeenCalledWith('room-abc');
    });

    it('saves uploaded multipart audio recording when present', async () => {
        const saveFromObservability = vi.fn().mockResolvedValue(null);
        const cleanupSession = vi.fn().mockResolvedValue(undefined);
        const saveAudio = vi.fn().mockResolvedValue('00000000-0000-4000-8000-000000000000.ogg');

        const app = await importFreshApp({
            sessionServiceMock: { cleanupSession },
            transcriptServiceMock: { saveFromObservability },
            sessionStoreMock: { get: vi.fn().mockReturnValue(undefined) },
            audioStorageServiceMock: { save: saveAudio },
        });

        await request(app)
            .post('/session/observability')
            .field('payload', JSON.stringify(makeObservabilityPayload()))
            .attach('audio', Buffer.from('fake-ogg-data'), {
                filename: 'recording.ogg',
                contentType: 'audio/ogg',
            })
            .expect(204);

        expect(saveFromObservability).toHaveBeenCalledTimes(1);
        expect(saveAudio).toHaveBeenCalledTimes(1);
        expect(saveAudio).toHaveBeenCalledWith(
            '00000000-0000-4000-8000-000000000000',
            expect.any(Buffer)
        );
        expect(cleanupSession).toHaveBeenCalledWith('room-abc');
    });

    it('does not save audio when request has no uploaded file', async () => {
        const saveFromObservability = vi.fn().mockResolvedValue(null);
        const cleanupSession = vi.fn().mockResolvedValue(undefined);
        const saveAudio = vi.fn().mockResolvedValue('ignored.ogg');

        const app = await importFreshApp({
            sessionServiceMock: { cleanupSession },
            transcriptServiceMock: { saveFromObservability },
            sessionStoreMock: { get: vi.fn().mockReturnValue(undefined) },
            audioStorageServiceMock: { save: saveAudio },
        });

        await request(app).post('/session/observability').send(makeObservabilityPayload()).expect(204);

        expect(saveFromObservability).toHaveBeenCalledTimes(1);
        expect(saveAudio).not.toHaveBeenCalled();
        expect(cleanupSession).toHaveBeenCalledWith('room-abc');
    });

    it('keeps /session/observability successful when audio save fails', async () => {
        const saveFromObservability = vi.fn().mockResolvedValue(null);
        const cleanupSession = vi.fn().mockResolvedValue(undefined);
        const saveAudio = vi.fn().mockRejectedValue(new Error('disk full'));

        const app = await importFreshApp({
            sessionServiceMock: { cleanupSession },
            transcriptServiceMock: { saveFromObservability },
            sessionStoreMock: { get: vi.fn().mockReturnValue(undefined) },
            audioStorageServiceMock: { save: saveAudio },
        });

        await request(app)
            .post('/session/observability')
            .field('payload', JSON.stringify(makeObservabilityPayload()))
            .attach('audio', Buffer.from('fake-ogg-data'), {
                filename: 'recording.ogg',
                contentType: 'audio/ogg',
            })
            .expect(204);

        expect(saveFromObservability).toHaveBeenCalledTimes(1);
        expect(saveAudio).toHaveBeenCalledTimes(1);
        expect(cleanupSession).toHaveBeenCalledWith('room-abc');
    });
});
