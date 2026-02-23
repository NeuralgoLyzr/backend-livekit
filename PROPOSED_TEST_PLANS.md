# Proposed Test Plans

This document captures proposed testing plans only. It does **not** implement runtime schema decoders or Mongo persistence validation yet.

## 1) Schema-Based Decoder Plan (Upstream APIs)

### Aim

Reduce runtime breakage when upstream provider payloads (Cartesia, ElevenLabs, Deepgram, Inworld, Rime, LiveKit/Twilio/Telnyx SDKs) change shape by enforcing explicit decode contracts and contract tests.

### Plan

1. Add provider-specific decode schemas (Zod) for the minimum required upstream fields and keep forward compatibility with `.passthrough()` where needed.
2. Add a shared decode helper (`decodeOrThrow`) that converts parse failures into consistent 502 errors with provider context and compact issue details.
3. Add fixture-driven contract tests per provider:

- valid fixture parses and normalizes correctly.
- malformed fixture fails with explicit decode errors.
- backward-compatible fixture variants still parse.

4. Add live/non-live split:

- non-live contract tests run in CI using fixtures.
- optional live smoke tests verify fixture drift and can refresh fixtures intentionally.

5. Add regression guardrails:

- snapshot normalized voice outputs for representative fixtures.
- assert metadata contracts for backend->python dispatch payloads.

### Test Deliverables

- Decoder contract test suites for each provider.
- Shared decode-helper tests for error behavior.
- Fixture corpus under `tests/fixtures/upstream/`.

## 2) Persisted Document Validation Plan (Mongo Reads/Writes)

### Aim

Prevent invalid persisted `config`, `sessionReport`, and `chatHistory` blobs from re-entering typed application paths as trusted data.

### Plan

1. Reuse existing domain schemas for persistence boundaries:

- `AgentConfigSchema`
- `SessionReportSchema`
- `ConversationItemSchema[]`

2. Add read-time validation tests:

- invalid stored blobs are detected and handled deterministically (error/quarantine/skip policy).
- valid documents round-trip through adapters without shape drift.

3. Add write-time validation tests:

- invalid write payloads are rejected before persistence.
- valid payloads persist and can be read back as typed objects.

4. Add Mongoose validator contract tests:

- schema validators block invalid docs at DB layer.
- adapter-level validation and Mongoose validation both enforced.

5. Add operational data-audit tests:

- scan task reports invalid documents with IDs and reasons.
- optional quarantine flow is deterministic and idempotent.

### Test Deliverables

- Adapter integration tests (read/write validation paths).
- Mongoose model validator tests.
- Data-audit script tests and sample output snapshots.

## Success Criteria

- Contract-breaking payload changes are caught in CI before deployment.
- Persisted invalid blobs cannot silently flow into typed runtime objects.
- Test failures point to exact boundary (provider decode, adapter read/write, or DB validator).

## 3) Sarvam STT Plugin Coverage Plan

### Aim

Ensure Sarvam STT is supported end-to-end (config options + runtime plugin wiring) without regressing existing inference-based STT providers.

### Plan

1. Backend config contract tests (`/config/pipeline-options`):

- Sarvam STT provider is present.
- Sarvam STT model `sarvam/saarika:v2.5` is returned.
- Sarvam STT language list includes expected BCP-47 values (`en-IN`, `hi-IN`, etc.).

2. Python runtime unit tests (`create_pipeline_session` / STT builder):

- Selecting `sarvam/saarika:v2.5` builds a `sarvam.STT(...)` plugin instance.
- Language normalization maps common values (`en-US` -> `en-IN`).
- `language=auto` maps to Sarvam auto-detect (`unknown`).
- Missing `SARVAM_API_KEY` raises a clear, actionable runtime error.
- Non-Sarvam STT logic (Deepgram/AssemblyAI/ElevenLabs branches) remains unchanged.

3. Regression checks:

- Existing pipeline STT tests continue passing for non-Sarvam models.
- Existing pipeline TTS Sarvam tests continue passing.

### Test Deliverables

- Backend HTTP contract assertions in `tests/httpContract.test.ts`.
- Python unit tests in `python-agent-livekit/tests/test_sessions_unit.py`.

### Run Commands

- `pnpm -C backend-livekit test`
- `cd python-agent-livekit && uv run ruff check .`
- `cd python-agent-livekit && uv run pyright`
- `cd python-agent-livekit && uv run pytest -v tests/test_sessions_unit.py`
