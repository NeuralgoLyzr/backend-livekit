/**
 * Agent Service
 * Handles agent dispatch via LiveKit API
 */

import { AgentDispatchClient } from 'livekit-server-sdk';
import { config } from '../config/index.js';
import type { AgentConfig } from '../types/index.js';

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

    // Build metadata with agent configuration - matching agent schema
    const metadataObj = {
      stt: agentConfig?.stt ?? 'assemblyai/universal-streaming:en',
      tts: agentConfig?.tts ?? 'cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
      llm: agentConfig?.llm ?? 'openai/gpt-4o-mini',
      prompt: agentConfig?.prompt ?? 'You are a helpful voice AI assistant. Be concise and friendly.',
      greeting: agentConfig?.greeting ?? null,
      realtime: agentConfig?.realtime ?? false,
      realtime_model: agentConfig?.realtime_model ?? 'gpt-4o-realtime-preview',
      realtime_voice: agentConfig?.realtime_voice ?? 'sage',
      tools: agentConfig?.tools ?? [],
      vad_enabled: agentConfig?.vad_enabled ?? true,
      turn_detection_enabled: agentConfig?.turn_detection_enabled ?? true,
      noise_cancellation_enabled: agentConfig?.noise_cancellation_enabled ?? true,
      noise_cancellation_type: agentConfig?.noise_cancellation_type ?? 'auto',
      avatar: agentConfig?.avatar
        ? {
            enabled: agentConfig.avatar.enabled ?? false,
            provider: agentConfig.avatar.provider ?? 'anam',
            anam: agentConfig.avatar.anam
              ? {
                  name: agentConfig.avatar.anam.name,
                  avatarId: agentConfig.avatar.anam.avatarId,
                }
              : undefined,
            avatar_participant_name: agentConfig.avatar.avatar_participant_name,
          }
        : undefined,
    };
    const metadata = JSON.stringify(metadataObj);

    // Debug logging for avatar config
    console.log('[agentService] Dispatch metadata:', JSON.stringify(metadataObj, null, 2));
    if (metadataObj.avatar) {
      console.log('[agentService] Avatar config enabled:', metadataObj.avatar.enabled);
      console.log('[agentService] Avatar provider:', metadataObj.avatar.provider);
      console.log('[agentService] Avatar anam config:', metadataObj.avatar.anam);
    } else {
      console.log('[agentService] No avatar config in request');
    }

    try {
      const dispatch = await client.createDispatch(
        roomName,
        config.agent.name,
        { metadata }
      );

      console.log(`✓ Agent dispatched to room "${roomName}" (ID: ${dispatch?.id ?? 'unknown'})`);
    } catch (error) {
      console.error(`✗ Failed to dispatch agent to room "${roomName}":`, error);
      throw error;
    }
  },
};
