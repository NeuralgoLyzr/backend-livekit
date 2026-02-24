import { describe, expect, it, vi } from 'vitest';

describe('agentAccessService (unit)', () => {
    const auth = {
        orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
        userId: 'member_user_1',
        isAdmin: false,
    };

    it('returns only shared ids assigned to the current user', async () => {
        const { createAgentAccessService } = await import('../src/services/agentAccessService.ts');

        const policyService = {
            listAssignedPermissions: vi.fn().mockResolvedValue([
                {
                    userId: 'member_user_1',
                    resourceId: '507f1f77bcf86cd799439011',
                    resourceType: 'agent',
                    modes: [],
                },
                {
                    userId: 'member_user_2',
                    resourceId: '507f1f77bcf86cd799439012',
                    resourceType: 'agent',
                    modes: [],
                },
            ]),
            shareResource: vi.fn(),
            unshareResource: vi.fn(),
        };

        const svc = createAgentAccessService({ policyService });
        const ids = await svc.listSharedAgentIds(auth);
        expect(Array.from(ids)).toEqual(['507f1f77bcf86cd799439011']);
    });

    it('treats mode-less assignment as editable shared access', async () => {
        const { createAgentAccessService } = await import('../src/services/agentAccessService.ts');

        const policyService = {
            listAssignedPermissions: vi.fn().mockResolvedValue([
                {
                    userId: 'member_user_1',
                    resourceId: '507f1f77bcf86cd799439011',
                    resourceType: 'agent',
                    modes: [],
                },
            ]),
            shareResource: vi.fn(),
            unshareResource: vi.fn(),
        };

        const svc = createAgentAccessService({ policyService });
        await expect(svc.hasSharedAccess(auth, '507f1f77bcf86cd799439011', 'update')).resolves.toBe(
            true
        );
    });

    it('enforces explicit modes when provided', async () => {
        const { createAgentAccessService } = await import('../src/services/agentAccessService.ts');

        const policyService = {
            listAssignedPermissions: vi.fn().mockResolvedValue([
                {
                    userId: 'member_user_1',
                    resourceId: '507f1f77bcf86cd799439011',
                    resourceType: 'agent',
                    modes: ['read'],
                },
            ]),
            shareResource: vi.fn(),
            unshareResource: vi.fn(),
        };

        const svc = createAgentAccessService({ policyService });
        await expect(svc.hasSharedAccess(auth, '507f1f77bcf86cd799439011', 'read')).resolves.toBe(
            true
        );
        await expect(
            svc.hasSharedAccess(auth, '507f1f77bcf86cd799439011', 'delete')
        ).resolves.toBe(false);
    });

    it('lists unique shared user ids for an agent', async () => {
        const { createAgentAccessService } = await import('../src/services/agentAccessService.ts');

        const policyService = {
            listAssignedPermissions: vi.fn().mockResolvedValue([
                {
                    userId: 'user_b',
                    resourceId: '507f1f77bcf86cd799439011',
                    resourceType: 'agent',
                    modes: [],
                },
                {
                    userId: 'user_a',
                    resourceId: '507f1f77bcf86cd799439011',
                    resourceType: 'agent',
                    modes: [],
                },
                {
                    userId: 'user_b',
                    resourceId: '507f1f77bcf86cd799439011',
                    resourceType: 'agent',
                    modes: [],
                },
            ]),
            shareResource: vi.fn(),
            unshareResource: vi.fn(),
        };

        const svc = createAgentAccessService({ policyService });
        await expect(svc.listSharedUserIdsForAgent(auth, '507f1f77bcf86cd799439011')).resolves.toEqual(
            ['user_a', 'user_b']
        );
    });
});
