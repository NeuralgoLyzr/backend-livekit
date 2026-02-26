# Voice Agent Server Code Review

## Progress Tracker

| #   | Issue                                               | Priority | Effort | Status              |
| --- | --------------------------------------------------- | -------- | ------ | ------------------- |
| 1   | Remove hardcoded Mongo URI + rotate creds           | P0       | S      | ✅                  |
| 2.1 | Wrap telephony routes with `asyncHandler`           | P0       | S      | ✅                  |
| 2.2 | Fix NaN query param bug in agents list              | P0       | S      | ✅                  |
| 2.3 | Fix logger redaction for `apiKey`                   | P1       | S      | ✅                  |
| 2.4 | Delete dead `_unused_file` files                    | P2       | S      | ✅                  |
| 3   | Restrict CORS (env-driven allowed origins)          | P1       | S      | ⏸️ deferred         |
| 4   | Add API key auth middleware                         | P1       | M      | ⬜                  |
| 5   | Centralize `formatZodError` / validation middleware | P1       | M      | ✅                  |
| 6   | Unify config finalization (normalizeTools + RAG)    | P2       | M      | ✅                  |
| 7   | Centralize `summarizeAgentConfig`                   | P2       | S      | ✅                  |
| 8   | Align DI patterns (composition root)                | P3       | L      | ✅                  |
| 9   | Unify LiveKit client creation                       | P3       | S      | ✅                  |
| 10  | Fix error middleware `err` type to `unknown`        | P1       | S      | ✅                  |
| 11  | Remove duplicate `dotenv.config()` call             | P2       | S      | ✅                  |
| 12  | Fix telephony route ad-hoc service caching          | P3       | S      | ✅ (absorbed by #8) |

---

## Detailed Findings

### 1. Hardcoded MongoDB credentials in source (P0, Security)

- **File:** `src/CONSTS.ts` line 31
- `MONGO_FALLBACK.uri` contains a full connection string with username/password.
- **Fix:** Remove the URI, rotate the credential, rely on `MONGODB_URI` env var + `.env.example` for docs.

### 2.1 Telephony routes missing `asyncHandler` (P0, Bug)

- **File:** `src/routes/telephony.ts` line 13
- Uses bare `async (req, res)` — Express 4 won't catch unhandled rejections; can crash the process.
- **Fix:** Wrap every async route handler with `asyncHandler`.

### 2.2 NaN query params in agents list (P0, Bug)

- **File:** `src/routes/agents.ts` lines 32-33
- `Number("abc")` → `NaN`, and `NaN ?? 50` is still `NaN` (nullish coalescing doesn't catch it).
- **Fix:** Validate with Zod or guard with `Number.isFinite()`.

### 2.3 Log redaction gap (P1, Security)

- **File:** `src/services/agentService.ts` maps `api_key` → `apiKey` in metadata.
- **File:** `src/lib/logger.ts` redaction config only covers `*.api_key`, not `*.apiKey`.
- **Fix:** Either rename the metadata key to `api_key` (snake_case) or expand redaction paths.

### 2.4 Dead code / unused files (P2)

- `src/agents/customAgent_unused_file.ts`
- `src/agents/agentFactory_unused_file.ts`
- `src/config/ultravoxOptions.ts` (self-described as "currently unused")
- **Fix:** Delete all three files (and the `src/agents/` directory if empty).

### 3. Wide-open CORS (P1, Security)

- **File:** `src/app.ts` line 20 — `cors()` with no origin restrictions.
- **Fix:** Configure allowed origins from env (e.g., `CORS_ALLOWED_ORIGINS`), default to restrictive in production.

### 4. No auth on sensitive endpoints (P1, Security)

- `routes/agents.ts` and `routes/session.ts` allow unauthenticated CRUD on agent configs and token minting.
- **Fix:** Add API key middleware (`X-API-Key` header) for non-health/config endpoints.

### 5. Duplicated `formatZodError` (P1, DRY)

- Identical function in `routes/session.ts` and `routes/agents.ts`.
- **Fix:** Extract to `lib/zod.ts` or create a `validateBody(schema)` middleware.

### 6. Config normalization pipeline duplicated (P2, DRY)

- Both `sessionService.ts` and `agentConfigResolverService.ts` repeat `normalizeTools()` + `deriveRagConfigFromKnowledgeBase()` + spread.
- **Fix:** Create a single `finalizeAgentConfig()` function.

### 7. `summarizeAgentConfig` duplicated (P2, DRY)

- Different functions with the same name in `agentService.ts` and `sessionService.ts`.
- **Fix:** Centralize to one module (e.g., `lib/agentConfigSummary.ts`).

### 8. Inconsistent DI / composition (P3, SOLID)

- `sessionService` injects only `store` but hard-imports `tokenService`, `agentService`, `roomService`, `MongooseAgentStore`, `config`.
- Telephony module uses proper ports/adapters. Core services should follow the same pattern.
- Ad-hoc caching in route files (`routes/agents.ts`, `sessionService.ts` resolver).
- **Fix:** Construct services at boot in a composition root.

### 9. Inconsistent LiveKit client lifecycle (P3, Consistency)

- `agentService.ts` creates `AgentDispatchClient` per request.
- `roomService.ts` creates `RoomServiceClient` at module load.
- **Fix:** Pick one strategy (singleton or factory) and apply consistently.

### 10. Error middleware typed too narrowly (P1, Correctness)

- `app.ts` line 69 types `err` as `Error`, but thrown values can be anything.
- **Fix:** Change to `unknown` and normalize.

### 11. Duplicate `dotenv.config()` (P2, DRY)

- Called in both `index.ts` and `config/index.ts`.
- **Fix:** Load dotenv exactly once at the entrypoint.

### 12. Ad-hoc service caching in route files (P3, Modularity)

- `routes/agents.ts` and `sessionService.ts` have lazy singleton patterns.
- **Fix:** Move to composition root.
