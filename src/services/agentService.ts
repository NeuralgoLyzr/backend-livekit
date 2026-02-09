/**
 * Agent Service
 * Handles agent dispatch via LiveKit API
 */

import { AgentDispatchClient } from 'livekit-server-sdk';
import { config } from '../config/index.js';
import type { AgentConfig } from '../types/index.js';
import { isDevelopment } from '../lib/env.js';
import { AGENT_DEFAULTS } from '../CONSTS.js';
import { logger } from '../lib/logger.js';

type BackgroundAudioConfig = NonNullable<AgentConfig['background_audio']>;
type ForwardedBackgroundAudioConfig = {
    ambient?: BackgroundAudioConfig['ambient'];
    tool_call?: BackgroundAudioConfig['tool_call'];
    turn_taking?: BackgroundAudioConfig['turn_taking'];
};

function buildBackgroundAudioConfig(
    backgroundAudio?: AgentConfig['background_audio']
): ForwardedBackgroundAudioConfig | undefined {
    if (!backgroundAudio?.enabled) return undefined;
    return {
        ambient: backgroundAudio.ambient,
        tool_call: backgroundAudio.tool_call,
        turn_taking: backgroundAudio.turn_taking,
    };
}

type AvatarConfig = NonNullable<AgentConfig['avatar']>;
type ForwardedAvatarConfig = {
    enabled: boolean;
    provider: AvatarConfig['provider'];
    anam: AvatarConfig['anam'];
    avatar_participant_name: AvatarConfig['avatar_participant_name'];
};

function buildAvatarConfig(avatar?: AgentConfig['avatar']): ForwardedAvatarConfig | undefined {
    if (!avatar) return undefined;

    const anam = avatar.anam
        ? {
            name: avatar.anam.name,
            avatarId: avatar.anam.avatarId,
        }
        : undefined;

    return {
        enabled: avatar.enabled ?? false,
        provider: avatar.provider ?? 'anam',
        anam,
        avatar_participant_name: avatar.avatar_participant_name,
    };
}

function buildMetadataObject(agentConfig: AgentConfig): Record<string, unknown> {
    const background_audio = buildBackgroundAudioConfig(agentConfig.background_audio);
    const avatar = buildAvatarConfig(agentConfig.avatar);

    return {
        engine: agentConfig.engine ?? AGENT_DEFAULTS.engine,
        prompt: agentConfig.prompt ?? AGENT_DEFAULTS.prompt,
        dynamic_variables: agentConfig.dynamic_variables,
        dynamic_variable_defaults: agentConfig.dynamic_variable_defaults,
        turn_detection: agentConfig.turn_detection ?? AGENT_DEFAULTS.turn_detection,
        noise_cancellation: agentConfig.noise_cancellation ?? AGENT_DEFAULTS.noise_cancellation,
        conversation_start:
            agentConfig.conversation_start ?? AGENT_DEFAULTS.conversation_start,
        // Logged only (safe to forward; Python may ignore).
        agent_name: agentConfig.agent_name,
        agent_description: agentConfig.agent_description,
        // Optional config for specialized sub-agent delegation tools.
        apiKey: agentConfig.api_key,
        // Optional correlation id (not required for tool execution when `lyzr_tools` are provided).
        agentId: agentConfig.agent_id,
        managed_agents: agentConfig.managed_agents?.enabled
            ? agentConfig.managed_agents.agents
            : undefined,
        user_id: agentConfig.user_id,
        session_id: agentConfig.session_id,
        tools: agentConfig.tools ?? AGENT_DEFAULTS.tools,
        // Remote tool configs (tools v2): used by the Python agent to register callable actions.
        lyzr_tools: agentConfig.lyzr_tools,
        lyzr_rag: agentConfig.lyzr_rag,
        agentic_rag: agentConfig.agentic_rag ?? AGENT_DEFAULTS.agentic_rag,
        vad_enabled: agentConfig.vad_enabled ?? AGENT_DEFAULTS.vad_enabled,
        preemptive_generation: agentConfig.preemptive_generation ?? false,
        background_audio,
        avatar,
    };
}

function summarizeAgentConfig(agentConfig: AgentConfig): Record<string, unknown> {
    const engineKind =
        (agentConfig.engine as { kind?: unknown } | undefined)?.kind ??
        (AGENT_DEFAULTS.engine as { kind?: unknown }).kind;

    const avatarEnabled = Boolean(agentConfig.avatar?.enabled);
    const backgroundAudioEnabled = Boolean(agentConfig.background_audio?.enabled);

    return {
        engineKind,
        toolsCount: agentConfig.tools?.length ?? AGENT_DEFAULTS.tools.length,
        vadEnabled: agentConfig.vad_enabled ?? AGENT_DEFAULTS.vad_enabled,
        preemptiveGeneration: agentConfig.preemptive_generation ?? false,
        turnDetection: agentConfig.turn_detection ?? AGENT_DEFAULTS.turn_detection,
        avatarEnabled,
        backgroundAudioEnabled,
        hasApiKey: Boolean(agentConfig.api_key),
        hasLyzrTools: Boolean(agentConfig.lyzr_tools),
        hasLyzrRag: Boolean(agentConfig.lyzr_rag),
        hasAgenticRag: Boolean(agentConfig.agentic_rag),
    };
}

export const agentService = {
    /**
     * Dispatch an agent to a room with custom configuration
     * @param roomName - Room name for the agent to join
     * @param agentConfig - Configuration object (STT, TTS, prompt, etc.)
     */
    async dispatchAgent(roomName: string, agentConfig: AgentConfig = {}): Promise<void> {
        const start = Date.now();
        const client = new AgentDispatchClient(
            config.livekit.url,
            config.livekit.apiKey,
            config.livekit.apiSecret
        );

        const metadataObj = buildMetadataObject(agentConfig);
        const metadata = JSON.stringify(metadataObj);

        // Dev-only: keep a lightweight marker, but avoid dumping raw metadata (may include secrets/PII).
        if (isDevelopment()) {
            logger.debug(
                {
                    event: 'livekit_agent_dispatch_attempt',
                    roomName,
                    agentName: config.agent.name,
                    userId: agentConfig.user_id,
                    sessionId: agentConfig.session_id,
                    agentConfig: summarizeAgentConfig(agentConfig),
                },
                'Dispatching agent (dev)'
            );
        }

        try {
            const dispatch = await client.createDispatch(roomName, config.agent.name, { metadata });

            logger.info(
                {
                    event: 'livekit_agent_dispatch',
                    roomName,
                    agentName: config.agent.name,
                    userId: agentConfig.user_id,
                    sessionId: agentConfig.session_id,
                    dispatchId: dispatch?.id ?? 'unknown',
                    durationMs: Date.now() - start,
                    outcome: 'success',
                    agentConfig: summarizeAgentConfig(agentConfig),
                },
                'Dispatched agent to room'
            );
        } catch (error) {
            logger.error(
                {
                    event: 'livekit_agent_dispatch',
                    roomName,
                    agentName: config.agent.name,
                    userId: agentConfig.user_id,
                    sessionId: agentConfig.session_id,
                    durationMs: Date.now() - start,
                    outcome: 'error',
                    agentConfig: summarizeAgentConfig(agentConfig),
                    err: error,
                },
                'Failed to dispatch agent to room'
            );
            throw error;
        }
    },
};
