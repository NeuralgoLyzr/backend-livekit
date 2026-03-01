import { describe, expect, it, vi } from 'vitest';

import { setRequiredEnv } from './testUtils';

describe('agentConfigResolverService (unit)', () => {
    it('merges overrides and normalizes tools + KB-derived RAG fields', async () => {
        setRequiredEnv();
        const { createAgentConfigResolverService } =
            await import('../src/services/agentConfigResolverService.js');

        const storedConfig = {
            tools: ['get_weather'],
            knowledge_base: {
                enabled: true,
                lyzr_rag: { base_url: 'x', rag_id: 'r', rag_name: 'n' },
            },
        } satisfies Record<string, unknown>;

        const getById = vi.fn().mockResolvedValue({
            id: '507f1f77bcf86cd799439011',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            config: storedConfig,
        });

        const resolver = createAgentConfigResolverService({
            agentStore: {
                list: async () => [],
                create: async () => {
                    throw new Error('not implemented');
                },
                update: async () => null,
                delete: async () => false,
                getById,
            },
        });

        const resolved = await resolver.resolveByAgentId({
            agentId: '507f1f77bcf86cd799439011',
            overrides: {
                tools: ['search_wikipedia', 'unknown_tool'],
            },
            accessScope: {
                orgId: 'org-a',
                userId: 'user-a',
                isAdmin: false,
            },
        });

        // Unknown tool removed; KB tool auto-added because KB enabled
        expect(resolved.tools).toEqual(['search_wikipedia', 'search_knowledge_base']);
        expect(resolved.lyzr_rag).toEqual({ base_url: 'x', rag_id: 'r', rag_name: 'n' });
        expect(getById).toHaveBeenCalledWith('507f1f77bcf86cd799439011', {
            orgId: 'org-a',
            createdByUserId: 'user-a',
        });
    });

    it('uses org-only scope when requester is admin', async () => {
        setRequiredEnv();
        const { createAgentConfigResolverService } =
            await import('../src/services/agentConfigResolverService.js');

        const getById = vi.fn().mockResolvedValue({
            id: '507f1f77bcf86cd799439011',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            config: {},
        });

        const resolver = createAgentConfigResolverService({
            agentStore: {
                list: async () => [],
                create: async () => {
                    throw new Error('not implemented');
                },
                update: async () => null,
                delete: async () => false,
                getById,
            },
        });

        await resolver.resolveByAgentId({
            agentId: '507f1f77bcf86cd799439011',
            accessScope: {
                orgId: 'org-a',
                userId: 'admin-a',
                isAdmin: true,
            },
        });

        expect(getById).toHaveBeenCalledWith('507f1f77bcf86cd799439011', {
            orgId: 'org-a',
        });
    });

    it('throws 404 when agent is missing', async () => {
        setRequiredEnv();
        const { createAgentConfigResolverService } =
            await import('../src/services/agentConfigResolverService.js');
        const { HttpError } = await import('../src/lib/httpErrors.js');

        const resolver = createAgentConfigResolverService({
            agentStore: {
                list: async () => [],
                create: async () => {
                    throw new Error('not implemented');
                },
                update: async () => null,
                delete: async () => false,
                getById: async () => null,
            },
        });

        await expect(
            resolver.resolveByAgentId({ agentId: '507f1f77bcf86cd799439011' })
        ).rejects.toBeInstanceOf(HttpError);
    });
});
