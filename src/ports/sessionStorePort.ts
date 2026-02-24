import type { SessionData } from '../types/index.js';

export interface SessionStorePort {
    set(roomName: string, data: SessionData): Promise<void>;
    get(roomName: string): Promise<SessionData | undefined>;
    delete(roomName: string): Promise<boolean>;
    has(roomName: string): Promise<boolean>;
    entries(): Promise<Array<[roomName: string, data: SessionData]>>;
}
