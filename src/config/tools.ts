import type { AgentConfig, ToolDefinition } from '../types/index.js';
import { AgenticRagEntrySchema } from '../types/index.js';
import { z } from 'zod';

type AgenticRagEntry = z.infer<typeof AgenticRagEntrySchema>;

/**
 * Central registry of supported tools. IDs must match what the Python agent
 * knows how to load.
 */
export const toolRegistry: ToolDefinition[] = [
    {
        id: 'get_weather',
        name: 'Get Weather',
        description: 'Fetch current weather conditions for a city via Open-Meteo.',
    },
    {
        id: 'search_wikipedia',
        name: 'Search Wikipedia',
        description: 'Look up a short summary for a topic from Wikipedia.',
    },
    {
        id: 'add_note',
        name: 'Add Note',
        description: 'Store a short note for the current room on the agent.',
    },
    {
        id: 'list_notes',
        name: 'List Notes',
        description: 'List notes stored for the current room on the agent.',
    },
    {
        id: 'call_sub_agent',
        name: 'Call Sub-Agent',
        description: 'Delegate a task to a specialized sub-agent via the sub-agent API.',
    },
    {
        id: 'search_knowledge_base',
        name: 'Search Knowledge Base',
        description: 'Retrieve relevant snippets from the configured knowledge base (RAG).',
    },
];

const registryIds = new Set(toolRegistry.map((t) => t.id));
const KNOWLEDGE_BASE_TOOL_ID = 'search_knowledge_base';

/**
 * Ensure the supplied tool IDs are known and deduplicated.
 */
export function normalizeTools(agentConfig?: AgentConfig): string[] {
    const tools = agentConfig?.tools;
    const requestedTools: unknown[] = Array.isArray(tools) ? tools : [];

    const cleaned: string[] = [];
    for (const id of requestedTools) {
        if (typeof id !== 'string') continue;
        if (!registryIds.has(id)) continue;
        if (cleaned.includes(id)) continue;
        cleaned.push(id);
    }

    // Auto-enable knowledge base tool when feature is present.
    if (
        registryIds.has(KNOWLEDGE_BASE_TOOL_ID) &&
        !cleaned.includes(KNOWLEDGE_BASE_TOOL_ID) &&
        hasKnowledgeBaseFeature(agentConfig)
    ) {
        cleaned.push(KNOWLEDGE_BASE_TOOL_ID);
    }

    return cleaned;
}

function hasKnowledgeBaseFeature(agentConfig?: AgentConfig): boolean {
    const features = agentConfig?.features;
    if (!Array.isArray(features)) return false;
    return features.some((f) => f?.type === 'KNOWLEDGE_BASE');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return undefined;
}

function asString(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    return undefined;
}

/**
 * Derive RAG configuration from the highest-priority KNOWLEDGE_BASE feature.
 * Agentic RAG is kept as a skeleton but unused for now.
 */
export function deriveRagConfigFromFeatures(agentConfig?: AgentConfig): {
    lyzr_rag?: AgentConfig['lyzr_rag'];
    agentic_rag?: AgentConfig['agentic_rag'];
} {
    const features = agentConfig?.features;
    if (!Array.isArray(features) || features.length === 0) {
        return {};
    }

    const kbFeatures = features
        .filter((f) => isRecord(f) && f.type === 'KNOWLEDGE_BASE')
        .sort((a, b) => (asNumber(b.priority) ?? 0) - (asNumber(a.priority) ?? 0));

    const selected = kbFeatures[0];
    if (!isRecord(selected)) return {};
    const cfg = selected.config;
    if (!isRecord(cfg)) return {};

    const lyzr = cfg.lyzr_rag;
    const lyzrRecord = isRecord(lyzr) ? lyzr : undefined;
    const base_url = (asString(lyzrRecord?.base_url) ?? '').trim();
    const rag_id = (asString(lyzrRecord?.rag_id) ?? '').trim();

    const lyzr_rag: AgentConfig['lyzr_rag'] | undefined =
        base_url && rag_id
            ? {
                  base_url,
                  rag_id,
                  rag_name: asString(lyzrRecord?.rag_name),
                  params: isRecord(lyzrRecord?.params) ? lyzrRecord?.params : undefined,
              }
            : undefined;

    const agenticRaw = cfg.agentic_rag;
    const agentic_rag: AgenticRagEntry[] = Array.isArray(agenticRaw)
        ? agenticRaw
              .map((entry): AgenticRagEntry | null => {
                  if (!isRecord(entry)) return null;
                  const rag_id = (asString(entry.rag_id) ?? '').trim();
                  const top_k = asNumber(entry.top_k);
                  const retrieval_type = (asString(entry.retrieval_type) ?? '').trim();
                  const score_threshold = asNumber(entry.score_threshold);
                  if (!rag_id || top_k === undefined || !retrieval_type || score_threshold === undefined) {
                      return null;
                  }
                  return {
                      rag_id,
                      top_k,
                      retrieval_type,
                      score_threshold,
                  };
              })
              .filter((v): v is AgenticRagEntry => v !== null)
        : [];

    return {
        ...(lyzr_rag ? { lyzr_rag } : {}),
        agentic_rag,
    };
}
