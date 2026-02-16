# backend-livekit

Express 5 + TypeScript (ESM) service that manages LiveKit voice-agent sessions: creates rooms, mints tokens, dispatches the Python agent with configuration metadata, persists transcripts, and serves agent CRUD + config catalogs.

---

## Architecture

### Composition Root (`src/composition.ts`)

All services are wired via factory functions (no class instantiation). The composition root creates:
- `InMemorySessionStore` — ephemeral session tracking (survives only as long as the process).
- `MongooseAgentStore` / `MongooseTranscriptStore` — MongoDB-backed persistence (optional; if `MONGODB_URI` is unset, `/agents` returns 503, sessions still work).
- Service factories (`createSessionService`, `createAgentService`, `createTokenService`, etc.) receive their dependencies explicitly.

### Hexagonal Architecture

```
Routes (HTTP) → Services (business logic) → Ports (interfaces) → Adapters (implementations)
```

- **Ports** (`src/ports/`): `AgentStorePort`, `SessionStorePort`, `TranscriptStorePort`.
- **Adapters** (`src/adapters/mongoose/`): Mongoose implementations of the ports.
- **In-memory adapter** (`src/lib/storage.ts`): `InMemorySessionStore` for session tracking.

### Auth

All session/transcript routes require `x-api-key` header. The `apiKeyAuth` middleware calls the Pagos API to resolve `{ orgId, userId, isAdmin }`. This context scopes transcript queries and session ownership.

### Logging

pino + `@axiomhq/pino`. The `requestLogging` middleware emits structured wide-event JSON logs per request.

---

## Source Layout

```
src/
├── index.ts                    # Process entrypoint, boots Express
├── app.ts                      # Middleware, CORS, routing, error handling
├── composition.ts              # DI composition root (wires services + stores)
├── CONSTS.ts                   # Agent defaults, MongoDB fallback, logging constants
│
├── config/
│   ├── index.ts                # Env validation (fails fast on missing vars)
│   ├── tools.ts                # Tool registry, normalizeTools(), finalizeAgentConfig()
│   ├── pipelineOptions.ts      # Pipeline STT/TTS/LLM model catalog
│   ├── realtimeOptions.ts      # Realtime provider options (OpenAI, Gemini, Ultravox, xAI Grok)
│   └── *Voices.ts              # Voice option lists per provider
│
├── routes/
│   ├── session.ts              # POST /session, /session/end, /session/observability
│   ├── health.ts               # GET /health
│   ├── config.ts               # GET /config/tools, /config/realtime-options, /config/pipeline-options
│   ├── agents.ts               # CRUD /agents
│   ├── transcripts.ts          # Transcript API
│   └── telephony.ts            # Webhook + management endpoints
│
├── services/
│   ├── sessionService.ts       # Orchestrates session create/end/cleanup
│   ├── agentService.ts         # Builds metadata object + dispatches to LiveKit agent
│   ├── agentConfigResolverService.ts  # Resolves agentId → saved config from DB
│   ├── agentRegistryService.ts # CRUD ops for saved agents
│   ├── tokenService.ts         # LiveKit JWT generation
│   ├── roomService.ts          # Room deletion via LiveKit SDK
│   ├── transcriptService.ts    # Transcript persistence + querying
│   ├── pagosAuthService.ts     # Resolves x-api-key → orgId/userId
│   └── livekitClients.ts       # LiveKit SDK client instances
│
├── types/
│   ├── index.ts                # Zod schemas: AgentConfigSchema, SessionRequestSchema, etc.
│   └── sessionReport.ts        # Session report/chat history schemas
│
├── lib/
│   ├── httpErrors.ts           # HttpError class + formatErrorResponse
│   ├── asyncHandler.ts         # Express async route wrapper
│   ├── storage.ts              # InMemorySessionStore
│   ├── logger.ts               # pino logger instance
│   ├── agentConfigSummary.ts   # Log-safe config summary
│   ├── zod.ts                  # Zod error formatting
│   ├── env.ts                  # isDevelopment() helper
│   ├── requestContext.ts       # Request context utilities
│   └── crypto/                 # AES encryption for telephony secrets
│
├── middleware/
│   ├── apiKeyAuth.ts           # x-api-key → Pagos auth context
│   └── requestLogging.ts       # Structured wide-event HTTP logging
│
├── models/
│   ├── agentModel.ts           # Mongoose schema for agents
│   ├── transcriptModel.ts      # Mongoose schema for transcripts
│   ├── telephonyBindingModel.ts
│   └── telephonyIntegrationModel.ts
│
├── ports/                      # Interface definitions (hexagonal arch)
│   ├── agentStorePort.ts
│   ├── sessionStorePort.ts
│   └── transcriptStorePort.ts
│
├── adapters/
│   ├── mongoose/               # Mongoose store implementations
│   └── prisma/                 # Legacy/unused
│
├── db/
│   └── mongoose.ts             # Mongoose connection + disconnection
│
└── telephony/
    ├── telephonyModule.ts      # Composition root for telephony subsystem
    ├── core/                   # TelephonySessionService
    ├── adapters/               # LiveKit webhook verifier, agent dispatch, store impls
    ├── http/                   # Telnyx/Twilio HTTP route handlers
    ├── management/             # Telnyx/Twilio onboarding services
    ├── routing/                # Binding-based call routing
    ├── ports/                  # Telephony interface definitions
    └── types.ts                # Telephony-specific types
```

---

## API Reference

### Session

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/session` | `x-api-key` | Create room, mint user token, dispatch agent. Body: `SessionRequestSchema` (`userIdentity` required; optional `roomName`, `sessionId`, `agentId`, `agentConfig`). Returns `{ userToken, roomName, sessionId, livekitUrl, agentDispatched, agentConfig }`. |
| `POST` | `/session/end` | `x-api-key` | Mark session ended. Body: `{ roomName }` or `{ sessionId }`. Does **not** delete the LiveKit room (see [Session Lifecycle](#session-lifecycle)). |
| `POST` | `/session/observability` | None | Receives session report + conversation history from the Python agent. Persists transcript to MongoDB, then deletes room + clears in-memory session store. |

### Config Catalogs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/config/tools` | None | Returns tool registry (tool IDs, names, descriptions). |
| `GET` | `/config/realtime-options` | None | Realtime provider options (OpenAI, Gemini, Ultravox, xAI Grok) with models + voices. |
| `GET` | `/config/pipeline-options` | None | Pipeline STT/TTS/LLM model catalogs. |

### Agents (CRUD)

All require `x-api-key`. Requires `MONGODB_URI` to be set (returns 503 otherwise).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/agents` | List saved agent configs (scoped by orgId). |
| `POST` | `/agents` | Create agent. Body: `{ config: AgentConfigWithName }`. |
| `GET` | `/agents/:agentId` | Get single agent by ID. |
| `PUT` | `/agents/:agentId` | Update agent config. |
| `DELETE` | `/agents/:agentId` | Delete agent. |

### Transcripts

All require `x-api-key`. Scoped by orgId.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/transcripts` | List transcripts. |
| `GET` | `/api/transcripts/:sessionId` | Get transcript by session ID. |
| `GET` | `/api/transcripts/agent/:agentId` | List transcripts for a specific agent. |
| `GET` | `/api/transcripts/agent/:agentId/stats` | Aggregated stats for an agent's transcripts. |

### Telephony

Requires `TELEPHONY_ENABLED=true`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/telephony/livekit-webhook` | LiveKit webhook signature | Webhook receiver for SIP/PSTN calls. |
| `POST` | `/telephony/providers/telnyx/onboard` | `x-api-key` | Telnyx provider onboarding. |
| `POST` | `/telephony/providers/twilio/onboard` | `x-api-key` | Twilio provider onboarding. |
| `GET` | `/telephony/bindings` | `x-api-key` | List phone number → agent bindings. |

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | None | Uptime/status check. |

---

## Metadata Contract (Backend → Python Agent)

The `buildMetadataObject()` function in `src/services/agentService.ts` is an **allowlist**. Only fields explicitly mapped here reach the Python agent via LiveKit `AgentDispatchClient`. Adding a field to the Zod schema alone is **not enough**.

Current allowlist:

```typescript
{
    engine,                    // { kind: 'pipeline' | 'realtime', stt, llm, tts, ... }
    prompt,                    // string
    dynamic_variables,         // Record<string, string>
    dynamic_variable_defaults, // Record<string, string>
    turn_detection,            // 'english' | 'multilingual'
    noise_cancellation,        // { enabled, type }
    conversation_start,        // { who: 'human' | 'ai', greeting? }
    agent_name,                // string (display only)
    agent_description,         // string (display only)
    apiKey,                    // from agentConfig.api_key
    agentId,                   // from agentConfig.agent_id
    managed_agents,            // array of { id, name, usage_description } (only if enabled)
    user_id,                   // string
    session_id,                // string
    tools,                     // string[] of tool IDs
    lyzr_tools,                // array of LyzrToolConfig
    lyzr_rag,                  // { base_url, rag_id, rag_name?, params? }
    agentic_rag,               // array of AgenticRagEntry
    vad_enabled,               // boolean
    preemptive_generation,     // boolean
    pronunciation_correction,  // boolean
    pronunciation_rules,       // Record<string, string>
    background_audio,          // { ambient?, tool_call?, turn_taking? }
    avatar,                    // { enabled, provider, anam?, avatar_participant_name? }
}
```

---

## Session Lifecycle

```
Client                    Backend                       Python Agent
  │                         │                               │
  ├─POST /session──────────►│                               │
  │                         ├─ create room                  │
  │                         ├─ mint token                   │
  │                         ├─ finalizeAgentConfig()        │
  │                         ├─ dispatchAgent() ────────────►│ (metadata JSON)
  │◄────── { userToken } ──┤                               │
  │                         │                               │
  │  ... voice session ...  │                               │
  │                         │                               │
  ├─POST /session/end──────►│                               │
  │                         ├─ mark session ended           │
  │                         │  (room NOT deleted yet)       │
  │                         │                               │
  │                         │◄── POST /session/observability│
  │                         ├─ persist transcript (MongoDB) │
  │                         ├─ delete LiveKit room          │
  │                         ├─ clear in-memory session      │
  │                         │                               │
```

**Key quirk**: `/session/end` does **not** delete the LiveKit room. The room is deleted only after `/session/observability` is received from the Python agent. This is intentional — it preserves the room for the agent's post-call observability hooks (session report, conversation history collection).

---

## Data Flow: Agent Config Resolution

1. Client sends `POST /session` with optional `agentId` and/or `agentConfig`.
2. If `agentId` is provided, `agentConfigResolverService` loads the saved config from MongoDB.
3. Inline `agentConfig` overrides are merged on top of the saved config.
4. `finalizeAgentConfig()` (`src/config/tools.ts`):
   - Validates tool IDs against the tool registry.
   - Auto-enables `search_knowledge_base` tool when `knowledge_base.enabled` is true.
   - Derives `lyzr_rag` / `agentic_rag` from `knowledge_base` if present.
5. `buildMetadataObject()` maps the allowlisted fields into a flat object.
6. `agentService.dispatchAgent()` JSON-stringifies metadata and sends via `AgentDispatchClient`.

---

## Environment Variables

### Required (crash on startup if missing)

| Variable | Description |
|----------|-------------|
| `LIVEKIT_URL` | LiveKit server URL |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `PAGOS_API_URL` | Pagos authentication API base URL |
| `PAGOS_ADMIN_TOKEN` | Pagos admin token for API key validation |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | HTTP listen port |
| `NODE_ENV` | — | `development` / `production` |
| `AGENT_NAME` | `local-test` | Agent name for LiveKit dispatch (must match Python agent's `AGENT_NAME`) |
| `MONGODB_URI` | — | MongoDB connection string. If unset, agent CRUD returns 503; sessions still work. |
| `MONGODB_DATABASE` | — | MongoDB database name |
| `TELEPHONY_ENABLED` | `false` | Enable telephony webhook processing |
| `LIVEKIT_WEBHOOK_API_KEY` | Same as `LIVEKIT_API_KEY` | Key for webhook JWT verification |
| `LIVEKIT_WEBHOOK_API_SECRET` | Same as `LIVEKIT_API_SECRET` | Secret for webhook JWT verification |
| `TELEPHONY_SIP_IDENTITY_PREFIX` | — | SIP identity prefix for telephony routing |
| `TELEPHONY_DISPATCH_ON_ANY_PARTICIPANT_JOIN` | — | Dispatch agent on any participant join (not just SIP) |
| `TELEPHONY_SECRETS_KEY` | — | AES key for encrypting telephony provider secrets |
| `LIVEKIT_SIP_HOST` | — | LiveKit SIP host for telephony management |
| `TELNYX_API_KEY` | — | Telnyx API key for onboarding |

---

## Development Commands

```bash
# Install dependencies
pnpm -C backend-livekit install

# Dev server (watch mode)
pnpm -C backend-livekit dev

# Production build
pnpm -C backend-livekit build

# Lint
pnpm -C backend-livekit lint
pnpm -C backend-livekit lint:fix

# Format
pnpm -C backend-livekit format

# Typecheck (no emit)
pnpm -C backend-livekit exec tsc -p tsconfig.json --noEmit

# Lint a single file
pnpm -C backend-livekit exec eslint src/routes/session.ts
```

---

## Troubleshooting / Common Pitfalls

1. **New config field not reaching Python agent**: You added it to `AgentConfigSchema` but forgot to add it to `buildMetadataObject()` in `src/services/agentService.ts`. That function is an explicit allowlist.

2. **`/agents` returns 503**: `MONGODB_URI` is not set. MongoDB is optional for sessions but required for agent CRUD and transcripts.

3. **Agent not dispatching**: Check that `AGENT_NAME` env var matches the Python agent's `AGENT_NAME` in `src/app/server.py`. Default is `local-test`.

4. **ESM import errors**: All relative imports in `src/` must use `.js` extensions (TypeScript ESM convention). e.g., `import { foo } from './bar.js'`.

5. **Session room not deleted after `/session/end`**: This is intentional. The room is deleted only after the Python agent posts back to `/session/observability`.

6. **Auth failures (401)**: The `x-api-key` header is validated against the Pagos API. Ensure `PAGOS_API_URL` and `PAGOS_ADMIN_TOKEN` are correct.

7. **Telephony routes return 404**: Set `TELEPHONY_ENABLED=true` in env. Management routes also require `TELEPHONY_SECRETS_KEY` and `LIVEKIT_SIP_HOST`.

8. **Tool not available in session**: Tool IDs must exist in the registry (`src/config/tools.ts`). `normalizeTools()` silently drops unknown IDs.

---

## Adding a New Config Field (End-to-End Checklist)

When adding a config field that flows from UI → backend → Python agent:

### 1. Backend (`backend-livekit/`)

- `src/types/index.ts` → Add field to `AgentConfigSchema` (Zod).
- `src/services/agentService.ts` → Add to `buildMetadataObject()` (this is the allowlist).
- `src/services/agentService.ts` → Add to `summarizeAgentConfig()` for dispatch logs.
- `src/CONSTS.ts` → Add default in `AGENT_DEFAULTS` if needed.

### 2. Python agent (`python-agent-livekit/`)

- `src/app/config_models.py` → Add field to `AgentConfig` (with default).
- `src/app/sessions.py` → Pass field to `AgentSession(...)` in both `create_realtime_session` and `create_pipeline_session`.
- `src/app/server.py` → Log it in `log_session_start` extra dict.

### 3. Frontend (`agent-studio-ui/`)

- `src/lib/livekit/types.ts` → Add to `AgentConfig` interface.
- `src/pages/voice-new-create/components/types.ts` → Add to `VoiceNewCreateFormValues`.
- `src/pages/voice-new-create/components/form-defaults.ts` → Set default value.
- `src/pages/voice-new-create/components/features.tsx` → Add feature card + toggle UI.
- `src/pages/voice-new-create/components/live-preview/utils.ts` → Include in `buildAgentConfigInternal`.
- `src/pages/voice-new-create/hooks/useHydrateVoiceNewFormFromAgent.ts` → Hydrate from saved agent.
- `src/pages/voice-new-create/index.tsx` → Add default and hydration in the inline block.
