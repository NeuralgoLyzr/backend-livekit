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
    { id: 'Ara', name: 'Ara' },
    { id: 'Rex', name: 'Rex' },
    { id: 'Sal', name: 'Sal' },
    { id: 'Eve', name: 'Eve' },
    { id: 'Leo', name: 'Leo' },
];

function parseCsvEnv(name: string): string[] {
    const raw = process.env[name];
    if (!raw) return [];
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

// --- Ultravox dynamic fetching (cached) ---
type UltravoxApiModel = { id?: string; name?: string };
type UltravoxApiVoice = { id?: string; name?: string };

let ultravoxCache:
    | {
        fetchedAtMs: number;
        models: RealtimeOption[];
        voices: RealtimeOption[];
        warning?: string;
    }
    | undefined;

const ULTRAVOX_CACHE_TTL_MS = 5 * 60 * 1000;

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
        const [modelsRes, voicesRes] = await Promise.all([
            fetch('https://api.ultravox.ai/api/models', { headers }),
            fetch('https://api.ultravox.ai/api/voices', { headers }),
        ]);

        if (!modelsRes.ok || !voicesRes.ok) {
            const warning = `Ultravox fetch failed (models=${modelsRes.status}, voices=${voicesRes.status})`;
            const out = { fetchedAtMs: now, models: [], voices: [], warning };
            ultravoxCache = out;
            return out;
        }

        const modelsJson = (await modelsRes.json().catch(() => [])) as UltravoxApiModel[];
        const voicesJson = (await voicesRes.json().catch(() => [])) as UltravoxApiVoice[];

        const models = (Array.isArray(modelsJson) ? modelsJson : [])
            .map((m) => ({
                id: String(m.id ?? '').trim(),
                name: String(m.name ?? m.id ?? '').trim(),
            }))
            .filter((m) => m.id && m.name);

        const voices = (Array.isArray(voicesJson) ? voicesJson : [])
            .map((v) => ({
                id: String(v.id ?? '').trim(),
                name: String(v.name ?? v.id ?? '').trim(),
            }))
            .filter((v) => v.id && v.name);

        const out = {
            fetchedAtMs: now,
            models,
            voices,
            warning: undefined,
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
    const azureDeployments =
        parseCsvEnv('AZURE_OPENAI_REALTIME_DEPLOYMENTS').length > 0
            ? parseCsvEnv('AZURE_OPENAI_REALTIME_DEPLOYMENTS')
            : parseCsvEnv('AZURE_OPENAI_DEPLOYMENTS');

    const ultravox = await fetchUltravoxOptions();

    return {
        providers: [
            {
                providerId: 'azure-openai',
                displayName: 'Azure OpenAI',
                models: azureDeployments.map((d) => ({ id: d, name: d })),
                voices: OPENAI_VOICES,
                requiredEnv: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'OPENAI_API_VERSION'],
                warning:
                    azureDeployments.length === 0
                        ? 'No Azure deployments configured. Set AZURE_OPENAI_REALTIME_DEPLOYMENTS.'
                        : undefined,
            },
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
                models: [{ id: 'grok-4-1-fast-non-reasoning', name: 'Grok 4.1 Fast (non-reasoning)' }],
                voices: XAI_VOICES,
                requiredEnv: ['XAI_API_KEY'],
            },
        ],
    };
}

