import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { importFreshApp } from './testUtils';

describe('session traces routes (HTTP)', () => {
    it('GET /api/traces/session/:sessionId validates and forwards to sessionTraceService.listBySession', async () => {
        const listBySession = vi.fn().mockResolvedValue({
            traces: [],
            pagination: {
                page: 1,
                limit: 20,
                totalItems: 0,
                totalPages: 0,
            },
        });

        const app = await importFreshApp({
            sessionTraceServiceMock: { listBySession },
        });

        const sessionId = '00000000-0000-4000-8000-000000000000';
        const res = await request(app)
            .get(`/api/traces/session/${sessionId}?page=2&limit=15`)
            .set('x-api-key', 'dev')
            .expect(200);

        expect(listBySession).toHaveBeenCalledTimes(1);
        expect(listBySession).toHaveBeenCalledWith({
            sessionId,
            auth: expect.objectContaining({
                orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                userId: 'mem_test_user',
                isAdmin: true,
            }),
            page: 2,
            limit: 15,
        });
        expect(res.body).toEqual({
            traces: [],
            pagination: {
                page: 1,
                limit: 20,
                totalItems: 0,
                totalPages: 0,
            },
        });
    });

    it('GET /api/traces/session/:sessionId/:traceId forwards to sessionTraceService.getBySessionAndTraceId', async () => {
        const getBySessionAndTraceId = vi.fn().mockResolvedValue({
            trace: {
                traceId: 'trace_1',
                name: 'inference',
                sessionId: '00000000-0000-4000-8000-000000000000',
                timestamp: '2026-02-16T00:00:00.000Z',
                latencySeconds: 1.23,
                totalCostUsd: 0.01,
                htmlPath: '/trace/trace_1',
                observations: [],
            },
        });

        const app = await importFreshApp({
            sessionTraceServiceMock: { getBySessionAndTraceId },
        });

        const sessionId = '00000000-0000-4000-8000-000000000000';
        const traceId = 'trace_1';

        const res = await request(app)
            .get(`/api/traces/session/${sessionId}/${traceId}`)
            .set('x-api-key', 'dev')
            .expect(200);

        expect(getBySessionAndTraceId).toHaveBeenCalledTimes(1);
        expect(getBySessionAndTraceId).toHaveBeenCalledWith({
            sessionId,
            traceId,
            auth: expect.objectContaining({
                orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                userId: 'mem_test_user',
                isAdmin: true,
            }),
        });
        expect(res.body.trace.traceId).toBe('trace_1');
    });

    it('GET /api/traces/session/:sessionId rejects invalid sessionId', async () => {
        const app = await importFreshApp({
            sessionTraceServiceMock: {
                listBySession: vi.fn(),
            },
        });

        const res = await request(app)
            .get('/api/traces/session/not-a-uuid')
            .set('x-api-key', 'dev')
            .expect(400);

        expect(res.body.error).toBeTruthy();
        expect(res.body.issues).toBeTruthy();
    });

    it('GET /api/traces/session/:sessionId rejects invalid pagination', async () => {
        const app = await importFreshApp({
            sessionTraceServiceMock: {
                listBySession: vi.fn(),
            },
        });

        const sessionId = '00000000-0000-4000-8000-000000000000';
        const res = await request(app)
            .get(`/api/traces/session/${sessionId}?page=0`)
            .set('x-api-key', 'dev')
            .expect(400);

        expect(res.body.error).toBeTruthy();
        expect(res.body.issues).toBeTruthy();
    });
});
