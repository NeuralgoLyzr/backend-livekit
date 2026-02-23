import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { importFreshApp } from './testUtils.js';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('GET /config/tts-voices (cartesia facets)', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        globalThis.fetch = fetchMock;
    });

    it('populates accent facets when Cartesia voices include accent/locale metadata', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({
                data: [
                    {
                        id: 'voice_1',
                        name: 'Calm Voice',
                        description: 'A calm voice.',
                        gender: 'feminine',
                        language: 'en',
                        locale: 'en-US',
                        is_owner: false,
                        is_public: true,
                        preview_file_url: 'https://files.cartesia.ai/files/file_1/download?format=playback',
                    },
                ],
                has_more: false,
            })
        );

        const app = await importFreshApp({
            env: { CARTESIA_API_KEY: 'test_cartesia_key', CARTESIA_VERSION: '2025-04-16' },
        });

        const res = await request(app)
            .get('/config/tts-voices')
            .query({ providerId: 'cartesia', limit: 10 });

        expect(res.status).toBe(200);
        expect(res.body.providerId).toBe('cartesia');
        expect(Array.isArray(res.body.voices)).toBe(true);
        expect(res.body.facets).toMatchObject({
            accent: ['American'],
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(String(url)).toContain('https://api.cartesia.ai/voices');
        expect(init.headers).toMatchObject({
            Authorization: expect.stringMatching(/^Bearer\s+/),
            'Cartesia-Version': '2025-04-16',
        });
    });
});

