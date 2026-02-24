import { HttpError } from '../../../lib/httpErrors.js';
import { httpGetJson } from '../httpJson.js';
import type { ListTtsVoicesInput, ListTtsVoicesResult, TtsVoice } from '../types.js';
import { buildFacets } from '../facets.js';

type CartesiaVoice = {
    id?: unknown;
    name?: unknown;
    description?: unknown;
    gender?: unknown;
    language?: unknown;
    accent?: unknown;
    dialect?: unknown;
    locale?: unknown;
    is_owner?: unknown;
    is_public?: unknown;
    preview_file_url?: unknown;
};

type CartesiaListVoicesResponse = {
    data?: unknown;
    has_more?: unknown;
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

function normalizeAccentLabel(raw: string): string {
    const value = raw.trim();
    if (!value) return '';

    const lower = value.toLowerCase();
    // Dialect codes used by Cartesia localize endpoint docs.
    const known: Record<string, string> = {
        us: 'American',
        uk: 'British',
        au: 'Australian',
        in: 'Indian',
        so: 'Southern',
        mx: 'Latin American',
        pe: 'Peninsular',
        br: 'Brazilian',
        eu: 'European',
        ca: 'Canadian',
    };
    return known[lower] ?? value;
}

function inferAccentLabel(input: {
    accent?: string;
    dialect?: string;
    locale?: string;
    language?: string;
}): string | undefined {
    const accent = (input.accent ?? '').trim();
    if (accent) return normalizeAccentLabel(accent);

    const dialect = (input.dialect ?? '').trim();
    if (dialect) return normalizeAccentLabel(dialect);

    const locale = (input.locale ?? '').trim();
    const language = (input.language ?? '').trim();
    if (!locale) return undefined;

    // If locale is the same as language ("en"), it doesn't add accent signal.
    if (language && locale.toLowerCase() === language.toLowerCase()) return undefined;

    // If locale looks like "en-US" / "pt_BR", map region codes when possible.
    const delimiter = locale.includes('-') ? '-' : locale.includes('_') ? '_' : '';
    if (delimiter) {
        const parts = locale.split(delimiter).filter(Boolean);
        const region = parts[parts.length - 1] ?? '';
        const mapped = normalizeAccentLabel(region);
        if (mapped && mapped !== region) return mapped;
    }

    return locale || undefined;
}

function parseCartesiaVoice(value: unknown): TtsVoice | null {
    if (!isRecord(value)) return null;
    const v = value as CartesiaVoice;
    const id = toStringOrEmpty(v.id);
    const name = toStringOrEmpty(v.name);
    if (!id || !name) return null;

    const description = toStringOrEmpty(v.description) || undefined;
    const gender = toStringOrEmpty(v.gender) || undefined;
    const language = toStringOrEmpty(v.language) || undefined;
    const accentLabel = inferAccentLabel({
        accent: toStringOrEmpty(v.accent) || undefined,
        dialect: toStringOrEmpty(v.dialect) || undefined,
        locale: toStringOrEmpty(v.locale) || undefined,
        language,
    });
    const previewUrl = toStringOrEmpty(v.preview_file_url) || undefined;
    const isOwner = toBoolean(v.is_owner);
    const isPublic = toBoolean(v.is_public);

    return {
        id,
        name,
        description,
        previewUrl,
        languages: language ? [language] : undefined,
        labels: {
            ...(gender ? { gender } : {}),
            ...(accentLabel ? { accent: accentLabel } : {}),
            type: isOwner ? 'owned' : isPublic ? 'public' : 'shared',
        },
    };
}

export function createCartesiaVoiceProvider(deps: { apiKey: string; version: string }) {
    const apiKey = deps.apiKey.trim();
    const version = deps.version.trim();

    async function listVoices(input: ListTtsVoicesInput): Promise<ListTtsVoicesResult> {
        if (!apiKey) {
            throw new HttpError(503, 'Cartesia voice proxy is not configured', {
                requiredEnv: ['CARTESIA_API_KEY'],
            });
        }

        const url = new URL('https://api.cartesia.ai/voices');
        const limit = Math.min(Math.max(Math.floor(input.limit ?? 50), 1), 100);
        url.searchParams.set('limit', String(limit));
        url.searchParams.set('expand[]', 'preview_file_url');
        if (input.cursor) url.searchParams.set('starting_after', input.cursor);
        if (input.q) url.searchParams.set('q', input.q);
        if (input.gender) url.searchParams.set('gender', input.gender);

        const payload = await httpGetJson(
            url.toString(),
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Cartesia-Version': version || '2025-04-16',
                },
            },
            { timeoutMs: 12_000 }
        );

        if (!payload || typeof payload !== 'object') {
            throw new HttpError(502, 'Invalid Cartesia response');
        }

        const body = payload as CartesiaListVoicesResponse;
        const rawList = Array.isArray(body.data) ? body.data : [];
        const allVoices: TtsVoice[] = rawList
            .map((item) => parseCartesiaVoice(item))
            .filter((v): v is TtsVoice => v !== null);

        const languageFilter = (input.language ?? '').trim();
        const voices =
            languageFilter.length > 0
                ? allVoices.filter((v) => (v.languages ?? []).includes(languageFilter))
                : allVoices;

        const nextCursor =
            rawList.length > 0 && body.has_more === true
                ? (() => {
                      const last = allVoices[allVoices.length - 1];
                      return last?.id;
                  })()
                : undefined;

        return {
            providerId: 'cartesia',
            voices,
            nextCursor,
            facets: buildFacets(voices),
        };
    }

    return { listVoices, providerId: 'cartesia' as const };
}

