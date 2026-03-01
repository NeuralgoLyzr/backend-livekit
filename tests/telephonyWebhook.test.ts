import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { importFreshApp, setRequiredEnv } from './testUtils';

describe('telephony webhook', () => {
    it('returns 503 when telephony is disabled', async () => {
        const app = await importFreshApp({ env: { TELEPHONY_ENABLED: 'false' } });
        await request(app).post('/telephony/livekit-webhook').send({}).expect(503);
    });

    it('requires express.raw body (route-level guard)', async () => {
        vi.resetModules();
        setRequiredEnv({ TELEPHONY_ENABLED: 'true' });

        // Avoid pulling in LiveKit SDK wiring.
        vi.doMock('../src/telephony/telephonyModule.js', () => ({
            telephonyModule: {
                webhookVerifier: { verifyAndDecode: vi.fn() },
                sessionService: { handleLiveKitEvent: vi.fn().mockResolvedValue(undefined) },
                store: {
                    getCallById: vi.fn(),
                    getCallByRoomName: vi.fn(),
                },
            },
        }));
        vi.doMock('../src/telephony/adapters/livekit/eventNormalizer.js', () => ({
            normalizeLiveKitWebhookEvent: vi.fn((evt: unknown) => evt),
        }));

        const telephonyRouter = (await import('../src/routes/telephony.js')).default;

        const bare = express();
        bare.use(express.json());
        bare.use('/telephony', telephonyRouter);

        const res = await request(bare)
            .post('/telephony/livekit-webhook')
            .send({ hello: 'world' })
            .expect(400);

        expect(res.body.error).toMatch(/Expected raw webhook body/i);
    });

    it('returns 401 with details on invalid signature (non-prod)', async () => {
        vi.resetModules();
        setRequiredEnv({ TELEPHONY_ENABLED: 'true', APP_ENV: 'dev' });

        vi.doMock('../src/telephony/telephonyModule.js', () => ({
            telephonyModule: {
                webhookVerifier: {
                    verifyAndDecode: vi.fn().mockRejectedValue(new Error('bad signature')),
                },
                sessionService: { handleLiveKitEvent: vi.fn().mockResolvedValue(undefined) },
                store: {
                    getCallById: vi.fn(),
                    getCallByRoomName: vi.fn(),
                },
            },
        }));
        vi.doMock('../src/telephony/adapters/livekit/eventNormalizer.js', () => ({
            normalizeLiveKitWebhookEvent: vi.fn((evt: unknown) => evt),
        }));

        const app = (await import('../src/app.js')).app;

        const res = await request(app)
            .post('/telephony/livekit-webhook')
            .set('Authorization', 'Bearer test')
            .send({ hello: 'world' })
            .expect(401);

        expect(res.body.error).toBe('Invalid webhook signature');
        expect(res.body.details).toBeTruthy();
    });

    it('accepts raw JSON and dispatches handler in background', async () => {
        vi.resetModules();
        setRequiredEnv({ TELEPHONY_ENABLED: 'true', APP_ENV: 'dev' });

        const verifyAndDecode = vi.fn().mockImplementation(async (raw: string) => ({
            raw,
            kind: 'test',
        }));
        const handleLiveKitEvent = vi.fn().mockResolvedValue(undefined);
        const normalizeLiveKitWebhookEvent = vi.fn((evt: unknown) => ({ normalized: evt }));

        vi.doMock('../src/telephony/telephonyModule.js', () => ({
            telephonyModule: {
                webhookVerifier: { verifyAndDecode },
                sessionService: { handleLiveKitEvent },
                store: {
                    getCallById: vi.fn(),
                    getCallByRoomName: vi.fn(),
                },
            },
        }));
        vi.doMock('../src/telephony/adapters/livekit/eventNormalizer.js', () => ({
            normalizeLiveKitWebhookEvent,
        }));

        const app = (await import('../src/app.js')).app;

        const res = await request(app)
            .post('/telephony/livekit-webhook')
            .set('Authorization', 'Bearer test')
            .send({ hello: 'world' })
            .expect(200);

        expect(res.body).toEqual({ ok: true });
        expect(verifyAndDecode).toHaveBeenCalledTimes(1);
        expect(handleLiveKitEvent).toHaveBeenCalledTimes(1);
        expect(normalizeLiveKitWebhookEvent).toHaveBeenCalledTimes(1);
    });
});
