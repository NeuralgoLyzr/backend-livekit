# Telephony (Provider-Agnostic) Plan — LiveKit Agent Backend

**Mode A only: SIP trunk into LiveKit**

## Context (current backend)

This repo is an Express + TypeScript backend that currently supports:

- `POST /session`: generates/accepts a `roomName`, creates a LiveKit user token, stores session metadata in an in-memory store, and dispatches a LiveKit agent via `agentService.dispatchAgent(roomName, agentConfig)`.
- `POST /session/end`: deletes a LiveKit room via `roomService.deleteRoom(roomName)` and removes session metadata.

Key existing components:

- `agentService`: dispatches a LiveKit agent to a room, passing `AgentConfig` via agent metadata.
- `tokenService`: creates LiveKit access tokens.
- `roomService`: deletes LiveKit rooms.
- `storage`: in-memory session storage keyed by `roomName`.

We want to add **telephony** so PSTN callers can talk to the LiveKit agent.

---

## Goals

- **Mode A only**: Use **SIP trunking into LiveKit** (no provider media websockets, no audio-bridge service).
- **Provider-agnostic**: At runtime, do not depend on Twilio/Vonage/Plivo APIs. Any SIP provider should work as long as it can trunk SIP to LiveKit.
- **Decoupled design**: Use **Ports & Adapters (Hexagonal)** so domain/orchestration logic is isolated from HTTP and LiveKit SDK specifics.
- **Sensible defaults (v1)**:
    - **Room strategy**: **one room per call** (per-call room).
    - **Agent dispatch timing**: dispatch when LiveKit confirms the **SIP participant joined the room** (or equivalent “connected” event), not on earliest “incoming/ringing”.
    - **State store**: in-memory for PoC (single instance). Must be abstracted behind an interface so Redis/Postgres is a drop-in later.

---

## Non-goals (v1)

- Provider-specific webhook endpoints (do **not** build `/telephony/webhooks/:provider`).
- Mode B “media streaming → bridge → LiveKit”.
- Billing, CRM, complex routing trees, multi-tenant DID management.
- Perfect cross-provider feature parity; this v1 normalizes around **LiveKit SIP + LiveKit webhooks**.

---

## Architectural approach (Mode A only)

### Big idea

With SIP trunking, “provider” differences are mostly **configuration**, not code. The backend’s runtime integration points are:

- **LiveKit SIP** (inbound/outbound trunks and dispatch rules)
- **LiveKit webhooks** (single webhook endpoint)
- Existing **agent dispatch** (`agentService.dispatchAgent`)

### Hexagonal layout

- **Domain / orchestration (core)**
    - `telephonySessionService`: owns call lifecycle state, webhook idempotency, and agent dispatch gating.
    - `callRouter`: maps inbound call context (DID/from/etc.) to `AgentConfig` and policies.
- **Ports (interfaces)**
    - `TelephonyStorePort`: persistence + idempotency (dedupe webhook events, track “agent already dispatched”).
    - `CallRoutingPort`: routing rules (DID → agent config).
    - `LiveKitWebhookVerifierPort`: verify webhook authenticity.
    - (Optional) `LiveKitSipPort`: initiate/terminate outbound PSTN calls via LiveKit SIP APIs.
- **Adapters**
    - HTTP adapter: Express router (`/telephony/*`).
    - LiveKit webhook verifier adapter.
    - In-memory store adapter (PoC).
    - (Optional) LiveKit SIP adapter for outbound dialing.

---

## Public API surface (v1)

### 1) LiveKit webhook endpoint (required)

**`POST /telephony/livekit-webhook`**

- Verify LiveKit webhook signature (reject if invalid).
- Parse + normalize event shape.
- Deduplicate by `eventId` (or a stable derived id).
- Call `telephonySessionService.handleLiveKitEvent(event)`.
- Return 200 quickly (don’t block on slow operations).

### 2) Outbound call endpoint (optional v1 — can defer)

**`POST /telephony/calls`**

- Body:
    - `to` (E.164)
    - `from` (E.164)
    - `agentConfig?` override (optional)
- Behavior:
    - Create per-call `roomName`
    - Persist call record
    - Dispatch agent to the room
    - Ask LiveKit SIP to dial out via configured outbound trunk

### 3) Minimal diagnostics (recommended, non-prod gated)

**`GET /telephony/calls/:callId`** (or lookup by `roomName`)

- Returns the internal call record to help debug event ordering and agent dispatch.

---

## Domain model (v1)

Store only what’s needed to be correct and idempotent.

### `TelephonyCall`

- `callId` (UUID)
- `roomName` (string)
- `direction` (`inbound` | `outbound`)
- `from` (string | null) — E.164 if present
- `to` (string | null) — E.164/DID if present
- `status`:
    - `created | sip_participant_joined | agent_dispatched | ended | failed`
- `agentDispatched` (boolean)
- `createdAt`, `updatedAt`
- `sipParticipant` (optional):
    - `participantSid`/`participantId` (if available)
    - `identity` (if available)
- `raw` (optional small debug blob; keep size bounded)

### Idempotency record

- `seenEventIds: Set<string>` (with TTL cleanup or bounded-size strategy)

---

## Call flow (Inbound, Mode A)

1. PSTN caller dials DID.
2. SIP provider routes call through the configured **inbound SIP trunk** to LiveKit.
3. LiveKit applies **dispatch rules** to route the SIP participant into a room.
    - For v1 “per-call room”, room naming/creation should be handled by LiveKit dispatch rules (or by a deterministic convention).
4. LiveKit emits webhook events as the SIP participant joins/connects.
5. Backend receives webhook:
    - verify signature
    - dedupe by `eventId`
    - identify **SIP/PSTN participant join** event
    - upsert call record keyed by `roomName` (+ any call ref/participant info)
    - resolve `AgentConfig` via `CallRoutingPort`
    - if not yet dispatched for this `roomName`: call `agentService.dispatchAgent(roomName, agentConfig)`
    - mark `agentDispatched=true`
6. On “participant left / call ended” webhook:
    - mark call ended
    - optionally delete room (immediately or after a grace period)

**Key invariant:** dispatch the agent exactly once per call room, even if webhooks are duplicated/out-of-order.

---

## Routing rules (v1 sensible defaults)

- **Per-call rooms**: always isolate each call to its own room.
- Default inbound `AgentConfig`:
    - `noise_cancellation_type: 'telephony'`
    - concise, PSTN-friendly prompt + greeting
    - minimal tools (optional; keep small for reliability)
- Optional DID overrides:
    - `toNumber`/DID → custom prompt/tools/voice/model

Routing must be separate from webhook parsing so it can evolve (config → DB).

---

## Storage choice (why in-memory is OK for PoC; when to move to Redis)

### In-memory is OK if:

- single backend instance
- OK losing state on restart
- acceptable operationally for a PoC

### Move to Redis/Postgres when:

- multiple backend replicas (webhooks can land on different instances)
- need idempotency across deploy/restart
- need reliable “exactly-once-ish” agent dispatch
- need operational visibility (“active calls”, dashboards)

**Design requirement:** keep state behind `TelephonyStorePort` so Redis is a drop-in swap later.

---

## Proposed module breakdown (implementation guide)

Add new modules while keeping style consistent with existing `routes/` and `services/` patterns.

- `src/routes/telephony.ts`
    - `POST /telephony/livekit-webhook`
    - (optional) `POST /telephony/calls`
    - (optional) `GET /telephony/calls/:callId` (non-prod)
- `src/services/telephonySessionService.ts`
    - `handleLiveKitEvent(normalizedEvent)`
    - `dispatchAgentIfNeeded(roomName, agentConfig)`
    - `markEnded(...)`
- `src/telephony/ports/*` (or colocate under `src/services/telephony/*`)
    - `TelephonyStorePort`
    - `CallRoutingPort`
    - `LiveKitWebhookVerifierPort`
    - (optional) `LiveKitSipPort`
- `src/telephony/adapters/store/inMemoryTelephonyStore.ts`
- `src/telephony/adapters/livekit/webhookVerifier.ts`
- `src/telephony/adapters/livekit/eventNormalizer.ts`
- `src/telephony/routing/defaultRouting.ts`

Wire-up:

- Mount telephony router in `src/app.ts` at `/telephony`.
- Extend `src/config/index.ts` with telephony env vars (webhook secret; optional trunk IDs).
- Update `README.md` with setup + endpoints.

---

## Configuration (env) — expected additions

Minimum:

- `LIVEKIT_WEBHOOK_SECRET` (or whatever naming is chosen): used to verify webhook signatures.
- `TELEPHONY_ENABLED=true|false`

Optional (if outbound dialing in v1):

- `LIVEKIT_SIP_OUTBOUND_TRUNK_ID=...`
- `TELEPHONY_DEFAULT_FROM_NUMBER=...`

---

## Required inputs to implement correctly

To avoid guessing, the implementer needs:

- A sample LiveKit webhook payload for **SIP participant joined** (and ended/left).
- The exact webhook signature verification scheme and secret naming.
- How to reliably identify “this participant is SIP/PSTN” from webhook payload:
    - participant kind/type/attributes, or a consistent identity prefix, etc.

---

## Success criteria

- An inbound PSTN call results in:
    - SIP participant joins a unique LiveKit room
    - backend dispatches the agent exactly once for that room
    - conversation works end-to-end
- Duplicate/out-of-order webhooks do not cause double-dispatch.
- Code is modular: swapping to Redis requires only store adapter changes (no domain changes).
