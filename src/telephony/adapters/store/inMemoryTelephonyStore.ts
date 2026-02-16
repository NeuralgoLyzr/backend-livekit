import { randomUUID } from 'crypto';
import type { TelephonyStorePort } from '../../ports/telephonyStorePort.js';
import type { TelephonyCall, TelephonyCallStatus } from '../../types.js';

function nowIso() {
    return new Date().toISOString();
}

export class InMemoryTelephonyStore implements TelephonyStorePort {
    private readonly callsById = new Map<string, TelephonyCall>();
    private readonly callIdByRoomName = new Map<string, string>();
    private readonly seenEventIds = new Set<string>();

    async recordEventSeen(eventId: string): Promise<boolean> {
        if (this.seenEventIds.has(eventId)) return false;
        this.seenEventIds.add(eventId);
        return true;
    }

    async upsertCallByRoomName(
        roomName: string,
        patch: Partial<Omit<TelephonyCall, 'callId' | 'roomName' | 'createdAt' | 'updatedAt'>> & {
            status?: TelephonyCallStatus;
        }
    ): Promise<TelephonyCall> {
        const existingId = this.callIdByRoomName.get(roomName);
        const existing = existingId ? this.callsById.get(existingId) : undefined;

        if (!existing) {
            const callId = randomUUID();
            const createdAt = nowIso();
            const call: TelephonyCall = {
                callId,
                roomName,
                direction: patch.direction ?? 'inbound',
                from: patch.from ?? null,
                to: patch.to ?? null,
                status: patch.status ?? 'created',
                agentDispatched: patch.agentDispatched ?? false,
                createdAt,
                updatedAt: createdAt,
                sipParticipant: patch.sipParticipant,
                raw: patch.raw,
            };
            this.callsById.set(callId, call);
            this.callIdByRoomName.set(roomName, callId);
            return call;
        }

        const updated: TelephonyCall = {
            ...existing,
            ...patch,
            roomName: existing.roomName,
            callId: existing.callId,
            updatedAt: nowIso(),
        };
        this.callsById.set(existing.callId, updated);
        this.callIdByRoomName.set(roomName, existing.callId);
        return updated;
    }

    async getCallById(callId: string): Promise<TelephonyCall | null> {
        return this.callsById.get(callId) ?? null;
    }

    async getCallByRoomName(roomName: string): Promise<TelephonyCall | null> {
        const callId = this.callIdByRoomName.get(roomName);
        if (!callId) return null;
        return this.callsById.get(callId) ?? null;
    }

    async listCalls(): Promise<TelephonyCall[]> {
        return Array.from(this.callsById.values()).sort((a, b) =>
            a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0
        );
    }

    async markAgentDispatched(callId: string): Promise<TelephonyCall | null> {
        const call = this.callsById.get(callId);
        if (!call) return null;
        const updated: TelephonyCall = {
            ...call,
            agentDispatched: true,
            status: 'agent_dispatched',
            updatedAt: nowIso(),
        };
        this.callsById.set(callId, updated);
        return updated;
    }

    async markEnded(
        callId: string,
        status: Extract<TelephonyCallStatus, 'ended' | 'failed'> = 'ended'
    ): Promise<TelephonyCall | null> {
        const call = this.callsById.get(callId);
        if (!call) return null;
        const updated: TelephonyCall = {
            ...call,
            status,
            updatedAt: nowIso(),
        };
        this.callsById.set(callId, updated);
        return updated;
    }
}
