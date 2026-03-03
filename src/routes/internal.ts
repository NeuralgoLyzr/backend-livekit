import { Router } from 'express';
import multer from 'multer';
import { SessionObservabilityIngestSchema } from '../types/index.js';
import type { SessionService } from '../services/sessionService.js';
import type { TranscriptService } from '../services/transcriptService.js';
import type { AudioStorageService } from '../services/audioStorageService.js';
import type { SessionStorePort } from '../ports/sessionStorePort.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { formatZodError } from '../lib/zod.js';
import type { HttpWideEvent } from '../middleware/requestLogging.js';
import { observabilityAuthMiddleware } from '../middleware/observabilityAuth.js';
import { createSessionObservabilityService } from '../services/sessionObservabilityService.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export function createInternalRouter(deps: {
    sessionService: SessionService;
    transcriptService?: TranscriptService;
    sessionStore?: SessionStorePort;
    audioStorageService?: AudioStorageService;
    observabilityIngestKey?: string;
}): Router {
    const router: Router = Router();
    const sessionObservabilityService = createSessionObservabilityService({
        sessionService: deps.sessionService,
        transcriptService: deps.transcriptService,
        sessionStore: deps.sessionStore,
        audioStorageService: deps.audioStorageService,
    });

    const requireObservabilityAuth = observabilityAuthMiddleware(
        deps.observabilityIngestKey ?? ''
    );

    router.post(
        '/sessions/observability',
        requireObservabilityAuth,
        upload.single('audio'),
        asyncHandler(async (req, res) => {
            let rawPayload: unknown = req.body;
            if (typeof req.body.payload === 'string') {
                try {
                    rawPayload = JSON.parse(req.body.payload);
                } catch {
                    return res.status(400).json({
                        error: 'Invalid payload',
                        details: 'payload must be valid JSON when sent as multipart form-data.',
                    });
                }
            }

            const parseResult = SessionObservabilityIngestSchema.safeParse(rawPayload);
            if (!parseResult.success) {
                return res.status(400).json(formatZodError(parseResult.error));
            }

            const payload = parseResult.data;
            const audioFile = req.file;

            const result = await sessionObservabilityService.ingestObservability({
                payload,
                audioBuffer: audioFile?.buffer,
            });

            const wideEvent = res.locals.wideEvent as HttpWideEvent | undefined;
            if (wideEvent) {
                wideEvent.roomName = payload.roomName;
                wideEvent.sessionId = payload.sessionId;
                wideEvent.observabilityHasErrors = result.hasErrors;
            }

            return res.status(204).send();
        })
    );

    return router;
}
