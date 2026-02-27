import type { AgentConfig, ToolDefinition } from '../types/index.js';

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
    if (!Array.isArray(tools)) {
        return registryIds.has(KNOWLEDGE_BASE_TOOL_ID) && hasKnowledgeBaseEnabled(agentConfig)
            ? [KNOWLEDGE_BASE_TOOL_ID]
            : [];
    }
    const requestedTools: unknown[] = tools;

    const wildcardEnabled = requestedTools.some((value) => {
        if (typeof value !== 'string') return false;
        const normalized = value.trim().toLowerCase();
        return normalized === '*' || normalized === 'all';
    });

    if (wildcardEnabled) {
        return toolRegistry
            .map((t) => t.id)
            .filter(
                (id) =>
                    id !== KNOWLEDGE_BASE_TOOL_ID ||
                    (registryIds.has(KNOWLEDGE_BASE_TOOL_ID) &&
                        hasKnowledgeBaseEnabled(agentConfig))
            );
    }

    const cleaned: string[] = [];
    for (const id of requestedTools) {
        if (typeof id !== 'string') continue;
        if (!registryIds.has(id)) continue;
        if (cleaned.includes(id)) continue;
        cleaned.push(id);
    }

    // Auto-enable knowledge base tool when knowledge base is enabled.
    if (
        registryIds.has(KNOWLEDGE_BASE_TOOL_ID) &&
        !cleaned.includes(KNOWLEDGE_BASE_TOOL_ID) &&
        hasKnowledgeBaseEnabled(agentConfig)
    ) {
        cleaned.push(KNOWLEDGE_BASE_TOOL_ID);
    }

    return cleaned;
}

function hasKnowledgeBaseEnabled(agentConfig?: AgentConfig): boolean {
    return Boolean(agentConfig?.knowledge_base?.enabled);
}

/**
 * Derive runtime RAG configuration from the knowledge base config.
 */
export function deriveRagConfigFromKnowledgeBase(agentConfig?: AgentConfig): {
    lyzr_rag?: AgentConfig['lyzr_rag'];
    agentic_rag?: AgentConfig['agentic_rag'];
} {
    const kb = agentConfig?.knowledge_base;
    if (!kb?.enabled) return {};

    return {
        ...(kb.lyzr_rag ? { lyzr_rag: kb.lyzr_rag } : {}),
        agentic_rag: kb.agentic_rag ?? [],
    };
}

/**
 * Apply tool normalization and KB-derived RAG fields to produce a dispatch-ready config.
 */
export function finalizeAgentConfig(agentConfig: AgentConfig): AgentConfig {
    return {
        ...agentConfig,
        tools: normalizeTools(agentConfig),
        ...deriveRagConfigFromKnowledgeBase(agentConfig),
    };
}
