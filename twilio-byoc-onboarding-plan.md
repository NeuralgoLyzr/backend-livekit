# Twilio BYOC (Bring Your Own Number) Onboarding Plan — LiveKit Telephony (Mode A)

This plan describes how to onboard a customer who already owns phone numbers in Twilio and wants inbound calls routed to a LiveKit SIP ingress, where our LiveKit agent is dispatched using the existing backend webhook: `POST /telephony/livekit-webhook`.

**Key constraint:** we do **not** purchase phone numbers for customers; we only connect **existing** Twilio numbers to a SIP trunk that forwards calls to LiveKit.

---

## Executive summary

### What we are “setting up”

For each customer, we will:

- Accept and securely store a **Twilio API Key + Secret** (and required Twilio identifiers).
- Discover and let them select an **existing Twilio Incoming Phone Number** (`PN…`).
- Create (or reuse) a **Twilio Elastic SIP Trunk** (`TK…`) in their Twilio account.
- Configure the trunk’s **Origination URL(s)** to our **LiveKit SIP ingress** (`sip:` URI).
- Associate the selected `PN…` with the `TK…` trunk so calls to that number are routed to the trunk.
- Persist an internal mapping `customer + number → routing policy` (agent config / destination agent / metadata).

### What we are NOT building

- We are not building Twilio Voice webhooks (TwiML) for call control.
- Twilio will not call our backend during the call; **LiveKit** will call our backend webhooks.
- We are not building provider-agnostic runtime code here; this is **onboarding/config**, not call media.

---

## Current architecture alignment (Mode A)

### Runtime call path (already in place)

1. PSTN caller dials the customer’s Twilio number (DID).
2. Twilio forwards the call via SIP to **LiveKit SIP ingress** (via trunk origination).
3. LiveKit places the SIP participant into a room (via LiveKit SIP dispatch rules / ingress behavior).
4. LiveKit sends webhook events to our backend at `POST /telephony/livekit-webhook`.
5. Our backend dedupes events and dispatches the agent to that room exactly once.

### Existing backend endpoints (already present)

- `POST /telephony/livekit-webhook` (required, LiveKit → backend)
- Diagnostics (non-prod):
    - `GET /telephony/calls/:callId`
    - `GET /telephony/calls/by-room/:roomName`

### New responsibility we’re adding

We are adding a **Twilio onboarding adapter** (management plane) that:

- Lets the frontend submit customer Twilio credentials.
- Discovers existing phone numbers in Twilio.
- Connects one of those numbers to LiveKit via Twilio Elastic SIP Trunking configuration.

This is separate from the existing provider-agnostic telephony runtime webhook handler.

---

## Twilio resources we will configure (customer’s Twilio account)

### Required inputs from the customer

At minimum, to manage Twilio resources on their behalf:

- **Account SID** (`AC…`) — identifies the account.
- **API Key SID** (`SK…`) and **API Key Secret** — used for REST API auth.

Optional / environment-dependent:

- **Region** (if applicable), and any customer-specific networking allowlists.

### Twilio objects involved

- **IncomingPhoneNumber** (`PN…`): the customer’s existing DID.
- **Trunk** (`TK…`): Elastic SIP trunk.
- **OriginationUrl** (under a Trunk): SIP URI where Twilio sends inbound calls.
- **(Optional) Credentials Lists / IP ACLs**: only needed if we require Twilio to authenticate to our SIP endpoint or if we enforce IP restrictions. (Not required for basic forwarding; depends on LiveKit SIP ingress requirements.)

### How we “connect a number”

There are two equivalent attachment mechanisms; we will support one canonical path internally:

- **Preferred**: Create a Trunk PhoneNumber association:
    - `POST /v1/Trunks/{TrunkSid}/PhoneNumbers` with `phoneNumberSid=PN…`.
- **Alternative**: Update the IncomingPhoneNumber to set `trunkSid=TK…`.

### Configuring where calls go (Origination URL)

We create/update the trunk origination target to our LiveKit SIP ingress:

- Create:
    - `POST /v1/Trunks/{TrunkSid}/OriginationUrls` with `SipUrl=sip:...`
- Support multiple origination URLs for HA (priority/weight) if we have more than one LiveKit SIP ingress target.

---

## LiveKit inputs needed for Twilio trunk configuration

We must know (or generate) the **SIP destination** Twilio will dial.

### Required LiveKit SIP ingress values

- **SIP URI** (must be `sip:` for Twilio OriginationUrl):
    - Example shape: `sip:your-ingress.example.com` (host + optional `:port`).
- **Transport / TLS requirements**:
    - Twilio trunk origination uses `sip:` (not `sips:`); if the LiveKit ingress requires TLS-only, we must validate compatibility.
- **Authentication** (if any):
    - If LiveKit SIP ingress requires username/password (SIP digest), we’ll need to configure Twilio trunk credentials list.
    - If LiveKit relies on IP allowlisting, we’ll need Twilio IP ranges or a customer-specific SBC strategy.

### Routing signal into the agent (DID / “to” number)

To choose the correct agent config per number, we need the call metadata to be observable in LiveKit webhook events, typically one of:

- The called number appears in participant attributes or raw webhook payload.
- The SIP participant identity or attributes encode the DID.

**Action item:** confirm which field in LiveKit webhook payload contains:

- `to` (DID) and `from` (caller), or
- at least a stable identifier we can map to the connected Twilio number.

---

## Backend API surface to expose (management plane)

All routes below are **frontend → backend** (customer onboarding), and should be separate from the existing runtime webhook.

### 1) Twilio credentials

#### `POST /telephony/providers/twilio/credentials:verify`

Purpose: verify provided credentials are valid without saving them.

- Input:
    - `accountSid`, `apiKeySid`, `apiKeySecret`
- Behavior:
    - Attempt a simple Twilio API call (e.g., list 1 phone number).
    - Return normalized status.
- Output:
    - `{ ok: true, accountSid, friendlyName? }` or `{ ok: false, errorCode, message }`

#### `POST /telephony/providers/twilio/credentials`

Purpose: store/replace customer credentials securely.

- Input:
    - same as verify
- Behavior:
    - Encrypt secret at rest.
    - Persist a `twilioIntegration` record.
- Output:
    - `{ integrationId, accountSid }`

#### `DELETE /telephony/providers/twilio/credentials`

Purpose: disconnect Twilio integration (does not necessarily revert Twilio trunk config).

### 2) Discover existing numbers

#### `GET /telephony/providers/twilio/numbers`

Purpose: list existing Twilio Incoming Phone Numbers in the connected account.

- Output items:
    - `phoneNumberSid` (`PN…`)
    - `e164` (e.g., `+14155551234`)
    - `friendlyName?`
    - `capabilities?` (voice)
    - `assignedToTrunkSid?` if detectable

### 3) Connect a number to LiveKit SIP ingress

#### `POST /telephony/providers/twilio/numbers/:phoneNumberSid/connect`

Purpose: connect an existing Twilio number to LiveKit by configuring Twilio SIP trunking.

- Input:
    - `sipTarget` (optional if backend has a default LiveKit SIP ingress)
    - `routing` (optional): agent config override / agent id / tags
    - `trunkStrategy` (optional):
        - `shared` (one trunk per customer) or
        - `dedicated` (one trunk per phone number)
- Behavior (idempotent):
    - Find or create trunk.
    - Ensure origination URL points to LiveKit SIP target(s).
    - Attach `phoneNumberSid` to trunk.
    - Persist mapping `(customer, PN) → trunk + routing policy`.
- Output:
    - `connectionId`
    - `trunkSid`
    - `sipTarget`
    - `status`

#### `POST /telephony/providers/twilio/numbers/:phoneNumberSid/disconnect`

Purpose: detach number from trunk (optional in v1; can be admin-only).

### 4) Status & diagnostics

#### `GET /telephony/providers/twilio/numbers/:phoneNumberSid/status`

Returns:

- Whether credentials are valid.
- Current trunk association for that number (as seen from Twilio).
- Origination URL(s) configured.
- Our internal mapping & routing policy (safe subset).

---

## Data model (recommended: DB-backed, multi-tenant)

Even if the PoC currently uses in-memory call state, onboarding config should be persistent.

### `TelephonyProviderIntegration` (per customer)

- `id`
- `customerId`
- `provider = 'twilio'`
- `accountSid (AC…)`
- `apiKeySid (SK…)`
- `apiKeySecretEncrypted`
- `createdAt`, `updatedAt`
- `status` (active/disabled)

### `TelephonyNumberConnection` (per connected number)

- `id`
- `customerId`
- `provider = 'twilio'`
- `phoneNumberSid (PN…)`
- `e164`
- `trunkSid (TK…)`
- `sipTarget` (the LiveKit SIP URI configured)
- `routingPolicy` (JSON: agent config overrides, tags, etc.)
- `createdAt`, `updatedAt`

### Sensitive data handling

- Encrypt API secrets at rest (KMS/Envelope encryption later; symmetric key for PoC but avoid committing secrets).
- Never log raw credentials.
- Return only masked values to the frontend (e.g., `SK…` ok, secret never).

---

## Onboarding flow (frontend UX)

### Step 0: Customer enters Twilio credentials

- UI collects: `Account SID`, `API Key SID`, `API Key Secret`.
- Frontend calls `POST /telephony/providers/twilio/credentials:verify`.
- On success, frontend calls `POST /telephony/providers/twilio/credentials` to save.

### Step 1: Choose an existing number

- Frontend calls `GET /telephony/providers/twilio/numbers`.
- User selects a number to connect.

### Step 2: Connect the number

- Frontend calls `POST /telephony/providers/twilio/numbers/:phoneNumberSid/connect`.
- UI shows “Connected” + a test call checklist.

### Step 3: Test call

- Customer dials the number.
- Backend should show:
    - LiveKit webhook events arriving
    - A call record created/updated
    - Agent dispatched exactly once

---

## Idempotency and safe retries (critical for UX)

All onboarding operations should be safe to retry:

- Creating a trunk: if one already exists, reuse it.
- Creating origination URLs: upsert by `SipUrl` (or store Twilio OriginationUrl SID).
- Attaching phone number: if already attached, treat as success.

Implementation approach:

- Persist Twilio SIDs (`TK`, OriginationUrl SID) after creation.
- When reconnecting, reconcile against Twilio state instead of assuming.

---

## Error handling and user-facing messages

Normalize Twilio API failures into a small set of actionable errors:

- **AUTH_INVALID**: bad key/secret/account mismatch
- **INSUFFICIENT_PERMISSIONS**: key lacks trunking/number permissions
- **NUMBER_NOT_FOUND**: PN does not exist or not owned by account
- **TRUNKING_NOT_ENABLED**: trunking product not enabled on the account
- **INVALID_SIP_TARGET**: malformed `sip:` URI or incompatible transport requirements
- **RATE_LIMITED**: advise retry/backoff

Return:

- `errorCode`
- `message` (safe, user-friendly)
- `requestId` (for support correlation)

---

## Security model

### Backend auth (who can connect numbers)

- All onboarding routes must be authenticated (customer session/JWT).
- Authorization checks must ensure:
    - `customerId` can only manage their own integration/number connections.

### Secret storage

- Encrypt Twilio API Key Secret at rest.
- Decrypt only when calling Twilio APIs.
- Do not store Twilio auth tokens in the browser; only send secret to backend once at setup/update.

### Auditability

Log high-level events (no secrets):

- `twilio.credentials.verified`
- `twilio.credentials.saved`
- `twilio.number.connected` (PN + TK + customerId)
- `twilio.number.disconnected`

---

## Implementation breakdown (backend)

### 1) Add a Twilio onboarding module (new)

Suggested structure:

- `src/telephony/providers/twilio/`
    - `twilioClient.ts` (creates Twilio REST client from stored creds)
    - `twilioOnboardingService.ts` (core orchestration: verify creds, list numbers, connect)
    - `twilioTypes.ts` (narrow types for what we use)
    - `twilioErrorMapper.ts` (normalize Twilio errors)

### 2) Add new router

- `src/routes/telephonyTwilio.ts` (mounted under `/telephony/providers/twilio`)
    - Implements routes defined above.

### 3) Add persistence

If no DB exists yet in this repo:

- For PoC, you can start with an in-memory store, but onboarding config should ideally be DB-backed.
- At minimum, define ports/interfaces so swapping storage later is easy.

### 4) Add config

Add server-side config for:

- Default LiveKit SIP target (`TELEPHONY_LIVEKIT_SIP_TARGET`)
- Whether to allow customer override of SIP target

---

## Implementation breakdown (frontend)

### Package manager

Use **pnpm** for any frontend dependency work.

### UI pages/components (suggested)

- **Twilio integration form**: collect credentials, verify, save.
- **Number picker**: list numbers, connect/disconnect.
- **Connection status**: show trunk SID, SIP target, last webhook seen, basic call diagnostics.

---

## Testing plan

### Unit tests (backend)

- Error mapping (Twilio error → normalized error code)
- Idempotent connect logic (when trunk/association already exists)

### Integration tests (manual is OK for PoC)

- Happy path: connect number → call → webhook received → agent dispatched
- Retry path: call `connect` twice → no duplicate trunks/urls
- Bad creds path: verify fails
- Missing product path: trunking not enabled

---

## Open questions / decisions to finalize

1. **Trunk strategy**
    - One trunk per customer (simpler to manage) vs one trunk per number (clearer isolation).
2. **SIP target**
    - Single shared LiveKit SIP ingress vs customer-specific targets.
3. **Routing signal**
    - Confirm how LiveKit webhook payload exposes DID (`to`) and caller (`from`) for SIP participants.
4. **Security constraints**
    - Do we require SIP auth (credentials list) or IP allowlisting between Twilio → LiveKit?

---

## Deliverables checklist

- [ ] Backend onboarding routes implemented and authenticated.
- [ ] Twilio onboarding service with idempotent connect logic.
- [ ] Secure credential storage.
- [ ] Persisted number → routing mappings.
- [ ] Frontend flow (verify creds → list numbers → connect).
- [ ] Runbook: “How to connect an existing Twilio number” + troubleshooting guide.
