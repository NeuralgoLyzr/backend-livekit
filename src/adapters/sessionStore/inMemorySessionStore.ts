import type { SessionData } from '../../types/index.js';
import type { SessionStorePort } from '../../ports/sessionStorePort.js';

export class InMemorySessionStore implements SessionStorePort {
    private readonly store: Map<string, SessionData>;
    private readonly roomNameBySessionId: Map<string, string>;

    constructor() {
        this.store = new Map<string, SessionData>();
        this.roomNameBySessionId = new Map<string, string>();
    }

    async set(roomName: string, data: SessionData): Promise<void> {
        const existing = this.store.get(roomName);
        if (existing) {
            const mappedRoom = this.roomNameBySessionId.get(existing.sessionId);
            if (mappedRoom === roomName) {
                this.roomNameBySessionId.delete(existing.sessionId);
            }
        }

        this.store.set(roomName, data);
        this.roomNameBySessionId.set(data.sessionId, roomName);
    }

    async get(roomName: string): Promise<SessionData | undefined> {
        return this.store.get(roomName);
    }

    async getBySessionId(
        sessionId: string
    ): Promise<{ roomName: string; data: SessionData } | undefined> {
        const roomName = this.roomNameBySessionId.get(sessionId);
        if (!roomName) {
            return undefined;
        }

        const data = this.store.get(roomName);
        if (!data || data.sessionId !== sessionId) {
            this.roomNameBySessionId.delete(sessionId);
            return undefined;
        }

        return { roomName, data };
    }

    async delete(roomName: string): Promise<boolean> {
        const existing = this.store.get(roomName);
        const deleted = this.store.delete(roomName);
        if (deleted && existing) {
            const mappedRoom = this.roomNameBySessionId.get(existing.sessionId);
            if (mappedRoom === roomName) {
                this.roomNameBySessionId.delete(existing.sessionId);
            }
        }
        return deleted;
    }

    async has(roomName: string): Promise<boolean> {
        return this.store.has(roomName);
    }

    async entries(): Promise<Array<[roomName: string, data: SessionData]>> {
        return Array.from(this.store.entries());
    }

    async clear(): Promise<void> {
        this.store.clear();
        this.roomNameBySessionId.clear();
    }

    async size(): Promise<number> {
        return this.store.size;
    }
}
