/**
 * Session endpoint
 * Creates user tokens and dispatches agents with custom configuration
 */

import { Router } from 'express';
import { SessionRequestSchema, EndSessionRequestSchema } from '../types/index.js';
import { ZodError } from 'zod';
import { sessionService } from '../services/sessionService.js';
import { formatErrorResponse, getErrorStatus } from '../lib/httpErrors.js';
import { AGENT_DEFAULTS } from '../services/agentDefaults.js';

const router: Router = Router();

function formatZodError(error: ZodError): { error: string; issues: typeof error.issues } {
    return {
        error: error.issues.map((i) => i.message).join('; '),
        issues: error.issues,
    };
}

router.post('/', async (req, res) => {
    try {
        const parseResult = SessionRequestSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({
                ...formatZodError(parseResult.error),
                example: {
                    userIdentity: 'user123',
                    roomName: 'optional-room-name',
                    agentConfig: {
                        stt: AGENT_DEFAULTS.stt,
                        tts: AGENT_DEFAULTS.tts,
                        llm: AGENT_DEFAULTS.llm,
                        prompt: 'You are a helpful voice AI assistant.',
                        greeting: "Say, 'Hi I'm Maya, how can I help you today?'",
                        realtime: AGENT_DEFAULTS.realtime,
                        realtime_model: AGENT_DEFAULTS.realtime_model,
                        realtime_voice: AGENT_DEFAULTS.realtime_voice,
                        vad_enabled: AGENT_DEFAULTS.vad_enabled,
                        turn_detection_enabled: AGENT_DEFAULTS.turn_detection_enabled,
                        noise_cancellation_enabled: AGENT_DEFAULTS.noise_cancellation_enabled,
                        noise_cancellation_type: AGENT_DEFAULTS.noise_cancellation_type,
                        avatar: {
                            enabled: true,
                            provider: 'anam',
                            anam: {
                                name: 'Maya',
                                avatarId: '<anam-avatar-id>',
                            },
                        },
                    },
                },
            });
        }

        const response = await sessionService.createSession(parseResult.data);
        res.json(response);
    } catch (error) {
        console.error('Session creation error:', error);
        res.status(getErrorStatus(error)).json(
            formatErrorResponse(error, {
                fallbackMessage: 'Failed to create session',
            })
        );
    }
});

router.post('/end', async (req, res) => {
    try {
        const parseResult = EndSessionRequestSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json(formatZodError(parseResult.error));
        }

        await sessionService.endSession(parseResult.data.roomName);
        res.status(204).send();
    } catch (error) {
        console.error('Session termination error:', error);
        res.status(getErrorStatus(error)).json(
            formatErrorResponse(error, {
                fallbackMessage: 'Failed to end session',
            })
        );
    }
});

export default router;
