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

function normalizeGenderLabel(value: string): string | undefined {
    const normalized = value.trim().toLowerCase().replaceAll(/[\s_]+/g, '-');
    if (!normalized) return undefined;

    const map: Record<string, string> = {
        male: 'masculine',
        masculine: 'masculine',
        female: 'feminine',
        feminine: 'feminine',
        'non-binary': 'non-binary',
        nonbinary: 'non-binary',
        'gender-neutral': 'non-binary',
        neutral: 'non-binary',
    };
    return map[normalized];
}

function inferGenderLabel(metadata: Record<string, unknown>): string | undefined {
    const direct = normalizeGenderLabel(toStringOrEmpty(metadata.gender));
    if (direct) return direct;

    const tags = toStringArray(metadata.tags);
    for (const tag of tags) {
        const fromTag = normalizeGenderLabel(tag);
        if (fromTag) return fromTag;
    }

    return undefined;
}

function titleCase(value: string): string {
    if (!value) return value;
    return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function parseAuraVoiceId(canonicalName: string): { voiceId: string; language?: string } | null {
    const raw = canonicalName.trim().toLowerCase();
    // Examples seen in docs: aura-apollo-en, aura-2-thalia-en
    const aura2Prefix = 'aura-2-';
    const auraPrefix = 'aura-';

    const withoutPrefix = raw.startsWith(aura2Prefix)
        ? raw.slice(aura2Prefix.length)
        : raw.startsWith(auraPrefix)
            ? raw.slice(auraPrefix.length)
            : '';
    if (!withoutPrefix) return null;

    const parts = withoutPrefix.split('-').filter(Boolean);
    if (parts.length < 2) return null;

    const language = parts[parts.length - 1];
    const voiceId = parts.slice(0, -1).join('-');
    if (!voiceId) return null;

    return { voiceId, language };
}

export function createDeepgramVoiceProvider(deps: { apiKey: string }) {
    const apiKey = deps.apiKey.trim();

    async function listVoices(input: ListTtsVoicesInput): Promise<ListTtsVoicesResult> {
        if (!apiKey) {
            throw new HttpError(503, 'Deepgram voice proxy is not configured', {
                requiredEnv: ['DEEPGRAM_API_KEY'],
            });
        }

        const url = 'https://api.deepgram.com/v1/models';
        const payload = await httpGetJson(
            url,
            { headers: { Authorization: `Token ${apiKey}` } },
            { timeoutMs: 12_000 }
        );

        if (!payload || typeof payload !== 'object') {
            throw new HttpError(502, 'Invalid Deepgram response');
        }

        const root = payload as Record<string, unknown>;
        const rawTts = Array.isArray(root.tts) ? root.tts : [];

        const voicesById = new Map<string, TtsVoice>();
        for (const model of rawTts) {
            if (!isRecord(model)) continue;
            const canonical = toStringOrEmpty(model.canonical_name ?? model.name);
            const parsed = canonical ? parseAuraVoiceId(canonical) : null;
            if (!parsed) continue;

            const voiceId = parsed.voiceId;
            const language = parsed.language;

            const metadata = isRecord(model.metadata) ? model.metadata : {};
            const accent = toStringOrEmpty(metadata.accent) || undefined;
            const age = toStringOrEmpty(metadata.age) || undefined;
            const sample = toStringOrEmpty(metadata.sample) || undefined;
            const gender = inferGenderLabel(metadata);

            const existing = voicesById.get(voiceId);
            const mergedLanguages = new Set([...(existing?.languages ?? []), ...(language ? [language] : [])]);

            const labels: Record<string, string> = { type: 'aura' };
            if (existing?.labels) {
                Object.assign(labels, existing.labels);
            }
            if (accent) labels.accent = accent;
            if (age) labels.age = age;
            if (gender) labels.gender = gender;

            voicesById.set(voiceId, {
                id: voiceId,
                name: titleCase(voiceId),
                previewUrl: existing?.previewUrl ?? sample,
                languages: [...mergedLanguages],
                labels,
            });
        }

        const q = (input.q ?? '').trim().toLowerCase();
        const languageFilter = (input.language ?? '').trim().toLowerCase();
        const genderFilter = normalizeGenderLabel(input.gender ?? '');

        let voices = [...voicesById.values()];
        if (languageFilter) {
            voices = voices.filter((v) => (v.languages ?? []).some((l) => l.toLowerCase() === languageFilter));
        }
        if (genderFilter) {
            voices = voices.filter((v) => {
                const voiceGender = normalizeGenderLabel(v.labels?.gender ?? '');
                return voiceGender === genderFilter;
            });
        }
        if (q) {
            voices = voices.filter((v) => `${v.name} ${v.id}`.toLowerCase().includes(q));
        }

        voices.sort((a, b) => a.name.localeCompare(b.name));

        return {
            providerId: 'deepgram',
            voices: voices.slice(0, Math.min(Math.max(Math.floor(input.limit ?? 200), 1), 500)),
            facets: buildFacets(voices),
        };
    }

    return { listVoices, providerId: 'deepgram' as const };
}
