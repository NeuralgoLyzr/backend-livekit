import { randomUUID } from 'crypto';
import type { TelephonyStorePort } from '../ports/telephonyStorePort.js';
import type { CallRoutingPort } from '../ports/callRoutingPort.js';
import type { AgentDispatchPort } from '../ports/agentDispatchPort.js';
import type { NormalizedLiveKitEvent, TelephonyCall } from '../types.js';
import { extractSipFromTo } from './sipAttributes.js';
import { logger } from '../../lib/logger.js';
import type { AgentConfig } from '../../types/index.js';

export interface TelephonySessionServiceDeps {
    store: TelephonyStorePort;
    routing: CallRoutingPort;
    agentDispatch: AgentDispatchPort;
    sipIdentityPrefix: string;
    dispatchOnAnyParticipantJoin: boolean;
    onAgentDispatched?: (input: {
        roomName: string;
        sessionId: string;
        agentConfig: AgentConfig;
    }) => Promise<void>;
}

function isSipParticipant(
    evt: NormalizedLiveKitEvent,
    sipIdentityPrefix: string,
    dispatchOnAnyParticipantJoin: boolean
): boolean {
    if (dispatchOnAnyParticipantJoin) return true;
    const p = evt.participant;
    if (!p) return false;

    if (typeof p.kind === 'string' && p.kind.toLowerCase().includes('sip')) return true;

    if (typeof p.identity === 'string' && p.identity.startsWith(sipIdentityPrefix)) return true;

    const attrs = p.attributes;
    if (attrs && typeof attrs === 'object') {
        for (const key of Object.keys(attrs)) {
            if (key.startsWith('sip.')) return true;
        }
    }
    return false;
}

export class TelephonySessionService {
    constructor(private readonly deps: TelephonySessionServiceDeps) {}

    async handleLiveKitEvent(evt: NormalizedLiveKitEvent): Promise<{
        firstSeen: boolean;
        ignoredReason?: 'duplicate' | 'missing_room' | 'non_sip_participant' | 'unsupported_event';
        dispatchAttempted: boolean;
        dispatchSucceeded: boolean;
        callId?: string;
    }> {
        // Idempotency guard
        const firstSeen = await this.deps.store.recordEventSeen(evt.eventId);
        if (!firstSeen) {
            return {
                firstSeen: false,
                ignoredReason: 'duplicate',
                dispatchAttempted: false,
                dispatchSucceeded: false,
            };
        }

        if (!evt.roomName) {
            return {
                firstSeen: true,
                ignoredReason: 'missing_room',
                dispatchAttempted: false,
                dispatchSucceeded: false,
            };
        }

        switch (evt.event) {
            case 'participant_joined': {
                if (
                    !isSipParticipant(
                        evt,
                        this.deps.sipIdentityPrefix,
                        this.deps.dispatchOnAnyParticipantJoin
                    )
                ) {
                    return {
                        firstSeen: true,
                        ignoredReason: 'non_sip_participant',
                        dispatchAttempted: false,
                        dispatchSucceeded: false,
                    };
                }

                const { from, to } = extractSipFromTo(evt.participant?.attributes);

                const existingCall = await this.deps.store.getCallByRoomName(evt.roomName);
                const isNewCall = !existingCall;

                const call = await this.deps.store.upsertCallByRoomName(evt.roomName, {
                    status: 'sip_participant_joined',
                    ...(isNewCall
                        ? { sipParticipant: evt.participant, from, to }
                        : {}),
                    raw: {
                        lastEventId: evt.eventId,
                        lastEvent: evt.event,
                        lastEventCreatedAt: evt.createdAt,
                    },
                });

                let dispatchAttempted = false;
                let dispatchSucceeded = false;
                try {
                    dispatchAttempted = !call.agentDispatched;
                    if (dispatchAttempted) {
                        await this.dispatchAgent(call);
                        dispatchSucceeded = true;
                    }
                } catch (err) {
                    logger.error(
                        { event: 'telephony.dispatch_failed', callId: call.callId, roomName: call.roomName, err },
                        'Agent dispatch failed'
                    );
                    dispatchSucceeded = false;
                }
                return {
                    firstSeen: true,
                    dispatchAttempted,
                    dispatchSucceeded,
                    callId: call.callId,
                };
            }

            case 'participant_left': {
                if (
                    !isSipParticipant(
                        evt,
                        this.deps.sipIdentityPrefix,
                        this.deps.dispatchOnAnyParticipantJoin
                    )
                ) {
                    return {
                        firstSeen: true,
                        ignoredReason: 'non_sip_participant',
                        dispatchAttempted: false,
                        dispatchSucceeded: false,
                    };
                }
                const call = await this.deps.store.getCallByRoomName(evt.roomName);
                if (!call) {
                    return {
                        firstSeen: true,
                        dispatchAttempted: false,
                        dispatchSucceeded: false,
                    };
                }

                const isOriginalCaller =
                    !call.sipParticipant?.participantId ||
                    call.sipParticipant.participantId === evt.participant?.participantId;

                if (isOriginalCaller) {
                    await this.deps.store.markEnded(call.callId, 'ended');
                }

                return {
                    firstSeen: true,
                    dispatchAttempted: false,
                    dispatchSucceeded: false,
                    callId: call.callId,
                };
            }

            default:
                return {
                    firstSeen: true,
                    ignoredReason: 'unsupported_event',
                    dispatchAttempted: false,
                    dispatchSucceeded: false,
                };
        }
    }

    private async dispatchAgent(call: TelephonyCall): Promise<void> {
        const routing = await this.deps.routing.resolveRouting({
            roomName: call.roomName,
            from: call.from,
            to: call.to,
            participant: call.sipParticipant,
        });

        const sessionId =
            typeof routing.agentConfig.session_id === 'string' && routing.agentConfig.session_id.trim()
                ? routing.agentConfig.session_id
                : randomUUID();

        const agentConfig = {
            ...routing.agentConfig,
            session_id: sessionId,
        };

        await this.deps.agentDispatch.dispatchAgent(call.roomName, agentConfig);
        await this.deps.store.markAgentDispatched(call.callId);

        if (this.deps.onAgentDispatched) {
            try {
                await this.deps.onAgentDispatched({
                    roomName: call.roomName,
                    sessionId,
                    agentConfig,
                });
            } catch (err) {
                logger.warn(
                    {
                        event: 'telephony.session_metadata_hook_failed',
                        roomName: call.roomName,
                        err,
                    },
                    'Failed to persist telephony session metadata'
                );
            }
        }
    }
}
