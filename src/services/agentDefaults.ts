export const AGENT_DEFAULTS = {
    stt: 'assemblyai/universal-streaming:en',
    tts: 'cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
    llm: 'openai/gpt-4o-mini',
    prompt: 'You are a helpful voice AI assistant. Be concise and friendly.',
    greeting: null as string | null,
    realtime: false,
    realtime_model: 'gpt-4o-realtime-preview',
    realtime_voice: 'sage',
    tools: [] as string[],
    agentic_rag: [] as unknown[],
    vad_enabled: true,
    turn_detection_enabled: true,
    noise_cancellation_enabled: true,
    noise_cancellation_type: 'auto' as const,
} as const;

