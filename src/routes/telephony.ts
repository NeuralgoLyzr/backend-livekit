/**
 * Telephony endpoints (Mode A: SIP trunk into LiveKit)
 */

import { Router } from 'express';
import { config } from '../config/index.js';
import { isDevEnv } from '../lib/env.js';
import { telephonyModule } from '../telephony/telephonyModule.js';
import { normalizeLiveKitWebhookEvent } from '../telephony/adapters/livekit/eventNormalizer.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { logger } from '../lib/logger.js';
import { createTelnyxRouter } from '../telephony/http/telnyxRoutes.js';
import { createTwilioRouter } from '../telephony/http/twilioRoutes.js';
import { createPlivoRouter } from '../telephony/http/plivoRoutes.js';

const router: Router = Router();

type WebhookRequestSnapshot = {
    at: string;
    contentType: string | null;
    hasAuthorizationHeader: boolean;
    bodyIsBuffer: boolean;
    bodyLength: number | null;
};

type WebhookAcceptedSnapshot = {
    at: string;
    eventId: string;
    livekitEvent: string;
    roomName: string | null;
    participant?: {
        participantId?: string;
        identity?: string;
        kind?: string;
        attributeKeys?: string[];
    };
};

type WebhookRejectedSnapshot = {
    at: string;
    reason: 'telephony_disabled' | 'expected_raw_body' | 'invalid_signature';
    details?: string;
};

const webhookStats: {
    totalRequests: number;
    totalAccepted: number;
    totalRejected: number;
    lastRequest: WebhookRequestSnapshot | null;
    lastAccepted: WebhookAcceptedSnapshot | null;
    lastRejected: WebhookRejectedSnapshot | null;
} = {
    totalRequests: 0,
    totalAccepted: 0,
    totalRejected: 0,
    lastRequest: null,
    lastAccepted: null,
    lastRejected: null,
};

// Mount Telnyx management routes
if (telephonyModule.telnyxOnboarding) {
    router.use(
        '/providers/telnyx',
        createTelnyxRouter({
            onboardingService: telephonyModule.telnyxOnboarding,
            integrationStore: telephonyModule.integrationStore,
        })
    );
}

// Mount Twilio management routes
if (telephonyModule.twilioOnboarding) {
    router.use(
        '/providers/twilio',
        createTwilioRouter({
            onboardingService: telephonyModule.twilioOnboarding,
            integrationStore: telephonyModule.integrationStore,
        })
    );
}

// Mount Plivo management routes
if (telephonyModule.plivoOnboarding) {
    router.use(
        '/providers/plivo',
        createPlivoRouter({
            onboardingService: telephonyModule.plivoOnboarding,
            integrationStore: telephonyModule.integrationStore,
        })
    );
}

// Provider-agnostic bindings listing
router.get(
    '/bindings',
    asyncHandler(async (_req, res) => {
        const bindings = await telephonyModule.bindingStore.listBindings();
        return res.json({ bindings });
    })
);

router.post(
    '/livekit-webhook',
    asyncHandler(async (req, res) => {
        webhookStats.totalRequests++;
        webhookStats.lastRequest = {
            at: new Date().toISOString(),
            contentType: req.get('Content-Type') ?? null,
            hasAuthorizationHeader: Boolean(req.get('Authorization')),
            bodyIsBuffer: Buffer.isBuffer(req.body),
            bodyLength: Buffer.isBuffer(req.body) ? req.body.length : null,
        };

        if (!config.telephony.enabled) {
            webhookStats.totalRejected++;
            webhookStats.lastRejected = {
                at: new Date().toISOString(),
                reason: 'telephony_disabled',
            };
            return res.status(503).json({ error: 'Telephony is disabled' });
        }

        const authHeader = req.get('Authorization');

        // `express.raw()` is mounted in `src/app.ts` for this path, so req.body is a Buffer.
        if (!Buffer.isBuffer(req.body)) {
            webhookStats.totalRejected++;
            webhookStats.lastRejected = {
                at: new Date().toISOString(),
                reason: 'expected_raw_body',
            };
            return res.status(400).json({
                error: 'Expected raw webhook body. Ensure express.raw() is configured for this route.',
            });
        }

        const rawBody = req.body.toString('utf8');

        let evt;
        try {
            evt = await telephonyModule.webhookVerifier.verifyAndDecode(rawBody, authHeader);
        } catch (error) {
            webhookStats.totalRejected++;
            webhookStats.lastRejected = {
                at: new Date().toISOString(),
                reason: 'invalid_signature',
                details: error instanceof Error ? error.message : 'Unknown error',
            };
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
                ...(isDevEnv() && {
                    details: error instanceof Error ? error.message : 'Unknown error',
                }),
            });
        }

        const normalized = normalizeLiveKitWebhookEvent(evt, { rawBody });

        webhookStats.totalAccepted++;
        webhookStats.lastAccepted = {
            at: new Date().toISOString(),
            eventId: normalized.eventId,
            livekitEvent: normalized.event,
            roomName: normalized.roomName,
            participant: normalized.participant
                ? {
                      participantId: normalized.participant.participantId,
                      identity: normalized.participant.identity,
                      kind: normalized.participant.kind,
                      attributeKeys: normalized.participant.attributes
                          ? Object.keys(normalized.participant.attributes)
                          : undefined,
                  }
                : undefined,
        };

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

// Minimal diagnostics (dev only)
if (isDevEnv()) {
    router.get(
        '/livekit-webhook/status',
        asyncHandler(async (_req, res) => {
            return res.json(webhookStats);
        })
    );

    router.get(
        '/calls',
        asyncHandler(async (_req, res) => {
            const calls = await telephonyModule.store.listCalls();
            return res.json({ calls });
        })
    );

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
