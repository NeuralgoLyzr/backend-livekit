import type {
    AgentStorePort,
    CreateAgentInput,
    ListAgentsInput,
    StoredAgent,
    UpdateAgentInput,
} from '../ports/agentStorePort.js';
import { HttpError } from '../lib/httpErrors.js';

export interface AgentRegistryAuthContext {
    orgId: string;
    userId: string;
    isAdmin: boolean;
}

export interface AgentRegistryService {
    listAgents(auth: AgentRegistryAuthContext, input?: ListAgentsInput): Promise<StoredAgent[]>;
    getAgent(auth: AgentRegistryAuthContext, agentId: string): Promise<StoredAgent | null>;
    createAgent(auth: AgentRegistryAuthContext, input: Pick<CreateAgentInput, 'config'>): Promise<StoredAgent>;
    updateAgent(
        auth: AgentRegistryAuthContext,
        agentId: string,
        input: UpdateAgentInput
    ): Promise<StoredAgent | null>;
    deleteAgent(auth: AgentRegistryAuthContext, agentId: string): Promise<boolean>;
}

function normalizeAgentName(name: string): string {
    return name.trim();
}

function toReadScope(auth: AgentRegistryAuthContext): { orgId: string; createdByUserId?: string } {
    return auth.isAdmin ? { orgId: auth.orgId } : { orgId: auth.orgId, createdByUserId: auth.userId };
}

export function createAgentRegistryService(deps: { store: AgentStorePort }): AgentRegistryService {
    return {
        async listAgents(auth: AgentRegistryAuthContext, input?: ListAgentsInput): Promise<StoredAgent[]> {
            return deps.store.list({
                ...input,
                scope: toReadScope(auth),
            });
        },

        async getAgent(auth: AgentRegistryAuthContext, agentId: string): Promise<StoredAgent | null> {
            return deps.store.getById(agentId, toReadScope(auth));
        },

        async createAgent(
            auth: AgentRegistryAuthContext,
            input: Pick<CreateAgentInput, 'config'>
        ): Promise<StoredAgent> {
            const agentName = normalizeAgentName(input.config.agent_name ?? '');
            if (agentName.length === 0) throw new HttpError(400, 'config.agent_name is required');

            return deps.store.create({
                orgId: auth.orgId,
                createdByUserId: auth.userId,
                ...input,
                config: {
                    ...input.config,
                    agent_name: agentName,
                },
            });
        },

        async updateAgent(
            auth: AgentRegistryAuthContext,
            agentId: string,
            input: UpdateAgentInput
        ): Promise<StoredAgent | null> {
            const patch: UpdateAgentInput = { ...input };

            if (patch.config) {
                const agentName = normalizeAgentName(patch.config.agent_name ?? '');
                if (agentName.length === 0) {
                    throw new HttpError(400, 'config.agent_name is required');
                }
                patch.config = { ...patch.config, agent_name: agentName };
            }

            return deps.store.update(agentId, patch, toReadScope(auth));
        },

        async deleteAgent(auth: AgentRegistryAuthContext, agentId: string): Promise<boolean> {
            return deps.store.delete(agentId, toReadScope(auth));
        },
    };
}
