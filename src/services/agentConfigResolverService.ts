import { deriveRagConfigFromKnowledgeBase, normalizeTools } from '../config/tools.js';
import { HttpError } from '../lib/httpErrors.js';
import type { AgentStorePort } from '../ports/agentStorePort.js';
import type { AgentConfig } from '../types/index.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base: unknown, patch: unknown): unknown {
    if (patch === undefined) return base;
    if (!isPlainObject(base) || !isPlainObject(patch)) {
        // Arrays and primitives are replaced by the patch when provided.
        return patch;
    }

    const out: Record<string, unknown> = { ...base };
    for (const [k, vPatch] of Object.entries(patch)) {
        if (vPatch === undefined) continue;
        out[k] = deepMerge((base as Record<string, unknown>)[k], vPatch);
    }
    return out;
}

export function mergeAgentConfig(base: AgentConfig, overrides?: AgentConfig): AgentConfig {
    if (!overrides) return base;
    return deepMerge(base, overrides) as AgentConfig;
}

export interface AgentConfigResolverService {
    /**
     * Resolve a stored agent config (by agentId) plus optional overrides
     * into a dispatch-ready config (tools normalized; KB-derived RAG fields populated).
     */
    resolveByAgentId(input: { agentId: string; overrides?: AgentConfig }): Promise<AgentConfig>;
}

export function createAgentConfigResolverService(deps: {
    agentStore: AgentStorePort;
}): AgentConfigResolverService {
    return {
        async resolveByAgentId(input: { agentId: string; overrides?: AgentConfig }): Promise<AgentConfig> {
            const agent = await deps.agentStore.getById(input.agentId);
            if (!agent) {
                throw new HttpError(404, 'Agent not found');
            }

            const merged = mergeAgentConfig(agent.config ?? {}, input.overrides);
            const normalizedTools = normalizeTools(merged);
            const derivedRag = deriveRagConfigFromKnowledgeBase(merged);

            return {
                ...merged,
                tools: normalizedTools,
                ...derivedRag,
            };
        },
    };
}

