import type { LiveKitWebhookEvent, NormalizedLiveKitEvent } from '../../types.js';
import { createHash } from 'node:crypto';

export function normalizeLiveKitWebhookEvent(
    evt: LiveKitWebhookEvent,
    options?: { rawBody?: string }
): NormalizedLiveKitEvent {
    let eventIdDerived = false;
    let eventId = typeof evt.id === 'string' && evt.id.trim().length > 0 ? evt.id : '';
    if (!eventId) {
        const rawBody = options?.rawBody;
        if (typeof rawBody === 'string' && rawBody.length > 0) {
            const digest = createHash('sha256').update(rawBody).digest('hex').slice(0, 16);
            eventId = `derived-${digest}`;
            eventIdDerived = true;
        } else {
            // Fallback only; callers should pass rawBody when possible.
            eventId = 'missing-id';
        }
    }
    const event = typeof evt.event === 'string' ? evt.event : 'unknown';
    const createdAt = typeof evt.createdAt === 'number' ? evt.createdAt : null;
    const roomName =
        evt.room && typeof evt.room.name === 'string' && evt.room.name.trim().length > 0
            ? evt.room.name
            : null;

    const participant =
        evt.participant && typeof evt.participant === 'object'
            ? {
                  participantId:
                      typeof evt.participant.sid === 'string' ? evt.participant.sid : undefined,
                  identity:
                      typeof evt.participant.identity === 'string'
                          ? evt.participant.identity
                          : undefined,
                  kind: typeof evt.participant.kind === 'string' ? evt.participant.kind : undefined,
                  attributes:
                      evt.participant.attributes && typeof evt.participant.attributes === 'object'
                          ? (evt.participant.attributes as Record<string, string>)
                          : undefined,
              }
            : undefined;

    return { eventId, eventIdDerived, event, createdAt, roomName, participant, raw: evt };
}
