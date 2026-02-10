import { Router } from 'express';
import {
    SessionRequestSchema,
    EndSessionRequestSchema,
    SessionObservabilityIngestSchema,
} from '../types/index.js';
import type { SessionService } from '../services/sessionService.js';
import { AGENT_DEFAULTS } from '../CONSTS.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { formatZodError } from '../lib/zod.js';
import { logger } from '../lib/logger.js';

export function createSessionRouter(sessionService: SessionService): Router {
    const router: Router = Router();

    router.post(
        '/',
        asyncHandler(async (req, res) => {
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

            const wideEvent = res.locals.wideEvent as
                | { roomName?: string; userIdentity?: string }
                | undefined;
            if (wideEvent) {
                wideEvent.roomName = response.roomName;
                wideEvent.userIdentity = parseResult.data.userIdentity;
            }

            return res.json(response);
        })
    );

    router.post(
        '/end',
        asyncHandler(async (req, res) => {
            const parseResult = EndSessionRequestSchema.safeParse(req.body);
            if (!parseResult.success) {
                return res.status(400).json(formatZodError(parseResult.error));
            }

            const payload = parseResult.data;
            await sessionService.endSession(
                'roomName' in payload
                    ? { roomName: payload.roomName }
                    : { sessionId: payload.sessionId }
            );

            const wideEvent = res.locals.wideEvent as { roomName?: string } | undefined;
            if (wideEvent && 'roomName' in payload) wideEvent.roomName = payload.roomName;

            return res.status(204).send();
        })
    );

    router.post(
        '/observability',
        asyncHandler(async (req, res) => {
            const parseResult = SessionObservabilityIngestSchema.safeParse(req.body);
            if (!parseResult.success) {
                return res.status(400).json(formatZodError(parseResult.error));
            }

            const payload = parseResult.data;
            logger.info(
                {
                    event: 'session_observability_ingest',
                    roomName: payload.roomName,
                    hasConversationHistory: Boolean(payload.conversationHistory),
                    hasSessionReport: Boolean(payload.sessionReport),
                },
                'Ingested session observability payload'
            );

            if (payload.sessionReport) {
                try {
                    await sessionService.cleanupSession(payload.roomName);
                } catch (error) {
                    logger.error({
                        err: error,
                        event: 'session_cleanup_failed',
                        roomName: payload.roomName,
                    });
                }
            }

            const wideEvent = res.locals.wideEvent as { roomName?: string } | undefined;
            if (wideEvent) wideEvent.roomName = payload.roomName;

            return res.status(204).send();
        })
    );

    return router;
}
