# LiveKit Backend API (`backend-livekit`)

Express + TypeScript service that issues LiveKit access tokens, dispatches a LiveKit agent (the Python worker in `../python-agent-livekit`), and stores lightweight session metadata for the frontend voice agent builder.

## What lives here (for API tools)

- `src/index.ts` – process entrypoint that boots Express.
- `src/app.ts` – middleware, CORS, routing, and error handling.
- `src/routes/session.ts` – POST `/session` (create + dispatch) and POST `/session/end`.
- `src/routes/health.ts` – GET `/health`.
- `src/services/tokenService.ts` – LiveKit JWT generation.
- `src/services/agentService.ts` – dispatches to the agent name in `config.agent.name`.
- `src/config/index.ts` – required env validation and defaults.
- `src/lib/storage.ts` – in-memory session cache.
- `src/types` – request/metadata types shared across the service.

## Quick start (pnpm)

Prereqs: Node 20+, pnpm 9+, LiveKit Cloud project with an agent created.

```bash
cd backend-livekit
pnpm install
pnpm dev   # tsx watch on src/index.ts (default port 4000)
```

Production:

```bash
pnpm build
pnpm start   # runs dist/index.js
```

Create `.env` (no template checked in):

```env
LIVEKIT_URL=wss://<your-project>.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
PORT=4000                 # optional
AGENT_NAME=shreya-obnox   # must match the Python agent registration
```

## API reference

Base URL defaults to `http://localhost:4000`.

### POST `/session`

Creates a LiveKit user token, persists session metadata, and dispatches the agent.

Request:

```json
{
  "userIdentity": "user-123",
  "roomName": "optional-room",
  "agentConfig": {
    "stt": "assemblyai/universal-streaming:en",
    "tts": "cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
    "llm": "openai/gpt-4o-mini",
    "prompt": "You are a helpful voice AI assistant. Be concise and friendly.",
    "greeting": "Say, 'Hi I’m Maya, how can I help you today?'",
    "realtime": false,
    "realtime_model": "gpt-4o-realtime-preview",
    "realtime_voice": "sage",
    "vad_enabled": true,
    "turn_detection_enabled": true,
    "noise_cancellation_enabled": true,
    "noise_cancellation_type": "auto"
  }
}
```

Response:

```json
{
  "userToken": "<jwt>",
  "roomName": "room-uuid",
  "livekitUrl": "wss://<your-project>.livekit.cloud",
  "agentDispatched": true,
  "agentConfig": {
    "stt": "assemblyai/universal-streaming:en",
    "tts": "cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
    "llm": "openai/gpt-4o-mini",
    "realtime": false
  }
}
```

Validation:

- `userIdentity` is required, alphanumeric/underscore/hyphen, ≤128 chars.
- `roomName` optional, same constraints (auto-generated when omitted).
- `agentConfig` is forwarded as metadata to the Python agent; unknown keys are ignored there.

### POST `/session/end`

```
{ "roomName": "room-uuid" }
```

Deletes the LiveKit room (via `roomService`) and clears cached metadata. Returns `204` or `404` if the room is unknown.

### GET `/health`

Simple uptime/status payload.

## Telephony (Mode A: SIP trunk into LiveKit)

This repo supports receiving **LiveKit webhooks** and dispatching your agent when a **SIP/PSTN participant** joins a room.

### Telephony env vars

Add these to your `.env`:

```env
TELEPHONY_ENABLED=true

# LiveKit webhook verification. By default, the service uses LIVEKIT_API_KEY/SECRET.
# Set these only if you sign webhooks with a different key.
LIVEKIT_WEBHOOK_API_KEY=...
LIVEKIT_WEBHOOK_API_SECRET=...

# Heuristic for SIP participant detection (identity prefix).
TELEPHONY_SIP_IDENTITY_PREFIX=sip_

# If true, dispatch agent on *any* participant_joined (useful for debugging only).
TELEPHONY_DISPATCH_ON_ANY_PARTICIPANT_JOIN=false
```

### Endpoints

- `POST /telephony/livekit-webhook`
  - Expects `Content-Type: application/webhook+json` and an `Authorization` header from LiveKit.
  - Returns `200` quickly and processes events asynchronously.

- `GET /telephony/calls/:callId` (non-prod only)
- `GET /telephony/calls/by-room/:roomName` (non-prod only)

## Agent metadata contract (backend → python-agent-livekit)

`agentService` serializes `agentConfig` into dispatch metadata that `python-agent-livekit/src/agent.py` reads. Keep these names stable:

- `stt`, `tts`, `llm` – LiveKit Inference model descriptors.
- `prompt`, `greeting` – instructions for the assistant.
- `realtime`, `realtime_model`, `realtime_voice` – toggles OpenAI Realtime path.
- `vad_enabled`, `turn_detection_enabled`.
- `noise_cancellation_enabled`, `noise_cancellation_type` (`auto|telephony|standard|none`).

## Development notes

- Frontend expects this service at `NEXT_PUBLIC_BACKEND_URL` (defaults to `http://localhost:4000`).
- In-memory storage only; restart clears sessions.
- Update validation or response shapes in `src/routes/session.ts` and keep `frontend-livekit/lib/types.ts` in sync.
- The displayed endpoints in `src/index.ts` are informational logs only.

## Troubleshooting

- **Missing env**: `src/config/index.ts` throws on startup if `LIVEKIT_*` keys are unset.
- **Agent not joining**: ensure AGENT_NAME matches the running Python agent registration and that the agent process is reachable by LiveKit Cloud.
- **CORS**: enabled globally; adjust in `src/app.ts` if you need stricter origins.

