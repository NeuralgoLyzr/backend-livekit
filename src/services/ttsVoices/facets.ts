import type { TtsVoice, TtsVoiceFacets } from './types.js';

function uniqSorted(items: string[]): string[] {
    const cleaned = items.map((v) => v.trim()).filter(Boolean);
    return [...new Set(cleaned)].sort((a, b) => a.localeCompare(b));
}

export function buildFacets(voices: TtsVoice[]): TtsVoiceFacets {
    const genders: string[] = [];
    const accents: string[] = [];
    const types: string[] = [];

    for (const voice of voices) {
        const labels = voice.labels ?? {};
        if (labels.gender) genders.push(labels.gender);
        if (labels.accent) accents.push(labels.accent);
        if (labels.type) types.push(labels.type);
    }

    return {
        gender: uniqSorted(genders),
        accent: uniqSorted(accents),
        type: uniqSorted(types),
    };
}

