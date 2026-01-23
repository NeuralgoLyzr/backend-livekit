/**
 * Agent Configuration Factory
 * Creates STT, TTS, and LLM configurations based on provider names
 */

export const agentFactory = {
    /**
     * Create STT (Speech-to-Text) configuration
     * @param provider - Provider name (e.g., 'deepgram', 'assemblyai', 'openai')
     * @param model - Optional model specification
     * @returns STT configuration string
     */
    createSTTConfig(provider: string = 'assemblyai', model?: string): string {
        const lowerProvider = provider.toLowerCase();

        switch (lowerProvider) {
            case 'assemblyai':
                return model ? `assemblyai/${model}` : 'assemblyai/universal-streaming:en';

            case 'deepgram':
                return model ? `deepgram/${model}` : 'deepgram/nova-3';

            case 'openai':
                return 'openai/whisper-1';

            default:
                console.warn(
                    `Unknown STT provider: ${provider}, defaulting to assemblyai/universal-streaming:en`
                );
                return 'assemblyai/universal-streaming:en';
        }
    },

    /**
     * Create TTS (Text-to-Speech) configuration
     * @param provider - Provider name (e.g., 'cartesia', 'openai', 'elevenlabs')
     * @param voice - Optional voice ID
     * @returns TTS configuration string
     */
    createTTSConfig(provider: string = 'cartesia', voice?: string): string {
        const lowerProvider = provider.toLowerCase();

        switch (lowerProvider) {
            case 'cartesia':
                return voice
                    ? `cartesia/sonic-3:${voice}`
                    : 'cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc';

            case 'openai':
                return voice ? `openai/tts-1:${voice}` : 'openai/tts-1:alloy';

            case 'elevenlabs':
                return voice ? `elevenlabs/${voice}` : 'elevenlabs/21m00Tcm4TlvDq8ikWAM';

            default:
                console.warn(`Unknown TTS provider: ${provider}, defaulting to cartesia`);
                return 'cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc';
        }
    },

    /**
     * Create LLM configuration
     * @param model - Model specification (e.g., 'gpt-4o-mini', 'gpt-4o')
     * @returns LLM configuration string
     */
    createLLMConfig(model: string = 'gpt-4o-mini'): string {
        // Support both with and without provider prefix
        if (model.includes('/')) {
            return model;
        }
        return `openai/${model}`;
    },
};
