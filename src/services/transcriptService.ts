import type {
    TranscriptStorePort,
    StoredTranscript,
    PaginationOpts,
    PaginatedResult,
    TranscriptFilters,
    AgentTranscriptStats,
} from '../ports/transcriptStorePort.js';
import type { SessionReport, ConversationItem } from '../types/sessionReport.js';
import { SessionReportSchema, ConversationItemSchema } from '../types/sessionReport.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractChatHistory(report: SessionReport): ConversationItem[] {
    const items = report.chat_history?.items;
    if (!Array.isArray(items)) return [];

    const valid: ConversationItem[] = [];
    for (const item of items) {
        const result = ConversationItemSchema.safeParse(item);
        if (result.success) {
            valid.push(result.data);
        }
    }
    return valid;
}

function countMessages(items: ConversationItem[]): number {
    return items.filter((i) => i.type === 'message').length;
}

function computeDurationMs(report: SessionReport): number | null {
    const events = report.events;
    if (!events || events.length === 0) return null;

    const first = events[0].created_at;
    const last = events[events.length - 1].created_at;
    if (typeof first !== 'number' || typeof last !== 'number') return null;

    return Math.round((last - first) * 1000);
}

function computeStartedAt(report: SessionReport): Date {
    const events = report.events;
    if (events && events.length > 0) {
        return new Date(events[0].created_at * 1000);
    }
    return new Date(report.timestamp * 1000);
}

function computeEndedAt(report: SessionReport): Date {
    return new Date(report.timestamp * 1000);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface TranscriptServiceDeps {
    store: TranscriptStorePort;
}

export function createTranscriptService(deps: TranscriptServiceDeps) {
    return {
        async saveFromObservability(input: {
            roomName: string;
            sessionId: string;
            agentId?: string | null;
            orgId: string;
            createdByUserId?: string | null;
            rawSessionReport: unknown;
            closeReason?: string | null;
        }): Promise<StoredTranscript | null> {
            const parseResult = SessionReportSchema.safeParse(input.rawSessionReport);
            if (!parseResult.success) {
                logger.warn(
                    {
                        event: 'transcript_ingest_invalid_report',
                        roomName: input.roomName,
                        issues: parseResult.error.issues.slice(0, 5),
                    },
                    'Session report failed validation — skipping transcript persistence'
                );
                return null;
            }

            const report = parseResult.data;
            const chatHistory = extractChatHistory(report);

            return deps.store.save({
                sessionId: input.sessionId,
                roomName: input.roomName,
                agentId: input.agentId ?? null,
                orgId: input.orgId,
                createdByUserId: input.createdByUserId ?? null,
                sessionReport: report,
                chatHistory,
                closeReason: input.closeReason ?? null,
                durationMs: computeDurationMs(report),
                messageCount: countMessages(chatHistory),
                startedAt: computeStartedAt(report),
                endedAt: computeEndedAt(report),
            });
        },

        async getBySessionId(sessionId: string): Promise<StoredTranscript | null> {
            return deps.store.findBySessionId(sessionId);
        },

        async listByAgentId(
            input: { orgId: string; agentId: string; createdByUserId?: string },
            opts?: PaginationOpts
        ): Promise<PaginatedResult<StoredTranscript>> {
            return deps.store.findByAgentId(input, opts);
        },

        async getAgentStats(input: {
            orgId: string;
            agentId: string;
            createdByUserId?: string;
        }): Promise<AgentTranscriptStats> {
            return deps.store.getAgentStats(input);
        },

        async list(
            filters: TranscriptFilters,
            opts?: PaginationOpts
        ): Promise<PaginatedResult<StoredTranscript>> {
            return deps.store.list(filters, opts);
        },
    };
}

export type TranscriptService = ReturnType<typeof createTranscriptService>;
