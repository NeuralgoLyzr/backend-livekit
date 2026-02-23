import type { ListTtsVoicesInput, ListTtsVoicesResult, TtsVoice } from '../types.js';
import { buildFacets } from '../facets.js';

const SARVAM_LANGUAGES = [
    'bn-IN',
    'en-IN',
    'gu-IN',
    'hi-IN',
    'kn-IN',
    'ml-IN',
    'mr-IN',
    'od-IN',
    'pa-IN',
    'ta-IN',
    'te-IN',
] as const;

const FEMALE_SPEAKERS = new Set([
    'ritu',
    'pooja',
    'simran',
    'kavya',
    'ishita',
    'shreya',
    'priya',
    'neha',
    'roopa',
    'amelia',
    'sophia',
]);

const MALE_SPEAKERS = new Set([
    'shubh',
    'rahul',
    'amit',
    'ratan',
    'rohan',
    'dev',
    'manan',
    'sumit',
    'aditya',
    'kabir',
    'varun',
    'aayan',
    'ashutosh',
    'advait',
]);

const INTERNATIONAL_SPEAKERS = new Set(['amelia', 'sophia']);

const SARVAM_VOICES: TtsVoice[] = [...MALE_SPEAKERS, ...FEMALE_SPEAKERS]
    .sort((a, b) => a.localeCompare(b))
    .map((speaker) => ({
        id: speaker,
        name: speaker.slice(0, 1).toUpperCase() + speaker.slice(1),
        description: `Sarvam Bulbul v3 (${speaker})`,
        languages: [...SARVAM_LANGUAGES],
        labels: {
            gender: FEMALE_SPEAKERS.has(speaker) ? 'feminine' : 'masculine',
            ...(INTERNATIONAL_SPEAKERS.has(speaker) ? { accent: 'international' } : {}),
            type: 'bulbul-v3',
        },
    }));

function normalizeGenderLabel(value: string): string | undefined {
    const normalized = value.trim().toLowerCase().replaceAll(/[\s_]+/g, '-');
    if (!normalized) return undefined;

    const map: Record<string, string> = {
        male: 'masculine',
        masculine: 'masculine',
        female: 'feminine',
        feminine: 'feminine',
    };
    return map[normalized];
}

function voiceSupportsLanguage(voice: TtsVoice, requested: string): boolean {
    const normalized = requested.trim().toLowerCase().replaceAll('_', '-');
    if (!normalized) return true;

    const base = normalized.split('-', 1)[0] ?? '';
    return (voice.languages ?? []).some((language) => {
        const voiceLanguage = language.trim().toLowerCase().replaceAll('_', '-');
        if (!voiceLanguage) return false;
        if (voiceLanguage === normalized) return true;
        const voiceBase = voiceLanguage.split('-', 1)[0] ?? '';
        return Boolean(base && voiceBase === base);
    });
}

async function _listVoices(input: ListTtsVoicesInput): Promise<ListTtsVoicesResult> {
    let voices = [...SARVAM_VOICES];

    const language = (input.language ?? '').trim();
    if (language) {
        voices = voices.filter((voice) => voiceSupportsLanguage(voice, language));
    }

    const gender = normalizeGenderLabel(input.gender ?? '');
    if (gender) {
        voices = voices.filter((voice) => normalizeGenderLabel(voice.labels?.gender ?? '') === gender);
    }

    const query = (input.q ?? '').trim().toLowerCase();
    if (query) {
        voices = voices.filter((voice) => {
            const labels = voice.labels ?? {};
            const haystack =
                `${voice.name} ${voice.id} ${voice.description ?? ''} ${Object.values(labels).join(' ')}`.toLowerCase();
            return haystack.includes(query);
        });
    }

    const limit = Math.min(Math.max(Math.floor(input.limit ?? 200), 1), 500);
    return {
        providerId: 'sarvam',
        voices: voices.slice(0, limit),
        facets: buildFacets(voices),
    };
}

export function createSarvamVoiceProvider() {
    return { listVoices: _listVoices, providerId: 'sarvam' as const };
}
