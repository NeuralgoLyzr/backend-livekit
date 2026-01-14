/**
 * Shared type definitions
 */

export interface AgentConfig {
  stt?: string;
  tts?: string;
  llm?: string;
  prompt?: string;
  greeting?: string | null;
  /**
   * Array of tool identifiers that should be enabled for this session.
   * Tool IDs must match those exposed by the backend tool registry and
   * recognized by the Python agent.
   */
  tools?: string[];
  realtime?: boolean;
  realtime_model?: string;
  realtime_voice?: string;
  vad_enabled?: boolean;
  turn_detection_enabled?: boolean;
  noise_cancellation_enabled?: boolean;
  noise_cancellation_type?: 'auto' | 'telephony' | 'standard' | 'none';
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
}

export interface SessionData {
  userIdentity: string;
  agentConfig?: AgentConfig;
  createdAt: string;
}
