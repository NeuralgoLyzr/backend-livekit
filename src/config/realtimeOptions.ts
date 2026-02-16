import { GEMINI_VOICES } from './geminiVoices.js';
import { OPENAI_VOICES } from './openaiVoices.js';
import { ULTRAVOX_VOICES } from './ultravoxVoices.js';
import { XAI_VOICES } from './xaiVoices.js';
// import { NOVA_SONIC_VOICES } from './novaSonicVoices.js';

export type RealtimeOption = {
    id: string;
    name: string;
    description?: string;
    previewUrl?: string;
    /**
     * Supported language codes for this realtime model (used as a hint/config where supported).
     *
     * Note: Some providers do not publish an authoritative allowlist. In those cases we
     * return a practical, UI-safe list based on the STT datasets we expose in pipeline mode.
     */
    languages?: string[];
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
     * Environment variables required to use this provider.
     */
    requiredEnv: string[];
    // /**
    //  * Whether the lists are fetched dynamically at request time.
    //  */
    // dynamic?: boolean;
};

type RealtimeOptionsResponse = {
    providers: RealtimeProviderOptions[];
};

export function getRealtimeOptions(): RealtimeOptionsResponse {
    // Practical baseline language list for realtime providers where coverage is broadly
    // multilingual but not enumerated in their public docs.
    const REALTIME_COMMON_LANGUAGES = [
        'en',
        'de',
        'es',
        'fr',
        'ja',
        'pt',
        'zh',
        'hi',
        'ko',
        'it',
        'nl',
        'pl',
        'ru',
        'sv',
        'tr',
        'tl',
        'bg',
        'ro',
        'ar',
        'cs',
        'el',
        'fi',
        'hr',
        'ms',
        'sk',
        'da',
        'ta',
        'uk',
        'hu',
        'no',
        'vi',
        'bn',
        'th',
        'he',
        'ka',
        'id',
        'te',
        'gu',
        'kn',
        'ml',
        'mr',
        'pa',
        'fil',
    ];
    return {
        providers: [
            {
                providerId: 'openai',
                displayName: 'OpenAI',
                models: [
                    {
                        id: 'gpt-realtime',
                        name: 'gpt-realtime',
                        languages: REALTIME_COMMON_LANGUAGES,
                    },
                    {
                        id: 'gpt-realtime-mini',
                        name: 'gpt-realtime-mini',
                        languages: REALTIME_COMMON_LANGUAGES,
                    },
                ],
                voices: OPENAI_VOICES,
                requiredEnv: ['OPENAI_API_KEY'],
            },
            {
                providerId: 'google',
                displayName: 'Gemini',
                models: [
                    {
                        id: 'gemini-2.5-flash-native-audio-preview-12-2025',
                        name: 'Gemini 2.5 Flash (Native Audio - Latest)',
                        languages: REALTIME_COMMON_LANGUAGES,
                    },
                ],
                voices: GEMINI_VOICES,
                requiredEnv: ['GOOGLE_API_KEY'],
            },
            {
                providerId: 'ultravox',
                displayName: 'Ultravox',
                // Note: model ids contain slashes; UI must split on FIRST slash only.
                models: [
                    {
                        id: 'fixie-ai/ultravox',
                        name: 'fixie-ai/ultravox',
                        languages: REALTIME_COMMON_LANGUAGES,
                    },
                    {
                        id: 'fixie-ai/ultravox-gemma3-27b-preview',
                        name: 'fixie-ai/ultravox-gemma3-27b-preview',
                        languages: REALTIME_COMMON_LANGUAGES,
                    },
                    {
                        id: 'fixie-ai/ultravox-llama3.3-70b',
                        name: 'fixie-ai/ultravox-llama3.3-70b',
                        languages: REALTIME_COMMON_LANGUAGES,
                    },
                    {
                        id: 'fixie-ai/ultravox-qwen3-32b-preview',
                        name: 'fixie-ai/ultravox-qwen3-32b-preview',
                        languages: REALTIME_COMMON_LANGUAGES,
                    },
                ],
                voices: ULTRAVOX_VOICES,
                requiredEnv: ['ULTRAVOX_API_KEY'],
            },
            {
                providerId: 'xai',
                displayName: 'xAI Grok',
                models: [
                    {
                        id: 'grok-voice-agent-latest',
                        name: 'Grok Voice Agent Latest',
                        languages: REALTIME_COMMON_LANGUAGES,
                    },
                ],
                voices: XAI_VOICES,
                requiredEnv: ['XAI_API_KEY'],
            },
            // {
            //     providerId: 'aws-nova',
            //     displayName: 'Nova Sonic',
            //     models: [
            //         { id: 'amazon.nova-2-sonic-v1:0', name: 'Nova Sonic 2' },
            //         { id: 'amazon.nova-sonic-v1:0', name: 'Nova Sonic 1' },
            //     ],
            //     voices: NOVA_SONIC_VOICES,
            // },
        ],
    };
}
