import type { AgentConfig } from '../../types/index.js';

export interface StoredBinding {
    id: string;
    integrationId: string;
    provider: string;
    providerNumberId: string;
    e164: string;
    agentId: string | null;
    agentConfig: AgentConfig | null;
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
    agentConfig?: AgentConfig;
}

export interface TelephonyBindingStorePort {
    upsertBinding(input: UpsertBindingInput): Promise<StoredBinding>;
    getBindingByE164(e164: string): Promise<StoredBinding | null>;
    getBindingById(id: string): Promise<StoredBinding | null>;
    listBindings(): Promise<StoredBinding[]>;
    disableBinding(id: string): Promise<boolean>;
}
