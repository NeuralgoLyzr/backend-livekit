export const AGENT_DEFAULTS = {
    engine: {
        kind: 'pipeline' as const,
        stt: 'assemblyai/universal-streaming:en',
        tts: 'cartesia/sonic-3',
        llm: 'openai/gpt-4o-mini',
        voice_id: '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
        language: 'en',
    },
    prompt: 'You are a helpful voice AI assistant. Be concise and friendly.',
    turn_detection: 'english' as const,
    noise_cancellation: {
        enabled: true,
        type: 'auto' as const,
    },
    conversation_start: {
        who: 'ai' as const,
        greeting: undefined as string | undefined,
    },
    tools: [] as string[],
    agentic_rag: [] as unknown[],
    vad_enabled: true,
} as const;

// Observability / logging
// Tail sampling is intentionally OFF by default; enable only when log volume becomes a problem.
export const ENABLE_TAIL_SAMPLING = false;

// Only used when ENABLE_TAIL_SAMPLING is true.
export const SUCCESS_SAMPLE_RATE = 0.05;
export const SLOW_REQUEST_MS = 2000;
