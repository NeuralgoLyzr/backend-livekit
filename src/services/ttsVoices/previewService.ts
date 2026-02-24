import { HttpError } from '../../lib/httpErrors.js';
import { createTtlCache } from './ttlCache.js';
import type { TtsVoiceProviderId } from './types.js';

export type TtsVoicePreview = {
    contentType: string;
    body: Buffer;
};

export interface TtsVoicePreviewService {
    fetchPreview(input: { providerId: TtsVoiceProviderId; url: string }): Promise<TtsVoicePreview>;
}

function toContentType(value: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed;
}

function cacheKey(providerId: string, url: string): string {
    return `${providerId}|${url.trim()}`;
}

function assertAllowedUrl(providerId: TtsVoiceProviderId, rawUrl: string): URL {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new HttpError(400, 'Invalid url');
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new HttpError(400, 'Unsupported url protocol');
    }

    const host = url.host.toLowerCase();
    const allowlistByProvider: Record<TtsVoiceProviderId, Set<string>> = {
        cartesia: new Set(['files.cartesia.ai']),
        elevenlabs: new Set(['api.elevenlabs.io', 'storage.googleapis.com']),
        deepgram: new Set(['static.deepgram.com', 'deepgram.com', 'www.deepgram.com']),
        inworld: new Set(['api.inworld.ai']),
        rime: new Set(['users.rime.ai']),
        sarvam: new Set<string>(),
    };

    const allow = allowlistByProvider[providerId] ?? new Set<string>();
    if (!allow.has(host)) {
        throw new HttpError(400, 'Preview url host not allowed', { providerId, host });
    }

    return url;
}

export type CreateTtsVoicePreviewServiceDeps = {
    cartesia: { apiKey: string };
};

export function createTtsVoicePreviewService(deps: CreateTtsVoicePreviewServiceDeps): TtsVoicePreviewService {
    const cartesiaApiKey = deps.cartesia.apiKey.trim();

    const cache = createTtlCache<TtsVoicePreview>({
        ttlMs: 10 * 60 * 1000,
        maxEntries: 250,
    });

    async function fetchFromUpstream(input: { providerId: TtsVoiceProviderId; url: URL }): Promise<TtsVoicePreview> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12_000);

        try {
            const headers: Record<string, string> = {};
            if (input.providerId === 'cartesia') {
                if (!cartesiaApiKey) {
                    throw new HttpError(503, 'Cartesia preview proxy is not configured', {
                        requiredEnv: ['CARTESIA_API_KEY'],
                    });
                }
                headers.Authorization = `Bearer ${cartesiaApiKey}`;
            }

            const response = await fetch(input.url.toString(), {
                method: 'GET',
                headers,
                signal: controller.signal,
            });

            if (!response.ok) {
                const snippet = await response.text().catch(() => '');
                throw new HttpError(502, `Upstream preview fetch failed (${response.status})`, {
                    providerId: input.providerId,
                    urlHost: input.url.host,
                    status: response.status,
                    bodySnippet: snippet.slice(0, 200),
                });
            }

            const arrayBuffer = await response.arrayBuffer();
            const body = Buffer.from(arrayBuffer);
            const contentType =
                toContentType(response.headers.get('content-type')) ?? 'application/octet-stream';

            if (body.length === 0) {
                throw new HttpError(502, 'Upstream preview returned empty body', {
                    providerId: input.providerId,
                    urlHost: input.url.host,
                });
            }

            return { body, contentType };
        } catch (error) {
            if (error instanceof HttpError) throw error;
            if (error instanceof Error && error.name === 'AbortError') {
                throw new HttpError(502, 'Upstream preview request timed out');
            }
            throw new HttpError(502, 'Failed to fetch preview audio', {
                reason: error instanceof Error ? error.message : String(error),
            });
        } finally {
            clearTimeout(timeout);
        }
    }

    return {
        async fetchPreview(input) {
            const url = assertAllowedUrl(input.providerId, input.url);
            const key = cacheKey(input.providerId, url.toString());
            const cached = cache.get(key);
            if (cached) return cached;

            const preview = await fetchFromUpstream({ providerId: input.providerId, url });
            cache.set(key, preview);
            return preview;
        },
    };
}
