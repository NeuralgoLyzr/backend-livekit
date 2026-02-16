# Express 5 migration guide (for an AI agent)

This guide is written for an AI coding agent that will migrate `backend-livekit` from **Express 4** to **Express 5**.

## Goals

- Upgrade `backend-livekit` to Express 5 (currently `express@latest`).
- Keep behavior consistent (especially `/telephony/livekit-webhook` raw-body handling).
- Ensure `pnpm dev`, `pnpm build`, and `pnpm start` work.
- Prefer minimal, mechanical changes; avoid refactors unless required by Express 5.

## Constraints (project conventions)

- Use **pnpm** for installs and dependency changes.
- Don’t break the LiveKit webhook signature validation flow:
    - `express.raw()` must remain mounted **before** `express.json()` for `/telephony/livekit-webhook`.

## Preflight checklist (before making changes)

### Environment prerequisites

- Node.js **18+** (Express 5 requirement).
- `pnpm` available.

### Baseline sanity (run and record results)

From `backend-livekit/`:

```bash
pnpm install
pnpm lint
pnpm build
```

Optional smoke run:

```bash
pnpm dev
```

Verify at least:

- `GET /health` returns JSON
- `POST /session` returns 400 on invalid input

## Step-by-step migration plan

### 1) Upgrade dependencies (pnpm)

In `backend-livekit/package.json`:

- Update `express` from `^4.18.0` to `^5.x` (or pin to the current latest 5.x).
- Update typings:
    - `@types/express` should be v5-compatible (typically `@types/express@^5`).

Then:

```bash
pnpm install
```

### 2) Run the official Express v5 codemods

Express maintains codemods that automatically handle many breaking changes:

```bash
npx codemod@latest @expressjs/v5-migration-recipe
```

After codemods:

```bash
pnpm lint
pnpm build
```

### 3) Fix compile/runtime failures by category (use official migration guide)

Work through failures in this order:

#### A) Route path matching syntax changes (path-to-regexp)

Search for and fix:

- Unnamed wildcards:
    - Express 4: `/*`
    - Express 5: `/*splat` (or `/{*splat}` if you need `/` included)
- Optional params:
    - Express 4: `:ext?`
    - Express 5: `{.:ext}` (brace syntax)
- Regex-like characters in string paths:
    - Express 4 patterns like `'/[discussion|page]/:slug'` must become arrays (e.g. `['/discussion/:slug', '/page/:slug']`)
- Reserved characters in paths: `()[]?+!` must be escaped if used literally.

Expected status for this repo:

- Routes are mostly simple (`/session`, `/health`, `/telephony/...`), so there may be **no** route syntax changes needed. Still, explicitly search to confirm.

#### B) Removed methods / deprecated signatures

Check and fix if present:

- `app.del()` → `app.delete()`
- `req.param(...)` removed
- `res.redirect('back')` removed (use `req.get('Referrer') || '/'`)
- Deprecated argument orders:
    - `res.redirect(url, status)` → `res.redirect(status, url)`
    - `res.send(body, status)` / `res.send(status, body)` → `res.status(status).send(body)`
    - `res.json(obj, status)` → `res.status(status).json(obj)`
- `res.send(status)` numeric overload removed (use `res.sendStatus(status)` or `res.status(status).send()`).

Expected status for this repo:

- Most handlers already use modern `res.status(...).json(...)` patterns.

#### C) Body parsing behavior changes

Express 5 changes:

- `req.body` can be **`undefined`** when a parser didn’t run.

Repo-specific must-not-break constraint:

- Keep ordering in `src/app.ts`:
    - `app.use('/telephony/livekit-webhook', express.raw(...))` **before** `app.use(express.json())`
- Keep the telephony route check that enforces raw body as a Buffer.

#### D) `req.params` behavioral changes

Express 5 changes:

- `req.params` may be a null-prototype object in common cases.
- Wildcard params are arrays (`/*splat` → `req.params.splat` is `string[]`).
- Unmatched optional params are omitted.

Expected status for this repo:

- Only named params like `:callId` and `:roomName` are used, so likely no changes.

#### E) `req.query` changes

Express 5 changes:

- `req.query` is a getter; default parser changes to “simple”.

Expected status for this repo:

- If you don’t mutate `req.query` and don’t rely on “extended” parsing, likely no changes.

#### F) `app.listen` callback behavior

Express 5 can pass an `error` argument to the `listen` callback for server error events.
Decide whether to handle explicitly (recommended if you want friendlier startup errors).

### 4) Async error handling strategy (Express 5 benefit)

Express 5:

- If an `async` handler throws or returns a rejected promise, Express forwards it to error middleware automatically (like `next(err)`).

Guidance:

- Do **not** remove try/catch blocks that produce user-facing HTTP status codes (e.g., converting upstream failures into `HttpError(502, ...)`).
- You may remove wrapper-only try/catch if it existed purely to pass errors to `next`.
- If you keep a global error middleware (this repo has one in `src/app.ts`), ensure it still returns JSON consistently.

### 5) Verification checklist (must pass)

From `backend-livekit/`:

```bash
pnpm lint
pnpm build
pnpm start
```

Smoke tests:

- `GET /health` returns `{ status: "ok", ... }`
- `POST /session` with invalid payload returns 400 with Zod issues
- `POST /session` with valid payload still returns `userToken`, `roomName`, `livekitUrl` (requires LiveKit envs)
- Telephony (if enabled):
    - `POST /telephony/livekit-webhook` still expects a raw body (Buffer)
    - invalid signature still returns 401 quickly

## “Can we fix async handler caveats without upgrading?” (Express 4 note)

If you stay on Express 4, you can safely handle async errors by wrapping handlers:

```js
const asyncWrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
```

Then use:

```js
router.get(
    '/path',
    asyncWrap(async (req, res) => {
        // ...
    })
);
```

## Deliverables expected from the AI agent

- A focused PR/patch that:
    - upgrades to Express 5 + compatible typings via pnpm
    - keeps webhook raw-body route behavior intact
    - passes `pnpm lint` and `pnpm build`
    - includes a short PR description with:
        - Summary
        - Test plan (commands + endpoints)

## References

- `https://expressjs.com/en/guide/migrating-5.html`
- `https://expressjs.com/en/guide/error-handling.html`
- `https://expressjs.com/2024/10/15/v5-release.html`
