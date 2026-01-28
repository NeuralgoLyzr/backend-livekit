export const AGENT_DEFAULTS = {
    engine: {
        kind: 'pipeline' as const,
        stt: 'assemblyai/universal-streaming:en',
        tts: 'cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
        llm: 'openai/gpt-4o-mini',
        voice_id: undefined as string | undefined,
    },
    prompt: 'You are a helpful voice AI assistant. Be concise and friendly.',
    turn_detection: 'multilingual' as const,
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

