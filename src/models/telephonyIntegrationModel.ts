import mongoose, { type Model, type Types } from 'mongoose';

export interface TelephonyIntegrationDocument {
    _id: Types.ObjectId;
    provider: 'telnyx' | 'twilio' | 'plivo';
    name: string | null;
    encryptedApiKey: string;
    apiKeyFingerprint: string;
    status: 'active' | 'disabled';
    providerResources: Record<string, unknown>;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const TelephonyIntegrationSchema = new mongoose.Schema<TelephonyIntegrationDocument>(
    {
        provider: { type: String, required: true, enum: ['telnyx', 'twilio', 'plivo'] },
        name: { type: String, default: null },
        encryptedApiKey: { type: String, required: true },
        apiKeyFingerprint: { type: String, required: true },
        status: { type: String, required: true, enum: ['active', 'disabled'], default: 'active' },
        providerResources: { type: mongoose.Schema.Types.Mixed, default: {} },
        deletedAt: { type: Date, default: null },
    },
    {
        timestamps: true,
        collection: 'lk_telephony_integrations',
    }
);

TelephonyIntegrationSchema.index({ provider: 1, apiKeyFingerprint: 1 });
TelephonyIntegrationSchema.index({ updatedAt: -1 });
TelephonyIntegrationSchema.index({ deletedAt: 1 });

export function getIntegrationModel(): Model<TelephonyIntegrationDocument> {
    const existing = mongoose.models.TelephonyIntegration as
        | Model<TelephonyIntegrationDocument>
        | undefined;
    return (
        existing ??
        mongoose.model<TelephonyIntegrationDocument>(
            'TelephonyIntegration',
            TelephonyIntegrationSchema
        )
    );
}
