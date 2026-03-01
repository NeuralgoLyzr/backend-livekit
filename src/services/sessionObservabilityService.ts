import type { SessionStorePort } from '../ports/sessionStorePort.js';
import type { AudioStorageService } from './audioStorageService.js';
import { HttpError } from '../lib/httpErrors.js';
import { logger } from '../lib/logger.js';
import type { SessionService } from './sessionService.js';
import type { TranscriptService } from './transcriptService.js';
import type { SessionData, SessionObservabilityIngest } from '../types/index.js';

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

            // ---- Step 0: Session ownership verification ----
            // Always verify before any mutation (transcript or cleanup).
            // This prevents attackers from triggering cleanup by omitting sessionReport.

            let sessionData: SessionData | undefined;

            if (deps.sessionStore) {
                sessionData = await deps.sessionStore.get(payload.roomName);

                if (sessionData && payload.sessionId !== sessionData.sessionId) {
                    throw new HttpError(
                        403,
                        'sessionId does not match the session for this room'
                    );
                }
            }

            // ---- Step 1 & 2: Transcript + Audio ----

            let transcript: StepOutcome = { status: 'skipped', reason: 'no_report_or_deps' };
            let audio: StepOutcome = { status: 'skipped', reason: 'no_transcript' };

            if (payload.sessionReport && deps.transcriptService) {
                try {
                    if (!sessionData) {
                        logger.warn(
                            {
                                event: 'observability_no_session_in_store',
                                roomName: payload.roomName,
                            },
                            'No session found in store for room; skipping transcript persistence'
                        );
                        transcript = { status: 'skipped', reason: 'no_session_in_store' };
                    } else {
                        const sessionId = payload.sessionId;
                        const agentId = sessionData.agentConfig?.agent_id ?? null;
                        const orgId = sessionData.orgId ?? null;
                        const createdByUserId = sessionData.createdByUserId ?? null;

                        if (!orgId) {
                            transcript = { status: 'skipped', reason: 'missing_org_id' };
                        } else {
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
