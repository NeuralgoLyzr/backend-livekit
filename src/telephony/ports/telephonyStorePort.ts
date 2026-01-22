import type { TelephonyCall, TelephonyCallStatus } from '../types.js';

export interface TelephonyStorePort {
  /**
   * Records an event ID as seen, returning true if this is the first time.
   * Used for webhook idempotency.
   */
  recordEventSeen(eventId: string): Promise<boolean>;

  upsertCallByRoomName(
    roomName: string,
    patch: Partial<
      Omit<TelephonyCall, 'callId' | 'roomName' | 'createdAt' | 'updatedAt'>
    > & {
      status?: TelephonyCallStatus;
    }
  ): Promise<TelephonyCall>;

  getCallById(callId: string): Promise<TelephonyCall | null>;
  getCallByRoomName(roomName: string): Promise<TelephonyCall | null>;

  markAgentDispatched(callId: string): Promise<TelephonyCall | null>;
  markEnded(callId: string, status?: Extract<TelephonyCallStatus, 'ended' | 'failed'>): Promise<TelephonyCall | null>;
}

