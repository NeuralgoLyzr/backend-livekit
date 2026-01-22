/**
 * Telephony endpoints (Mode A: SIP trunk into LiveKit)
 */

import { Router } from 'express';
import { config } from '../config/index.js';
import { telephonyModule } from '../telephony/telephonyModule.js';
import { normalizeLiveKitWebhookEvent } from '../telephony/adapters/livekit/eventNormalizer.js';

const router: Router = Router();

router.post('/livekit-webhook', async (req, res) => {
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
    // Invalid signature / malformed payload
    return res.status(401).json({
      error: 'Invalid webhook signature',
      ...(process.env.NODE_ENV !== 'production' && {
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    });
  }

  const normalized = normalizeLiveKitWebhookEvent(evt);

  // Respond quickly; do work in the background.
  void telephonyModule.sessionService.handleLiveKitEvent(normalized).catch((err) => {
    console.error('[telephony] Failed to handle webhook event:', err);
  });

  return res.status(200).json({ ok: true });
});

// Minimal diagnostics (non-prod only)
if (process.env.NODE_ENV !== 'production') {
  router.get('/calls/:callId', async (req, res) => {
    const call = await telephonyModule.store.getCallById(req.params.callId);
    if (!call) return res.status(404).json({ error: 'Call not found' });
    return res.json(call);
  });

  router.get('/calls/by-room/:roomName', async (req, res) => {
    const call = await telephonyModule.store.getCallByRoomName(req.params.roomName);
    if (!call) return res.status(404).json({ error: 'Call not found' });
    return res.json(call);
  });
}

// Optional v1 outbound dialing endpoint - not implemented in this PoC yet.
router.post('/calls', async (req, res) => {
  return res.status(501).json({
    error: 'Outbound PSTN dialing not implemented in this PoC. Implement LiveKit SIP outbound adapter first.',
  });
});

export default router;

