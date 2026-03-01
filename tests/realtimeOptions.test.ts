import { describe, expect, it } from 'vitest';

describe('realtimeOptions', () => {
    it('exposes xAI provider metadata without backend warning fields', async () => {
        const { getRealtimeOptions } = await import('../src/config/realtimeOptions.js');
        const providers = getRealtimeOptions().providers;
        const xai = providers.find((provider) => provider.providerId === 'xai');

        expect(xai).toBeDefined();
        expect(xai).toMatchObject({
            providerId: 'xai',
            displayName: 'xAI Grok',
            requiredEnv: ['XAI_API_KEY'],
            models: [
                expect.objectContaining({
                    id: 'grok-voice-agent-latest',
                    name: 'Grok Voice Agent Latest',
                }),
            ],
        });
        expect(xai?.voices).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: 'ara', name: 'Ara' }),
            ])
        );
        expect((xai as { warning?: unknown } | undefined)?.warning).toBeUndefined();
    });

    it('does not set warning on realtime providers', async () => {
        const { getRealtimeOptions } = await import('../src/config/realtimeOptions.js');

        for (const provider of getRealtimeOptions().providers) {
            expect((provider as { warning?: unknown }).warning).toBeUndefined();
        }
    });
});
