import mongoose, { type Model, type Types } from 'mongoose';

export interface AgentConfigDocument {
    _id: Types.ObjectId;
    orgId: string;
    createdByUserId: string;
    config: unknown;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
}

const AgentSchema = new mongoose.Schema<AgentConfigDocument>(
    {
        orgId: { type: String, required: true, trim: true },
        createdByUserId: { type: String, required: true, trim: true },
        config: { type: mongoose.Schema.Types.Mixed, required: true, default: {} },
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
AgentSchema.index({ orgId: 1, deletedAt: 1, updatedAt: -1 });
AgentSchema.index({ orgId: 1, createdByUserId: 1, deletedAt: 1, updatedAt: -1 });

export function getAgentModel(): Model<AgentConfigDocument> {
    const existing = mongoose.models.Agent as Model<AgentConfigDocument> | undefined;
    return existing ?? mongoose.model<AgentConfigDocument>('Agent', AgentSchema);
}
