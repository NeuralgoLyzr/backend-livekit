/**
 * Session endpoint
 * Creates user tokens and dispatches agents with custom configuration
 */

import { Router } from 'express';
import {
    SessionRequestSchema,
    EndSessionRequestSchema,
    SessionObservabilityIngestSchema,
} from '../types/index.js';
import { ZodError } from 'zod';
import { sessionService } from '../services/sessionService.js';
import { formatErrorResponse, getErrorStatus } from '../lib/httpErrors.js';
import { AGENT_DEFAULTS } from '../CONSTS.js';

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
                    agentId: '<saved-agent-id>',
                    agentConfig: {
                        engine: AGENT_DEFAULTS.engine,
                        prompt: 'You are a helpful voice AI assistant.',
                        vad_enabled: AGENT_DEFAULTS.vad_enabled,
                        turn_detection: AGENT_DEFAULTS.turn_detection,
                        noise_cancellation: AGENT_DEFAULTS.noise_cancellation,
                        conversation_start: {
                            who: 'ai',
                            greeting: "Say, 'Hi I'm Maya, how can I help you today?'",
                        },
                        background_audio: {
                            enabled: true,
                            ambient: {
                                enabled: true,
                                source: '<ambient-audio-source>',
                                volume: 0.25,
                            },
                            tool_call: {
                                enabled: true,
                                sources: [
                                    {
                                        source: '<tool-call-sfx-source>',
                                        volume: 0.25,
                                        probability: 1,
                                    },
                                ],
                            },
                            turn_taking: {
                                enabled: true,
                                sources: [
                                    {
                                        source: '<turn-taking-sfx-source>',
                                        volume: 0.25,
                                        probability: 1,
                                    },
                                ],
                            },
                        },
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
        return res.json(response);
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
        return res.status(204).send();
    } catch (error) {
        console.error('Session termination error:', error);
        res.status(getErrorStatus(error)).json(
            formatErrorResponse(error, {
                fallbackMessage: 'Failed to end session',
            })
        );
    }
});

/**
 * Receive post-call session artifacts (for testing).
 *
 * This is intended for local debugging of LiveKit Agents data hooks:
 * - `session.history` (conversation transcript / timeline)
 * - `ctx.make_session_report()` (structured report)
 */
router.post('/observability', async (req, res) => {
    try {
        const parseResult = SessionObservabilityIngestSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json(formatZodError(parseResult.error));
        }

        const payload = parseResult.data;
        console.log('[session/observability] room=', payload.roomName);
        console.log(
            '[session/observability] conversationHistory=',
            JSON.stringify(payload.conversationHistory ?? null, null, 2)
        );
        console.log(
            '[session/observability] sessionReport=',
            JSON.stringify(payload.sessionReport ?? null, null, 2)
        );

        // Clean up only after the structured report arrives (it includes full history/events).
        // This avoids deleting the room too early (e.g., when we only received a `close` hook).
        if (payload.sessionReport) {
            // If cleanup fails we still return 204 so the agent doesn't retry forever.
            try {
                await sessionService.cleanupSession(payload.roomName);
            } catch (error) {
                console.error('[session/observability] cleanup error:', error);
            }
        }

        return res.status(204).send();
    } catch (error) {
        console.error('Session observability ingest error:', error);
        res.status(getErrorStatus(error)).json(
            formatErrorResponse(error, {
                fallbackMessage: 'Failed to ingest session observability payload',
            })
        );
    }
});

export default router;
