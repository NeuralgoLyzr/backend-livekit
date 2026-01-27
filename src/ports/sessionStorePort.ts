import type { SessionData } from '../types/index.js';

export interface SessionStorePort {
    set(roomName: string, data: SessionData): void;
    get(roomName: string): SessionData | undefined;
    delete(roomName: string): boolean;
    has(roomName: string): boolean;
}

