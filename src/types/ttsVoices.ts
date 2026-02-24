import { z } from 'zod';

export const TtsVoiceProviderIdSchema = z.enum([
    'cartesia',
    'elevenlabs',
    'deepgram',
    'inworld',
    'rime',
    'sarvam',
]);
export type TtsVoiceProviderId = z.infer<typeof TtsVoiceProviderIdSchema>;

export const ListTtsVoicesQuerySchema = z
    .object({
        providerId: TtsVoiceProviderIdSchema,
        q: z.string().optional(),
        language: z.string().optional(),
        gender: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
    })
    .strict();
export type ListTtsVoicesQuery = z.infer<typeof ListTtsVoicesQuerySchema>;

export const GetTtsVoicePreviewQuerySchema = z
    .object({
        providerId: TtsVoiceProviderIdSchema,
        url: z.string().min(1),
    })
    .strict();
export type GetTtsVoicePreviewQuery = z.infer<typeof GetTtsVoicePreviewQuerySchema>;
