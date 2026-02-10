import { describe, expect, it } from 'vitest';
import { setRequiredEnv } from './testUtils';

describe('config/tools', () => {
    // normalizeTools
    describe('normalizeTools', () => {
        it('returns empty array when no tools provided', async () => {
            setRequiredEnv();
            const { normalizeTools } = await import('../dist/config/tools.js');
            expect(normalizeTools({})).toEqual([]);
            expect(normalizeTools()).toEqual([]);
        });

        it('filters out unknown tool IDs', async () => {
            setRequiredEnv();
            const { normalizeTools } = await import('../dist/config/tools.js');
            expect(normalizeTools({ tools: ['get_weather', 'fake_tool'] })).toEqual([
                'get_weather',
            ]);
        });

        it('deduplicates tool IDs', async () => {
            setRequiredEnv();
            const { normalizeTools } = await import('../dist/config/tools.js');
            expect(normalizeTools({ tools: ['get_weather', 'get_weather'] })).toEqual([
                'get_weather',
            ]);
        });

        it('auto-adds search_knowledge_base when KB is enabled', async () => {
            setRequiredEnv();
            const { normalizeTools } = await import('../dist/config/tools.js');
            const result = normalizeTools({
                tools: ['get_weather'],
                knowledge_base: { enabled: true },
            });
            expect(result).toContain('search_knowledge_base');
            expect(result).toContain('get_weather');
        });

        it('does not add search_knowledge_base when KB is disabled', async () => {
            setRequiredEnv();
            const { normalizeTools } = await import('../dist/config/tools.js');
            const result = normalizeTools({
                tools: ['get_weather'],
                knowledge_base: { enabled: false },
            });
            expect(result).not.toContain('search_knowledge_base');
        });

        it('wildcard "*" enables all registry tools (except KB when KB not enabled)', async () => {
            setRequiredEnv();
            const { normalizeTools, toolRegistry } = await import('../dist/config/tools.js');
            const result = normalizeTools({ tools: ['*'] });
            const expected = toolRegistry
                .map((t: { id: string }) => t.id)
                .filter((id: string) => id !== 'search_knowledge_base');
            expect(result).toEqual(expected);
        });

        it('wildcard "all" enables all registry tools', async () => {
            setRequiredEnv();
            const { normalizeTools } = await import('../dist/config/tools.js');
            const result = normalizeTools({ tools: ['all'] });
            expect(result.length).toBeGreaterThan(0);
            expect(result).not.toContain('search_knowledge_base');
        });

        it('wildcard with KB enabled includes search_knowledge_base', async () => {
            setRequiredEnv();
            const { normalizeTools, toolRegistry } = await import('../dist/config/tools.js');
            const result = normalizeTools({
                tools: ['*'],
                knowledge_base: { enabled: true },
            });
            expect(result).toEqual(toolRegistry.map((t: { id: string }) => t.id));
        });

        it('ignores non-string tool entries', async () => {
            setRequiredEnv();
            const { normalizeTools } = await import('../dist/config/tools.js');
            const result = normalizeTools({
                tools: [42, null, 'get_weather', undefined] as unknown as string[],
            });
            expect(result).toEqual(['get_weather']);
        });
    });

    // deriveRagConfigFromKnowledgeBase
    describe('deriveRagConfigFromKnowledgeBase', () => {
        it('returns empty object when KB is not enabled', async () => {
            setRequiredEnv();
            const { deriveRagConfigFromKnowledgeBase } = await import('../dist/config/tools.js');
            expect(deriveRagConfigFromKnowledgeBase({})).toEqual({});
            expect(
                deriveRagConfigFromKnowledgeBase({ knowledge_base: { enabled: false } })
            ).toEqual({});
        });

        it('extracts lyzr_rag when KB is enabled', async () => {
            setRequiredEnv();
            const { deriveRagConfigFromKnowledgeBase } = await import('../dist/config/tools.js');
            const lyzr_rag = { base_url: 'http://x', rag_id: 'r', rag_name: 'n' };
            const result = deriveRagConfigFromKnowledgeBase({
                knowledge_base: { enabled: true, lyzr_rag },
            });
            expect(result.lyzr_rag).toEqual(lyzr_rag);
        });

        it('defaults agentic_rag to empty array when KB enabled but none provided', async () => {
            setRequiredEnv();
            const { deriveRagConfigFromKnowledgeBase } = await import('../dist/config/tools.js');
            const result = deriveRagConfigFromKnowledgeBase({
                knowledge_base: { enabled: true },
            });
            expect(result.agentic_rag).toEqual([]);
        });
    });

    // finalizeAgentConfig
    describe('finalizeAgentConfig', () => {
        it('normalizes tools and derives RAG fields in one pass', async () => {
            setRequiredEnv();
            const { finalizeAgentConfig } = await import('../dist/config/tools.js');
            const result = finalizeAgentConfig({
                tools: ['get_weather', 'unknown'],
                knowledge_base: {
                    enabled: true,
                    lyzr_rag: { base_url: 'x', rag_id: 'r', rag_name: 'n' },
                },
            });
            expect(result.tools).toEqual(['get_weather', 'search_knowledge_base']);
            expect(result.lyzr_rag).toEqual({ base_url: 'x', rag_id: 'r', rag_name: 'n' });
            expect(result.agentic_rag).toEqual([]);
        });

        it('preserves other config fields unchanged', async () => {
            setRequiredEnv();
            const { finalizeAgentConfig } = await import('../dist/config/tools.js');
            const result = finalizeAgentConfig({
                prompt: 'hello',
                vad_enabled: false,
                tools: ['get_weather'],
            });
            expect(result.prompt).toBe('hello');
            expect(result.vad_enabled).toBe(false);
            expect(result.tools).toEqual(['get_weather']);
        });
    });
});
