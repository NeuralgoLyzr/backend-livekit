import type { AgentConfig } from '../types/index.js';

export interface StoredAgent {
    id: string;
    config: AgentConfig;
    createdAt: string;
    updatedAt: string;
}

export interface AgentAccessScope {
    orgId: string;
    createdByUserId?: string;
}

export interface CreateAgentInput {
    orgId: string;
    createdByUserId: string;
    config: AgentConfig;
}

export interface UpdateAgentInput {
    config?: AgentConfig;
}

export interface ListAgentsInput {
    limit?: number;
    offset?: number;
}

export interface AgentStorePort {
    list(input?: ListAgentsInput & { scope?: AgentAccessScope }): Promise<StoredAgent[]>;
    getById(id: string, scope?: AgentAccessScope): Promise<StoredAgent | null>;
    create(input: CreateAgentInput): Promise<StoredAgent>;
    update(id: string, input: UpdateAgentInput, scope?: AgentAccessScope): Promise<StoredAgent | null>;
    delete(id: string, scope?: AgentAccessScope): Promise<boolean>;
}
