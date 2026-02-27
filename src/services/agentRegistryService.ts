import type {
    AgentStorePort,
    CreateAgentInput,
    ListAgentsInput,
    StoredAgent,
    StoredAgentVersion,
    UpdateAgentInput,
} from '../ports/agentStorePort.js';
import { HttpError } from '../lib/httpErrors.js';
import type { AgentAccessService } from './agentAccessService.js';

export interface AgentRegistryAuthContext {
    orgId: string;
    userId: string;
    isAdmin: boolean;
}

export interface AgentRegistryService {
    listAgents(auth: AgentRegistryAuthContext, input?: ListAgentsInput): Promise<StoredAgent[]>;
    getAgent(auth: AgentRegistryAuthContext, agentId: string): Promise<StoredAgent | null>;
    listAgentVersions(
        auth: AgentRegistryAuthContext,
        agentId: string
    ): Promise<StoredAgentVersion[] | null>;
    createAgent(auth: AgentRegistryAuthContext, input: Pick<CreateAgentInput, 'config'>): Promise<StoredAgent>;
    updateAgent(
        auth: AgentRegistryAuthContext,
        agentId: string,
        input: UpdateAgentInput
    ): Promise<StoredAgent | null>;
    activateAgentVersion(
        auth: AgentRegistryAuthContext,
        agentId: string,
        versionId: string
    ): Promise<StoredAgent | null>;
    deleteAgent(auth: AgentRegistryAuthContext, agentId: string): Promise<boolean>;
    listAgentShares(auth: AgentRegistryAuthContext, agentId: string): Promise<string[] | null>;
    shareAgent(
        auth: AgentRegistryAuthContext,
        agentId: string,
        input: { emailIds: string[]; adminUserId?: string; bearerToken?: string }
    ): Promise<unknown>;
    unshareAgent(
        auth: AgentRegistryAuthContext,
        agentId: string,
        input: { emailIds: string[]; adminUserId?: string; bearerToken?: string }
    ): Promise<unknown>;
}

function normalizeAgentName(name: string): string {
    return name.trim();
}

function toReadScope(auth: AgentRegistryAuthContext): { orgId: string; createdByUserId?: string } {
    return auth.isAdmin ? { orgId: auth.orgId } : { orgId: auth.orgId, createdByUserId: auth.userId };
}

function normalizePagination(input?: ListAgentsInput): { limit: number; offset: number } {
    const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200);
    const offset = Math.max(input?.offset ?? 0, 0);
    return { limit, offset };
}

function toEpochMs(value: string): number {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function mergeAndSortAgents(owned: StoredAgent[], shared: StoredAgent[]): StoredAgent[] {
    const byId = new Map<string, StoredAgent>();

    for (const agent of owned) {
        byId.set(agent.id, agent);
    }

    for (const agent of shared) {
        if (byId.has(agent.id)) continue;
        byId.set(agent.id, { ...agent, shared: true });
    }

    return Array.from(byId.values()).sort(
        (left, right) => toEpochMs(right.updatedAt) - toEpochMs(left.updatedAt)
    );
}

async function listAllAgentsInScope(
    store: AgentStorePort,
    scope: { orgId: string; createdByUserId?: string },
    targetCount?: number
): Promise<StoredAgent[]> {
    const pageSize = 200;
    let offset = 0;
    const results: StoredAgent[] = [];
    const minimumCount = targetCount === undefined ? Number.POSITIVE_INFINITY : Math.max(targetCount, 0);

    while (true) {
        const page = await store.list({
            scope,
            limit: pageSize,
            offset,
        });
        results.push(...page);
        if (results.length >= minimumCount) break;
        if (page.length < pageSize) break;
        offset += pageSize;
    }

    return results;
}

async function listSharedAgentsByIds(
    store: AgentStorePort,
    orgId: string,
    sharedIds: Iterable<string>
): Promise<StoredAgent[]> {
    const sharedAgents: StoredAgent[] = [];

    for (const agentId of sharedIds) {
        const agent = await store.getById(agentId, { orgId });
        if (agent) {
            sharedAgents.push(agent);
        }
    }

    return sharedAgents;
}

function hasNonEmptyValues(values: string[]): boolean {
    return values.some((value) => value.trim().length > 0);
}

async function assertOwnerOrAdminCanManageShares(params: {
    store: AgentStorePort;
    auth: AgentRegistryAuthContext;
    agentId: string;
    operation: 'share' | 'unshare';
}): Promise<void> {
    const ownerVisibleAgent = await params.store.getById(params.agentId, toReadScope(params.auth));
    if (ownerVisibleAgent) return;

    throw new HttpError(403, `Only owner/admin can ${params.operation} this agent`);
}

export function createAgentRegistryService(deps: {
    store: AgentStorePort;
    access?: AgentAccessService;
}): AgentRegistryService {
    const access: AgentAccessService =
        deps.access ??
        ({
            async listSharedAgentIds() {
                return new Set<string>();
            },
            async hasSharedAccess() {
                return false;
            },
            async listSharedUserIdsForAgent() {
                return [];
            },
            async shareAgent() {
                throw new HttpError(503, 'Agent sharing is not configured');
            },
            async unshareAgent() {
                throw new HttpError(503, 'Agent sharing is not configured');
            },
        } satisfies AgentAccessService);

    return {
        async listAgents(auth: AgentRegistryAuthContext, input?: ListAgentsInput): Promise<StoredAgent[]> {
            if (auth.isAdmin) {
                return deps.store.list({
                    ...input,
                    scope: { orgId: auth.orgId },
                });
            }

            const sharedIds = await access.listSharedAgentIds(auth);
            if (sharedIds.size === 0) {
                return deps.store.list({
                    ...input,
                    scope: toReadScope(auth),
                });
            }

            const { limit, offset } = normalizePagination(input);
            const requiredMergedCount = offset + limit;
            const [ownedAgents, sharedAgents] = await Promise.all([
                listAllAgentsInScope(deps.store, toReadScope(auth), requiredMergedCount),
                listSharedAgentsByIds(deps.store, auth.orgId, sharedIds),
            ]);

            const merged = mergeAndSortAgents(ownedAgents, sharedAgents);
            return merged.slice(offset, offset + limit);
        },

        async getAgent(auth: AgentRegistryAuthContext, agentId: string): Promise<StoredAgent | null> {
            if (auth.isAdmin) {
                return deps.store.getById(agentId, { orgId: auth.orgId });
            }

            const owned = await deps.store.getById(agentId, toReadScope(auth));
            if (owned) return owned;

            const canReadShared = await access.hasSharedAccess(auth, agentId, 'read');
            if (!canReadShared) return null;

            const shared = await deps.store.getById(agentId, { orgId: auth.orgId });
            if (!shared) return null;
            return { ...shared, shared: true };
        },

        async listAgentVersions(
            auth: AgentRegistryAuthContext,
            agentId: string
        ): Promise<StoredAgentVersion[] | null> {
            if (auth.isAdmin) {
                return deps.store.listVersions(agentId, { orgId: auth.orgId });
            }

            const owned = await deps.store.listVersions(agentId, toReadScope(auth));
            if (owned) return owned;

            const canReadShared = await access.hasSharedAccess(auth, agentId, 'read');
            if (!canReadShared) return null;

            return deps.store.listVersions(agentId, { orgId: auth.orgId });
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

            if (auth.isAdmin) {
                return deps.store.update(agentId, patch, { orgId: auth.orgId });
            }

            const updatedOwned = await deps.store.update(agentId, patch, toReadScope(auth));
            if (updatedOwned) return updatedOwned;

            const canUpdateShared = await access.hasSharedAccess(auth, agentId, 'update');
            if (!canUpdateShared) return null;

            const updatedShared = await deps.store.update(agentId, patch, { orgId: auth.orgId });
            if (!updatedShared) return null;
            return { ...updatedShared, shared: true };
        },

        async activateAgentVersion(
            auth: AgentRegistryAuthContext,
            agentId: string,
            versionId: string
        ): Promise<StoredAgent | null> {
            if (auth.isAdmin) {
                return deps.store.activateVersion(agentId, versionId, { orgId: auth.orgId });
            }

            const activatedOwned = await deps.store.activateVersion(agentId, versionId, toReadScope(auth));
            if (activatedOwned) return activatedOwned;

            const canUpdateShared = await access.hasSharedAccess(auth, agentId, 'update');
            if (!canUpdateShared) return null;

            const activatedShared = await deps.store.activateVersion(agentId, versionId, {
                orgId: auth.orgId,
            });
            if (!activatedShared) return null;
            return { ...activatedShared, shared: true };
        },

        async deleteAgent(auth: AgentRegistryAuthContext, agentId: string): Promise<boolean> {
            if (auth.isAdmin) {
                return deps.store.delete(agentId, { orgId: auth.orgId });
            }

            // Intentional: shared users cannot delete. Owner-only for non-admin.
            return deps.store.delete(agentId, toReadScope(auth));
        },

        async listAgentShares(auth: AgentRegistryAuthContext, agentId: string): Promise<string[] | null> {
            const agent = await this.getAgent(auth, agentId);
            if (!agent) return null;

            return access.listSharedUserIdsForAgent(auth, agentId);
        },

        async shareAgent(
            auth: AgentRegistryAuthContext,
            agentId: string,
            input: { emailIds: string[]; adminUserId?: string; bearerToken?: string }
        ): Promise<unknown> {
            if (!hasNonEmptyValues(input.emailIds)) {
                throw new HttpError(400, 'emailIds must include at least one email');
            }

            await assertOwnerOrAdminCanManageShares({
                store: deps.store,
                auth,
                agentId,
                operation: 'share',
            });

            return access.shareAgent({
                auth,
                agentId,
                emailIds: input.emailIds,
                adminUserId: input.adminUserId,
                bearerToken: input.bearerToken,
            });
        },

        async unshareAgent(
            auth: AgentRegistryAuthContext,
            agentId: string,
            input: { emailIds: string[]; adminUserId?: string; bearerToken?: string }
        ): Promise<unknown> {
            if (!hasNonEmptyValues(input.emailIds)) {
                throw new HttpError(400, 'emailIds must include at least one email');
            }

            await assertOwnerOrAdminCanManageShares({
                store: deps.store,
                auth,
                agentId,
                operation: 'unshare',
            });

            return access.unshareAgent({
                auth,
                agentId,
                emailIds: input.emailIds,
                adminUserId: input.adminUserId,
                bearerToken: input.bearerToken,
            });
        },
    };
}
