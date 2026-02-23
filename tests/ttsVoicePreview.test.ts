import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { importFreshApp } from './testUtils.js';

describe('GET /config/tts-voice-preview', () => {
    it('returns 400 for invalid query', async () => {
        const app = await importFreshApp();
        const res = await request(app).get('/config/tts-voice-preview');
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error');
        expect(res.body).toHaveProperty('issues');
    });

    it('returns 400 for disallowed host', async () => {
        const app = await importFreshApp({ env: { CARTESIA_API_KEY: 'test_cartesia_key' } });
        const res = await request(app)
            .get('/config/tts-voice-preview')
            .query({
                providerId: 'cartesia',
                url: 'https://example.com/not-allowed.wav',
            });
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ error: 'Preview url host not allowed' });
    });

    it('returns 503 when Cartesia preview proxy is not configured', async () => {
        const app = await importFreshApp({ env: { CARTESIA_API_KEY: '' } });
        const res = await request(app)
            .get('/config/tts-voice-preview')
            .query({
                providerId: 'cartesia',
                url: 'https://files.cartesia.ai/files/file_test/download?format=playback',
            });
        expect(res.status).toBe(503);
        expect(res.body).toMatchObject({ error: 'Cartesia preview proxy is not configured' });
    });
});

