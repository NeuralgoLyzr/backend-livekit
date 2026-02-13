export interface StoredBinding {
    id: string;
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
    integrationId: string;
    provider: string;
    providerNumberId: string;
    e164: string;
    agentId?: string;
}

export interface TelephonyBindingStorePort {
    upsertBinding(input: UpsertBindingInput): Promise<StoredBinding>;
    getBindingByE164(e164: string): Promise<StoredBinding | null>;
    getBindingById(id: string): Promise<StoredBinding | null>;
    listBindings(): Promise<StoredBinding[]>;
    listBindingsByIntegrationId(integrationId: string): Promise<StoredBinding[]>;
    deleteBinding(id: string): Promise<boolean>;
}
