import { randomUUID } from 'crypto';

import type { SessionStorePort } from '../ports/sessionStorePort.js';
import type { AudioStorageService } from './audioStorageService.js';
import { logger } from '../lib/logger.js';
import type { SessionService } from './sessionService.js';
import type { TranscriptService } from './transcriptService.js';
import type { SessionObservabilityIngest } from '../types/index.js';

interface SessionObservabilityServiceDeps {
    sessionService: Pick<SessionService, 'cleanupSession'>;
    transcriptService?: TranscriptService;
    sessionStore?: SessionStorePort;
    audioStorageService?: AudioStorageService;
}

interface IngestSessionObservabilityInput {
    payload: SessionObservabilityIngest;
    audioBuffer?: Buffer;
}

export function createSessionObservabilityService(deps: SessionObservabilityServiceDeps) {
    return {
        async ingestObservability(input: IngestSessionObservabilityInput): Promise<void> {
            const { payload, audioBuffer } = input;

            if (!payload.sessionReport) {
                return;
            }

            if (deps.transcriptService && deps.sessionStore) {
                try {
                    const sessionData = await deps.sessionStore.get(payload.roomName);
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

                        if (audioBuffer && deps.audioStorageService) {
                            try {
                                await deps.audioStorageService.save(sessionId, audioBuffer);
                            } catch (error) {
                                logger.error(
                                    {
                                        err: error,
                                        event: 'audio_recording_save_failed',
                                        sessionId,
                                    },
                                    'Failed to save audio recording'
                                );
                            }
                        }
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
                await deps.sessionService.cleanupSession(payload.roomName);
            } catch (error) {
                logger.error({
                    err: error,
                    event: 'session_cleanup_failed',
                    roomName: payload.roomName,
                });
            }
        },
    };
}

export type SessionObservabilityService = ReturnType<typeof createSessionObservabilityService>;
