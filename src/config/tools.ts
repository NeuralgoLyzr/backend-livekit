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
];

const registryIds = new Set(toolRegistry.map((t) => t.id));

/**
 * Ensure the supplied tool IDs are known and deduplicated.
 */
export function normalizeTools(agentConfig?: AgentConfig): string[] {
    const tools = agentConfig?.tools;
    if (!Array.isArray(tools)) {
        return [];
    }

    const cleaned: string[] = [];
    for (const id of tools) {
        if (typeof id !== 'string') continue;
        if (!registryIds.has(id)) continue;
        if (cleaned.includes(id)) continue;
        cleaned.push(id);
    }
    return cleaned;
}
