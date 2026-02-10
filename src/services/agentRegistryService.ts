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

function normalizeAgentName(name: string): string {
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
            const agentName = normalizeAgentName(input.config.agent_name ?? '');
            if (agentName.length === 0) throw new HttpError(400, 'config.agent_name is required');

            return deps.store.create({
                ...input,
                config: {
                    ...input.config,
                    agent_name: agentName,
                },
            });
        },

        async updateAgent(agentId: string, input: UpdateAgentInput): Promise<StoredAgent | null> {
            const patch: UpdateAgentInput = { ...input };

            if (patch.config) {
                const agentName = normalizeAgentName(patch.config.agent_name ?? '');
                if (agentName.length === 0) {
                    throw new HttpError(400, 'config.agent_name is required');
                }
                patch.config = { ...patch.config, agent_name: agentName };
            }

            return deps.store.update(agentId, patch);
        },

        async deleteAgent(agentId: string): Promise<boolean> {
            return deps.store.delete(agentId);
        },
    };
}
