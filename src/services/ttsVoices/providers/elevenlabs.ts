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

function pickPreviewUrl(v: Record<string, unknown>): string | undefined {
    const direct =
        toStringOrEmpty(v.preview_url) ||
        toStringOrEmpty(v.previewUrl) ||
        toStringOrEmpty(v.preview_audio_url);
    if (direct) return direct;

    const samples = Array.isArray(v.samples) ? v.samples : [];
    for (const sample of samples) {
        if (!isRecord(sample)) continue;
        const url =
            toStringOrEmpty(sample.sample_url) ||
            toStringOrEmpty(sample.audio_url) ||
            toStringOrEmpty(sample.url);
        if (url) return url;
    }
    return undefined;
}

function normalizeLabels(labels: unknown): Record<string, string> {
    if (!labels || typeof labels !== 'object' || Array.isArray(labels)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(labels as Record<string, unknown>)) {
        const v = toStringOrEmpty(value);
        if (!v) continue;
        out[key] = v;
    }
    return out;
}

function parseElevenLabsVoice(value: unknown): TtsVoice | null {
    if (!isRecord(value)) return null;

    const voiceId = toStringOrEmpty(value.voice_id ?? value.voiceId ?? value.id);
    const name = toStringOrEmpty(value.name ?? value.display_name ?? value.displayName);
    if (!voiceId || !name) return null;

    const description = toStringOrEmpty(value.description) || undefined;
    const category = toStringOrEmpty(value.category) || undefined;
    const labels = normalizeLabels(value.labels);

    return {
        id: voiceId,
        name,
        description,
        previewUrl: pickPreviewUrl(value),
        labels: {
            ...(category ? { type: category } : {}),
            ...(labels.gender ? { gender: labels.gender } : {}),
            ...(labels.accent ? { accent: labels.accent } : {}),
            ...(labels.use_case ? { use_case: labels.use_case } : {}),
        },
    };
}

export function createElevenLabsVoiceProvider(deps: { apiKey: string }) {
    const apiKey = deps.apiKey.trim();

    async function listVoices(input: ListTtsVoicesInput): Promise<ListTtsVoicesResult> {
        if (!apiKey) {
            throw new HttpError(503, 'ElevenLabs voice proxy is not configured', {
                requiredEnv: ['ELEVENLABS_API_KEY'],
            });
        }

        const q = (input.q ?? '').trim();
        const urlV2 = new URL('https://api.elevenlabs.io/v2/voices');
        // Some versions support `search`. If ignored, we still filter client-side below.
        if (q) urlV2.searchParams.set('search', q);

        const headers = { 'xi-api-key': apiKey };

        let payload: unknown;
        try {
            payload = await httpGetJson(urlV2.toString(), { headers }, { timeoutMs: 12_000 });
        } catch {
            // Backwards compatibility: fall back to v1.
            const urlV1 = 'https://api.elevenlabs.io/v1/voices';
            payload = await httpGetJson(urlV1, { headers }, { timeoutMs: 12_000 });
        }

        if (!payload || typeof payload !== 'object') {
            throw new HttpError(502, 'Invalid ElevenLabs response');
        }

        const root = payload as Record<string, unknown>;
        const rawList = Array.isArray(root.voices) ? root.voices : Array.isArray(root.data) ? root.data : [];
        const voices: TtsVoice[] = rawList
            .map((item) => parseElevenLabsVoice(item))
            .filter((v): v is TtsVoice => v !== null);

        const filtered = q
            ? voices.filter((v) => {
                  const hay = `${v.name} ${v.description ?? ''} ${v.id}`.toLowerCase();
                  return hay.includes(q.toLowerCase());
              })
            : voices;

        return {
            providerId: 'elevenlabs',
            voices: filtered.slice(0, Math.min(Math.max(Math.floor(input.limit ?? 200), 1), 500)),
            facets: buildFacets(filtered),
        };
    }

    return { listVoices, providerId: 'elevenlabs' as const };
}

