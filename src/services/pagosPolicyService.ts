import { HttpError } from '../lib/httpErrors.js';
import { logger } from '../lib/logger.js';

export interface AssignedPermission {
    userId?: string;
    resourceId: string;
    resourceType?: string;
    modes: string[];
}

export interface ShareResourceInput {
    organizationId: string;
    resourceId: string;
    resourceType: string;
    emailIds: string[];
    adminUserId?: string;
    bearerToken?: string;
}

export interface PagosPolicyService {
    listAssignedPermissions(input: {
        organizationId: string;
        permissionType: string;
    }): Promise<AssignedPermission[]>;
    shareResource(input: ShareResourceInput): Promise<unknown>;
    unshareResource(input: ShareResourceInput): Promise<unknown>;
}

export interface CreatePagosPolicyServiceDeps {
    pagosApiUrl: string;
    pagosAdminToken: string;
    timeoutMs?: number;
}

function normalizeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function toObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') return null;
    return value as Record<string, unknown>;
}

function parseAssignedPermission(value: unknown): AssignedPermission | null {
    const row = toObject(value);
    if (!row) return null;

    const resourceId = normalizeString(row.resource_id ?? row.resourceId);
    if (!resourceId) return null;

    const userId = normalizeString(row.user_id ?? row.userId) || undefined;
    const resourceType =
        normalizeString(
            row.resource_type ?? row.resourceType ?? row.type ?? row.permission_type
        ) || undefined;
    const modes = Array.isArray(row.modes)
        ? row.modes
              .map((mode) => normalizeString(mode))
              .filter((mode) => mode.length > 0)
        : [];

    return {
        userId,
        resourceId,
        resourceType,
        modes,
    };
}

function parseAssignedPermissionsPayload(payload: unknown): AssignedPermission[] {
    const extractArray = (): unknown[] => {
        if (Array.isArray(payload)) return payload;

        const root = toObject(payload);
        if (!root) return [];

        if (Array.isArray(root.data)) return root.data;
        if (Array.isArray(root.permissions)) return root.permissions;
        if (Array.isArray(root.items)) return root.items;

        return [];
    };

    const entries = extractArray();
    const normalized: AssignedPermission[] = [];
    for (const entry of entries) {
        const parsed = parseAssignedPermission(entry);
        if (parsed) normalized.push(parsed);
    }
    return normalized;
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, string>): string {
    const base = baseUrl.replace(/\/+$/, '');
    const url = new URL(base + path);
    for (const [key, value] of Object.entries(query ?? {})) {
        if (value.length > 0) {
            url.searchParams.set(key, value);
        }
    }
    return url.toString();
}

async function readResponseDetails(response: Response): Promise<{ json?: unknown; text?: string }> {
    const contentType = normalizeString(response.headers.get('content-type'));
    if (contentType.includes('application/json')) {
        const json = await response.json().catch(() => null);
        return { json: json ?? undefined };
    }

    const text = await response.text().catch(() => '');
    return { text: text || undefined };
}

function extractErrorMessage(details: { json?: unknown; text?: string }, fallback: string): string {
    const jsonRoot = toObject(details.json);
    const message =
        normalizeString(jsonRoot?.error) ||
        normalizeString(jsonRoot?.message) ||
        normalizeString(details.text);
    return message || fallback;
}

export function createPagosPolicyService(deps: CreatePagosPolicyServiceDeps): PagosPolicyService {
    const timeoutMs = Math.max(deps.timeoutMs ?? 30_000, 500);

    async function requestWithFallback(input: {
        method: 'GET' | 'POST';
        fallbackPaths: string[];
        query?: Record<string, string>;
        body?: unknown;
        bearerToken?: string;
    }): Promise<unknown> {
        const token = normalizeString(input.bearerToken) || deps.pagosAdminToken;
        const requestHeaders: Record<string, string> = {
            accept: 'application/json',
            Authorization: `Bearer ${token}`,
        };
        if (input.method === 'POST') {
            requestHeaders['Content-Type'] = 'application/json';
        }

        let lastError: HttpError | null = null;

        for (const path of input.fallbackPaths) {
            const url = buildUrl(deps.pagosApiUrl, path, input.query);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetch(url, {
                    method: input.method,
                    headers: requestHeaders,
                    body: input.method === 'POST' ? JSON.stringify(input.body ?? {}) : undefined,
                    signal: controller.signal,
                });

                if (!response.ok) {
                    const details = await readResponseDetails(response);
                    const message = extractErrorMessage(details, 'Pagos policy request failed');

                    // Try next fallback path only on 404.
                    if (response.status === 404) {
                        lastError = new HttpError(404, message, details.json ?? details.text);
                        continue;
                    }

                    throw new HttpError(response.status, message, details.json ?? details.text);
                }

                const payload = await response.json().catch(() => null);
                return payload;
            } catch (error) {
                if (error instanceof HttpError) {
                    throw error;
                }

                const message = error instanceof Error ? error.message : String(error);
                logger.warn(
                    {
                        event: 'pagos_policy_request_error',
                        path,
                        method: input.method,
                        err: message,
                    },
                    'Pagos policy request errored'
                );
                throw new HttpError(502, 'Failed to communicate with Pagos policy service');
            } finally {
                clearTimeout(timeout);
            }
        }

        if (lastError) {
            logger.warn(
                {
                    event: 'pagos_policy_request_not_found',
                    paths: input.fallbackPaths,
                    method: input.method,
                },
                'Pagos policy endpoint not found'
            );
        }

        throw new HttpError(502, 'Pagos policy endpoint not available');
    }

    async function listAssignedPermissions(input: {
        organizationId: string;
        permissionType: string;
    }): Promise<AssignedPermission[]> {
        const organizationId = normalizeString(input.organizationId);
        const permissionType = normalizeString(input.permissionType);
        if (!organizationId) {
            throw new HttpError(400, 'organizationId is required for policy lookup');
        }
        if (!permissionType) {
            throw new HttpError(400, 'permissionType is required for policy lookup');
        }

        const payload = await requestWithFallback({
            method: 'GET',
            fallbackPaths: ['/policies/assigned-permissions', '/api/v1/policies/assigned-permissions'],
            query: {
                organization_id: organizationId,
                permission_type: permissionType,
            },
        });

        return parseAssignedPermissionsPayload(payload);
    }

    async function shareResource(input: ShareResourceInput): Promise<unknown> {
        const payload = {
            email_ids: input.emailIds,
            resource_id: input.resourceId,
            resource_type: input.resourceType,
            org_id: input.organizationId,
            ...(input.adminUserId ? { admin_user_id: input.adminUserId } : {}),
        };

        return requestWithFallback({
            method: 'POST',
            fallbackPaths: ['/policies/share-resource', '/api/v1/policies/share-resource'],
            body: payload,
            bearerToken: input.bearerToken,
        });
    }

    async function unshareResource(input: ShareResourceInput): Promise<unknown> {
        const payload = {
            email_ids: input.emailIds,
            resource_id: input.resourceId,
            resource_type: input.resourceType,
            org_id: input.organizationId,
            ...(input.adminUserId ? { admin_user_id: input.adminUserId } : {}),
        };

        return requestWithFallback({
            method: 'POST',
            fallbackPaths: ['/policies/unshare-resource', '/api/v1/policies/unshare-resource'],
            body: payload,
            bearerToken: input.bearerToken,
        });
    }

    return {
        listAssignedPermissions,
        shareResource,
        unshareResource,
    };
}
