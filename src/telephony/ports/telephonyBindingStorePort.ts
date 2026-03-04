export interface StoredBinding {
    id: string;
    orgId: string;
    integrationId: string;
    provider: string;
    providerNumberId: string;
    e164: string;
    agentId: string | null;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface UpsertBindingInput {
    orgId: string;
    integrationId: string;
    provider: string;
    providerNumberId: string;
    e164: string;
    agentId?: string;
}

export interface TelephonyBindingStorePort {
    upsertBinding(input: UpsertBindingInput): Promise<StoredBinding>;
    getBindingByE164(e164: string): Promise<StoredBinding | null>;
    getBindingById(id: string, scope: { orgId: string }): Promise<StoredBinding | null>;
    listBindings(scope: { orgId: string }): Promise<StoredBinding[]>;
    listBindingsByIntegrationId(
        integrationId: string,
        scope: { orgId: string }
    ): Promise<StoredBinding[]>;
    deleteBinding(id: string, scope: { orgId: string }): Promise<boolean>;
}
