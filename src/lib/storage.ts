/**
 * In-memory session storage
 * Stores session metadata indexed by room name
 */

import type { SessionData } from '../types/index.js';

class SessionStorage {
  private store: Map<string, SessionData>;

  constructor() {
    this.store = new Map();
  }

  set(roomName: string, data: SessionData): void {
    this.store.set(roomName, data);
  }

  get(roomName: string): SessionData | undefined {
    return this.store.get(roomName);
  }

  delete(roomName: string): boolean {
    return this.store.delete(roomName);
  }

  has(roomName: string): boolean {
    return this.store.has(roomName);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

// Export singleton instance
export const storage = new SessionStorage();
