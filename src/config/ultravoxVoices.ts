import type { RealtimeOption } from './realtimeOptions.js';

/**
 * Voices supported by LiveKit's Ultravox realtime plugin.
 *
 * This list is intentionally explicit for UI selectors + validation.
 * Keep it in sync with the Ultravox realtime plugin / provider as voices change.
 */
export const ULTRAVOX_VOICES: RealtimeOption[] = [
    { id: 'Mark', name: 'Mark', description: 'Energetic, expressive man with a rapid-fire delivery' },
    { id: 'Jessica', name: 'Jessica', description: 'Female, Middle-Aged, Conversational' },
    { id: 'Ashley', name: 'Ashley', description: 'A warm, natural female voice' },
    {
        id: 'Blake',
        name: 'Blake',
        description: 'Rich, intimate male voice, reassuring',
    },
    {
        id: 'Carter',
        name: 'Carter',
        description:
            'Energetic, mature radio announcer-style male voice, great for storytelling, pep talks',
    },
    { id: 'Priya', name: 'Priya', description: 'Even-toned female voice with an Indian accent' },
    {
        id: 'Clive',
        name: 'Clive',
        description: 'British-accented English-language male voice with a calm, cordial quality',
    },
    { id: 'Craig', name: 'Craig', description: 'Older British male with a refined and articulate voice' },
    { id: 'Deborah', name: 'Deborah', description: 'Gentle and elegant female voice' },
    {
        id: 'Dennis',
        name: 'Dennis',
        description: 'Middle-aged man with a smooth, calm and friendly voice',
    },
    {
        id: 'Edward',
        name: 'Edward',
        description: 'Male with a fast-talking, emphatic and streetwise tone',
    },
    {
        id: 'Elizabeth',
        name: 'Elizabeth',
        description: 'Professional middle-aged woman, perfect for narrations and voiceovers',
    },
    {
        id: 'Julia',
        name: 'Julia',
        description: 'Quirky, high-pitched female voice that delivers lines with playful energy',
    },
    {
        id: 'Luna',
        name: 'Luna',
        description:
            'Calm, relaxing female voice, perfect for meditations, mindfulness',
    },
    { id: 'Olivia', name: 'Olivia', description: 'Young, British female with an upbeat, friendly tone' },
    {
        id: 'Pixie',
        name: 'Pixie',
        description: 'High-pitched, childlike female voice with a squeaky quality - great for a cartoon',
    },
    {
        id: 'Ronald',
        name: 'Ronald',
        description: 'Confident, British man with a deep, gravelly voice',
    },
    {
        id: 'Sarah',
        name: 'Sarah',
        description: 'Fast-talking young adult woman, with a questioning and curious tone',
    },
    {
        id: 'Shaun',
        name: 'Shaun',
        description: 'Friendly, dynamic male voice great for conversations',
    },
    { id: 'Timothy', name: 'Timothy', description: 'Lively, upbeat American male voice' },

];

