export type PipelineModelOption = {
    id: string;
    name: string;
    description?: string;
};

export type PipelineProviderModels = {
    providerId: string;
    displayName: string;
    models: PipelineModelOption[];
};

type PipelineOptionsResponse = {
    stt: PipelineProviderModels[];
    tts: PipelineProviderModels[];
    llm: PipelineProviderModels[];
};

export function getPipelineOptions(): PipelineOptionsResponse {
    return {
        stt: [
            {
                providerId: 'assemblyai',
                displayName: 'AssemblyAI',
                models: [
                    {
                        id: 'assemblyai/universal-streaming:en',
                        name: 'AssemblyAI Universal-Streaming (EN)',
                    },
                    {
                        id: 'assemblyai/universal-streaming-multilingual:en',
                        name: 'AssemblyAI Universal-Streaming Multilingual (EN)',
                    },
                ],
            },
            {
                providerId: 'cartesia',
                displayName: 'Cartesia',
                models: [
                    {
                        id: 'cartesia/ink-whisper:en',
                        name: 'Cartesia Ink Whisper (EN)',
                    },
                ],
            },
            {
                providerId: 'deepgram',
                displayName: 'Deepgram',
                models: [
                    { id: 'deepgram/flux-general:en', name: 'Deepgram Flux (EN)' },
                    { id: 'deepgram/nova-3:en', name: 'Deepgram Nova-3 (EN)' },
                    { id: 'deepgram/nova-3:multi', name: 'Deepgram Nova-3 (Multilingual)' },
                    { id: 'deepgram/nova-3-medical:en', name: 'Deepgram Nova-3 Medical (EN)' },
                    { id: 'deepgram/nova-2:en', name: 'Deepgram Nova-2 (EN)' },
                    { id: 'deepgram/nova-2:multi', name: 'Deepgram Nova-2 (Multilingual)' },
                    { id: 'deepgram/nova-2-medical:en', name: 'Deepgram Nova-2 Medical (EN)' },
                    {
                        id: 'deepgram/nova-2-conversationalai:en',
                        name: 'Deepgram Nova-2 Conversational AI (EN)',
                    },
                    {
                        id: 'deepgram/nova-2-phonecall:en',
                        name: 'Deepgram Nova-2 Phonecall (EN)',
                    },
                ],
            },
            {
                providerId: 'elevenlabs',
                displayName: 'ElevenLabs',
                models: [
                    {
                        id: 'elevenlabs/scribe_v2_realtime:en',
                        name: 'ElevenLabs Scribe V2 Realtime (EN)',
                    },
                ],
            },
        ],
        tts: [
            {
                providerId: 'cartesia',
                displayName: 'Cartesia',
                models: [
                    {
                        id: 'cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
                        name: 'Cartesia Sonic-3',
                    },
                    {
                        id: 'cartesia/sonic-2:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
                        name: 'Cartesia Sonic-2',
                    },
                    {
                        id: 'cartesia/sonic-turbo:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
                        name: 'Cartesia Sonic-Turbo',
                    },
                    {
                        id: 'cartesia/sonic:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
                        name: 'Cartesia Sonic',
                    },
                ],
            },
            {
                providerId: 'deepgram',
                displayName: 'Deepgram',
                models: [
                    { id: 'deepgram/aura:apollo', name: 'Deepgram Aura-1 (Apollo)' },
                    { id: 'deepgram/aura-2:athena', name: 'Deepgram Aura-2 (Athena)' },
                ],
            },
            {
                providerId: 'elevenlabs',
                displayName: 'ElevenLabs',
                models: [
                    {
                        id: 'elevenlabs/eleven_flash_v2:Xb7hH8MSUJpSbSDYk0k2',
                        name: 'ElevenLabs Eleven Flash v2',
                    },
                    {
                        id: 'elevenlabs/eleven_flash_v2_5:Xb7hH8MSUJpSbSDYk0k2',
                        name: 'ElevenLabs Eleven Flash v2.5',
                    },
                    {
                        id: 'elevenlabs/eleven_turbo_v2:Xb7hH8MSUJpSbSDYk0k2',
                        name: 'ElevenLabs Eleven Turbo v2',
                    },
                    {
                        id: 'elevenlabs/eleven_turbo_v2_5:Xb7hH8MSUJpSbSDYk0k2',
                        name: 'ElevenLabs Eleven Turbo v2.5',
                    },
                    {
                        id: 'elevenlabs/eleven_multilingual_v2:Xb7hH8MSUJpSbSDYk0k2',
                        name: 'ElevenLabs Eleven Multilingual v2',
                    },
                ],
            },
            {
                providerId: 'inworld',
                displayName: 'Inworld',
                models: [
                    {
                        id: 'inworld/inworld-tts-1.5-max:Ashley',
                        name: 'Inworld TTS 1.5 Max (Ashley)',
                    },
                    {
                        id: 'inworld/inworld-tts-1.5-mini:Ashley',
                        name: 'Inworld TTS 1.5 Mini (Ashley)',
                    },
                    {
                        id: 'inworld/inworld-tts-1-max:Ashley',
                        name: 'Inworld TTS-1 Max (Ashley)',
                    },
                    {
                        id: 'inworld/inworld-tts-1:Ashley',
                        name: 'Inworld TTS-1 (Ashley)',
                    },
                ],
            },
            {
                providerId: 'rime',
                displayName: 'Rime',
                models: [
                    { id: 'rime/arcana:astra', name: 'Rime Arcana V2 (Astra)' },
                    { id: 'rime/mistv2:astra', name: 'Rime Mist V2 (Astra)' },
                ],
            },
        ],
        llm: [
            {
                providerId: 'openai',
                displayName: 'OpenAI',
                models: [
                    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
                    { id: 'openai/gpt-4o', name: 'GPT-4o' },
                    { id: 'openai/gpt-4.1', name: 'GPT-4.1' },
                    { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini' },
                    { id: 'openai/gpt-4.1-nano', name: 'GPT-4.1 Nano' },
                    { id: 'openai/gpt-5', name: 'GPT-5' },
                    { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini' },
                    { id: 'openai/gpt-5-nano', name: 'GPT-5 Nano' },
                    { id: 'openai/gpt-5.1', name: 'GPT-5.1' },
                    { id: 'openai/gpt-5.1-chat-latest', name: 'GPT-5.1 Chat Latest' },
                    { id: 'openai/gpt-5.2', name: 'GPT-5.2' },
                    { id: 'openai/gpt-5.2-chat-latest', name: 'GPT-5.2 Chat Latest' },
                    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B' },
                ],
            },
            {
                providerId: 'google',
                displayName: 'Google Gemini',
                models: [
                    { id: 'google/gemini-3-flash', name: 'Gemini 3 Flash' },
                    { id: 'google/gemini-3-pro', name: 'Gemini 3 Pro' },
                    { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
                    { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
                    { id: 'google/gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
                    { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
                    { id: 'google/gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
                ],
            },
            {
                providerId: 'qwen',
                displayName: 'Qwen',
                models: [
                    {
                        id: 'qwen/qwen3-235b-a22b-instruct',
                        name: 'Qwen3 235B Instruct',
                    },
                ],
            },
            {
                providerId: 'moonshotai',
                displayName: 'MoonshotAI (Kimi)',
                models: [
                    { id: 'moonshotai/kimi-k2-instruct', name: 'Kimi K2 Instruct' },
                ],
            },
            {
                providerId: 'deepseek-ai',
                displayName: 'DeepSeek',
                models: [
                    { id: 'deepseek-ai/deepseek-v3', name: 'DeepSeek V3' },
                    { id: 'deepseek-ai/deepseek-v3.2', name: 'DeepSeek V3.2' },
                ],
            },
        ],
    };
}
