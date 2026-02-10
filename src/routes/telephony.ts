/**
 * Telephony endpoints (Mode A: SIP trunk into LiveKit)
 */

import { Router } from 'express';
import { config } from '../config/index.js';
import { telephonyModule } from '../telephony/telephonyModule.js';
import { normalizeLiveKitWebhookEvent } from '../telephony/adapters/livekit/eventNormalizer.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { logger } from '../lib/logger.js';

const router: Router = Router();

router.post(
    '/livekit-webhook',
    asyncHandler(async (req, res) => {
        if (!config.telephony.enabled) {
            return res.status(503).json({ error: 'Telephony is disabled' });
        }

        const authHeader = req.get('Authorization');

        // `express.raw()` is mounted in `src/app.ts` for this path, so req.body is a Buffer.
        if (!Buffer.isBuffer(req.body)) {
            return res.status(400).json({
                error: 'Expected raw webhook body. Ensure express.raw() is configured for this route.',
            });
        }

        const rawBody = req.body.toString('utf8');

        let evt;
        try {
            evt = await telephonyModule.webhookVerifier.verifyAndDecode(rawBody, authHeader);
        } catch (error) {
            logger.warn(
                {
                    event: 'telephony_webhook_rejected',
                    reason: 'invalid_signature',
                    hasAuthorizationHeader: Boolean(authHeader),
                    err: error,
                },
                'Rejected LiveKit telephony webhook'
            );
            // Invalid signature / malformed payload
            return res.status(401).json({
                error: 'Invalid webhook signature',
                ...(process.env.NODE_ENV !== 'production' && {
                    details: error instanceof Error ? error.message : 'Unknown error',
                }),
            });
        }

        const normalized = normalizeLiveKitWebhookEvent(evt, { rawBody });

        logger.info(
            {
                event: 'telephony_webhook_received',
                eventId: normalized.eventId,
                eventIdDerived: normalized.eventIdDerived ?? false,
                livekitEvent: normalized.event,
                roomName: normalized.roomName,
                participant: normalized.participant,
            },
            'Accepted LiveKit telephony webhook'
        );

        // Respond quickly; do work in the background.
        const handleStart = Date.now();
        void telephonyModule.sessionService
            .handleLiveKitEvent(normalized)
            .then((result) => {
                logger.info(
                    {
                        event: 'telephony_webhook_processed',
                        eventId: normalized.eventId,
                        livekitEvent: normalized.event,
                        roomName: normalized.roomName,
                        durationMs: Date.now() - handleStart,
                        idempotencyFirstSeen: result.firstSeen,
                        ignoredReason: result.ignoredReason,
                        dispatchAttempted: result.dispatchAttempted,
                        dispatchSucceeded: result.dispatchSucceeded,
                        callId: result.callId,
                    },
                    'Processed LiveKit telephony webhook'
                );
            })
            .catch((err) => {
                logger.error(
                    {
                        event: 'telephony_webhook_processed',
                        eventId: normalized.eventId,
                        livekitEvent: normalized.event,
                        roomName: normalized.roomName,
                        durationMs: Date.now() - handleStart,
                        err,
                    },
                    'Failed to process LiveKit telephony webhook'
                );
            });

        return res.status(200).json({ ok: true });
    })
);

// Minimal diagnostics (non-prod only)
if (process.env.NODE_ENV !== 'production') {
    router.get(
        '/calls/:callId',
        asyncHandler(async (req, res) => {
            const callId = req.params.callId as string;
            const call = await telephonyModule.store.getCallById(callId);
            if (!call) return res.status(404).json({ error: 'Call not found' });
            return res.json(call);
        })
    );

    router.get(
        '/calls/by-room/:roomName',
        asyncHandler(async (req, res) => {
            const roomName = req.params.roomName as string;
            const call = await telephonyModule.store.getCallByRoomName(roomName);
            if (!call) return res.status(404).json({ error: 'Call not found' });
            return res.json(call);
        })
    );
}

// Optional v1 outbound dialing endpoint - not implemented in this PoC yet.
router.post(
    '/calls',
    asyncHandler(async (_req, res) => {
        return res.status(501).json({
            error: 'Outbound PSTN dialing not implemented in this PoC. Implement LiveKit SIP outbound adapter first.',
        });
    })
);

export default router;
