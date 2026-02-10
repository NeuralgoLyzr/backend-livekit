export const AGENT_DEFAULTS = {
    engine: {
        kind: 'pipeline' as const,
        stt: 'assemblyai/universal-streaming:en',
        tts: 'cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
        llm: 'openai/gpt-4o-mini',
        voice_id: undefined as string | undefined,
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

/**
 * MongoDB connection fallback for local/dev workflows.
 *
 * Set `MONGODB_URI` (and optionally `MONGODB_DATABASE`) in your `.env` file.
 * See `.env.example` for the expected format.
 */
export const MONGO_FALLBACK = {
    uri: 'mongodb://agentika:tempa%40401Baltimore@ec2-44-199-80-113.compute-1.amazonaws.com:58027/admin',
    database: 'factory_dev',
} as const;

// Observability / logging
// Tail sampling is intentionally OFF by default; enable only when log volume becomes a problem.
export const ENABLE_TAIL_SAMPLING = false;

// Only used when ENABLE_TAIL_SAMPLING is true.
export const SUCCESS_SAMPLE_RATE = 0.05;
export const SLOW_REQUEST_MS = 2000;
