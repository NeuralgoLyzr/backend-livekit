import type {
    AgentStorePort,
    CreateAgentInput,
    ListAgentsInput,
    StoredAgent,
    UpdateAgentInput,
} from '../ports/agentStorePort.js';
import { HttpError } from '../lib/httpErrors.js';

export interface AgentRegistryService {
    listAgents(input?: ListAgentsInput): Promise<StoredAgent[]>;
    getAgent(agentId: string): Promise<StoredAgent | null>;
    createAgent(input: CreateAgentInput): Promise<StoredAgent>;
    updateAgent(agentId: string, input: UpdateAgentInput): Promise<StoredAgent | null>;
    deleteAgent(agentId: string): Promise<boolean>;
}

function normalizeName(name: string): string {
    return name.trim();
}

export function createAgentRegistryService(deps: { store: AgentStorePort }): AgentRegistryService {
    return {
        async listAgents(input?: ListAgentsInput): Promise<StoredAgent[]> {
            return deps.store.list(input);
        },

        async getAgent(agentId: string): Promise<StoredAgent | null> {
            return deps.store.getById(agentId);
        },

        async createAgent(input: CreateAgentInput): Promise<StoredAgent> {
            const name = normalizeName(input.name);
            if (name.length === 0) {
                throw new HttpError(400, 'Agent name cannot be empty');
            }

            return deps.store.create({
                ...input,
                name,
                description: input.description ?? null,
                config: input.config ?? {},
            });
        },

        async updateAgent(agentId: string, input: UpdateAgentInput): Promise<StoredAgent | null> {
            const patch: UpdateAgentInput = {
                ...input,
                ...(input.name !== undefined ? { name: normalizeName(input.name) } : {}),
            };

            if (patch.name !== undefined && patch.name.length === 0) {
                throw new HttpError(400, 'Agent name cannot be empty');
            }

            return deps.store.update(agentId, patch);
        },

        async deleteAgent(agentId: string): Promise<boolean> {
            return deps.store.delete(agentId);
        },
    };
}

