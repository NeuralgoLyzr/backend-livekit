import { httpGetJson } from '../httpJson.js';
import type { ListTtsVoicesInput, ListTtsVoicesResult, TtsVoice } from '../types.js';
import { buildFacets } from '../facets.js';
import { createTtlCache } from '../ttlCache.js';

type RimeVoiceDetails = {
    voice_id?: unknown;
    speaker_name?: unknown;
    // Newer public manifest fields (https://users.rime.ai/data/voices/voice_details.json)
    speaker?: unknown;
    gender?: unknown;
    age_group?: unknown;
    age?: unknown;
    country?: unknown;
    dialect?: unknown;
    language?: unknown;
    language_code?: unknown;
    lang?: unknown;
    model_id?: unknown;
    modelId?: unknown;
    flagship?: unknown;
    demographic?: unknown;
    genre?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringOrEmpty(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function toBoolean(value: unknown): boolean {
    return value === true;
}

function titleFromId(value: string): string {
    const cleaned = value
        .trim()
        .replaceAll(/[_-]+/g, ' ')
        .replaceAll(/\s+/g, ' ');
    if (!cleaned) return '';
    return cleaned
        .split(' ')
        .filter(Boolean)
        .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
        .join(' ');
}

function normalizeRimeLanguages(v: RimeVoiceDetails): string[] | undefined {
    const out = new Set<string>();

    const rawCode = (toStringOrEmpty(v.language_code) || toStringOrEmpty(v.lang)).toLowerCase();
    const rawName = toStringOrEmpty(v.language).toLowerCase();

    const iso6393ToIso6391: Record<string, string> = {
        ara: 'ar',
        deu: 'de',
        eng: 'en',
        fra: 'fr',
        ger: 'de',
        heb: 'he',
        hin: 'hi',
        jpn: 'ja',
        por: 'pt',
        spa: 'es',
    };

    const nameToIso6391: Record<string, string> = {
        arabic: 'ar',
        english: 'en',
        french: 'fr',
        german: 'de',
        hebrew: 'he',
        hindi: 'hi',
        japanese: 'ja',
        portugese: 'pt', // upstream typo seen in manifest
        portuguese: 'pt',
        spanish: 'es',
    };

    function addCode(code: string): void {
        const normalized = code.trim().toLowerCase().replaceAll('_', '-');
        if (!normalized) return;
        out.add(normalized);
        const base = normalized.split('-', 1)[0];
        if (base) out.add(base);
    }

    if (rawCode) {
        addCode(rawCode);
        if (rawCode.length === 3 && iso6393ToIso6391[rawCode]) {
            addCode(iso6393ToIso6391[rawCode]);
        }
    }

    if (rawName && nameToIso6391[rawName]) {
        addCode(nameToIso6391[rawName]);
    }

    const languages = [...out];
    return languages.length > 0 ? languages : undefined;
}

function parseRimeVoiceDetails(value: unknown): TtsVoice | null {
    if (!isRecord(value)) return null;
    const v = value as RimeVoiceDetails;
    const id = toStringOrEmpty(v.voice_id) || toStringOrEmpty(v.speaker);
    const rawName = toStringOrEmpty(v.speaker_name) || toStringOrEmpty(v.speaker);
    const name = rawName ? titleFromId(rawName) || rawName : '';
    if (!id || !name) return null;

    const gender = toStringOrEmpty(v.gender) || undefined;
    const age = toStringOrEmpty(v.age_group) || toStringOrEmpty(v.age) || undefined;
    const accent = toStringOrEmpty(v.dialect) || toStringOrEmpty(v.country) || undefined;
    const languages = normalizeRimeLanguages(v);
    const modelId = toStringOrEmpty(v.model_id) || toStringOrEmpty(v.modelId) || undefined;
    const isFlagship = toBoolean(v.flagship);

    const descriptionParts = [
        toStringOrEmpty(v.language) || '',
        toStringOrEmpty(v.country) || '',
        toStringOrEmpty(v.dialect) || '',
        modelId ? `model: ${modelId}` : '',
        isFlagship ? 'flagship' : '',
    ].filter(Boolean);
    const description = descriptionParts.length > 0 ? descriptionParts.join(' • ') : undefined;

    return {
        id,
        name,
        description,
        languages,
        labels: {
            ...(gender ? { gender } : {}),
            ...(age ? { age } : {}),
            ...(accent ? { accent } : {}),
            ...(modelId ? { type: modelId } : {}),
            ...(isFlagship ? { use_case: 'flagship' } : {}),
        },
    };
}

export function createRimeVoiceProvider() {
    // Rime hosts public JSON manifests; cache for longer.
    const cache = createTtlCache<TtsVoice[]>({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 10 });

    async function fetchAll(): Promise<TtsVoice[]> {
        const cached = cache.get('all');
        if (cached) return cached;

        const url = 'https://users.rime.ai/data/voices/voice_details.json';
        const payload = await httpGetJson(url, {}, { timeoutMs: 12_000 });
        const raw = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];

        const voices: TtsVoice[] = raw
            .map((item) => parseRimeVoiceDetails(item))
            .filter((v): v is TtsVoice => v !== null);

        cache.set('all', voices);
        return voices;
    }

    async function listVoices(input: ListTtsVoicesInput): Promise<ListTtsVoicesResult> {
        let voices = await fetchAll();

        const language = (input.language ?? '').trim().toLowerCase();
        if (language) {
            const normalized = language.replaceAll('_', '-');
            const base = normalized.split('-', 1)[0] ?? '';
            voices = voices.filter((v) =>
                (v.languages ?? []).some((l) => {
                    const voiceLang = l.trim().toLowerCase().replaceAll('_', '-');
                    if (!voiceLang) return false;
                    if (voiceLang === normalized) return true;
                    if (base && voiceLang === base) return true;
                    const voiceBase = voiceLang.split('-', 1)[0] ?? '';
                    return Boolean(base && voiceBase === base);
                })
            );
        }

        const gender = (input.gender ?? '').trim().toLowerCase();
        if (gender) {
            voices = voices.filter((v) => {
                const g = (v.labels?.gender ?? '').trim().toLowerCase();
                return g === gender;
            });
        }

        const q = (input.q ?? '').trim().toLowerCase();
        if (q) {
            voices = voices.filter((v) => {
                const labels = v.labels ?? {};
                const hay = `${v.name} ${v.description ?? ''} ${v.id} ${Object.values(labels).join(' ')}`.toLowerCase();
                return hay.includes(q);
            });
        }

        const limit = Math.min(Math.max(Math.floor(input.limit ?? 200), 1), 500);
        return {
            providerId: 'rime',
            voices: voices.slice(0, limit),
            facets: buildFacets(voices),
        };
    }

    return { listVoices, providerId: 'rime' as const };
}

