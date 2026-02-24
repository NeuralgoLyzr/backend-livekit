import { beforeEach, describe, expect, it, vi } from 'vitest';

function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

describe('pagosPolicyService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('lists assigned permissions from array payload', async () => {
        const { createPagosPolicyService } = await import('../src/services/pagosPolicyService.ts');
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse([
                {
                    user_id: 'member_user_1',
                    resource_id: '507f1f77bcf86cd799439011',
                    resource_type: 'agent',
                    modes: ['read', 'update'],
                },
            ])
        );
        vi.stubGlobal('fetch', fetchMock);

        const svc = createPagosPolicyService({
            pagosApiUrl: 'https://pagos.test',
            pagosAdminToken: 'admin-token',
        });

        const permissions = await svc.listAssignedPermissions({
            organizationId: '96f0cee4-bb87-4477-8eff-577ef2780614',
            permissionType: 'agent',
        });

        expect(permissions).toEqual([
            {
                userId: 'member_user_1',
                resourceId: '507f1f77bcf86cd799439011',
                resourceType: 'agent',
                modes: ['read', 'update'],
            },
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('falls back to /api/v1 path when unversioned endpoint is missing', async () => {
        const { createPagosPolicyService } = await import('../src/services/pagosPolicyService.ts');
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse({ error: 'not found' }, 404))
            .mockResolvedValueOnce(
                jsonResponse({
                    data: [
                        {
                            user_id: 'member_user_1',
                            resource_id: '507f1f77bcf86cd799439011',
                            resource_type: 'agent',
                            modes: [],
                        },
                    ],
                })
            );
        vi.stubGlobal('fetch', fetchMock);

        const svc = createPagosPolicyService({
            pagosApiUrl: 'https://pagos.test',
            pagosAdminToken: 'admin-token',
        });

        await svc.listAssignedPermissions({
            organizationId: '96f0cee4-bb87-4477-8eff-577ef2780614',
            permissionType: 'agent',
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const firstUrl = String(fetchMock.mock.calls[0]?.[0]);
        const secondUrl = String(fetchMock.mock.calls[1]?.[0]);
        expect(firstUrl).toContain('/policies/assigned-permissions');
        expect(secondUrl).toContain('/api/v1/policies/assigned-permissions');
    });

    it('uses caller bearer token for share requests when provided', async () => {
        const { createPagosPolicyService } = await import('../src/services/pagosPolicyService.ts');
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'ok' }));
        vi.stubGlobal('fetch', fetchMock);

        const svc = createPagosPolicyService({
            pagosApiUrl: 'https://pagos.test',
            pagosAdminToken: 'admin-token',
        });

        await svc.shareResource({
            organizationId: '96f0cee4-bb87-4477-8eff-577ef2780614',
            resourceId: '507f1f77bcf86cd799439011',
            resourceType: 'agent',
            emailIds: ['a@example.com'],
            adminUserId: 'admin_1',
            bearerToken: 'user-token',
        });

        const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
        expect(headers.Authorization).toBe('Bearer user-token');
    });
});
