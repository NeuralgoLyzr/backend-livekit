/**
 * Strongly-typed Zod schemas for LiveKit session reports and conversation history.
 *
 * Derived from the LiveKit Agents SDK:
 * - `ctx.make_session_report().to_dict()` → SessionReport
 * - `session.history`                     → ChatHistory
 *
 * Item types: message, agent_handoff, function_call, function_call_output
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Metrics (per-item, shape varies by role/type)
// ---------------------------------------------------------------------------

export const ConversationItemMetricsSchema = z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Provider-specific timing/latency metrics attached to conversation items.');

// ---------------------------------------------------------------------------
// Conversation items (discriminated union on `type`)
// ---------------------------------------------------------------------------

const BaseItemFields = {
    id: z.string(),
    created_at: z.number(),
    extra: z.record(z.string(), z.unknown()).optional(),
};

export const MessageItemSchema = z.object({
    ...BaseItemFields,
    type: z.literal('message'),
    role: z.enum(['developer', 'system', 'user', 'assistant']),
    content: z.array(z.union([z.string(), z.record(z.string(), z.unknown())])),
    interrupted: z.boolean().optional(),
    transcript_confidence: z.number().nullable().optional(),
    metrics: ConversationItemMetricsSchema,
    hash: z.unknown().optional(),
});
export type MessageItem = z.infer<typeof MessageItemSchema>;

export const AgentHandoffItemSchema = z.object({
    ...BaseItemFields,
    type: z.literal('agent_handoff'),
    new_agent_id: z.string(),
    old_agent_id: z.string().nullable().optional(),
});
export type AgentHandoffItem = z.infer<typeof AgentHandoffItemSchema>;

export const FunctionCallItemSchema = z.object({
    ...BaseItemFields,
    type: z.literal('function_call'),
    name: z.string(),
    call_id: z.string().optional(),
    arguments: z.string().optional(),
    group_id: z.string().nullable().optional(),
});
export type FunctionCallItem = z.infer<typeof FunctionCallItemSchema>;

export const FunctionCallOutputItemSchema = z.object({
    ...BaseItemFields,
    type: z.literal('function_call_output'),
    name: z.string().optional(),
    call_id: z.string().optional(),
    output: z.string().optional(),
    is_error: z.boolean().optional(),
});
export type FunctionCallOutputItem = z.infer<typeof FunctionCallOutputItemSchema>;

const KnownConversationItemSchema = z.discriminatedUnion('type', [
    MessageItemSchema,
    AgentHandoffItemSchema,
    FunctionCallItemSchema,
    FunctionCallOutputItemSchema,
]);

export const ConversationItemSchema = z.union([
    KnownConversationItemSchema,
    z.object({ type: z.string(), id: z.string(), created_at: z.number() }).passthrough(),
]);
export type ConversationItem = z.infer<typeof ConversationItemSchema>;

// ---------------------------------------------------------------------------
// Chat history (session.history)
// ---------------------------------------------------------------------------

export const ChatHistorySchema = z.object({
    items: z.array(ConversationItemSchema),
});
export type ChatHistory = z.infer<typeof ChatHistorySchema>;

// ---------------------------------------------------------------------------
// Session events (discriminated union on `type`)
// ---------------------------------------------------------------------------

const BaseEventFields = {
    created_at: z.number(),
};

export const AgentStateChangedEventSchema = z.object({
    ...BaseEventFields,
    type: z.literal('agent_state_changed'),
    old_state: z.string(),
    new_state: z.string(),
});

export const UserStateChangedEventSchema = z.object({
    ...BaseEventFields,
    type: z.literal('user_state_changed'),
    old_state: z.string(),
    new_state: z.string(),
});

export const SpeechCreatedEventSchema = z.object({
    ...BaseEventFields,
    type: z.literal('speech_created'),
    user_initiated: z.boolean().optional(),
    source: z.string().optional(),
});

export const ConversationItemAddedEventSchema = z.object({
    ...BaseEventFields,
    type: z.literal('conversation_item_added'),
    item: z.record(z.string(), z.unknown()),
});

export const UserInputTranscribedEventSchema = z.object({
    ...BaseEventFields,
    type: z.literal('user_input_transcribed'),
    transcript: z.string(),
    is_final: z.boolean(),
    speaker_id: z.string().nullable().optional(),
    language: z.string().optional(),
});

export const CloseEventSchema = z.object({
    ...BaseEventFields,
    type: z.literal('close'),
    error: z.unknown().nullable().optional(),
    reason: z.string().nullable().optional(),
});

const KnownSessionEventSchema = z.discriminatedUnion('type', [
    AgentStateChangedEventSchema,
    UserStateChangedEventSchema,
    SpeechCreatedEventSchema,
    ConversationItemAddedEventSchema,
    UserInputTranscribedEventSchema,
    CloseEventSchema,
]);

export const SessionEventSchema = z.union([
    KnownSessionEventSchema,
    z.object({ type: z.string(), created_at: z.number() }).passthrough(),
]);
export type SessionEvent = z.infer<typeof SessionEventSchema>;

// ---------------------------------------------------------------------------
// Session options (agent config snapshot at runtime)
// ---------------------------------------------------------------------------

export const SessionReportOptionsSchema = z
    .object({
        allow_interruptions: z.boolean().optional(),
        discard_audio_if_uninterruptible: z.boolean().optional(),
        min_interruption_duration: z.number().optional(),
        min_interruption_words: z.number().optional(),
        min_endpointing_delay: z.number().optional(),
        max_endpointing_delay: z.number().optional(),
        max_tool_steps: z.number().optional(),
        user_away_timeout: z.number().optional(),
        min_consecutive_speech_delay: z.number().optional(),
        preemptive_generation: z.boolean().optional(),
    })
    .passthrough();
export type SessionReportOptions = z.infer<typeof SessionReportOptionsSchema>;

// ---------------------------------------------------------------------------
// Session report (top-level)
// ---------------------------------------------------------------------------

export const SessionReportSchema = z
    .object({
        job_id: z.string(),
        room_id: z.string(),
        room: z.string(),
        events: z.array(SessionEventSchema),
        audio_recording_path: z.string().nullable().optional(),
        audio_recording_started_at: z.number().nullable().optional(),
        options: SessionReportOptionsSchema.optional(),
        chat_history: ChatHistorySchema.optional(),
        timestamp: z.number(),
    })
    .passthrough();
export type SessionReport = z.infer<typeof SessionReportSchema>;
