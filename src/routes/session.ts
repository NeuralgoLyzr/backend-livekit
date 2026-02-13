import { Router, type RequestHandler } from 'express';
import { randomUUID } from 'crypto';
import {
    SessionRequestSchema,
    EndSessionRequestSchema,
    SessionObservabilityIngestSchema,
} from '../types/index.js';
import type { SessionService } from '../services/sessionService.js';
import type { TranscriptService } from '../services/transcriptService.js';
import type { SessionStorePort } from '../ports/sessionStorePort.js';
import type { PagosAuthService } from '../services/pagosAuthService.js';
import { AGENT_DEFAULTS } from '../CONSTS.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { formatZodError } from '../lib/zod.js';
import { logger } from '../lib/logger.js';
import type { HttpWideEvent } from '../middleware/requestLogging.js';
import { apiKeyAuthMiddleware } from '../middleware/apiKeyAuth.js';
import type { RequestAuthLocals } from '../middleware/apiKeyAuth.js';
import { HttpError } from '../lib/httpErrors.js';

export function createSessionRouter(
    sessionService: SessionService,
    deps?: {
        transcriptService?: TranscriptService;
        sessionStore?: SessionStorePort;
        pagosAuthService?: PagosAuthService;
    }
): Router {
    const router: Router = Router();
    const requireApiKey: RequestHandler = deps?.pagosAuthService
        ? apiKeyAuthMiddleware(deps.pagosAuthService)
        : (_req, _res, next) => next(new HttpError(500, 'Pagos auth is not configured'));

    router.post(
        '/',
        requireApiKey,
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

            const auth = (res.locals as RequestAuthLocals).auth;
            const response = await sessionService.createSession({
                ...parseResult.data,
                orgId: auth?.orgId,
                createdByUserId: auth?.userId,
            });

            const wideEvent = res.locals.wideEvent as HttpWideEvent | undefined;
            if (wideEvent) {
                wideEvent.roomName = response.roomName;
                wideEvent.sessionId = response.sessionId;
                wideEvent.userIdentity = parseResult.data.userIdentity;
            }

            return res.json(response);
        })
    );

    router.post(
        '/end',
        requireApiKey,
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

            const wideEvent = res.locals.wideEvent as HttpWideEvent | undefined;
            if (wideEvent) {
                if ('roomName' in payload) {
                    wideEvent.roomName = payload.roomName;
                } else {
                    wideEvent.sessionId = payload.sessionId;
                }
            }

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
                if (deps?.transcriptService && deps?.sessionStore) {
                    try {
                        const sessionData = deps.sessionStore.get(payload.roomName);
                        const sessionId = payload.sessionId || sessionData?.sessionId || randomUUID();
                        const agentId = sessionData?.agentConfig?.agent_id ?? null;
                        const orgId = sessionData?.orgId || payload.orgId || null;
                        const createdByUserId = sessionData?.createdByUserId ?? null;

                        if (!orgId) {
                            logger.warn(
                                {
                                    event: 'transcript_persist_missing_org_id',
                                    roomName: payload.roomName,
                                    sessionId,
                                },
                                'Missing orgId; skipping transcript persistence'
                            );
                        } else {
                            if (!payload.sessionId && !sessionData?.sessionId) {
                                logger.warn(
                                    {
                                        event: 'transcript_persist_derived_session_id',
                                        roomName: payload.roomName,
                                        derivedSessionId: sessionId,
                                    },
                                    'No sessionId provided/resolved; generated a random UUID for transcript persistence'
                                );
                            }

                            await deps.transcriptService.saveFromObservability({
                                roomName: payload.roomName,
                                sessionId,
                                agentId,
                                orgId,
                                createdByUserId,
                                rawSessionReport: payload.sessionReport,
                                closeReason: payload.closeReason ?? null,
                            });
                        }
                    } catch (error) {
                        logger.error({
                            err: error,
                            event: 'transcript_persist_failed',
                            roomName: payload.roomName,
                        });
                    }
                }

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

            const wideEvent = res.locals.wideEvent as HttpWideEvent | undefined;
            if (wideEvent) {
                wideEvent.roomName = payload.roomName;
                wideEvent.sessionId = payload.sessionId ?? undefined;
            }

            return res.status(204).send();
        })
    );

    return router;
}
