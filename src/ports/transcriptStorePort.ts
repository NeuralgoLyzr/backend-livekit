import type { SessionReport, ConversationItem } from '../types/sessionReport.js';

// ---------------------------------------------------------------------------
// Stored document
// ---------------------------------------------------------------------------

export interface StoredTranscript {
    id: string;
    sessionId: string;
    roomName: string;
    agentId: string | null;
    orgId: string;
    createdByUserId: string | null;
    sessionReport: SessionReport;
    chatHistory: ConversationItem[];
    closeReason: string | null;
    durationMs: number | null;
    messageCount: number;
    startedAt: string;
    endedAt: string;
    createdAt: string;
    updatedAt: string;
}

// ---------------------------------------------------------------------------
// Inputs / filters
// ---------------------------------------------------------------------------

export interface SaveTranscriptInput {
    sessionId: string;
    roomName: string;
    agentId?: string | null;
    orgId: string;
    createdByUserId?: string | null;
    sessionReport: SessionReport;
    chatHistory: ConversationItem[];
    closeReason?: string | null;
    durationMs?: number | null;
    messageCount: number;
    startedAt: Date;
    endedAt: Date;
}

export interface TranscriptFilters {
    orgId?: string;
    agentId?: string;
    sessionId?: string;
    createdByUserId?: string;
    from?: string;
    to?: string;
}

export interface PaginationOpts {
    limit?: number;
    offset?: number;
    sort?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
    items: T[];
    total: number;
    limit: number;
    offset: number;
    nextOffset: number | null;
}

export interface AgentTranscriptStats {
    totalCalls: number;
    browserCalls: number;
    phoneCalls: number;
    avgMessages: number | null;
}

// ---------------------------------------------------------------------------
// Port interface
// ---------------------------------------------------------------------------

export interface TranscriptStorePort {
    save(input: SaveTranscriptInput): Promise<StoredTranscript>;

    findBySessionId(sessionId: string): Promise<StoredTranscript | null>;

    findByAgentId(
        input: { orgId: string; agentId: string; createdByUserId?: string },
        opts?: PaginationOpts
    ): Promise<PaginatedResult<StoredTranscript>>;

    list(
        filters: TranscriptFilters,
        opts?: PaginationOpts
    ): Promise<PaginatedResult<StoredTranscript>>;

    getAgentStats(input: {
        orgId: string;
        agentId: string;
        createdByUserId?: string;
    }): Promise<AgentTranscriptStats>;
}
