import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

describe('POST /internal/sessions/observability (transcripts)', () => {
    afterEach(() => {
        vi.doUnmock('crypto');
    });

    it('rejects payloads missing required sessionId', async () => {
        const cleanupSession = vi.fn().mockResolvedValue({ roomDelete: { status: 'deleted' }, storeDelete: { status: 'ok' } });

        const app = await importFreshApp({
            sessionServiceMock: { cleanupSession },
            sessionStoreMock: { get: vi.fn().mockReturnValue(undefined) },
        });

        const res = await request(app)
            .post('/internal/sessions/observability')
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
            });

        expect(res.status).toBe(400);
    });

    it('persists transcript with required sessionId', async () => {
        const saveFromObservability = vi.fn().mockResolvedValue(null);
        const cleanupSession = vi.fn().mockResolvedValue({ roomDelete: { status: 'deleted' }, storeDelete: { status: 'ok' } });
        const sessionStoreGet = vi.fn().mockReturnValue({
            sessionId: '00000000-0000-4000-8000-000000000000',
            orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
            createdAt: new Date().toISOString(),
            userIdentity: 'user_1',
        });

        const app = await importFreshApp({
            sessionServiceMock: { cleanupSession },
            transcriptServiceMock: { saveFromObservability },
            sessionStoreMock: { get: sessionStoreGet },
        });

        await request(app)
            .post('/internal/sessions/observability')
            .send(makeObservabilityPayload())
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
        const cleanupSession = vi.fn().mockResolvedValue({ roomDelete: { status: 'deleted' }, storeDelete: { status: 'ok' } });
        const saveAudio = vi.fn().mockResolvedValue('00000000-0000-4000-8000-000000000000.ogg');

        const app = await importFreshApp({
            sessionServiceMock: { cleanupSession },
            transcriptServiceMock: { saveFromObservability },
            sessionStoreMock: {
                get: vi.fn().mockReturnValue({
                    sessionId: '00000000-0000-4000-8000-000000000000',
                    orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                    createdAt: new Date().toISOString(),
                    userIdentity: 'user_1',
                }),
            },
            audioStorageServiceMock: { save: saveAudio },
        });

        await request(app)
            .post('/internal/sessions/observability')
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
        const cleanupSession = vi.fn().mockResolvedValue({ roomDelete: { status: 'deleted' }, storeDelete: { status: 'ok' } });
        const saveAudio = vi.fn().mockResolvedValue('ignored.ogg');

        const app = await importFreshApp({
            sessionServiceMock: { cleanupSession },
            transcriptServiceMock: { saveFromObservability },
            sessionStoreMock: {
                get: vi.fn().mockReturnValue({
                    sessionId: '00000000-0000-4000-8000-000000000000',
                    orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                    createdAt: new Date().toISOString(),
                    userIdentity: 'user_1',
                }),
            },
            audioStorageServiceMock: { save: saveAudio },
        });

        await request(app)
            .post('/internal/sessions/observability')
            .send(makeObservabilityPayload())
            .expect(204);

        expect(saveFromObservability).toHaveBeenCalledTimes(1);
        expect(saveAudio).not.toHaveBeenCalled();
        expect(cleanupSession).toHaveBeenCalledWith('room-abc');
    });

    it('keeps /internal/sessions/observability successful when audio save fails', async () => {
        const saveFromObservability = vi.fn().mockResolvedValue(null);
        const cleanupSession = vi.fn().mockResolvedValue({ roomDelete: { status: 'deleted' }, storeDelete: { status: 'ok' } });
        const saveAudio = vi.fn().mockRejectedValue(new Error('disk full'));

        const app = await importFreshApp({
            sessionServiceMock: { cleanupSession },
            transcriptServiceMock: { saveFromObservability },
            sessionStoreMock: {
                get: vi.fn().mockReturnValue({
                    sessionId: '00000000-0000-4000-8000-000000000000',
                    orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                    createdAt: new Date().toISOString(),
                    userIdentity: 'user_1',
                }),
            },
            audioStorageServiceMock: { save: saveAudio },
        });

        await request(app)
            .post('/internal/sessions/observability')
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
