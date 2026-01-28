/**
 * Shared type definitions using Zod schemas
 */

import { z } from 'zod';

// Validation constants
const MAX_IDENTITY_LENGTH = 128;
const MAX_ROOM_NAME_LENGTH = 128;
const VALID_IDENTIFIER_REGEX = /^[\w-]+$/;

export const AvatarProviderSchema = z.literal('anam');
export type AvatarProvider = z.infer<typeof AvatarProviderSchema>;

export const ManagedAgentSchema = z.object({
	id: z.string(),
	name: z.string(),
	/**
	 * Human-readable description of what this specialized agent should be used for.
	 *
	 * Note: kept in snake_case to match the upstream config contract.
	 */
	usage_description: z.string(),
});
export type ManagedAgent = z.infer<typeof ManagedAgentSchema>;

export const AnamAvatarConfigSchema = z.object({
	/**
	 * Persona display name in Anam.
	 */
	name: z.string().optional(),
	/**
	 * Anam Avatar ID (from Anam gallery or lab).
	 */
	avatarId: z.string().optional(),
});
export type AnamAvatarConfig = z.infer<typeof AnamAvatarConfigSchema>;

export const AvatarConfigSchema = z
	.object({
		/**
		 * Enable virtual avatar mode.
		 */
		enabled: z.boolean().optional(),
		/**
		 * Avatar provider to use.
		 */
		provider: AvatarProviderSchema.optional(),
		/**
		 * Provider-specific config.
		 */
		anam: AnamAvatarConfigSchema.optional(),
		/**
		 * Optional participant name to use for the avatar worker.
		 */
		avatar_participant_name: z.string().optional(),
	})
	.superRefine((data, ctx) => {
		if (data.enabled) {
			const provider = data.provider ?? 'anam';
			if (provider !== 'anam') {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `Unsupported avatar provider: ${provider}`,
					path: ['provider'],
				});
			}
			const avatarId = data.anam?.avatarId;
			if (!avatarId || avatarId.trim().length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'avatar.anam.avatarId is required when avatar.enabled is true',
					path: ['anam', 'avatarId'],
				});
			}
		}
	});
export type AvatarConfig = z.infer<typeof AvatarConfigSchema>;

export const LyzrRagParamsSchema = z
	.object({
		top_k: z.number().optional(),
		retrieval_type: z.string().optional(),
		score_threshold: z.number().optional(),
	})
	.partial();

export const LyzrRagSchema = z.object({
	base_url: z.string(),
	rag_id: z.string(),
	rag_name: z.string().optional(),
	params: LyzrRagParamsSchema.optional(),
});

export const AgenticRagEntrySchema = z.object({
	rag_id: z.string(),
	top_k: z.number(),
	retrieval_type: z.string(),
	score_threshold: z.number(),
});

export const KnowledgeBaseConfigSchema = z.object({
	/**
	 * Master enable flag for knowledge base (RAG) features.
	 */
	enabled: z.boolean().optional(),
	/**
	 * Lyzr RAG config. When enabled, the backend may forward this to the agent as `lyzr_rag`.
	 */
	lyzr_rag: LyzrRagSchema.optional(),
	/**
	 * Agentic RAG skeleton (unused for now, but kept for compatibility).
	 * When enabled, the backend may forward this to the agent as `agentic_rag`.
	 */
	agentic_rag: z.array(AgenticRagEntrySchema).optional(),
});
export type KnowledgeBaseConfig = z.infer<typeof KnowledgeBaseConfigSchema>;

const ThinkingSoundSourceSchema = z.object({
	source: z.string(),
	volume: z.number().min(0).max(1).optional(),
	probability: z.number().min(0).max(1).optional(),
});

const BackgroundAudioSchema = z.object({
	/**
	 * Master enable flag for background audio publishing.
	 * (The Python agent uses `ambient.enabled` / `thinking.enabled`; this flag is used for UX.)
	 */
	enabled: z.boolean().optional(),
	ambient: z
		.object({
			enabled: z.boolean().optional(),
			source: z.string().optional(),
			volume: z.number().min(0).max(1).optional(),
		})
		.optional(),
	/**
	 * Tool-call sound effects (looped while a tool is executing).
	 */
	tool_call: z
		.object({
			enabled: z.boolean().optional(),
			sources: z.array(ThinkingSoundSourceSchema).optional(),
		})
		.optional(),
	/**
	 * Turn-taking sound effects (looped while agent state is "thinking").
	 */
	turn_taking: z
		.object({
			enabled: z.boolean().optional(),
			sources: z.array(ThinkingSoundSourceSchema).optional(),
		})
		.optional(),
});

export const AgentConfigSchema = z.object({
	/**
	 * Logged only (not used for agent runtime).
	 */
	agent_name: z.string().optional(),
	/**
	 * Logged only (not used for agent runtime).
	 */
	agent_description: z.string().optional(),
	/**
	 * Engine configuration. This replaces top-level `stt`/`tts`/`llm` + `realtime*`.
	 *
	 * Note: optional to allow partial updates; backend applies defaults when omitted.
	 */
	engine: z
		.discriminatedUnion('kind', [
			z.object({
				kind: z.literal('pipeline'),
				stt: z.string(),
				llm: z.string(),
				tts: z.string(),
				/**
				 * Optional voice id override for pipeline TTS (implementation-specific).
				 */
				voice_id: z.string().optional(),
			}),
			z.object({
				kind: z.literal('realtime'),
				/**
				 * Realtime model identifier.
				 */
				llm: z.string(),
				/**
				 * Optional realtime voice preset.
				 */
				voice: z.string().optional(),
			}),
		])
		.optional(),
	/**
	 * System prompt / instructions for the agent.
	 */
	prompt: z.string().optional(),
	/**
	 * Configure who initiates the conversation.
	 */
	conversation_start: z
		.object({
			who: z.enum(['human', 'ai']),
			greeting: z.string().optional(),
		})
		.superRefine((data, ctx) => {
			if (data.who === 'ai' && (!data.greeting || data.greeting.trim().length === 0)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'conversation_start.greeting is required when conversation_start.who is "ai"',
					path: ['greeting'],
				});
			}
		})
		.optional(),
	/**
	 * Turn detection mode. (Only two supported options.)
	 */
	turn_detection: z.enum(['english', 'multilingual']).optional(),
	/**
	 * Noise cancellation configuration.
	 */
	noise_cancellation: z
		.object({
			enabled: z.boolean(),
			type: z.enum(['auto', 'telephony', 'standard', 'none']),
		})
		.optional(),
	/**
	 * Optional API key used by certain tools (e.g. sub-agent delegation).
	 */
	api_key: z.string().optional(),
	/**
	 * Optional knowledge base (RAG) config provided by the client.
	 *
	 * Note: the backend normalizes this into runtime fields like `lyzr_rag` / `agentic_rag`
	 * before dispatching the agent.
	 */
	knowledge_base: KnowledgeBaseConfigSchema.optional(),
	/**
	 * Optional RAG config (derived from `knowledge_base` or directly provided).
	 */
	lyzr_rag: LyzrRagSchema.optional(),
	/**
	 * Agentic RAG skeleton (unused for now, but kept for compatibility).
	 */
	agentic_rag: z.array(AgenticRagEntrySchema).optional(),
	/**
	 * Optional list of managed specialized sub-agents available to this agent.
	 */
	managed_agents: z.array(ManagedAgentSchema).optional(),
	/**
	 * Array of tool identifiers that should be enabled for this session.
	 * Tool IDs must match those exposed by the backend tool registry and
	 * recognized by the Python agent.
	 */
	tools: z.array(z.string()).optional(),
	/**
	 * Optional identifiers forwarded to external tools/APIs.
	 */
	user_id: z.string().optional(),
	session_id: z.string().optional(),
	vad_enabled: z.boolean().optional(),
	/**
	 * Optional virtual avatar config. When enabled, the Python agent may start an
	 * avatar worker (e.g. Anam) to publish synced audio+video into the room.
	 */
	avatar: AvatarConfigSchema.optional(),
	/**
	 * Optional background audio config (ambient + thinking SFX).
	 */
	background_audio: BackgroundAudioSchema.optional(),
}).strict();
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const ToolDefinitionSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string(),
});
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export const SessionDataSchema = z.object({
	userIdentity: z.string(),
	agentConfig: AgentConfigSchema.optional(),
	createdAt: z.string(),
});
export type SessionData = z.infer<typeof SessionDataSchema>;

// Request validation schemas
const UserIdentitySchema = z
	.string({ error: 'userIdentity is required and must be a string' })
	.min(1, 'userIdentity cannot be empty')
	.max(MAX_IDENTITY_LENGTH, `userIdentity must be ${MAX_IDENTITY_LENGTH} characters or less`)
	.regex(
		VALID_IDENTIFIER_REGEX,
		'userIdentity can only contain letters, numbers, underscores, and hyphens'
	);

const RoomNameSchema = z
	.string()
	.max(MAX_ROOM_NAME_LENGTH, `roomName must be ${MAX_ROOM_NAME_LENGTH} characters or less`)
	.regex(
		VALID_IDENTIFIER_REGEX,
		'roomName can only contain letters, numbers, underscores, and hyphens'
	)
	.optional()
	.or(z.literal(''));

export const SessionRequestSchema = z.object({
	userIdentity: UserIdentitySchema,
	roomName: RoomNameSchema,
	agentConfig: AgentConfigSchema.optional(),
});
export type SessionRequest = z.infer<typeof SessionRequestSchema>;

export const EndSessionRequestSchema = z.object({
	roomName: z
		.string({ error: 'roomName is required' })
		.min(1, 'roomName is required')
		.max(MAX_ROOM_NAME_LENGTH, `roomName must be ${MAX_ROOM_NAME_LENGTH} characters or less`)
		.regex(
			VALID_IDENTIFIER_REGEX,
			'roomName can only contain letters, numbers, underscores, and hyphens'
		),
});
export type EndSessionRequest = z.infer<typeof EndSessionRequestSchema>;
