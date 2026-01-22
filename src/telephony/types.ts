import type { AgentConfig } from '../types/index.js';

export type TelephonyDirection = 'inbound' | 'outbound';
export type TelephonyCallStatus =
  | 'created'
  | 'sip_participant_joined'
  | 'agent_dispatched'
  | 'ended'
  | 'failed';

export interface TelephonySipParticipant {
  participantId?: string;
  identity?: string;
  attributes?: Record<string, string>;
  kind?: string;
}

export interface TelephonyCall {
  callId: string;
  roomName: string;
  direction: TelephonyDirection;
  from: string | null;
  to: string | null;
  status: TelephonyCallStatus;
  agentDispatched: boolean;
  createdAt: string;
  updatedAt: string;
  sipParticipant?: TelephonySipParticipant;
  raw?: Record<string, unknown>;
}

/**
 * Minimal shape of a LiveKit webhook payload we rely on.
 * We keep this loose to avoid coupling to SDK-internal types.
 */
export interface LiveKitWebhookEvent {
  id?: string;
  createdAt?: number;
  event?: string;
  room?: { name?: string };
  participant?: {
    sid?: string;
    identity?: string;
    kind?: string;
    attributes?: Record<string, string>;
  };
  [k: string]: unknown;
}

export interface NormalizedLiveKitEvent {
  eventId: string;
  event: string;
  createdAt: number | null;
  roomName: string | null;
  participant?: TelephonySipParticipant;
  raw: LiveKitWebhookEvent;
}

export interface CallRoutingContext {
  roomName: string;
  from: string | null;
  to: string | null;
  participant?: TelephonySipParticipant;
}

export interface CallRoutingResult {
  agentConfig: AgentConfig;
}

