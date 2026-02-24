import type { SessionData } from '../../types/index.js';
import type { SessionStorePort } from '../../ports/sessionStorePort.js';

export class InMemorySessionStore implements SessionStorePort {
    private readonly store: Map<string, SessionData>;

    constructor() {
        this.store = new Map<string, SessionData>();
    }

    async set(roomName: string, data: SessionData): Promise<void> {
        this.store.set(roomName, data);
    }

    async get(roomName: string): Promise<SessionData | undefined> {
        return this.store.get(roomName);
    }

    async delete(roomName: string): Promise<boolean> {
        return this.store.delete(roomName);
    }

    async has(roomName: string): Promise<boolean> {
        return this.store.has(roomName);
    }

    async entries(): Promise<Array<[roomName: string, data: SessionData]>> {
        return Array.from(this.store.entries());
    }

    async clear(): Promise<void> {
        this.store.clear();
    }

    async size(): Promise<number> {
        return this.store.size;
    }
}
