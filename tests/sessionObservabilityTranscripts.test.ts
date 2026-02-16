import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type * as Crypto from 'crypto';

import { importFreshApp } from './testUtils';

describe('POST /session/observability (transcripts)', () => {
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
});

