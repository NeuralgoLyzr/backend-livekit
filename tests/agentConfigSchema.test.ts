import { describe, expect, it } from 'vitest';

describe('AgentConfigSchema pipeline voice_id validation', () => {
    it('rejects pipeline engine when voice_id is missing', async () => {
        const { AgentConfigSchema } = await import('../src/types/index.js');

        const result = AgentConfigSchema.safeParse({
            engine: {
                kind: 'pipeline',
                stt: 'assemblyai/universal-streaming:en',
                llm: 'openai/gpt-4o-mini',
                tts: 'cartesia/sonic-3',
            },
        });

        expect(result.success).toBe(false);
    });

    it('rejects engine_pipeline stash when voice_id is missing', async () => {
        const { AgentConfigSchema } = await import('../src/types/index.js');

        const result = AgentConfigSchema.safeParse({
            engine_pipeline: {
                kind: 'pipeline',
                stt: 'assemblyai/universal-streaming:en',
                llm: 'openai/gpt-4o-mini',
                tts: 'cartesia/sonic-3',
            },
        });

        expect(result.success).toBe(false);
    });
});
