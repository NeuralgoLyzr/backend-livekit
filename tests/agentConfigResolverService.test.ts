import { describe, expect, it } from 'vitest';

import { setRequiredEnv } from './testUtils';

describe('agentConfigResolverService (unit)', () => {
    it('merges overrides and normalizes tools + KB-derived RAG fields', async () => {
        setRequiredEnv();
        const { createAgentConfigResolverService } =
            await import('../dist/services/agentConfigResolverService.js');

        const storedConfig = {
            tools: ['get_weather'],
            knowledge_base: {
                enabled: true,
                lyzr_rag: { base_url: 'x', rag_id: 'r', rag_name: 'n' },
            },
        } satisfies Record<string, unknown>;

        const resolver = createAgentConfigResolverService({
            agentStore: {
                list: async () => [],
                create: async () => {
                    throw new Error('not implemented');
                },
                update: async () => null,
                delete: async () => false,
                getById: async () => ({
                    id: '507f1f77bcf86cd799439011',
                    name: 'A',
                    description: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    config: storedConfig,
                }),
            },
        });

        const resolved = await resolver.resolveByAgentId({
            agentId: '507f1f77bcf86cd799439011',
            overrides: {
                tools: ['search_wikipedia', 'unknown_tool'],
            },
        });

        // Unknown tool removed; KB tool auto-added because KB enabled
        expect(resolved.tools).toEqual(['search_wikipedia', 'search_knowledge_base']);
        expect(resolved.lyzr_rag).toEqual({ base_url: 'x', rag_id: 'r', rag_name: 'n' });
    });

    it('throws 404 when agent is missing', async () => {
        setRequiredEnv();
        const { createAgentConfigResolverService } =
            await import('../dist/services/agentConfigResolverService.js');
        const { HttpError } = await import('../dist/lib/httpErrors.js');

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
