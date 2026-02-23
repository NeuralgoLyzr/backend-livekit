import 'dotenv/config';

import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { importFreshApp } from './testUtils.js';

const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || '';

describe.skipIf(!CARTESIA_API_KEY)('TTS voice preview (live)', () => {
    it(
        'proxies Cartesia preview audio with Authorization header',
        async () => {
            const app = await importFreshApp({ env: { CARTESIA_API_KEY } });

            const listRes = await request(app)
                .get('/config/tts-voices')
                .query({ providerId: 'cartesia', limit: 25 });

            expect(listRes.status).toBe(200);
            expect(Array.isArray(listRes.body.voices)).toBe(true);

            const voiceWithPreview = (listRes.body.voices as Array<{ previewUrl?: string }>).find(
                (v) => typeof v.previewUrl === 'string' && v.previewUrl.startsWith('http')
            );
            expect(voiceWithPreview).toBeDefined();

            const previewUrl = voiceWithPreview!.previewUrl!;
            const previewRes = await request(app)
                .get('/config/tts-voice-preview')
                .query({ providerId: 'cartesia', url: previewUrl });

            expect(previewRes.status).toBe(200);
            expect(previewRes.headers['content-type']).toBeTruthy();
            expect(previewRes.body).toBeInstanceOf(Buffer);
            expect((previewRes.body as Buffer).length).toBeGreaterThan(500);
        },
        60_000
    );
});

