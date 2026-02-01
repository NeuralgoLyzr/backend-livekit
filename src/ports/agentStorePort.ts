import type { AgentConfig } from '../types/index.js';

export interface StoredAgent {
    id: string;
    name: string;
    description: string | null;
    config: AgentConfig;
    createdAt: string;
    updatedAt: string;
}

export interface CreateAgentInput {
    name: string;
    description?: string | null;
    config: AgentConfig;
}

export interface UpdateAgentInput {
    name?: string;
    description?: string | null;
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

