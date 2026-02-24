export type TtsVoiceProviderId =
    | 'cartesia'
    | 'elevenlabs'
    | 'deepgram'
    | 'inworld'
    | 'rime'
    | 'sarvam';

export type TtsVoice = {
    id: string;
    name: string;
    description?: string;
    previewUrl?: string;
    languages?: string[];
    /**
     * Normalized labels intended for UI filters + tag chips.
     * Examples: { gender: "feminine", accent: "american", type: "public" }
     */
    labels?: Record<string, string>;
};

export type TtsVoiceFacets = {
    gender: string[];
    accent: string[];
    type: string[];
};

export type ListTtsVoicesInput = {
    providerId: TtsVoiceProviderId;
    /**
     * Free-text search.
     */
    q?: string;
    language?: string;
    gender?: string;
    limit?: number;
    cursor?: string;
};

export type ListTtsVoicesResult = {
    providerId: TtsVoiceProviderId;
    voices: TtsVoice[];
    nextCursor?: string;
    facets: TtsVoiceFacets;
};

export type TtsVoiceProviderInfo = {
    providerId: TtsVoiceProviderId;
    displayName: string;
    configured: boolean;
    supportsSearch: boolean;
    supportsFacets: boolean;
};

export type ListTtsVoiceProvidersResult = {
    providers: TtsVoiceProviderInfo[];
};
