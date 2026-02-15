import type {
    TranscriptStorePort,
    SaveTranscriptInput,
    StoredTranscript,
    TranscriptFilters,
    PaginationOpts,
    PaginatedResult,
    AgentTranscriptStats,
} from '../../ports/transcriptStorePort.js';
import type { SessionReport, ConversationItem } from '../../types/sessionReport.js';
import { connectMongo } from '../../db/mongoose.js';
import { getTranscriptModel, type TranscriptDocument } from '../../models/transcriptModel.js';

function roundTo1Decimal(value: number): number {
    return Math.round(value * 10) / 10;
}

function toStoredTranscript(row: TranscriptDocument): StoredTranscript {
    return {
        id: row._id.toString(),
        sessionId: row.sessionId,
        roomName: row.roomName,
        agentId: row.agentId,
        orgId: row.orgId,
        createdByUserId: row.createdByUserId,
        sessionReport: row.sessionReport as SessionReport,
        chatHistory: row.chatHistory as ConversationItem[],
        closeReason: row.closeReason,
        durationMs: row.durationMs,
        messageCount: row.messageCount,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

function buildFilter(filters: TranscriptFilters): Record<string, unknown> {
    const query: Record<string, unknown> = {};

    if (filters.orgId) query.orgId = filters.orgId;
    if (filters.agentId) query.agentId = filters.agentId;
    if (filters.sessionId) query.sessionId = filters.sessionId;
    if (filters.createdByUserId) query.createdByUserId = filters.createdByUserId;

    if (filters.from || filters.to) {
        const range: Record<string, Date> = {};

        function parseRangeDate(value: string, which: 'from' | 'to'): Date {
            // Accept both date-only (YYYY-MM-DD) and full ISO datetime strings.
            // For date-only, normalize to UTC day boundaries to avoid local-time surprises.
            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                return which === 'from'
                    ? new Date(`${value}T00:00:00.000Z`)
                    : new Date(`${value}T23:59:59.999Z`);
            }
            return new Date(value);
        }

        if (filters.from) range.$gte = parseRangeDate(filters.from, 'from');
        if (filters.to) range.$lte = parseRangeDate(filters.to, 'to');
        query.endedAt = range;
    }

    return query;
}

export class MongooseTranscriptStore implements TranscriptStorePort {
    constructor(private readonly options?: { phoneRoomPrefix?: string }) {}

    async save(input: SaveTranscriptInput): Promise<StoredTranscript> {
        await connectMongo();
        const Transcript = getTranscriptModel();

        const doc = await Transcript.findOneAndUpdate(
            { sessionId: input.sessionId },
            {
                $set: {
                    roomName: input.roomName,
                    agentId: input.agentId ?? null,
                    orgId: input.orgId,
                    createdByUserId: input.createdByUserId ?? null,
                    sessionReport: input.sessionReport as unknown,
                    chatHistory: input.chatHistory as unknown[],
                    closeReason: input.closeReason ?? null,
                    durationMs: input.durationMs ?? null,
                    messageCount: input.messageCount,
                    startedAt: input.startedAt,
                    endedAt: input.endedAt,
                },
            },
            { upsert: true, new: true, runValidators: true }
        ).lean<TranscriptDocument>();

        return toStoredTranscript(doc);
    }

    async findBySessionId(sessionId: string): Promise<StoredTranscript | null> {
        await connectMongo();
        const Transcript = getTranscriptModel();

        const row = await Transcript.findOne({ sessionId }).lean<TranscriptDocument>();
        if (!row) return null;
        return toStoredTranscript(row);
    }

    async findByAgentId(
        input: { orgId: string; agentId: string; createdByUserId?: string },
        opts?: PaginationOpts
    ): Promise<PaginatedResult<StoredTranscript>> {
        return this.list(
            {
                orgId: input.orgId,
                agentId: input.agentId,
                createdByUserId: input.createdByUserId,
            },
            opts
        );
    }

    async list(
        filters: TranscriptFilters,
        opts?: PaginationOpts
    ): Promise<PaginatedResult<StoredTranscript>> {
        await connectMongo();
        const Transcript = getTranscriptModel();

        const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
        const offset = Math.max(opts?.offset ?? 0, 0);
        const sortDir = opts?.sort === 'asc' ? 1 : -1;

        const query = buildFilter(filters);

        const [rows, total] = await Promise.all([
            Transcript.find(query)
                .sort({ endedAt: sortDir })
                .skip(offset)
                .limit(limit)
                .lean<TranscriptDocument[]>(),
            Transcript.countDocuments(query),
        ]);

        const nextOffset = offset + rows.length < total ? offset + rows.length : null;
        return {
            items: rows.map(toStoredTranscript),
            total,
            limit,
            offset,
            nextOffset,
        };
    }

    async getAgentStats(input: {
        orgId: string;
        agentId: string;
        createdByUserId?: string;
    }): Promise<AgentTranscriptStats> {
        await connectMongo();
        const Transcript = getTranscriptModel();

        const phoneRoomPrefix = this.options?.phoneRoomPrefix ?? 'call-';
        const isPhoneExpr =
            phoneRoomPrefix.length > 0
                ? { $eq: [{ $indexOfBytes: ['$roomName', phoneRoomPrefix] }, 0] }
                : false;

        const pipeline = [
            {
                $match: {
                    orgId: input.orgId,
                    agentId: input.agentId,
                    ...(input.createdByUserId ? { createdByUserId: input.createdByUserId } : {}),
                },
            },
            {
                $group: {
                    _id: null,
                    totalCalls: { $sum: 1 },
                    phoneCalls: { $sum: { $cond: [isPhoneExpr, 1, 0] } },
                    avgMessages: { $avg: '$messageCount' },
                },
            },
        ];

        const [agg] = await Transcript.aggregate(pipeline);

        if (!agg) {
            return {
                totalCalls: 0,
                browserCalls: 0,
                phoneCalls: 0,
                avgMessages: null,
            };
        }

        const totalCalls = Number(agg.totalCalls ?? 0);
        const phoneCalls = Number(agg.phoneCalls ?? 0);
        const browserCalls = Math.max(totalCalls - phoneCalls, 0);

        return {
            totalCalls,
            browserCalls,
            phoneCalls,
            avgMessages: agg.avgMessages != null ? roundTo1Decimal(Number(agg.avgMessages)) : null,
        };
    }
}
