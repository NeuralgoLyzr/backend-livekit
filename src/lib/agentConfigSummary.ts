import type { AgentConfig } from '../types/index.js';
import { AGENT_DEFAULTS } from '../CONSTS.js';

export function summarizeAgentConfigForLog(agentConfig: AgentConfig): Record<string, unknown> {
    const engineKind =
        (agentConfig.engine as { kind?: unknown } | undefined)?.kind ??
        (AGENT_DEFAULTS.engine as { kind?: unknown }).kind;

    return {
        engineKind,
        toolsCount: agentConfig.tools?.length ?? AGENT_DEFAULTS.tools.length,
        vadEnabled: agentConfig.vad_enabled ?? AGENT_DEFAULTS.vad_enabled,
        preemptiveGeneration: agentConfig.preemptive_generation ?? false,
        pronunciationCorrection: agentConfig.pronunciation_correction ?? false,
        pronunciationRulesCount: Object.keys(agentConfig.pronunciation_rules ?? {}).length,
        turnDetection: agentConfig.turn_detection ?? AGENT_DEFAULTS.turn_detection,
        avatarEnabled: Boolean(agentConfig.avatar?.enabled),
        backgroundAudioEnabled: Boolean(agentConfig.background_audio?.enabled),
        hasApiKey: Boolean(agentConfig.api_key),
        hasLyzrTools: Boolean(agentConfig.lyzr_tools),
        hasLyzrRag: Boolean(agentConfig.lyzr_rag),
        hasAgenticRag: Boolean(agentConfig.agentic_rag),
    };
}
