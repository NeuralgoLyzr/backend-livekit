export type TelephonyProvider = 'telnyx' | 'twilio' | 'plivo';

export interface StoredIntegration {
    id: string;
    provider: TelephonyProvider;
    name: string | null;
    apiKeyFingerprint: string;
    status: 'active' | 'disabled';
    providerResources: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

export interface CreateIntegrationInput {
    provider: TelephonyProvider;
    name?: string;
    encryptedApiKey: string;
    apiKeyFingerprint: string;
}

export interface TelephonyIntegrationStorePort {
    create(input: CreateIntegrationInput): Promise<StoredIntegration>;
    getById(id: string): Promise<(StoredIntegration & { encryptedApiKey: string }) | null>;
    updateProviderResources(
        id: string,
        resources: Record<string, unknown>
    ): Promise<StoredIntegration | null>;
    disable(id: string): Promise<boolean>;
    listByProvider(provider: TelephonyProvider): Promise<StoredIntegration[]>;
}
