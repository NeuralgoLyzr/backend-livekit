import type { AgentConfig } from '../types/index.js';

export interface StoredAgent {
    id: string;
    config: AgentConfig;
    createdAt: string;
    updatedAt: string;
}

export interface CreateAgentInput {
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
    list(input?: ListAgentsInput): Promise<StoredAgent[]>;
    getById(id: string): Promise<StoredAgent | null>;
    create(input: CreateAgentInput): Promise<StoredAgent>;
    update(id: string, input: UpdateAgentInput): Promise<StoredAgent | null>;
    delete(id: string): Promise<boolean>;
}
