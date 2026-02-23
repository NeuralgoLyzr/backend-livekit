import { HttpError } from '../../lib/httpErrors.js';
import type {
    ListTtsVoiceProvidersResult,
    ListTtsVoicesInput,
    ListTtsVoicesResult,
    TtsVoiceProviderId,
} from './types.js';
import { createTtlCache } from './ttlCache.js';
import { createCartesiaVoiceProvider } from './providers/cartesia.js';
import { createElevenLabsVoiceProvider } from './providers/elevenlabs.js';
import { createDeepgramVoiceProvider } from './providers/deepgram.js';
import { createInworldVoiceProvider } from './providers/inworld.js';
import { createRimeVoiceProvider } from './providers/rime.js';
import { createSarvamVoiceProvider } from './providers/sarvam.js';

export interface TtsVoicesService {
    listProviders(): ListTtsVoiceProvidersResult;
    listVoices(input: ListTtsVoicesInput): Promise<ListTtsVoicesResult>;
}

export type CreateTtsVoicesServiceDeps = {
    cartesia: { apiKey: string; version: string };
    elevenlabs: { apiKey: string };
    deepgram: { apiKey: string };
    inworld: { base64: string };
};

function assertProviderId(value: string): TtsVoiceProviderId {
    const normalized = value.trim().toLowerCase();
    switch (normalized) {
        case 'cartesia':
        case 'elevenlabs':
        case 'deepgram':
        case 'inworld':
        case 'rime':
        case 'sarvam':
            return normalized;
        default:
            throw new HttpError(400, `Unsupported providerId: ${value}`);
    }
}

function cacheKey(input: ListTtsVoicesInput): string {
    const parts = [
        input.providerId,
        input.q ?? '',
        input.language ?? '',
        input.gender ?? '',
        input.limit != null ? String(input.limit) : '',
        input.cursor ?? '',
    ];
    return parts.map((p) => String(p ?? '').trim()).join('|');
}

export function createTtsVoicesService(deps: CreateTtsVoicesServiceDeps): TtsVoicesService {
    const cartesia = createCartesiaVoiceProvider(deps.cartesia);
    const elevenlabs = createElevenLabsVoiceProvider(deps.elevenlabs);
    const deepgram = createDeepgramVoiceProvider(deps.deepgram);
    const inworld = createInworldVoiceProvider(deps.inworld);
    const rime = createRimeVoiceProvider();
    const sarvam = createSarvamVoiceProvider();

    const providers = {
        cartesia,
        elevenlabs,
        deepgram,
        inworld,
        rime,
        sarvam,
    } as const;

    const listCache = createTtlCache<ListTtsVoicesResult>({ ttlMs: 60_000, maxEntries: 500 });

    function listProviders(): ListTtsVoiceProvidersResult {
        return {
            providers: [
                {
                    providerId: 'cartesia',
                    displayName: 'Cartesia',
                    configured: Boolean(deps.cartesia.apiKey.trim()),
                    supportsSearch: true,
                    supportsFacets: true,
                },
                {
                    providerId: 'elevenlabs',
                    displayName: 'ElevenLabs',
                    configured: Boolean(deps.elevenlabs.apiKey.trim()),
                    supportsSearch: true,
                    supportsFacets: true,
                },
                {
                    providerId: 'deepgram',
                    displayName: 'Deepgram',
                    configured: Boolean(deps.deepgram.apiKey.trim()),
                    supportsSearch: true,
                    supportsFacets: true,
                },
                {
                    providerId: 'inworld',
                    displayName: 'Inworld',
                    configured: Boolean(deps.inworld.base64.trim()),
                    supportsSearch: true,
                    supportsFacets: true,
                },
                {
                    providerId: 'rime',
                    displayName: 'Rime',
                    configured: true,
                    supportsSearch: true,
                    supportsFacets: true,
                },
                {
                    providerId: 'sarvam',
                    displayName: 'Sarvam',
                    configured: true,
                    supportsSearch: true,
                    supportsFacets: true,
                },
            ],
        };
    }

    async function listVoices(input: ListTtsVoicesInput): Promise<ListTtsVoicesResult> {
        const providerId = assertProviderId(input.providerId);
        const normalized: ListTtsVoicesInput = {
            ...input,
            providerId,
            q: input.q?.trim() || undefined,
            language: input.language?.trim() || undefined,
            gender: input.gender?.trim() || undefined,
            limit: input.limit != null ? Math.floor(input.limit) : 100,
            cursor: input.cursor?.trim() || undefined,
        };

        const key = cacheKey(normalized);
        const cached = listCache.get(key);
        if (cached) return cached;

        const provider = providers[providerId];
        const result = await provider.listVoices(normalized);
        listCache.set(key, result);
        return result;
    }

    return { listProviders, listVoices };
}
