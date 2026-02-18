import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createLangfuseTraceService } from '../dist/services/langfuseTraceService.js';

function okJson(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });
}

describe('langfuseTraceService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('returns 503 when langfuse credentials are missing', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const service = createLangfuseTraceService({
            host: '',
            publicKey: '',
            secretKey: '',
        });

        await expect(
            service.listTracesBySession({
                sessionId: '00000000-0000-4000-8000-000000000000',
            })
        ).rejects.toMatchObject({ status: 503 });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('normalizes trace summaries from list endpoint', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            okJson({
                data: [
                    {
                        id: 'trace_1',
                        name: 'voice-session',
                        sessionId: '00000000-0000-4000-8000-000000000000',
                        timestamp: '2026-02-16T01:02:03.000Z',
                        latency: 2.5,
                        totalCost: 0.03,
                        htmlPath: '/trace/trace_1',
                        observations: ['obs_1', 'obs_2'],
                    },
                ],
                meta: {
                    page: 1,
                    limit: 20,
                    totalItems: 1,
                    totalPages: 1,
                },
            })
        );
        vi.stubGlobal('fetch', fetchMock);

        const service = createLangfuseTraceService({
            host: 'https://cloud.langfuse.com/',
            publicKey: 'pk-lf-test',
            secretKey: 'sk-lf-test',
        });

        const result = await service.listTracesBySession({
            sessionId: '00000000-0000-4000-8000-000000000000',
        });

        expect(result.traces).toEqual([
            {
                traceId: 'trace_1',
                name: 'voice-session',
                sessionId: '00000000-0000-4000-8000-000000000000',
                timestamp: '2026-02-16T01:02:03.000Z',
                latencySeconds: 2.5,
                totalCostUsd: 0.03,
                observationCount: 2,
                htmlPath: '/trace/trace_1',
            },
        ]);
        expect(result.pagination).toEqual({
            page: 1,
            limit: 20,
            totalItems: 1,
            totalPages: 1,
        });
    });

    it('normalizes trace detail and observations', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            okJson({
                id: 'trace_1',
                name: 'voice-session',
                sessionId: '00000000-0000-4000-8000-000000000000',
                timestamp: '2026-02-16T01:02:03.000Z',
                latency: 2.5,
                totalCost: 0.03,
                htmlPath: '/trace/trace_1',
                observations: [
                    {
                        id: 'obs_1',
                        traceId: 'trace_1',
                        parentObservationId: null,
                        type: 'SPAN',
                        name: 'inference',
                        level: 'DEFAULT',
                        startTime: '2026-02-16T01:02:03.000Z',
                        endTime: '2026-02-16T01:02:04.000Z',
                        statusMessage: null,
                        model: 'gpt-4o-mini',
                        modelParameters: { temperature: 0.2 },
                        input: { text: 'hi' },
                        output: { text: 'hello' },
                        metadata: { foo: 'bar' },
                        usageDetails: { input: 10, output: 4, total: 14 },
                        costDetails: { total: 0.03 },
                        environment: 'production',
                    },
                    {
                        id: 'invalid_obs',
                        type: 'SPAN',
                    },
                ],
            })
        );
        vi.stubGlobal('fetch', fetchMock);

        const service = createLangfuseTraceService({
            host: 'https://cloud.langfuse.com',
            publicKey: 'pk-lf-test',
            secretKey: 'sk-lf-test',
        });

        const detail = await service.getTrace('trace_1');
        expect(detail.traceId).toBe('trace_1');
        expect(detail.observations).toHaveLength(1);
        expect(detail.observations[0]).toMatchObject({
            id: 'obs_1',
            traceId: 'trace_1',
            type: 'SPAN',
            model: 'gpt-4o-mini',
        });
    });
});

