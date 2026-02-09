import { GEMINI_VOICES } from './geminiVoices.js';
import { OPENAI_VOICES } from './openaiVoices.js';
import { ULTRAVOX_VOICES } from './ultravoxVoices.js';
// import { NOVA_SONIC_VOICES } from './novaSonicVoices.js';
// import { XAI_VOICES } from './xaiVoices.js';

export type RealtimeOption = {
    id: string;
    name: string;
    description?: string;
    previewUrl?: string;
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
    /**
     * Optional warning to surface in UI (e.g. missing env).
     */
    warning?: string;
    // /**
    //  * Whether the lists are fetched dynamically at request time.
    //  */
    // dynamic?: boolean;
};

type RealtimeOptionsResponse = {
    providers: RealtimeProviderOptions[];
};

export function getRealtimeOptions(): RealtimeOptionsResponse {
    const hasUltravoxKey = Boolean(process.env.ULTRAVOX_API_KEY?.trim());
    return {
        providers: [
            {
                providerId: 'openai',
                displayName: 'OpenAI',
                models: [
                    { id: 'gpt-realtime', name: 'gpt-realtime' },
                    { id: 'gpt-realtime-mini', name: 'gpt-realtime-mini' },
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
                    { id: 'fixie-ai/ultravox', name: 'fixie-ai/ultravox' },
                    {
                        id: 'fixie-ai/ultravox-gemma3-27b-preview',
                        name: 'fixie-ai/ultravox-gemma3-27b-preview',
                    },
                    {
                        id: 'fixie-ai/ultravox-llama3.3-70b',
                        name: 'fixie-ai/ultravox-llama3.3-70b',
                    },
                    {
                        id: 'fixie-ai/ultravox-qwen3-32b-preview',
                        name: 'fixie-ai/ultravox-qwen3-32b-preview',
                    },
                ],
                voices: ULTRAVOX_VOICES,
                requiredEnv: ['ULTRAVOX_API_KEY'],
                warning: hasUltravoxKey ? undefined : 'Missing ULTRAVOX_API_KEY',
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
            // {
            //     providerId: 'xai',
            //     displayName: 'xAI Grok',
            //     models: [{ id: 'grok-voice-agent-latest', name: 'Grok Voice Agent Latest' }],
            //     voices: XAI_VOICES,
            // },
        ],
    };
}
