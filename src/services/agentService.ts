/**
 * Agent Service
 * Handles agent dispatch via LiveKit API
 */

import { AgentDispatchClient } from 'livekit-server-sdk';
import { config } from '../config/index.js';
import type { AgentConfig } from '../types/index.js';
import { isDevelopment } from '../lib/env.js';
import { AGENT_DEFAULTS } from './agentDefaults.js';

type BackgroundAudioConfig = NonNullable<AgentConfig['background_audio']>;
type ForwardedBackgroundAudioConfig = {
    ambient?: BackgroundAudioConfig['ambient'];
    thinking?: BackgroundAudioConfig['thinking'];
};

function buildBackgroundAudioConfig(
    backgroundAudio?: AgentConfig['background_audio']
): ForwardedBackgroundAudioConfig | undefined {
    if (!backgroundAudio?.enabled) return undefined;
    return {
        ambient: backgroundAudio.ambient,
        thinking: backgroundAudio.thinking,
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
        stt: agentConfig.stt ?? AGENT_DEFAULTS.stt,
        tts: agentConfig.tts ?? AGENT_DEFAULTS.tts,
        llm: agentConfig.llm ?? AGENT_DEFAULTS.llm,
        prompt: agentConfig.prompt ?? AGENT_DEFAULTS.prompt,
        greeting: agentConfig.greeting ?? AGENT_DEFAULTS.greeting,
        // Optional config for specialized sub-agent delegation tools.
        apiKey: agentConfig.api_key,
        managed_agents: agentConfig.managed_agents,
        user_id: agentConfig.user_id,
        session_id: agentConfig.session_id,
        realtime: agentConfig.realtime ?? AGENT_DEFAULTS.realtime,
        realtime_model: agentConfig.realtime_model ?? AGENT_DEFAULTS.realtime_model,
        realtime_voice: agentConfig.realtime_voice ?? AGENT_DEFAULTS.realtime_voice,
        tools: agentConfig.tools ?? AGENT_DEFAULTS.tools,
        lyzr_rag: agentConfig.lyzr_rag,
        agentic_rag: agentConfig.agentic_rag ?? AGENT_DEFAULTS.agentic_rag,
        vad_enabled: agentConfig.vad_enabled ?? AGENT_DEFAULTS.vad_enabled,
        turn_detection_enabled:
            agentConfig.turn_detection_enabled ?? AGENT_DEFAULTS.turn_detection_enabled,
        noise_cancellation_enabled:
            agentConfig.noise_cancellation_enabled ?? AGENT_DEFAULTS.noise_cancellation_enabled,
        noise_cancellation_type:
            agentConfig.noise_cancellation_type ?? AGENT_DEFAULTS.noise_cancellation_type,
        background_audio,
        avatar,
    };
}

export const agentService = {
    /**
     * Dispatch an agent to a room with custom configuration
     * @param roomName - Room name for the agent to join
     * @param agentConfig - Configuration object (STT, TTS, prompt, etc.)
     */
    async dispatchAgent(roomName: string, agentConfig: AgentConfig = {}): Promise<void> {
        const client = new AgentDispatchClient(
            config.livekit.url,
            config.livekit.apiKey,
            config.livekit.apiSecret
        );

        const metadataObj = buildMetadataObject(agentConfig);
        const metadata = JSON.stringify(metadataObj);

        if (isDevelopment()) {
            console.log('[agentService] Dispatch metadata:', JSON.stringify(metadataObj, null, 2));
        } else {
            const avatarEnabled = Boolean(
                (metadataObj as { avatar?: { enabled?: boolean } }).avatar?.enabled
            );

            console.log(
                `[agentService] Dispatching agent to "${roomName}" (avatar: ${avatarEnabled ? 'on' : 'off'})`
            );
        }

        try {
            const dispatch = await client.createDispatch(roomName, config.agent.name, { metadata });

            console.log(
                `✓ Agent dispatched to room "${roomName}" (ID: ${dispatch?.id ?? 'unknown'})`
            );
        } catch (error) {
            console.error(`✗ Failed to dispatch agent to room "${roomName}":`, error);
            throw error;
        }
    },
};
