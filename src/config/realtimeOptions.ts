import { GEMINI_VOICES } from './geminiVoices.js';
import { OPENAI_VOICES } from './openaiVoices.js';
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
    // /**
    //  * Whether the lists are fetched dynamically at request time.
    //  */
    // dynamic?: boolean;
};

type RealtimeOptionsResponse = {
    providers: RealtimeProviderOptions[];
};

export function getRealtimeOptions(): RealtimeOptionsResponse {
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
            //     providerId: 'ultravox',
            //     displayName: 'Ultravox',
            //     models: [],
            //     voices: [],
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
