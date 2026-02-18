import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { importFreshApp } from './testUtils';

describe('transcripts routes (HTTP)', () => {
    it('GET /api/transcripts validates query and forwards to transcriptService.list', async () => {
        const list = vi.fn().mockResolvedValue({
            items: [],
            total: 0,
            limit: 10,
            offset: 5,
            nextOffset: null,
        });
        const app = await importFreshApp({
            sessionServiceMock: {},
            transcriptServiceMock: { list },
        });

        const res = await request(app)
            .get(
                [
                    '/api/transcripts',
                    '?limit=10',
                    '&offset=5',
                    '&sort=asc',
                    '&agentId=507f1f77bcf86cd799439011',
                    '&sessionId=00000000-0000-4000-8000-000000000000',
                    '&from=2026-01-15',
                    '&to=2026-01-16',
                ].join('')
            )
            .set('x-api-key', 'dev')
            .expect(200);

        expect(list).toHaveBeenCalledTimes(1);
        expect(list).toHaveBeenCalledWith(
            {
                orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                agentId: '507f1f77bcf86cd799439011',
                sessionId: '00000000-0000-4000-8000-000000000000',
                from: '2026-01-15',
                to: '2026-01-16',
            },
            { limit: 10, offset: 5, sort: 'asc' }
        );

        expect(res.body).toEqual({
            items: [],
            total: 0,
            limit: 10,
            offset: 5,
            nextOffset: null,
        });
    });

    it('GET /api/transcripts rejects invalid agentId', async () => {
        const app = await importFreshApp({ sessionServiceMock: {}, transcriptServiceMock: {} });
        const res = await request(app)
            .get('/api/transcripts?agentId=not-a-mongo-id')
            .set('x-api-key', 'dev')
            .expect(400);
        expect(res.body.error).toBeTruthy();
        expect(res.body.issues).toBeTruthy();
    });

    it('GET /api/transcripts/:sessionId returns 404 when not found', async () => {
        const getBySessionId = vi.fn().mockResolvedValue(null);
        const app = await importFreshApp({
            sessionServiceMock: {},
            transcriptServiceMock: { getBySessionId },
        });

        await request(app)
            .get('/api/transcripts/00000000-0000-4000-8000-000000000000')
            .set('x-api-key', 'dev')
            .expect(404);
        expect(getBySessionId).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000000');
    });

    it('GET /api/transcripts/:sessionId/audio returns 404 when audio file is missing', async () => {
        const transcript = {
            id: 't1',
            sessionId: '00000000-0000-4000-8000-000000000000',
            orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
            createdByUserId: 'mem_test_user',
        };
        const getBySessionId = vi.fn().mockResolvedValue(transcript);
        const getFilePath = vi.fn().mockResolvedValue(null);
        const app = await importFreshApp({
            sessionServiceMock: {},
            transcriptServiceMock: { getBySessionId },
            audioStorageServiceMock: { getFilePath },
        });

        const res = await request(app)
            .get('/api/transcripts/00000000-0000-4000-8000-000000000000/audio')
            .set('x-api-key', 'dev')
            .expect(404);

        expect(res.body).toEqual({ error: 'Audio recording not found' });
    });

    it('GET /api/transcripts/:sessionId/audio serves audio file when available', async () => {
        const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'livekit-audio-test-'));
        const filePath = path.join(tmpDir, '00000000-0000-4000-8000-000000000000.ogg');
        await writeFile(filePath, Buffer.from('fake-ogg-data'));

        try {
            const transcript = {
                id: 't1',
                sessionId: '00000000-0000-4000-8000-000000000000',
                orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                createdByUserId: 'mem_test_user',
            };
            const getBySessionId = vi.fn().mockResolvedValue(transcript);
            const getFilePath = vi.fn().mockResolvedValue(filePath);
            const app = await importFreshApp({
                sessionServiceMock: {},
                transcriptServiceMock: { getBySessionId },
                audioStorageServiceMock: { getFilePath },
            });

            const res = await request(app)
                .get('/api/transcripts/00000000-0000-4000-8000-000000000000/audio')
                .set('x-api-key', 'dev')
                .expect(200);

            expect(res.headers['content-type']).toContain('audio/ogg');
            const bodyText = Buffer.isBuffer(res.body) ? res.body.toString('utf8') : res.text;
            expect(bodyText).toBe('fake-ogg-data');
        } finally {
            await rm(tmpDir, { recursive: true, force: true });
        }
    });

    it('GET /api/transcripts/:sessionId returns transcript when found', async () => {
        const transcript = {
            id: 't1',
            sessionId: '00000000-0000-4000-8000-000000000000',
            orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
            createdByUserId: 'mem_any',
        };
        const getBySessionId = vi.fn().mockResolvedValue(transcript);
        const app = await importFreshApp({
            sessionServiceMock: {},
            transcriptServiceMock: { getBySessionId },
        });

        const res = await request(app)
            .get('/api/transcripts/00000000-0000-4000-8000-000000000000')
            .set('x-api-key', 'dev')
            .expect(200);
        expect(res.body).toEqual({ transcript });
    });

    it('GET /api/transcripts/agent/:agentId forwards pagination to listByAgentId', async () => {
        const listByAgentId = vi.fn().mockResolvedValue({
            items: [],
            total: 0,
            limit: 2,
            offset: 0,
            nextOffset: null,
        });
        const app = await importFreshApp({
            sessionServiceMock: {},
            transcriptServiceMock: { listByAgentId },
        });

        await request(app)
            .get('/api/transcripts/agent/507f1f77bcf86cd799439011?limit=2&offset=0&sort=desc')
            .set('x-api-key', 'dev')
            .expect(200);

        expect(listByAgentId).toHaveBeenCalledWith(
            {
                orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                agentId: '507f1f77bcf86cd799439011',
            },
            {
                limit: 2,
                offset: 0,
                sort: 'desc',
            }
        );
    });

    it('GET /api/transcripts/agent/:agentId/stats returns stats payload', async () => {
        const getAgentStats = vi.fn().mockResolvedValue({
            totalCalls: 3,
            browserCalls: 3,
            phoneCalls: 0,
            avgMessages: 8.0,
        });
        const app = await importFreshApp({
            sessionServiceMock: {},
            transcriptServiceMock: { getAgentStats },
        });

        const res = await request(app)
            .get('/api/transcripts/agent/507f1f77bcf86cd799439011/stats')
            .set('x-api-key', 'dev')
            .expect(200);

        expect(res.body).toEqual({
            totalCalls: 3,
            browserCalls: 3,
            phoneCalls: 0,
            avgMessages: 8.0,
        });
    });

    it('GET /api/transcripts applies createdByUserId filter for non-admin users', async () => {
        const list = vi.fn().mockResolvedValue({
            items: [],
            total: 0,
            limit: 50,
            offset: 0,
            nextOffset: null,
        });
        const app = await importFreshApp({
            sessionServiceMock: {},
            transcriptServiceMock: { list },
            pagosAuthServiceMock: {
                resolveAuthContext: vi.fn().mockResolvedValue({
                    orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                    userId: 'member_user_1',
                    role: 'member',
                    isAdmin: false,
                }),
            },
        });

        await request(app).get('/api/transcripts').set('x-api-key', 'dev').expect(200);

        expect(list).toHaveBeenCalledTimes(1);
        expect(list).toHaveBeenCalledWith(
            {
                orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                createdByUserId: 'member_user_1',
            },
            { limit: undefined, offset: undefined, sort: undefined }
        );
    });

    it('GET /api/transcripts/:sessionId returns 404 for non-admin user mismatch', async () => {
        const getBySessionId = vi.fn().mockResolvedValue({
            id: 't1',
            sessionId: '00000000-0000-4000-8000-000000000000',
            orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
            createdByUserId: 'different_user',
        });
        const app = await importFreshApp({
            sessionServiceMock: {},
            transcriptServiceMock: { getBySessionId },
            pagosAuthServiceMock: {
                resolveAuthContext: vi.fn().mockResolvedValue({
                    orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                    userId: 'member_user_1',
                    role: 'member',
                    isAdmin: false,
                }),
            },
        });

        const res = await request(app)
            .get('/api/transcripts/00000000-0000-4000-8000-000000000000')
            .set('x-api-key', 'dev')
            .expect(404);

        expect(res.body).toEqual({ error: 'Transcript not found' });
        expect(getBySessionId).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000000');
    });
});
