import { Router } from 'express';
import { toolRegistry } from '../config/tools.js';
import { getRealtimeOptions } from '../config/realtimeOptions.js';
import { getPipelineOptions } from '../config/pipelineOptions.js';
import type { TtsVoicesService } from '../services/ttsVoices/index.js';
import type { TtsVoicePreviewService } from '../services/ttsVoices/index.js';
import { GetTtsVoicePreviewQuerySchema, ListTtsVoicesQuerySchema } from '../types/ttsVoices.js';
import { formatZodError } from '../lib/zod.js';

export function createConfigRouter(deps: {
    ttsVoicesService: TtsVoicesService;
    ttsVoicePreviewService: TtsVoicePreviewService;
}): Router {
    const router: Router = Router();

    router.get('/tools', (_req, res) => {
        res.json({
            tools: toolRegistry,
        });
    });

    router.get('/realtime-options', (_req, res) => {
        const options = getRealtimeOptions();
        res.json(options);
    });

    router.get('/pipeline-options', (_req, res) => {
        const options = getPipelineOptions();
        res.json(options);
    });

    router.get('/tts-voice-providers', (_req, res) => {
        res.json(deps.ttsVoicesService.listProviders());
    });

    router.get('/tts-voices', async (req, res) => {
        const parseResult = ListTtsVoicesQuerySchema.safeParse(req.query);
        if (!parseResult.success) {
            return res.status(400).json({
                ...formatZodError(parseResult.error),
                example: {
                    providerId: 'cartesia',
                    q: 'calm',
                    language: 'en',
                    gender: 'feminine',
                    limit: 50,
                },
            });
        }

        const result = await deps.ttsVoicesService.listVoices(parseResult.data);
        return res.json(result);
    });

    router.get('/tts-voice-preview', async (req, res) => {
        const parseResult = GetTtsVoicePreviewQuerySchema.safeParse(req.query);
        if (!parseResult.success) {
            return res.status(400).json({
                ...formatZodError(parseResult.error),
                example: {
                    providerId: 'cartesia',
                    url: 'https://files.cartesia.ai/files/<id>/download?format=playback',
                },
            });
        }

        const preview = await deps.ttsVoicePreviewService.fetchPreview(parseResult.data);
        res.setHeader('Content-Type', preview.contentType);
        res.setHeader('Cache-Control', 'private, max-age=600');
        return res.status(200).send(preview.body);
    });

    return router;
}
