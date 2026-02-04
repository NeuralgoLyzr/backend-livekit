type RealtimeOption = {
    id: string;
    name: string;
};

export type RealtimeProviderOptions = {
    providerId: string;
    displayName: string;
    /**
     * Model identifiers to encode into `engine.llm`.
     *
     * Recommended encoding is `${providerId}/${modelId}`.
     */
    models: RealtimeOption[];
    /**
     * Voice identifiers to send as `engine.voice`.
     */
    voices: RealtimeOption[];
    /**
     * Env vars required to successfully run this provider in the Python agent.
     * (Used by UI to show helpful warnings and disable choices when missing.)
     */
    requiredEnv: string[];
    /**
     * Whether the lists are fetched dynamically at request time.
     */
    dynamic?: boolean;
    /**
     * Optional reason for being partially unavailable (e.g. missing API key).
     */
    warning?: string;
};

type RealtimeOptionsResponse = {
    providers: RealtimeProviderOptions[];
};

const OPENAI_VOICES: RealtimeOption[] = [
    { id: 'alloy', name: 'Alloy' },
    { id: 'ash', name: 'Ash' },
    { id: 'ballad', name: 'Ballad' },
    { id: 'coral', name: 'Coral' },
    { id: 'echo', name: 'Echo' },
    { id: 'sage', name: 'Sage' },
    { id: 'shimmer', name: 'Shimmer' },
    { id: 'verse', name: 'Verse' },
    { id: 'marin', name: 'Marin' },
    { id: 'cedar', name: 'Cedar' },
];

const GEMINI_VOICES: RealtimeOption[] = [
    'Zephyr',
    'Puck',
    'Charon',
    'Kore',
    'Fenrir',
    'Leda',
    'Orus',
    'Aoede',
    'Callirrhoe',
    'Autonoe',
    'Enceladus',
    'Iapetus',
    'Umbriel',
    'Algieba',
    'Despina',
    'Erinome',
    'Algenib',
    'Rasalgethi',
    'Laomedeia',
    'Achernar',
    'Alnilam',
    'Schedar',
    'Gacrux',
    'Pulcherrima',
    'Achird',
    'Zubenelgenubi',
    'Vindemiatrix',
    'Sadachbia',
    'Sadaltager',
    'Sulafat',
].map((v) => ({ id: v, name: v }));

const NOVA_SONIC_VOICES: RealtimeOption[] = [
    { id: 'tiffany', name: 'tiffany' },
    { id: 'matthew', name: 'matthew' },
    { id: 'amy', name: 'amy' },
    { id: 'olivia', name: 'olivia' },
    { id: 'kiara', name: 'kiara' },
    { id: 'arjun', name: 'arjun' },
    { id: 'ambre', name: 'ambre' },
    { id: 'florian', name: 'florian' },
    { id: 'beatrice', name: 'beatrice' },
    { id: 'lorenzo', name: 'lorenzo' },
    { id: 'tina', name: 'tina' },
    { id: 'lennart', name: 'lennart' },
    { id: 'lupe', name: 'lupe' },
    { id: 'carlos', name: 'carlos' },
    { id: 'carolina', name: 'carolina' },
    { id: 'leo', name: 'leo' },
];

const XAI_VOICES: RealtimeOption[] = [
    // LiveKit xAI plugin default is lowercase (e.g. "ara").
    { id: 'ara', name: 'Ara' },
    { id: 'rex', name: 'Rex' },
    { id: 'sal', name: 'Sal' },
    { id: 'eve', name: 'Eve' },
    { id: 'leo', name: 'Leo' },
];

// --- Ultravox dynamic fetching (cached) ---
type UltravoxListResponse<T> = {
    results: T[];
    next: string | null;
    previous?: string | null;
    total?: number;
};

type UltravoxApiModel = { name?: string };
type UltravoxApiVoice = { voiceId?: string; name?: string };

let ultravoxCache:
    | {
        fetchedAtMs: number;
        models: RealtimeOption[];
        voices: RealtimeOption[];
        warning?: string;
    }
    | undefined;

const ULTRAVOX_CACHE_TTL_MS = 5 * 60 * 1000;
const ULTRAVOX_FETCH_TIMEOUT_MS = 8000;
const ULTRAVOX_PAGE_SIZE = 200;
const ULTRAVOX_MAX_PAGES = 50;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

function extractCursor(nextUrl: string): string | undefined {
    try {
        const url = new URL(nextUrl);
        const cursor = url.searchParams.get('cursor');
        return cursor ? cursor : undefined;
    } catch {
        return undefined;
    }
}

async function fetchUltravoxAllPages<T>(
    endpoint: string,
    headers: Record<string, string>
): Promise<{ results: T[]; warning?: string }> {
    const out: T[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < ULTRAVOX_MAX_PAGES; page++) {
        const url = new URL(endpoint);
        url.searchParams.set('pageSize', String(ULTRAVOX_PAGE_SIZE));
        if (cursor) url.searchParams.set('cursor', cursor);

        const res = await fetchWithTimeout(url.toString(), { headers }, ULTRAVOX_FETCH_TIMEOUT_MS);
        if (!res.ok) {
            return {
                results: [],
                warning: `Ultravox fetch failed (${endpoint}, status=${res.status})`,
            };
        }

        const json = (await res.json().catch(() => null)) as UltravoxListResponse<T> | null;
        const pageResults = Array.isArray(json?.results) ? json!.results : [];
        out.push(...pageResults);

        const next = typeof json?.next === 'string' ? json.next : null;
        if (!next) break;

        const nextCursor = extractCursor(next);
        if (!nextCursor || nextCursor === cursor) {
            // Defensive: break if pagination is not progressing.
            break;
        }
        cursor = nextCursor;
    }

    return { results: out };
}

async function fetchUltravoxOptions(): Promise<{
    models: RealtimeOption[];
    voices: RealtimeOption[];
    warning?: string;
}> {
    const now = Date.now();
    if (ultravoxCache && now - ultravoxCache.fetchedAtMs < ULTRAVOX_CACHE_TTL_MS) {
        return ultravoxCache;
    }

    const apiKey = process.env.ULTRAVOX_API_KEY;
    if (!apiKey) {
        const empty = {
            fetchedAtMs: now,
            models: [],
            voices: [],
            warning: 'Missing ULTRAVOX_API_KEY; cannot fetch models/voices.',
        };
        ultravoxCache = empty;
        return empty;
    }

    try {
        const headers = { 'X-API-Key': apiKey };
        const [modelsPage, voicesPage] = await Promise.all([
            fetchUltravoxAllPages<UltravoxApiModel>('https://api.ultravox.ai/api/models', headers),
            fetchUltravoxAllPages<UltravoxApiVoice>('https://api.ultravox.ai/api/voices', headers),
        ]);

        const warning = modelsPage.warning || voicesPage.warning;

        // Models endpoint returns `{ results: [{ name: string }], next: ... }`
        const models = modelsPage.results
            .map((m) => {
                const name = String(m.name ?? '').trim();
                return { id: name, name };
            })
            .filter((m) => m.id && m.name);

        // Voices endpoint returns `{ results: [{ voiceId: string, name: string, ... }], next: ... }`
        const voices = voicesPage.results
            .map((v) => {
                const id = String(v.voiceId ?? '').trim();
                const name = String(v.name ?? '').trim();
                return { id, name: name || id };
            })
            .filter((v) => v.id && v.name);

        const out = {
            fetchedAtMs: now,
            models,
            voices,
            warning,
        };
        ultravoxCache = out;
        return out;
    } catch (error) {
        const out = {
            fetchedAtMs: now,
            models: [],
            voices: [],
            warning: `Ultravox fetch error: ${String((error as Error)?.message ?? error)}`,
        };
        ultravoxCache = out;
        return out;
    }
}

export async function getRealtimeOptions(): Promise<RealtimeOptionsResponse> {
    const ultravox = await fetchUltravoxOptions();

    return {
        providers: [
            {
                providerId: 'google',
                displayName: 'Gemini',
                models: [
                    {
                        id: 'gemini-2.5-flash-native-audio-preview-12-2025',
                        name: 'Gemini 2.5 Flash (native audio preview)',
                    },
                ],
                voices: GEMINI_VOICES,
                requiredEnv: ['GOOGLE_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS'],
            },
            {
                providerId: 'aws-nova',
                displayName: 'Nova Sonic',
                models: [
                    { id: 'amazon.nova-2-sonic-v1:0', name: 'Nova Sonic 2' },
                    { id: 'amazon.nova-sonic-v1:0', name: 'Nova Sonic 1' },
                ],
                voices: NOVA_SONIC_VOICES,
                requiredEnv: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
            },
            {
                providerId: 'openai',
                displayName: 'OpenAI',
                models: [
                    { id: 'gpt-realtime', name: 'gpt-realtime' },
                    { id: 'gpt-realtime-mini', name: 'gpt-realtime-mini' },
                ],
                voices: OPENAI_VOICES,
                requiredEnv: ['OPENAI_API_KEY'],
            },
            {
                providerId: 'ultravox',
                displayName: 'Ultravox',
                models: ultravox.models,
                voices: ultravox.voices,
                requiredEnv: ['ULTRAVOX_API_KEY'],
                dynamic: true,
                warning: ultravox.warning,
            },
            {
                providerId: 'xai',
                displayName: 'xAI Grok',
                /**
                 * xAI's Grok Voice Agent API does not accept a "model" parameter via the LiveKit
                 * plugin API (it selects the voice agent model server-side). We keep a single
                 * default model option purely to satisfy the UI's provider/model selection UX.
                 * The Python worker intentionally ignores this model id.
                 */
                models: [{ id: 'grok-voice-agent-latest', name: 'Grok Voice Agent Latest' }],
                voices: XAI_VOICES,
                requiredEnv: ['XAI_API_KEY'],
            },
        ],
    };
}

