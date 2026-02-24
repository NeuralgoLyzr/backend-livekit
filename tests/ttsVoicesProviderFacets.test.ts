import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { importFreshApp } from './testUtils.js';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('GET /config/tts-voices (provider facet mapping)', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        globalThis.fetch = fetchMock;
    });

    it('maps Deepgram metadata tags to gender labels and supports gender filtering', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({
                tts: [
                    {
                        canonical_name: 'aura-athena-en',
                        metadata: {
                            accent: 'American',
                            age: 'young',
                            tags: ['feminine', 'energetic'],
                            sample: 'https://static.deepgram.com/examples/athena.mp3',
                        },
                    },
                    {
                        canonical_name: 'aura-apollo-en',
                        metadata: {
                            accent: 'British',
                            age: 'middle-aged',
                            tags: ['masculine', 'warm'],
                            sample: 'https://static.deepgram.com/examples/apollo.mp3',
                        },
                    },
                ],
            })
        );

        const app = await importFreshApp({
            env: { DEEPGRAM_API_KEY: 'test_deepgram_key' },
        });

        const res = await request(app)
            .get('/config/tts-voices')
            .query({ providerId: 'deepgram', limit: 50, gender: 'feminine' });

        expect(res.status).toBe(200);
        expect(res.body.providerId).toBe('deepgram');
        expect(res.body.facets.gender).toEqual(['feminine']);
        expect(res.body.voices).toHaveLength(1);
        expect(res.body.voices[0]).toMatchObject({
            id: 'athena',
            labels: {
                gender: 'feminine',
                accent: 'American',
                type: 'aura',
            },
        });
    });

    it('maps Inworld accent tags to accent facet labels', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({
                voices: [
                    {
                        voiceId: 'voice_uk',
                        displayName: 'UK Voice',
                        description: 'Calm and clear',
                        langCode: 'en',
                        tags: ['british', 'calm'],
                    },
                    {
                        voiceId: 'voice_au',
                        displayName: 'AU Voice',
                        description: 'Bright and approachable',
                        langCode: 'en',
                        tags: ['australian', 'approachable'],
                    },
                ],
            })
        );

        const app = await importFreshApp({
            env: { INWORLD_BASE_64: 'dGVzdDp0ZXN0' },
        });

        const res = await request(app).get('/config/tts-voices').query({ providerId: 'inworld', limit: 50 });

        expect(res.status).toBe(200);
        expect(res.body.providerId).toBe('inworld');
        expect(res.body.facets.accent).toEqual(['Australian', 'British']);
        expect(res.body.voices[0]).toMatchObject({
            labels: {
                accent: expect.stringMatching(/Australian|British/),
                type: 'inworld',
            },
        });
    });

    it('returns static Sarvam voices + facets', async () => {
        const app = await importFreshApp();
        const res = await request(app).get('/config/tts-voices').query({ providerId: 'sarvam', limit: 50 });

        expect(res.status).toBe(200);
        expect(res.body.providerId).toBe('sarvam');
        expect(Array.isArray(res.body.voices)).toBe(true);
        expect(res.body.voices.length).toBeGreaterThan(0);
        expect(res.body.voices).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'shubh',
                    labels: expect.objectContaining({
                        gender: 'masculine',
                        type: 'bulbul-v3',
                    }),
                }),
            ])
        );
        expect(res.body.facets).toMatchObject({
            gender: expect.arrayContaining(['feminine', 'masculine']),
            type: ['bulbul-v3'],
        });
    });

    it('filters Sarvam voices by query, gender, language, and limit', async () => {
        const app = await importFreshApp();

        const res = await request(app).get('/config/tts-voices').query({
            providerId: 'sarvam',
            q: 'shubh',
            gender: 'male',
            language: 'en',
            limit: 1,
        });

        expect(res.status).toBe(200);
        expect(res.body.providerId).toBe('sarvam');
        expect(res.body.voices).toHaveLength(1);
        expect(res.body.voices[0]).toMatchObject({
            id: 'shubh',
            labels: expect.objectContaining({ gender: 'masculine' }),
        });
    });
});
