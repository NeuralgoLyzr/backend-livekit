/**
 * Shared type definitions
 */

export interface AgentConfig {
  stt?: string;
  tts?: string;
  llm?: string;
  prompt?: string;
  greeting?: string | null;
  realtime?: boolean;
  realtime_model?: string;
  realtime_voice?: string;
  vad_enabled?: boolean;
  turn_detection_enabled?: boolean;
  noise_cancellation_enabled?: boolean;
  noise_cancellation_type?: 'auto' | 'telephony' | 'standard' | 'none';
}

export interface SessionData {
  userIdentity: string;
  agentConfig?: AgentConfig;
  createdAt: string;
}
