import mongoose, { type Model, type Types } from 'mongoose';

export interface TelephonyBindingDocument {
    _id: Types.ObjectId;
    integrationId: Types.ObjectId;
    provider: string;
    providerNumberId: string;
    e164: string;
    agentId: string | null;
    agentConfig: unknown;
    enabled: boolean;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const TelephonyBindingSchema = new mongoose.Schema<TelephonyBindingDocument>(
    {
        integrationId: { type: mongoose.Schema.Types.ObjectId, required: true },
        provider: { type: String, required: true },
        providerNumberId: { type: String, required: true },
        e164: { type: String, required: true },
        agentId: { type: String, default: null },
        agentConfig: { type: mongoose.Schema.Types.Mixed, default: null },
        enabled: { type: Boolean, default: true },
        deletedAt: { type: Date, default: null },
    },
    {
        timestamps: true,
        collection: 'lk_telephony_bindings',
    }
);

TelephonyBindingSchema.index(
    { e164: 1, enabled: 1 },
    {
        unique: true,
        partialFilterExpression: { enabled: true, deletedAt: null },
    }
);
TelephonyBindingSchema.index({ integrationId: 1 });
TelephonyBindingSchema.index({ deletedAt: 1 });

export function getBindingModel(): Model<TelephonyBindingDocument> {
    const existing = mongoose.models.TelephonyBinding as
        | Model<TelephonyBindingDocument>
        | undefined;
    return (
        existing ??
        mongoose.model<TelephonyBindingDocument>('TelephonyBinding', TelephonyBindingSchema)
    );
}
