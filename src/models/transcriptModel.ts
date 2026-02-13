import mongoose, { type Model, type Types } from 'mongoose';

export interface TranscriptDocument {
    _id: Types.ObjectId;
    sessionId: string;
    roomName: string;
    agentId: string | null;
    orgId: string;
    createdByUserId: string | null;
    sessionReport: unknown;
    chatHistory: unknown[];
    closeReason: string | null;
    durationMs: number | null;
    messageCount: number;
    startedAt: Date;
    endedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const TranscriptSchema = new mongoose.Schema<TranscriptDocument>(
    {
        sessionId: { type: String, required: true },
        roomName: { type: String, required: true },
        agentId: { type: String, default: null },
        orgId: { type: String, required: true },
        createdByUserId: { type: String, default: null },
        sessionReport: { type: mongoose.Schema.Types.Mixed, required: true },
        chatHistory: { type: [mongoose.Schema.Types.Mixed], required: true, default: [] },
        closeReason: { type: String, default: null },
        durationMs: { type: Number, default: null },
        messageCount: { type: Number, required: true, default: 0 },
        startedAt: { type: Date, required: true },
        endedAt: { type: Date, required: true },
    },
    {
        timestamps: true,
        collection: 'lk_transcripts',
    }
);

TranscriptSchema.index({ sessionId: 1 }, { unique: true });
TranscriptSchema.index({ agentId: 1, endedAt: -1 });
TranscriptSchema.index({ orgId: 1, endedAt: -1 });
TranscriptSchema.index({ orgId: 1, agentId: 1, endedAt: -1 });
TranscriptSchema.index({ orgId: 1, createdByUserId: 1, endedAt: -1 });
TranscriptSchema.index({ endedAt: -1 });
TranscriptSchema.index({ roomName: 1 });

export function getTranscriptModel(): Model<TranscriptDocument> {
    const existing = mongoose.models.Transcript as Model<TranscriptDocument> | undefined;
    return existing ?? mongoose.model<TranscriptDocument>('Transcript', TranscriptSchema);
}
