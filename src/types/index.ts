/**
 * Shared type definitions
 */

export type AvatarProvider = 'anam';

export interface ManagedAgent {
	id: string;
	name: string;
	/**
	 * Human-readable description of what this specialized agent should be used for.
	 *
	 * Note: kept in snake_case to match the upstream config contract.
	 */
	usage_description: string;
}

export interface AnamAvatarConfig {
	/**
	 * Persona display name in Anam.
	 */
	name?: string;
	/**
	 * Anam Avatar ID (from Anam gallery or lab).
	 */
	avatarId?: string;
}

export interface AvatarConfig {
	/**
	 * Enable virtual avatar mode.
	 */
	enabled?: boolean;
	/**
	 * Avatar provider to use.
	 */
	provider?: AvatarProvider;
	/**
	 * Provider-specific config.
	 */
	anam?: AnamAvatarConfig;
	/**
	 * Optional participant name to use for the avatar worker.
	 */
	avatar_participant_name?: string;
}

export interface AgentConfig {
	stt?: string;
	tts?: string;
	llm?: string;
	prompt?: string;
	greeting?: string | null;
	/**
	 * Optional API key used by certain tools (e.g. sub-agent delegation).
	 */
	api_key?: string;
	/**
	 * Optional list of managed specialized sub-agents available to this agent.
	 */
	managed_agents?: ManagedAgent[];
	/**
	 * Array of tool identifiers that should be enabled for this session.
	 * Tool IDs must match those exposed by the backend tool registry and
	 * recognized by the Python agent.
	 */
	tools?: string[];
	/**
	 * Optional identifiers forwarded to external tools/APIs.
	 */
	user_id?: string;
	session_id?: string;
	realtime?: boolean;
	realtime_model?: string;
	realtime_voice?: string;
	vad_enabled?: boolean;
	turn_detection_enabled?: boolean;
	noise_cancellation_enabled?: boolean;
	noise_cancellation_type?: 'auto' | 'telephony' | 'standard' | 'none';
	/**
	 * Optional virtual avatar config. When enabled, the Python agent may start an
	 * avatar worker (e.g. Anam) to publish synced audio+video into the room.
	 */
	avatar?: AvatarConfig;
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
