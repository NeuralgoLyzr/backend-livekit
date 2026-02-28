import { randomUUID } from 'crypto';

import type { SessionStorePort } from '../ports/sessionStorePort.js';
import type { AudioStorageService } from './audioStorageService.js';
import { logger } from '../lib/logger.js';
import type { SessionService } from './sessionService.js';
import type { TranscriptService } from './transcriptService.js';
import type { SessionObservabilityIngest } from '../types/index.js';

// ---------------------------------------------------------------------------
// Step outcome types
// ---------------------------------------------------------------------------

interface StepOutcome {
    status: 'ok' | 'skipped' | 'error';
    reason?: string;
    error?: string;
}

export interface ObservabilityResult {
    steps: {
        transcript: StepOutcome;
        audio: StepOutcome;
        roomDelete: StepOutcome;
        storeDelete: StepOutcome;
    };
    hasErrors: boolean;
    durationMs: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

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

function errorToString(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function createSessionObservabilityService(deps: SessionObservabilityServiceDeps) {
    return {
        async ingestObservability(
            input: IngestSessionObservabilityInput
        ): Promise<ObservabilityResult> {
            const { payload, audioBuffer } = input;
            const start = Date.now();

            // ---- Step 1 & 2: Transcript + Audio ----

            let transcript: StepOutcome = { status: 'skipped', reason: 'no_report_or_deps' };
            let audio: StepOutcome = { status: 'skipped', reason: 'no_transcript' };

            if (payload.sessionReport && deps.transcriptService && deps.sessionStore) {
                try {
                    logger.info(
                        {
                            event: 'session_observability_store_lookup_start',
                            roomName: payload.roomName,
                            sessionId: payload.sessionId ?? null,
                            payloadHasOrgId: Boolean(payload.orgId),
                        },
                        'Looking up session store data for observability ingest'
                    );
                    const sessionData = await deps.sessionStore.get(payload.roomName);
                    logger.info(
                        {
                            event: 'session_observability_store_lookup_result',
                            roomName: payload.roomName,
                            sessionId: payload.sessionId ?? null,
                            hasSessionStoreRecord: Boolean(sessionData),
                            storeSessionId: sessionData?.sessionId ?? null,
                            storeHasOrgId: Boolean(sessionData?.orgId),
                            storeHasCreatedByUserId: Boolean(sessionData?.createdByUserId),
                        },
                        sessionData
                            ? 'Resolved session store record for observability ingest'
                            : 'No session store record found for observability ingest'
                    );

                    if (!sessionData && payload.sessionId) {
                        const fallbackBySessionId = await deps.sessionStore.getBySessionId(
                            payload.sessionId
                        );
                        logger.warn(
                            {
                                event: 'session_observability_store_lookup_by_session_id',
                                roomName: payload.roomName,
                                sessionId: payload.sessionId,
                                found: Boolean(fallbackBySessionId),
                                matchedRoomName: fallbackBySessionId?.roomName ?? null,
                                matchedHasOrgId: Boolean(fallbackBySessionId?.data.orgId),
                            },
                            fallbackBySessionId
                                ? 'Room lookup missed, but sessionId lookup found a store record'
                                : 'Room lookup missed and sessionId lookup also found nothing'
                        );
                    }

                    const sessionId =
                        payload.sessionId || sessionData?.sessionId || randomUUID();
                    const agentId = sessionData?.agentConfig?.agent_id ?? null;
                    const orgId = sessionData?.orgId || payload.orgId || null;
                    const createdByUserId = sessionData?.createdByUserId ?? null;
                    const orgIdSource = sessionData?.orgId
                        ? 'session_store'
                        : payload.orgId
                          ? 'payload'
                          : 'none';

                    if (!orgId) {
                        logger.warn(
                            {
                                event: 'transcript_persist_missing_org_id',
                                roomName: payload.roomName,
                                sessionId: payload.sessionId ?? sessionData?.sessionId ?? null,
                                payloadSessionId: payload.sessionId ?? null,
                                storeSessionId: sessionData?.sessionId ?? null,
                                hasSessionStoreRecord: Boolean(sessionData),
                                payloadHasOrgId: Boolean(payload.orgId),
                                storeHasOrgId: Boolean(sessionData?.orgId),
                                hasSessionReport: Boolean(payload.sessionReport),
                                closeReason: payload.closeReason ?? null,
                            },
                            'Missing orgId; skipping transcript persistence'
                        );
                        transcript = { status: 'skipped', reason: 'missing_org_id' };
                    } else {
                        logger.info(
                            {
                                event: 'transcript_persist_org_id_resolved',
                                roomName: payload.roomName,
                                sessionId,
                                orgIdSource,
                                hasCreatedByUserId: Boolean(createdByUserId),
                                agentId,
                            },
                            'Resolved orgId for transcript persistence'
                        );
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

                        transcript = { status: 'ok' };

                        // Audio (only attempted after successful transcript persistence)
                        if (audioBuffer && deps.audioStorageService) {
                            try {
                                await deps.audioStorageService.save(sessionId, audioBuffer);
                                audio = { status: 'ok' };
                            } catch (error) {
                                audio = { status: 'error', error: errorToString(error) };
                            }
                        } else if (!audioBuffer) {
                            audio = { status: 'skipped', reason: 'no_audio' };
                        } else {
                            audio = { status: 'skipped', reason: 'no_storage_service' };
                        }
                    }
                } catch (error) {
                    transcript = { status: 'error', error: errorToString(error) };
                }
            }

            // ---- Step 3 & 4: Room + Store cleanup ----

            const cleanup = await deps.sessionService.cleanupSession(payload.roomName);

            const roomDelete: StepOutcome =
                cleanup.roomDelete.status === 'error'
                    ? { status: 'error', error: errorToString(cleanup.roomDelete.error) }
                    : cleanup.roomDelete.status === 'already_gone'
                      ? { status: 'ok', reason: 'already_gone' }
                      : { status: 'ok' };

            const storeDelete: StepOutcome =
                cleanup.storeDelete.status === 'error'
                    ? { status: 'error', error: errorToString(cleanup.storeDelete.error) }
                    : { status: 'ok' };

            // ---- Summary ----

            const steps = { transcript, audio, roomDelete, storeDelete };
            const hasErrors = Object.values(steps).some((s) => s.status === 'error');
            const durationMs = Date.now() - start;

            logger[hasErrors ? 'warn' : 'info'](
                {
                    event: 'session_observability_complete',
                    roomName: payload.roomName,
                    sessionId: payload.sessionId,
                    steps,
                    hasErrors,
                    durationMs,
                },
                hasErrors
                    ? 'Session observability completed with errors'
                    : 'Session observability completed'
            );

            return { steps, hasErrors, durationMs };
        },
    };
}

export type SessionObservabilityService = ReturnType<typeof createSessionObservabilityService>;
