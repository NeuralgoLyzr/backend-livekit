import mongoose, { type Model, type Types } from 'mongoose';

export interface AgentRow {
    _id: Types.ObjectId;
    name: string;
    description?: string | null;
    config: unknown;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
}

const AgentSchema = new mongoose.Schema<AgentRow>(
    {
        name: { type: String, required: true },
        description: { type: String, required: false, default: null },
        config: { type: mongoose.Schema.Types.Mixed, required: true, default: {} },
        deletedAt: { type: Date, required: false, default: null },
    },
    {
        timestamps: true,
        // Prisma MongoDB defaults to the model name as the collection name.
        // Pin it here to avoid a data migration during the Prisma -> Mongoose cutover.
        collection: 'Agent',
    }
);

AgentSchema.index({ updatedAt: -1 });
AgentSchema.index({ deletedAt: 1 });

export function getAgentModel(): Model<AgentRow> {
    const existing = mongoose.models.Agent as Model<AgentRow> | undefined;
    return existing ?? mongoose.model<AgentRow>('Agent', AgentSchema);
}

