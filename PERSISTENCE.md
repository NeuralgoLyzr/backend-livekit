## Persistence layer (MongoDB + Mongoose) — Handoff

This document explains how **agent persistence** works in `backend-livekit`, how the **frontend** uses it, and how to extend it safely (e.g. add new fields).

---

## What “agent persistence” means in this repo

### Persisted

- **Saved agent configurations** (name/description + `config` JSON blob).
- Stored in MongoDB via a Mongoose model `Agent`.

### Not persisted (yet)

- WebRTC session lifecycle (stored in-memory today).
- Telephony call state (stored in-memory today).
- Any Python agent runtime state (handled by the Python worker; this backend only passes metadata/config).

---

## How agents are stored (in `lyzr-agent`)

`lyzr-agent/` (Python) uses **direct MongoDB collections** with small “manager” classes (not Prisma).

- **Agent documents**
  - Manager: `lyzr-agent/lyzr_agent/database/agent_data_manager.py`
  - Key: `agent_id`
  - Operations: `find_one({agent_id})`, `update_one({agent_id}, {$set: data}, upsert=True)`

- **Sessions + messages**
  - Manager: `lyzr-agent/lyzr_agent/database/session_data_manager.py`
  - Collection: `sessions` (also writes/reads `messages` via `MessageDataManager`)
  - Pattern: `get_session()` creates the session doc if missing; `save_messages()` appends messages with dedupe for assistant role.

- **Per-user/session state**
  - Manager: `lyzr-agent/lyzr_agent/database/states_manager.py`
  - Collection: `states`
  - Unique index: `(user_id, session_id)`
  - Stores `current_agent_id` and arbitrary `data.*` keys via update helpers.

This is separate from `backend-livekit` and is **not currently wired** into `python-agent-livekit` (which reads config from LiveKit job metadata).

---

## How agents are stored (in `backend-livekit`)

### Data model (MongoDB via Mongoose)

Key idea: the agent “runtime config” is stored as **JSON** in `Agent.config` for Phase 1 simplicity.

Implementation files:

- Model: `backend-livekit/src/models/agentModel.ts`
- Adapter: `backend-livekit/src/adapters/mongoose/mongooseAgentStore.ts`
- Connection bootstrap: `backend-livekit/src/db/mongoose.ts`

### Mongoose configuration

Runtime enforces configuration when persistence is used:

- `backend-livekit/src/db/mongoose.ts` throws **503** if `MONGODB_URI` is missing.

---

## Clean architecture boundaries (ports → adapters → services → routes)

### Port (interface)

- `backend-livekit/src/ports/agentStorePort.ts`
  - Defines the storage boundary: list/get/create/update/delete.

### Adapter (Mongoose/Mongo implementation)

- `backend-livekit/src/adapters/mongoose/mongooseAgentStore.ts`
  - Implements `AgentStorePort` using Mongoose.
  - Soft-delete via `deletedAt`.

### Services

- `backend-livekit/src/services/agentRegistryService.ts`
  - Pure app logic for CRUD (name normalization, defaults).

- `backend-livekit/src/services/agentConfigResolverService.ts`
  - The important “call start” behavior:
    - Load stored agent config by `agentId`
    - Deep-merge **overrides** (`agentConfig`) on top
    - Normalize tools
    - Derive KB/RAG runtime fields

### Routes

- `backend-livekit/src/routes/agents.ts`
  - REST CRUD for persisted agents.

- `backend-livekit/src/routes/session.ts`
  - `POST /session` accepts optional `agentId` + optional `agentConfig`.

---

## Backend routes you should use/implement

### Already implemented (agent persistence + call start)

- **`GET /agents`**: list agents
- **`POST /agents`**: create agent (persist config)
- **`GET /agents/:agentId`**: get agent
- **`PUT /agents/:agentId`**: update agent
- **`DELETE /agents/:agentId`**: soft-delete agent

- **`POST /session`**: start a WebRTC session
  - Body supports:
    - `agentId` (Mongo ObjectId string): load stored config
    - `agentConfig`: merge as overrides

### Likely next (telephony routing) — Phase 2 suggestion

If “agent id to start calls” must include **telephony**, you’ll need a way to resolve an agent for inbound calls:

- Persist a DID mapping (e.g. `toNumber -> agentId`) and update telephony routing to use it.
  - New model suggestion: `TelephonyDidRoute { id, did, agentId, createdAt, updatedAt, deletedAt? }`
  - Update routing in `backend-livekit/src/telephony/routing/`

---

## Frontend wiring (what changed)

The frontend previously saved configs in localStorage; it now uses backend persistence.

Key files:

- `frontend-livekit/lib/backendClient.ts`
  - Typed helper for `/agents` and `/session`.

- `frontend-livekit/hooks/useAgents.ts`
  - Loads agent list from backend and supports create/delete/update.

- `frontend-livekit/app/(app)/page.tsx`
  - Selecting a saved agent sets:
    - `selectedAgentId`
    - `configDraft` = `agent.config`
  - Starting a session passes `agentId` into `VoiceSession`.

- `frontend-livekit/components/voice-session.tsx`
  - Session creation now calls backend with:
    - `{ userIdentity, agentId?, agentConfig }`

---

## Local dev checklist (Phase 1)

### Backend

- Set `MONGODB_URI` to a MongoDB connection string (required for `/agents` + `agentId` resolution).
  - Example: `MONGODB_URI="mongodb://localhost:27017/livekit_dev"`

- Run:

```bash
pnpm -C backend-livekit dev
```

### Frontend

- Set `NEXT_PUBLIC_BACKEND_URL` (defaults to `http://localhost:4000`).
- Run:

```bash
pnpm -C frontend-livekit dev
```

### Manual smoke checks

- Create agent in UI → confirms `POST /agents`
- Refresh UI → confirms `GET /agents`
- Start session with a saved agent → confirms `POST /session` includes `agentId`

---

## How to add new fields (two common cases)

### Case A: Add new fields inside `Agent.config` (recommended, Phase 1 style)

This requires **no DB schema change**.

Checklist:

- Add field to validation/type boundaries:
  - Backend: `backend-livekit/src/types/index.ts` (`AgentConfigSchema`)
  - Frontend: `frontend-livekit/lib/types.ts` (`AgentConfig`)
- Ensure the Python agent understands it via metadata parsing (if needed).
- Done: the `config` JSON blob will store it automatically.

### Case B: Add a new top-level column on `Agent` (e.g. `dispatchTarget`)

Checklist:

- Update the Mongoose schema:
  - `backend-livekit/src/models/agentModel.ts`
- Update adapter mapping:
  - `backend-livekit/src/adapters/mongoose/mongooseAgentStore.ts`
  - `backend-livekit/src/ports/agentStorePort.ts` types
- Update API types/validation:
  - `backend-livekit/src/types/index.ts`
- Update frontend types + client payloads if exposed:
  - `frontend-livekit/lib/types.ts`
  - `frontend-livekit/lib/backendClient.ts`

---

## Troubleshooting

### `/agents` returns 503 “Persistence is not configured”

- Set `MONGODB_URI` (see `.env.example`).

### `agentId must be a valid Mongo ObjectId`

- `agentId` must be a 24-hex Mongo ObjectId string (see `AgentIdSchema` in `backend-livekit/src/types/index.ts`).

### You can create agents but `GET /agents` is empty

- Verify you’re pointing at the same database (`MONGODB_URI`) you wrote into.
- If you’re experimenting with collection names, update the pinned collection name in `backend-livekit/src/models/agentModel.ts`.

