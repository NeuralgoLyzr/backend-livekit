export type TelephonyProvider = 'telnyx' | 'twilio' | 'plivo';

export interface StoredIntegration {
    id: string;
    orgId: string;
    provider: TelephonyProvider;
    name: string | null;
    apiKeyFingerprint: string;
    status: 'active' | 'disabled';
    providerResources: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

export interface CreateIntegrationInput {
    orgId: string;
    provider: TelephonyProvider;
    name?: string;
    encryptedApiKey: string;
    apiKeyFingerprint: string;
}

export interface TelephonyIntegrationStorePort {
    create(input: CreateIntegrationInput): Promise<StoredIntegration>;
    getById(
        id: string,
        scope: { orgId: string }
    ): Promise<(StoredIntegration & { encryptedApiKey: string }) | null>;
    updateProviderResources(
        id: string,
        resources: Record<string, unknown>,
        scope: { orgId: string }
    ): Promise<StoredIntegration | null>;
    deleteById(id: string, scope: { orgId: string }): Promise<boolean>;
    listByProvider(provider: TelephonyProvider, scope: { orgId: string }): Promise<StoredIntegration[]>;
}
