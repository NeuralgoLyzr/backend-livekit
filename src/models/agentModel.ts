import mongoose, { type Model, type Types } from 'mongoose';

export interface AgentVersionDocument {
    versionId: string;
    config: unknown;
    active: boolean;
    createdAt: Date;
}

export interface AgentConfigDocument {
    _id: Types.ObjectId;
    orgId: string;
    createdByUserId: string;
    config: unknown;
    versions: AgentVersionDocument[];
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
}

const AgentVersionSchema = new mongoose.Schema<AgentVersionDocument>(
    {
        versionId: { type: String, required: true, trim: true },
        config: { type: mongoose.Schema.Types.Mixed, required: true, default: {} },
        active: { type: Boolean, required: true, default: false },
        createdAt: { type: Date, required: true },
    },
    {
        _id: false,
    }
);

const AgentSchema = new mongoose.Schema<AgentConfigDocument>(
    {
        orgId: { type: String, required: true, trim: true },
        createdByUserId: { type: String, required: true, trim: true },
        config: { type: mongoose.Schema.Types.Mixed, required: true, default: {} },
        versions: { type: [AgentVersionSchema], required: true, default: [] },
        deletedAt: { type: Date, required: false, default: null },
    },
    {
        timestamps: true,
        // Explicitly pin the collection name (don't rely on model-name defaults).
        collection: 'lk_agent_configs',
    }
);

AgentSchema.index({ updatedAt: -1 });
AgentSchema.index({ deletedAt: 1 });
AgentSchema.index({ 'versions.versionId': 1 });
AgentSchema.index({ orgId: 1, deletedAt: 1, updatedAt: -1 });
AgentSchema.index({ orgId: 1, createdByUserId: 1, deletedAt: 1, updatedAt: -1 });

export function getAgentModel(): Model<AgentConfigDocument> {
    const existing = mongoose.models.Agent as Model<AgentConfigDocument> | undefined;
    return existing ?? mongoose.model<AgentConfigDocument>('Agent', AgentSchema);
}
