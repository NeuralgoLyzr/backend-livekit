import type { AgentRegistryAuthContext } from './agentRegistryService.js';
import type { AssignedPermission, PagosPolicyService } from './pagosPolicyService.js';

type AgentAction = 'read' | 'update' | 'delete' | 'share';

export interface AgentAccessService {
    listSharedAgentIds(auth: AgentRegistryAuthContext): Promise<Set<string>>;
    hasSharedAccess(
        auth: AgentRegistryAuthContext,
        agentId: string,
        action: AgentAction
    ): Promise<boolean>;
    listSharedUserIdsForAgent(auth: AgentRegistryAuthContext, agentId: string): Promise<string[]>;
    shareAgent(input: {
        auth: AgentRegistryAuthContext;
        agentId: string;
        emailIds: string[];
        adminUserId?: string;
        bearerToken?: string;
    }): Promise<unknown>;
    unshareAgent(input: {
        auth: AgentRegistryAuthContext;
        agentId: string;
        emailIds: string[];
        adminUserId?: string;
        bearerToken?: string;
    }): Promise<unknown>;
}

const AGENT_PERMISSION_TYPE = 'agent';

function normalizeString(value: string | undefined): string {
    return (value ?? '').trim();
}

function isAgentPermission(permission: AssignedPermission): boolean {
    const type = normalizeString(permission.resourceType).toLowerCase();
    return !type || type === AGENT_PERMISSION_TYPE;
}

function filterPermissionsForUser(
    permissions: AssignedPermission[],
    userId: string
): AssignedPermission[] {
    const hasExplicitUserAssignments = permissions.some((permission) => Boolean(permission.userId));
    if (!hasExplicitUserAssignments) return permissions;
    return permissions.filter((permission) => permission.userId === userId);
}

function uniqueSorted(values: Iterable<string>): string[] {
    return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function hasMode(permission: AssignedPermission, allowedModes: Set<string>): boolean {
    const normalizedModes = permission.modes.map((mode) => mode.toLowerCase());
    if (normalizedModes.length === 0) {
        // Legacy behavior: shared resources are editable by default.
        return true;
    }
    return normalizedModes.some((mode) => allowedModes.has(mode));
}

function getAllowedModes(action: AgentAction): Set<string> {
    switch (action) {
        case 'read':
            return new Set(['read', 'view', 'get', 'list', 'execute', 'write', 'edit', 'update']);
        case 'update':
            return new Set(['update', 'write', 'edit']);
        case 'delete':
            return new Set(['delete', 'remove']);
        case 'share':
            return new Set(['share']);
        default:
            return new Set();
    }
}

export function createAgentAccessService(deps: { policyService: PagosPolicyService }): AgentAccessService {
    async function getUserAgentPermissions(auth: AgentRegistryAuthContext): Promise<AssignedPermission[]> {
        const all = await deps.policyService.listAssignedPermissions({
            organizationId: auth.orgId,
            permissionType: AGENT_PERMISSION_TYPE,
        });

        return filterPermissionsForUser(
            all.filter((permission) => isAgentPermission(permission)),
            auth.userId
        );
    }

    return {
        async listSharedAgentIds(auth: AgentRegistryAuthContext): Promise<Set<string>> {
            const permissions = await getUserAgentPermissions(auth);
            const ids = permissions
                .map((permission) => permission.resourceId)
                .filter((resourceId) => resourceId.length > 0);
            return new Set(ids);
        },

        async hasSharedAccess(
            auth: AgentRegistryAuthContext,
            agentId: string,
            action: AgentAction
        ): Promise<boolean> {
            const permissions = await getUserAgentPermissions(auth);
            const allowedModes = getAllowedModes(action);
            return permissions.some(
                (permission) => permission.resourceId === agentId && hasMode(permission, allowedModes)
            );
        },

        async listSharedUserIdsForAgent(auth: AgentRegistryAuthContext, agentId: string): Promise<string[]> {
            const permissions = await deps.policyService.listAssignedPermissions({
                organizationId: auth.orgId,
                permissionType: AGENT_PERMISSION_TYPE,
            });

            const userIds = permissions
                .filter((permission) => isAgentPermission(permission) && permission.resourceId === agentId)
                .map((permission) => normalizeString(permission.userId))
                .filter((userId) => userId.length > 0);

            return uniqueSorted(userIds);
        },

        async shareAgent(input): Promise<unknown> {
            return deps.policyService.shareResource({
                organizationId: input.auth.orgId,
                resourceId: input.agentId,
                resourceType: AGENT_PERMISSION_TYPE,
                emailIds: input.emailIds,
                adminUserId: input.adminUserId,
                bearerToken: input.bearerToken,
            });
        },

        async unshareAgent(input): Promise<unknown> {
            return deps.policyService.unshareResource({
                organizationId: input.auth.orgId,
                resourceId: input.agentId,
                resourceType: AGENT_PERMISSION_TYPE,
                emailIds: input.emailIds,
                adminUserId: input.adminUserId,
                bearerToken: input.bearerToken,
            });
        },
    };
}
