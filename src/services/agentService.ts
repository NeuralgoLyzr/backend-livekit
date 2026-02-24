import type { AgentDispatchClient } from 'livekit-server-sdk';
import type { AgentConfig } from '../types/index.js';
import { isDevelopment } from '../lib/env.js';
import { AGENT_DEFAULTS } from '../CONSTS.js';
import { summarizeAgentConfigForLog } from '../lib/agentConfigSummary.js';
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

type AvatarConfigInput = NonNullable<AgentConfig['avatar']>;
type ForwardedAvatarConfig = {
    enabled: boolean;
    provider: AvatarConfigInput['provider'];
    avatar_participant_name: AvatarConfigInput['avatar_participant_name'];
    anam?: AvatarConfigInput['anam'];
    hedra?: AvatarConfigInput['hedra'];
    lemonslice?: AvatarConfigInput['lemonslice'];
    liveavatar?: AvatarConfigInput['liveavatar'];
    tavus?: AvatarConfigInput['tavus'];
    bithuman?: AvatarConfigInput['bithuman'];
    simli?: AvatarConfigInput['simli'];
    bey?: AvatarConfigInput['bey'];
    avatario?: AvatarConfigInput['avatario'];
};

function buildAvatarConfig(avatar?: AgentConfig['avatar']): ForwardedAvatarConfig | undefined {
    if (!avatar) return undefined;

    const provider = avatar.provider ?? 'anam';
    const base = {
        enabled: avatar.enabled ?? false,
        provider,
        avatar_participant_name: avatar.avatar_participant_name,
    };

    switch (provider) {
        case 'anam': {
            const anam = avatar.anam
                ? {
                      name: avatar.anam.name,
                      avatarId: avatar.anam.avatarId,
                  }
                : undefined;
            return { ...base, anam };
        }
        case 'hedra':
            return { ...base, hedra: avatar.hedra };
        case 'lemonslice':
            return { ...base, lemonslice: avatar.lemonslice };
        case 'liveavatar':
            return { ...base, liveavatar: avatar.liveavatar };
        case 'tavus':
            return { ...base, tavus: avatar.tavus };
        case 'bithuman':
            return { ...base, bithuman: avatar.bithuman };
        case 'simli':
            return { ...base, simli: avatar.simli };
        case 'bey':
            return { ...base, bey: avatar.bey };
        case 'avatario':
            return { ...base, avatario: avatar.avatario };
        default:
            return base;
    }
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
        conversation_start: agentConfig.conversation_start ?? AGENT_DEFAULTS.conversation_start,
        agent_name: agentConfig.agent_name,
        agent_description: agentConfig.agent_description,
        apiKey: agentConfig.api_key,
        agentId: agentConfig.agent_id,
        managed_agents: agentConfig.managed_agents?.enabled
            ? agentConfig.managed_agents
            : undefined,
        user_id: agentConfig.user_id,
        session_id: agentConfig.session_id,
        tools: agentConfig.tools ?? AGENT_DEFAULTS.tools,
        lyzr_tools: agentConfig.lyzr_tools,
        lyzr_rag: agentConfig.lyzr_rag,
        agentic_rag: agentConfig.agentic_rag ?? AGENT_DEFAULTS.agentic_rag,
        vad_enabled: agentConfig.vad_enabled ?? AGENT_DEFAULTS.vad_enabled,
        preemptive_generation: agentConfig.preemptive_generation ?? false,
        pronunciation_correction: agentConfig.pronunciation_correction ?? false,
        pronunciation_rules: agentConfig.pronunciation_rules,
        audio_recording_enabled: agentConfig.audio_recording_enabled ?? false,
        background_audio,
        avatar,
    };
}

export interface AgentServiceDeps {
    client: AgentDispatchClient;
    agentName: string;
}

export function createAgentService(deps: AgentServiceDeps) {
    return {
        async dispatchAgent(roomName: string, agentConfig: AgentConfig = {}): Promise<void> {
            const start = Date.now();

            const metadataObj = buildMetadataObject(agentConfig);
            const metadata = JSON.stringify(metadataObj);

            if (isDevelopment()) {
                logger.debug(
                    {
                        event: 'livekit_agent_dispatch_attempt',
                        roomName,
                        agentName: deps.agentName,
                        userId: agentConfig.user_id,
                        sessionId: agentConfig.session_id,
                        agentConfig: summarizeAgentConfigForLog(agentConfig),
                    },
                    'Dispatching agent (dev)'
                );
            }

            try {
                const dispatch = await deps.client.createDispatch(roomName, deps.agentName, {
                    metadata,
                });

                logger.info(
                    {
                        event: 'livekit_agent_dispatch',
                        roomName,
                        agentName: deps.agentName,
                        userId: agentConfig.user_id,
                        sessionId: agentConfig.session_id,
                        dispatchId: dispatch?.id ?? 'unknown',
                        durationMs: Date.now() - start,
                        outcome: 'success',
                        agentConfig: summarizeAgentConfigForLog(agentConfig),
                    },
                    'Dispatched agent to room'
                );
            } catch (error) {
                logger.error(
                    {
                        event: 'livekit_agent_dispatch',
                        roomName,
                        agentName: deps.agentName,
                        userId: agentConfig.user_id,
                        sessionId: agentConfig.session_id,
                        durationMs: Date.now() - start,
                        outcome: 'error',
                        agentConfig: summarizeAgentConfigForLog(agentConfig),
                        err: error,
                    },
                    'Failed to dispatch agent to room'
                );
                throw error;
            }
        },
    };
}

export type AgentService = ReturnType<typeof createAgentService>;
