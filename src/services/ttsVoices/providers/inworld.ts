import { HttpError } from '../../../lib/httpErrors.js';
import { httpGetJson } from '../httpJson.js';
import type { ListTtsVoicesInput, ListTtsVoicesResult, TtsVoice } from '../types.js';
import { buildFacets } from '../facets.js';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringOrEmpty(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => toStringOrEmpty(item)).filter(Boolean);
}

function normalizeTag(value: string): string {
    return value.trim().toLowerCase().replaceAll(/[\s_-]+/g, ' ');
}

function normalizeGenderLabel(value: string): string | undefined {
    const normalized = normalizeTag(value);
    if (!normalized) return undefined;

    const map: Record<string, string> = {
        male: 'masculine',
        masculine: 'masculine',
        female: 'feminine',
        feminine: 'feminine',
        'non binary': 'non-binary',
        'gender neutral': 'non-binary',
    };
    return map[normalized];
}

function inferGenderFromTags(tags: string[]): string | undefined {
    for (const tag of tags) {
        const normalized = normalizeGenderLabel(tag);
        if (normalized) return normalized;
    }
    return undefined;
}

function inferAccentFromTags(tags: string[]): string | undefined {
    const map: Record<string, string> = {
        american: 'American',
        british: 'British',
        australian: 'Australian',
        indian: 'Indian',
        irish: 'Irish',
        scottish: 'Scottish',
        canadian: 'Canadian',
        'new zealand': 'New Zealand',
        kiwi: 'New Zealand',
    };

    for (const tag of tags) {
        const normalized = normalizeTag(tag);
        if (map[normalized]) return map[normalized];
    }
    return undefined;
}

function parseInworldVoice(value: unknown): TtsVoice | null {
    if (!isRecord(value)) return null;
    const id = toStringOrEmpty(value.voiceId ?? value.voice_id ?? value.id);
    const name = toStringOrEmpty(value.displayName ?? value.display_name ?? value.name);
    if (!id || !name) return null;
    const description = toStringOrEmpty(value.description) || undefined;
    const languagesFromArray = Array.isArray(value.languages)
        ? value.languages.map((l) => toStringOrEmpty(l)).filter(Boolean)
        : [];
    const langCode = toStringOrEmpty(value.langCode ?? value.lang_code);
    const languages = [...languagesFromArray, ...(langCode ? [langCode] : [])];
    const tags = toStringArray(value.tags);
    const inferredGender = inferGenderFromTags(tags);
    const inferredAccent = inferAccentFromTags(tags);
    return {
        id,
        name,
        description,
        languages: languages.length > 0 ? languages : undefined,
        labels: {
            ...(inferredGender ? { gender: inferredGender } : {}),
            ...(inferredAccent ? { accent: inferredAccent } : {}),
            type: 'inworld',
        },
    };
}

export function createInworldVoiceProvider(deps: { base64: string }) {
    const base64 = deps.base64.trim();
    const authorizationHeaderValue = base64 ? `Basic ${base64}` : '';

    async function listVoices(input: ListTtsVoicesInput): Promise<ListTtsVoicesResult> {
        if (!authorizationHeaderValue) {
            throw new HttpError(503, 'Inworld voice proxy is not configured', {
                requiredEnv: ['INWORLD_BASE_64'],
            });
        }

        const url = new URL('https://api.inworld.ai/voices/v1/voices');
        const language = (input.language ?? '').trim();
        if (language) url.searchParams.append('languages', language);

        const payload = await httpGetJson(
            url.toString(),
            { headers: { Authorization: authorizationHeaderValue } },
            { timeoutMs: 12_000 }
        );

        if (!payload || typeof payload !== 'object') {
            throw new HttpError(502, 'Invalid Inworld response');
        }

        const root = payload as Record<string, unknown>;
        const raw = Array.isArray(root.voices) ? root.voices : [];
        let voices: TtsVoice[] = raw
            .map((item) => parseInworldVoice(item))
            .filter((v): v is TtsVoice => v !== null);

        const genderFilter = normalizeGenderLabel(input.gender ?? '');
        if (genderFilter) {
            voices = voices.filter((voice) => {
                const voiceGender = normalizeGenderLabel(voice.labels?.gender ?? '');
                return voiceGender === genderFilter;
            });
        }

        const q = (input.q ?? '').trim().toLowerCase();
        if (q) {
            voices = voices.filter((v) => `${v.name} ${v.description ?? ''} ${v.id}`.toLowerCase().includes(q));
        }

        voices.sort((a, b) => a.name.localeCompare(b.name));

        return {
            providerId: 'inworld',
            voices: voices.slice(0, Math.min(Math.max(Math.floor(input.limit ?? 200), 1), 500)),
            facets: buildFacets(voices),
        };
    }

    return { listVoices, providerId: 'inworld' as const };
}
