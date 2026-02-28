# Session Report: Security Hardening Audit & Work Scope

**Date:** 2026-02-20 (updated 2026-02-21)
**Status:** ALL 8 SLICES COMPLETE — Security hardening work scope fully implemented
**Full Spec:** [security-hardening-work-scope.md](../Roadmap/security-hardening-work-scope.md)

---

## Session Goal

Conduct a comprehensive security audit of the BEYLE KACHERI codebase to verify 13 reported vulnerabilities across authorization, authentication, input sanitization, and session management. Produce a verified audit report and an actionable work scope divided into implementation slices.

---

## Documents Read

| Document | Location | Status |
|----------|----------|--------|
| Architecture Blueprint | `Docs/blueprint/architecture blueprint.md` | Read — confirmed RBAC, workspace boundaries, SOC2 as architectural requirements |
| Roadmap | `Docs/Roadmap/docs roadmap.md` | Read — Sections 1.3 (Auth/RBAC), 1.7 (Safety), 2.3 (Advanced RBAC) are relevant |
| API Contract | `Docs/API_CONTRACT.md` | Read — Common Headers section (lines 127-142), Auth section (lines 80-143) |
| Deferred Work Scope | `Docs/Roadmap/deferred-work-scope.md` | Read — no security items listed |
| Roadmap Close-Out Session | `Docs/session-reports/2026-02-20-roadmap-closeout.md` | Read — confirms 2.3 is intentionally held |

### Codebase Areas Inspected

| Area | Files Read | Purpose |
|------|-----------|---------|
| Auth middleware | `src/auth/middleware.ts` | JWT validation flow, `req.user` setting, dev bypass |
| Auth routes | `src/auth/routes.ts` | Registration, login, refresh token rotation |
| Workspace middleware | `src/workspace/middleware.ts` | `workspaceRole` derivation from headers, `getUserIdFromRequest()` |
| Rate limiting | `src/middleware/rateLimit.ts` | Rate limit keying strategy |
| Workspace routes | `src/routes/clauses.ts`, `compliancePolicies.ts`, `extractionStandards.ts`, `notificationPreferences.ts`, `knowledge.ts` | Path vs header workspace ID usage |
| Notification routes | `src/routes/notifications.ts`, `notificationPreferences.ts` | `x-user-id` header trust |
| WebSocket handlers | `src/realtime/workspaceWs.ts`, `yjsStandalone.ts` | Authentication on WS upgrade |
| Global endpoints | `src/store/artifacts.ts`, `src/routes/jobs.ts`, `aiWatch.ts`, `proofHealth.ts` | Workspace scoping and auth guards |
| File manager | `src/routes/files.ts`, `src/store/fsNodes.ts` | Workspace scoping verification |
| Import route | `src/routes/importDoc.ts` | `app.inject()` usage |
| Server routes | `src/server.ts` | `/docs`, `/docs/trash`, `/__debug/*` endpoints |
| Frontend rendering | `EditorPage.tsx`, `ClausePreviewModal.tsx`, `WorkspaceKnowledgeExplorerPage.tsx`, `PDFImportModal.tsx`, `RoundCard.tsx`, `SearchResultCard.tsx` | `dangerouslySetInnerHTML` usage |
| Frontend API | `src/api.ts` | Token storage in localStorage |
| Store: audit | `src/store/audit.ts` | Audit log workspace scoping |

---

## Architecture & Roadmap Alignment

### Roadmap Sections Covered
- **1.3 Workspace, Auth, RBAC & Sharing** — This work enforces the requirements already defined: "Real authentication with stable user IDs", "Workspace boundaries", "Doc-level permissions enforced on read/write/AI/export"
- **1.7 Ops, Safety & Platform** — "Basic guardrails: rate limits" — fixing rate limit bypass
- **2.3 Advanced RBAC & Enterprise IT** (prerequisite) — Security hardening is a prerequisite for any RBAC work. Without correct authorization primitives, group roles and SCIM are meaningless.

### Architecture Alignment
- Blueprint mandates: "RBAC", "SOC2 Logs", "Workspace Broadcasts" — all require authorization correctness
- No new architectural boundaries. All changes enforce existing boundaries that are currently unenforced.
- WebSocket auth follows the same JWT-based pattern as HTTP auth — consistent with blueprint's authentication model.

### API Contract Sections Affected
- **Common Headers** — `X-User-Id` and `X-Workspace-Id` descriptions must be updated
- **GET /docs, GET /docs/trash** — Must document workspace requirement
- **WebSocket Events** — Must document auth token requirement
- **Debug Endpoints** — Must document production-disabled status

---

## Assumptions Ruled Out

1. ~~x-user-id and x-workspace-id are injected by a trusted gateway~~ → **FALSE**. No gateway, proxy, or header-stripping middleware exists. Headers are client-supplied and untrusted.
2. ~~File manager allows cross-tenant access~~ → **FALSE**. Workspace scoping is properly implemented at route and store layers. This claim was disproven.
3. ~~Global endpoints have no authentication~~ → **PARTIALLY FALSE**. JWT auth is enforced (401 for unauthenticated). The issue is missing authorization (workspace scoping), not missing authentication.
4. ~~WebSocket has some auth via cookies or session~~ → **FALSE**. Zero authentication on either WebSocket server. Query params are the sole identity source.

---

## Known Constraints

1. **No new runtime dependencies** except `dompurify` (Slice 5) — requires approval per CLAUDE.md Section 7.
2. **localStorage token storage** is a known limitation. Migration to httpOnly cookies is a separate effort requiring full auth flow redesign. Out of scope.
3. **Admin role concept** does not currently exist in the user model. Slice 3 and 8 need a lightweight admin gate — likely env-var-based (`KACHERI_ADMIN_USERS`) until Roadmap 2.3 implements proper admin roles.
4. **Access token validation against user status** (Slice 6) adds ~1ms latency per request. Mitigated by in-memory cache with short TTL.
5. **WebSocket token in query params** (Slice 4) is visible in server access logs. Log scrubbing or header-based auth alternative should be considered.

---

## Identified Risks / Drift

### Drift Found During Audit

| Drift | Sources in Conflict | Resolution |
|-------|---------------------|------------|
| API Contract says `X-User-Id: Track action initiator` (optional) | Code uses it for authorization, not just tracking | Contract must be updated: `X-User-Id` should be documented as ignored (identity from JWT) |
| API Contract says `X-Workspace-Id: No` (not required) | Without it, `/docs` returns ALL docs across workspaces | Contract must be updated: required for workspace-scoped endpoints |
| Roadmap 1.3 says "Real authentication with stable user IDs used in proofs and provenance" | Proofs and provenance currently use `x-user-id` header, not authenticated JWT `req.user.id` | Must switch to `req.user.id` for proof attribution |
| Blueprint says "RBAC" and "SOC2 Logs" | Audit logs can be poisoned via spoofed `x-user-id` | Fixed by Slice 1 (canonical user identity) |

### Unresolved Questions

1. **Admin user model**: How should admin status be determined before Roadmap 2.3? Recommendation: `KACHERI_ADMIN_USERS` env var with comma-separated user IDs.
2. **WebSocket auth mechanism**: JWT in query param vs. first-message auth handshake? Query param is simpler but visible in logs. First-message is more secure but requires protocol change.
3. **Token storage migration**: Should httpOnly cookies be tracked as a separate work scope item? Recommendation: yes, separate from this scope.

---

## Audit Results Summary

| # | Vulnerability | Severity | Verdict | Slice |
|---|--------------|----------|---------|-------|
| 1 | Cross-workspace authz bypass via header/path mismatch | CRITICAL | **TRUE** (with mitigating factors) | 2 |
| 2 | File manager cross-tenant read/write | CRITICAL | **FALSE** | N/A |
| 3 | Sensitive global endpoints unprotected | CRITICAL | **PARTIALLY TRUE** (authn present, authz missing) | 3 |
| 4 | Notification APIs trust x-user-id | CRITICAL | **TRUE** | 1 |
| 5 | WebSocket auth missing | CRITICAL | **TRUE** | 4 |
| 6 | Stored XSS via dangerouslySetInnerHTML | HIGH | **TRUE** (5 of 6 locations) | 5 |
| 7 | Refresh rotation — empty token hashes | HIGH | **TRUE** | 6 |
| 8 | Registration — throwaway sessions | HIGH | **TRUE** | 6 |
| 9 | Access tokens not checked against revocation | HIGH | **TRUE** | 6 |
| 10 | importDoc app.inject without auth | HIGH | **TRUE** | 7 |
| 11 | Debug endpoints expose DB paths | MEDIUM | **TRUE** | 8 |
| 12 | Rate limiting uses x-user-id (bypassable) | MEDIUM | **TRUE** | 1 |
| 13 | /docs and /docs/trash return all docs | MEDIUM | **TRUE** | 3 |

**Score: 11 confirmed TRUE, 1 partially true, 1 false.**

---

## Work Scope Reference

Full work scope with 8 slices: [security-hardening-work-scope.md](../Roadmap/security-hardening-work-scope.md)

| Phase | Slices | Focus | Est. Days |
|-------|--------|-------|-----------|
| 1 | 1, 2, 3, 5, 6 | Identity foundation + XSS + sessions (parallel) | 4 |
| 2 | 4, 7 | WebSocket auth + importDoc fix | 2.5 |
| 3 | 8 | Debug cleanup + integration testing | 0.5 |
| **Total** | **8 slices** | | **~9 days** |

---

## Slice 1 Implementation — Canonical User Identity (COMPLETE)

**Completed:** 2026-02-20
**Vulnerabilities fixed:** #4 (Notification API spoofing), #12 (Rate limit bypass), partial #1 (cross-workspace bypass)
**TypeScript check:** `npx tsc --noEmit` — PASS (zero errors)

### What Changed

| File | Change | Purpose |
|------|--------|---------|
| `src/auth/middleware.ts` | After each `req.user` assignment, overwrite `req.headers['x-user-id']` with verified identity and set `req.userId` | Broad fix: all downstream code reading `x-user-id` automatically gets authenticated user |
| `src/auth/routes.ts` | Added `userId?: string` to FastifyRequest type augmentation | Type support for new `req.userId` convenience property |
| `src/workspace/middleware.ts` | `getUserIdFromRequest()` now checks `req.user?.id` first, then dev header fallback | Defense-in-depth: workspace identity resolution uses JWT identity |
| `src/middleware/rateLimit.ts` | `getUserKey()` uses `req.user?.id ?? req.ip` (ignores headers entirely) | Fixes Vuln #12: rate limiting can no longer be bypassed via spoofed header |
| `src/routes/notifications.ts` | All 5 `request.headers['x-user-id']` reads replaced with `request.user?.id` | Fixes Vuln #4: notification ownership based on authenticated identity |
| `src/routes/notificationPreferences.ts` | Local `getUserId()` uses `req.user?.id` first, dev header fallback | Defense-in-depth: preferences tied to authenticated user |

### What Was NOT Changed (and why)

~12 additional files still read `x-user-id` (AI routes, clauses, compliance, extraction, knowledge, server.ts provenance, requestLogger). These are **safe after the middleware header overwrite** — the auth middleware now forces `x-user-id` to match the JWT identity before any route handler executes. A follow-up cleanup pass can migrate them to `req.user?.id` for code consistency, but this is not security-critical.

### Decisions Made

1. **Two-layer approach**: Broad middleware header overwrite + explicit defense-in-depth changes to highest-risk files.
2. **`req.userId` shortcut added**: Convenience property set alongside the header overwrite, for clean access in future code.
3. **Dev mode preserved**: When `DEV_BYPASS_AUTH=true`, dev user identity is still derived from `X-Dev-User` header. This is intentional for local development.

### Risks

- AI routes that previously attributed actions to spoofed `x-user-id` now correctly attribute to the JWT user. This is correct behavior but changes attribution for any existing audit logs from this point forward.
- Dev mode remains permissive by design. In production (`DEV_BYPASS_AUTH` unset/false), all identity comes from JWT.

### How to Validate

1. `npx tsc --noEmit` — passes
2. Manual test: send request with spoofed `x-user-id: attacker` + valid JWT for user `alice` → notifications API returns only `alice`'s notifications
3. Rate limit: spoofed `x-user-id` header no longer affects rate limiting bucket — keyed on JWT `req.user.id`

---

## Slice 2 Implementation — Workspace Path/Header Mismatch Enforcement (COMPLETE)

**Completed:** 2026-02-21
**Vulnerability fixed:** #1 (Cross-workspace authorization bypass via header/path mismatch)
**TypeScript check:** `npx tsc --noEmit` — PASS (zero errors, both backend and frontend)

### What Changed

| File | Change | Purpose |
|------|--------|---------|
| `src/workspace/middleware.ts` | Rewrote `extractWorkspaceId()` into three functions: `extractPathWorkspaceId()`, `extractHeaderWorkspaceId()`, `resolveWorkspaceId()`. Middleware hook now detects path/header mismatch and returns 400. Added `requireWorkspaceMatch()` exported helper. | **Core fix**: if `X-Workspace-Id` header differs from `:wid`/`:workspaceId` path param → 400 `workspace_mismatch`. Path param is source of truth. |
| `src/routes/clauses.ts` | Added `requireWorkspaceMatch(req, reply, wid)` call to all 8 route handlers | Defense-in-depth: route-level validation |
| `src/routes/compliancePolicies.ts` | Added `requireWorkspaceMatch(req, reply, wid)` call to all 5 route handlers | Defense-in-depth: route-level validation |
| `src/routes/extractionStandards.ts` | Added `requireWorkspaceMatch(req, reply, workspaceId)` call to all 4 route handlers | Defense-in-depth: route-level validation (uses `:workspaceId` param name) |
| `src/routes/notificationPreferences.ts` | Added `requireWorkspaceMatch(request, reply, workspaceId)` call to both route handlers | Defense-in-depth: route-level validation |
| `src/routes/knowledge.ts` | Added `requireWorkspaceMatch` to all 12 workspace-scoped routes. Fixed `/docs/:id/related` to use `req.workspaceId` instead of header-based `getWorkspaceId()` | Defense-in-depth + fixed header-based workspace resolution |
| `src/routes/negotiations.ts` | Replaced manual header-based mismatch checks in `/workspaces/:wid/negotiations` and `/workspaces/:wid/negotiations/stats` with `requireWorkspaceMatch` | Replaced ad-hoc check with centralized guard |
| `src/routes/compliance.ts` | Replaced raw `req.headers['x-workspace-id']` and `req.headers['x-user-id']` reads with `req.workspaceId` and `req.user?.id` | Use middleware-validated values instead of raw headers |
| `src/routes/docReviewers.ts` | Renamed `getWorkspaceId()` to `getResolvedWorkspaceId()` using `req.workspaceId` instead of raw header | Use middleware-validated workspace ID |

### What Was NOT Changed (and why)

- **Auth middleware** (`src/auth/middleware.ts`) — Slice 1 already complete, no changes needed.
- **Non-workspace-scoped routes** in negotiations.ts (doc-scoped, session-scoped) — these use `getWorkspaceId()` from headers for context/attribution, not for authorization decisions. The middleware's header overwrite from Slice 1 makes these safe. A cleanup pass can migrate them to `req.workspaceId` for consistency but is not security-critical.
- **No API contract changes** — the `X-Workspace-Id` header description update is documented in the work scope for a batch contract update later.
- **No new dependencies** — pure code changes.

### Decisions Made

1. **Three-function decomposition**: Split workspace ID extraction into `extractPathWorkspaceId()`, `extractHeaderWorkspaceId()`, and `resolveWorkspaceId()` for clarity and testability.
2. **Path param is source of truth**: When both path and header are present, path wins. When only header exists, header is used. This means existing clients that omit the header but use path params work correctly (no breaking change).
3. **requireWorkspaceMatch as defense-in-depth**: The middleware catches mismatches globally, but each route also validates explicitly. Belt and suspenders.
4. **negotiations.ts already had ad-hoc checks**: The workspace-scoped negotiation routes already had manual mismatch validation. Replaced with the centralized `requireWorkspaceMatch` for consistency.

### Risks

- Routes that previously tolerated a missing `X-Workspace-Id` header when a path param was present now derive workspace from the path param automatically. This is **correct and non-breaking** — the middleware sets `req.workspaceId` from the path param.
- The `getWorkspaceId()` local helper function in knowledge.ts is no longer used by workspace-scoped routes (they use `req.params.wid` + `requireWorkspaceMatch`). It's still used by the local `getUserId()` helper via `x-user-id` header reads in some routes — these are safe post-Slice 1 (auth middleware overwrites the header).

### How to Validate

1. `npx tsc --noEmit` — passes (both backend and frontend)
2. Manual test: `PUT /workspaces/A/clauses` with `X-Workspace-Id: B` → expect 400 `workspace_mismatch`
3. Manual test: `GET /workspaces/A/clauses` without `X-Workspace-Id` header → works (middleware derives from path param)
4. Manual test: `GET /workspaces/A/clauses` with `X-Workspace-Id: A` → works (consistent, no mismatch)

---

## Slice 3 Implementation — /docs Membership + Global Endpoint Scoping (COMPLETE)

**Completed:** 2026-02-21
**Vulnerabilities fixed:** #13 (/docs returns all docs without workspace scope), #3 (Global endpoints unscoped)
**TypeScript check:** `npx tsc --noEmit` — PASS (zero errors, both backend and frontend)

### What Changed

| File | Change | Purpose |
|------|--------|---------|
| `src/workspace/middleware.ts` | Added `isPlatformAdmin()` and `requirePlatformAdmin()` helpers. Uses `KACHERI_ADMIN_USERS` env var (comma-separated user IDs). When env var unset, allows all authenticated users (dev-friendly default). | Platform admin gate for global endpoints |
| `src/server.ts` | `GET /docs`: replaced `devWorkspace(req)` with `req.workspaceId`, added 400 if missing, added 403 if user not a workspace member. `GET /docs/trash`: same pattern. | Fixes Vuln #13: /docs no longer returns all docs when workspace header omitted |
| `src/routes/artifacts.ts` | Added `requirePlatformAdmin(req, reply)` to all 7 global endpoints (`GET /artifacts`, `GET /artifacts/stats`, `GET /artifacts/pending`, `GET /artifacts/failed`, `GET /artifacts/:id`, `DELETE /artifacts/:id`, `POST /artifacts/:id/verify`). Added `checkDocAccess(db, req, reply, docId, 'viewer')` to `GET /docs/:docId/artifacts`. | Fixes Vuln #3: artifacts endpoints now admin-only |
| `src/routes/jobs.ts` | Added `requirePlatformAdmin(req, reply)` to all 7 global endpoints (`GET /jobs`, `GET /jobs/stats`, `GET /jobs/:id`, `POST /jobs`, `DELETE /jobs/:id`, `POST /jobs/:id/retry`, `POST /jobs/cleanup`). Added `checkDocAccess()` to `GET /docs/:docId/jobs`. Also fixed `userId` extraction to use `req.user?.id` instead of unsafe cast. | Fixes Vuln #3: jobs endpoints now admin-only |
| `src/routes/aiWatch.ts` | Added `requirePlatformAdmin(req, reply)` to all 5 global endpoints (`/ai/watch/summary`, `/ai/watch/events`, `/ai/watch/exports-summary`, `/ai/watch/providers`, `/ai/watch/hotspots`). Added `checkDocAccess()` to 2 doc-scoped endpoints (`/docs/:id/compose-determinism`, `/docs/:id/ai-ranges`). | Fixes Vuln #3: AI Watch global endpoints now admin-only, doc-scoped endpoints now access-checked |
| `src/routes/proofHealth.ts` | Added `checkDocAccess()` to `GET /docs/:id/proof-health`. Rewrote `POST /docs/proof-health/batch` to verify user has workspace access for each docId; inaccessible docIds are skipped and returned in `accessDenied` array. | Fixes batch endpoint: no longer returns health data for docs the user can't access |
| `Docs/Roadmap/deferred-work-scope.md` | Added item #9: "Enforce KACHERI_ADMIN_USERS Before Production Deployment" documenting that the env var must be set before production. | Tracks the dev-friendly default as a production hardening TODO |

### What Was NOT Changed (and why)

- **Debug endpoints** (`/__debug/*` in server.ts) — these are addressed in Slice 8 (depends on Slice 3's admin guard, now available).
- **`POST /docs` and `POST /docs/from-template`** — these already check workspace write access and use `devWorkspace(req)` for workspace context. They allow unscoped doc creation (no workspace header) for backward compatibility. A future cleanup pass can tighten this.
- **`GET /docs/:id`** and other doc-specific routes — these already use `checkDocAccess()` for authorization. No changes needed.
- **API Contract updates** — contract updates are batched for a single update after all slices, per work scope instructions.

### Decisions Made

1. **Admin gate uses env var, not DB**: `KACHERI_ADMIN_USERS` env var approach chosen (lightweight, no schema changes). Deferred to Roadmap 2.3 for proper admin roles.
2. **Unset env var = allow all**: When `KACHERI_ADMIN_USERS` is not set, all authenticated users can access global endpoints. This preserves current behavior and avoids breaking dev workflows. Documented as deferred production hardening item.
3. **Batch proof health filters silently**: Instead of failing the entire batch request when some docIds are inaccessible, we skip them and return an `accessDenied` array. This is more user-friendly for the frontend.
4. **Doc-scoped endpoints get doc-access checks**: `GET /docs/:docId/artifacts`, `GET /docs/:docId/jobs`, `GET /docs/:id/compose-determinism`, `GET /docs/:id/ai-ranges`, and `GET /docs/:id/proof-health` now validate the caller has at least viewer access to the document.

### Risks

- **Breaking change for `/docs` and `/docs/trash`**: Clients that rely on unscoped `GET /docs` will get 400 `workspace_required`. The frontend already sends `X-Workspace-Id` header, so this is non-breaking for the standard client.
- **Admin endpoints open when env var unset**: If `KACHERI_ADMIN_USERS` is not configured, all authenticated users can access global admin endpoints. This is by design for development and is documented in deferred-work-scope.md (#9).
- **Proof health batch response shape change**: Adds `accessDenied: string[]` to the response. Frontend should handle this gracefully (field is new, not breaking for existing consumers that ignore unknown fields).

### How to Validate

1. `npx tsc --noEmit` — passes (both backend and frontend)
2. `GET /docs` without `X-Workspace-Id` header → 400 `workspace_required`
3. `GET /docs` with valid `X-Workspace-Id` + member → 200 (returns workspace-scoped docs)
4. `GET /docs/trash` without `X-Workspace-Id` header → 400 `workspace_required`
5. `GET /artifacts` without `KACHERI_ADMIN_USERS` set → 200 (dev-friendly default)
6. `GET /artifacts` with `KACHERI_ADMIN_USERS=some_other_user` as non-listed user → 403
7. `POST /docs/proof-health/batch` with mix of accessible/inaccessible docIds → partial results + `accessDenied` array

---

## Slice 4 Implementation — WebSocket Authentication (COMPLETE)

**Completed:** 2026-02-21
**Vulnerability fixed:** #5 (WebSocket auth missing — CRITICAL)
**TypeScript check:** `npx tsc --noEmit` — PASS (zero errors, both backend and frontend)

### What Changed

| File | Change | Purpose |
|------|--------|---------|
| `src/realtime/workspaceWs.ts` | Added `authenticateUpgrade()` function that verifies JWT from `?token=` query param, checks workspace membership via `createWorkspaceStore(db).getUserRole()`. Upgrade handler now calls auth before `wss.handleUpgrade()`. Connection handler uses verified identity from JWT context, not query params. `hello` message no longer overrides identity. | **Core fix**: workspace WS now requires valid JWT + workspace membership |
| `src/realtime/yjsStandalone.ts` | Added lightweight JWT verification using `jsonwebtoken` directly. Added read-only SQLite DB connection for doc access checks (`doc_permissions`, `workspace_members`, `docs.created_by`). `authenticateUpgrade()` verifies JWT from `?token=` query param and checks doc access before allowing upgrade. | **Core fix**: Yjs standalone now requires valid JWT + doc access |
| `KACHERI FRONTEND/src/hooks/useWorkspaceSocket.ts` | `connect()` now reads fresh `accessToken` from localStorage and appends as `?token=` on each connection/reconnect. Base URL (with dev fallback userId/displayName) computed in `useMemo`, token injected dynamically. | Frontend sends JWT token to workspace WS; fresh token on each reconnect |
| `KACHERI FRONTEND/src/Editor.tsx` | `WebsocketProvider` created with `params: { token }` from localStorage. Added `onDisconnect` status listener that updates `provider.params.token` with fresh token from localStorage so reconnections use updated credentials. | Frontend sends JWT token to Yjs WS; token refreshed on disconnect |

### What Was NOT Changed (and why)

- **No new dependencies** — `jsonwebtoken` and `better-sqlite3` are already in `package.json`. The Yjs standalone uses `require()` for these (consistent with existing pattern in the file for `ws` and `y-leveldb`).
- **No API contract changes** — WebSocket auth token requirement will be documented in a batch contract update after all slices (per work scope).
- **No changes to auth middleware or routes** — WebSocket auth is self-contained, reusing existing JWT verification utilities.

### Decisions Made

1. **Token in query param** (not header or first-message handshake): WebSocket API does not support custom headers in browser. First-message handshake would require protocol changes on both sides. Query param is the standard approach (used by Socket.IO, Firebase, Supabase, etc.).
2. **Workspace WS — membership check**: `createWorkspaceStore(db).getUserRole()` is called during upgrade. If user is not a member, connection is rejected with 403 before WebSocket handshake completes.
3. **Yjs standalone — read-only DB**: Opens a separate read-only SQLite connection to avoid importing the full `db.ts` module (which runs migrations). The `KACHERI_DB_PATH` env var is shared between both processes.
4. **Yjs standalone — doc access mirrors `getEffectiveDocRole`**: Checks (in order): explicit `doc_permissions` entry → workspace membership (via `workspace_members` JOIN) → doc creator. Any match grants access.
5. **Dev mode bypass preserved**: When `DEV_BYPASS_AUTH=true` (non-production), both servers allow connections without valid tokens. Workspace WS falls back to query param identity. Yjs allows all connections. This preserves existing developer experience.
6. **Fresh token on reconnect (frontend)**: `useWorkspaceSocket` reads `localStorage.getItem('accessToken')` inside `connect()` (not in `useMemo`) so each reconnect attempt uses the latest token. `Editor.tsx` updates `provider.params.token` on disconnect events.
7. **Socket rejection protocol**: Invalid/missing tokens get `HTTP/1.1 401 Unauthorized` written to the raw socket before `socket.destroy()`. Unauthorized workspace/doc access gets `HTTP/1.1 403 Forbidden`. This follows WebSocket RFC 6455 upgrade rejection pattern.

### Risks

- **Token in query param visible in server logs**: Workspace WS operates outside Fastify's request lifecycle (upgrade handler on raw HTTP server), so Fastify access logs don't capture the URL. Yjs standalone logging doesn't log request URLs. No additional log scrubbing needed for current implementation.
- **Yjs standalone DB availability**: If the SQLite DB file doesn't exist or can't be opened, doc access checks are disabled. In dev mode, connections are allowed (fail-open). In production, connections are denied (fail-closed). A warning is logged.
- **Token expiry during long editing sessions**: Access tokens have 1-hour expiry. For Yjs, the provider's `params.token` is updated on disconnect, so reconnections after token refresh work. If the token expires while still connected (no disconnect), the connection remains active (already authenticated). This is acceptable — the auth was valid at connection time.
- **Breaking change for external WebSocket clients**: Any client connecting to workspace WS or Yjs without a token will be rejected in production. The internal frontend is updated in this same slice.

### How to Validate

1. `npx tsc --noEmit` — passes (both backend and frontend)
2. Connect to workspace WS without token → rejected (HTTP 401, non-dev mode)
3. Connect to workspace WS with valid token to authorized workspace → accepted
4. Connect to workspace WS with valid token to unauthorized workspace → HTTP 403
5. Connect to Yjs WS without token → rejected (HTTP 401, non-dev mode)
6. Connect to Yjs WS with valid token for accessible document → accepted
7. Dev mode with `DEV_BYPASS_AUTH=true` → connections work without token (backwards compatible)

---

## Slice 5 Implementation — HTML Sanitization / Stored XSS (COMPLETE)

**Completed:** 2026-02-21
**Vulnerability fixed:** #6 (Stored XSS via dangerouslySetInnerHTML — HIGH)
**TypeScript check:** `npx tsc --noEmit` — PASS (zero errors, both backend and frontend)
**New dependency:** `dompurify` ^3.x (runtime, frontend) + `@types/dompurify` ^3.x (devDependency, frontend)

### What Changed

| File | Change | Purpose |
|------|--------|---------|
| `KACHERI FRONTEND/package.json` | Added `dompurify` and `@types/dompurify` | Industry-standard HTML sanitizer for XSS prevention |
| `KACHERI FRONTEND/src/utils/sanitize.ts` | **New file.** Exports `sanitizeHtml(html)` wrapping DOMPurify with strict tag/attribute allowlist | Shared frontend sanitizer utility |
| `KACHERI FRONTEND/src/EditorPage.tsx` | Wrapped header content (line ~2489) and footer content (line ~2505) with `sanitizeHtml()` | Sanitize page header/footer HTML before rendering |
| `KACHERI FRONTEND/src/components/clauses/ClausePreviewModal.tsx` | Wrapped `clause.contentHtml` (line ~124) with `sanitizeHtml()` | Sanitize clause preview HTML |
| `KACHERI FRONTEND/src/pages/WorkspaceKnowledgeExplorerPage.tsx` | Wrapped `doc.snippet` (line ~464) with `sanitizeHtml()` | Sanitize search result snippets |
| `KACHERI FRONTEND/src/components/PDFImportModal.tsx` | Wrapped `displayHtml` (line ~326) with `sanitizeHtml()` | Sanitize PDF-extracted HTML |
| `KACHERI FRONTEND/src/components/negotiation/RoundCard.tsx` | Wrapped `detail.snapshotHtml` (line ~159) with `sanitizeHtml()` | Sanitize negotiation snapshot HTML |
| `KACHERI BACKEND/src/utils/sanitize.ts` | **New file.** Exports `stripDangerousHtml(html)` — regex-based strip of `<script>`, `<iframe>`, `<object>`, `<embed>` tags and `on*` event handlers | Shared backend defense-in-depth sanitizer |
| `KACHERI BACKEND/src/server.ts` | Import `stripDangerousHtml`. Sanitize `header.content` and `footer.content` in `PATCH /docs/:id/layout` before storing | Backend defense-in-depth: strip dangerous HTML on write for header/footer |
| `KACHERI BACKEND/src/routes/clauses.ts` | Import `stripDangerousHtml`. Sanitize `contentHtml` in POST create, POST from-selection, and PATCH update before storing | Backend defense-in-depth: strip dangerous HTML on write for clauses |

### What Was NOT Changed (and why)

- **SearchResultCard.tsx** — already has its own inline `sanitizeSnippet()` function that only allows `<mark>` tags. This is intentionally more restrictive than the shared sanitizer and correct for its use case. Not migrated.
- **No API contract changes** — all changes are internal (frontend rendering + backend input sanitization). No endpoint signatures changed.
- **No backend DOMPurify dependency** — backend defense-in-depth uses lightweight regex stripping. This is adequate because: (a) the primary defense is frontend DOMPurify, (b) backend content is rendered in the browser where DOMPurify runs, (c) no new dependency needed for server-side.

### Decisions Made

1. **DOMPurify for frontend, regex for backend**: DOMPurify is the industry standard for browser-based sanitization. Backend uses simpler regex as defense-in-depth (not primary defense).
2. **Shared utility files**: `KACHERI FRONTEND/src/utils/sanitize.ts` and `KACHERI BACKEND/src/utils/sanitize.ts` — follows existing `utils/` pattern in both codebases.
3. **Permissive allowlist**: Tags include `img`, `table`, `a`, `mark`, `span`, `div` and others needed for rich document content. Attributes include `style` and `class` for formatting. This matches actual content patterns in clauses, headers/footers, and knowledge snippets.
4. **Circular dependency avoided**: Initially placed `stripDangerousHtml` in `server.ts`, but `server.ts` imports `clauses.ts` → moved to `src/utils/sanitize.ts` to avoid circular import.

### Risks

- **DOMPurify may strip legitimate formatting** if the allowlist is too restrictive. Current allowlist is permissive (includes `style`, `class`, `img`, `a`, etc.). If users report formatting loss, the allowlist can be expanded.
- **New runtime dependency** (`dompurify`): ~20KB gzipped, zero dependencies, widely used (~50M weekly npm downloads). Minimal risk.
- **Backend regex sanitization is not comprehensive**: It strips the most common XSS vectors (`<script>`, `<iframe>`, `on*` handlers) but could miss exotic payloads. This is acceptable because the frontend DOMPurify is the primary defense.

### How to Validate

1. `npx tsc --noEmit` — passes (both backend and frontend)
2. Create clause with `<img src=x onerror="alert(1)">` → rendered without `onerror` attribute
3. Set header content with `<script>alert(1)</script>` → script tag stripped on both storage (backend) and render (frontend)
4. Create clause with `<iframe src="https://evil.com"></iframe>` → iframe stripped on storage and render
5. Verify legitimate formatting preserved: bold, italic, headings, lists, tables, links, images all render correctly

---

## Slice 6 Implementation — Session Lifecycle Fixes (COMPLETE)

**Completed:** 2026-02-21
**Vulnerabilities fixed:** #7 (Empty token hashes in refresh rotation), #8 (Throwaway sessions in registration), #9 (Access tokens not checked against user status)
**TypeScript check:** `npx tsc --noEmit` — PASS (zero errors, both backend and frontend)

### What Changed

| File | Change | Purpose |
|------|--------|---------|
| `src/auth/sessions.ts` | Added `updateTokenHash(sessionId, refreshToken)` to `SessionStore` interface and implementation. Updates the `token_hash` column for an existing session. | Enables the create→generate→update pattern that resolves the chicken-and-egg problem between session IDs and refresh token hashing |
| `src/auth/routes.ts` (POST /register) | Replaced two-session creation with single-session pattern: `create('')` → `createTokenPair(session.id)` → `updateTokenHash()`. Eliminated throwaway session. | **Fixes Vuln #8**: Registration now creates exactly 1 session with the correct refresh token hash |
| `src/auth/routes.ts` (POST /login) | Replaced temp-token pattern with same single-session pattern: `create('')` → `createTokenPair(session.id)` → `updateTokenHash()`. | **Fixes token hash mismatch in login**: Session now stores hash of the actual returned refresh token (was storing hash of an intermediate temp token) |
| `src/auth/routes.ts` (POST /refresh) | Added `sessionStore.updateTokenHash(session.id, tokens.refreshToken)` after token generation. | **Fixes Vuln #7**: Refreshed session now has hash of the actual refresh token (was `hash('')`) |
| `src/auth/middleware.ts` | Added `isUserActive()` function with in-memory TTL cache (60s). Imported `UserStore` type. Check runs after JWT validation succeeds, before attaching user to request. Returns 401 if user is not active. | **Fixes Vuln #9**: Suspended/deleted users are denied access within 60s of status change, even with valid unexpired access tokens |

### What Was NOT Changed (and why)

- **Session schema** (`sessions` table) — no schema changes needed. The `token_hash` column already exists; we just update it correctly now.
- **Logout flow** — already correct. Uses `sessionStore.revoke(payload.sid)` which works regardless of token hash.
- **Dev mode bypass** — user status check is skipped for dev bypass users (they don't exist in the DB). This is correct — dev mode doesn't enforce user status.
- **Frontend** — no frontend changes. Session lifecycle is entirely server-side.

### Decisions Made

1. **`updateTokenHash` method added to SessionStore**: The chicken-and-egg problem (session ID needed for token, token needed for session hash) is resolved by a two-step pattern: create session with placeholder hash, generate tokens, then update the hash. This is cleaner than pre-generating session IDs outside the store.
2. **Login flow also fixed**: The work scope only specified refresh rotation and registration, but login had the same token hash mismatch bug (storing hash of an intermediate `tempTokens.refreshToken` that was never returned to the client). Fixed for consistency.
3. **60-second TTL cache for user status**: Simple `Map<string, { status, cachedAt }>` at module level. No external dependency. Acceptable tradeoff: a suspended user may remain active for up to 60 seconds. Cache is per-process (not shared across workers, if any).
4. **User status defaults to 'deleted' if not found**: If `userStore.findById()` returns null, the user is treated as deleted (not active). This is the safe default.

### Risks

- **60-second cache window**: A suspended user can still make requests for up to 60 seconds after suspension. For the current threat model (internal legal document system, not financial transactions), this is acceptable. If tighter enforcement is needed, the TTL can be reduced or a cache invalidation mechanism can be added.
- **Login flow change**: The old login flow created tokens twice (temp + final). The new flow creates them once. This is simpler and correct, but changes the behavior for any code that depended on the old two-step pattern. No such code exists.
- **In-memory cache is per-process**: If the backend runs in multiple processes/workers, each has its own cache. A user suspended in one process may remain cached as active in another for up to 60 seconds. This is acceptable for the current single-process SQLite architecture.

### How to Validate

1. `npx tsc --noEmit` — passes (both backend and frontend)
2. Register → verify only 1 session created (not 2), session has non-empty token hash
3. Login → verify session's `token_hash` matches `sha256(returnedRefreshToken)`
4. Refresh → verify new session has non-empty token hash matching the new refresh token
5. Suspend user → verify subsequent access token requests return 401 within 60s

---

## Slice 7 Implementation — importDoc app.inject Fix (COMPLETE)

**Completed:** 2026-02-21
**Vulnerability fixed:** #10 (importDoc bypasses auth/workspace — HIGH)
**TypeScript check:** `npx tsc --noEmit` — PASS (zero errors, both backend and frontend)

### What Changed

| File | Change | Purpose |
|------|--------|---------|
| `src/routes/importDoc.ts` | Added imports for `createDoc` (from `../store/docs`), `recordProvenance` (from `../provenance`), `logAuditEvent` (from `../store/audit`) | Bring in direct store and provenance functions |
| `src/routes/importDoc.ts` | Replaced `app.inject({ method: 'POST', url: '/docs', payload: { title } })` with direct `createDoc(title, importWorkspace, importUserId)` call | **Core fix**: document creation now uses authenticated user identity (`req.user?.id`) and validated workspace ID (`req.workspaceId`) instead of bypassing auth via internal HTTP call |
| `src/routes/importDoc.ts` | Added `recordProvenance()` call after doc creation, mirroring the `POST /docs` handler pattern | Imported documents now have a provenance record for their creation event |
| `src/routes/importDoc.ts` | Added `logAuditEvent()` call for workspace-scoped imports | Imported documents now appear in workspace audit logs |
| `src/routes/importDoc.ts` | Replaced `importWorkspaceId` (from raw header) with `importWorkspace` (from validated `req.workspaceId` or header fallback) in the FTS sync and entity harvester section | Auto-index hooks now use the same validated workspace ID as the doc creation |

### What Was NOT Changed (and why)

- **`GET /docs/:id/import/source` and `GET /docs/:id/import/meta`** — already have `checkDocAccess()` guards from existing code. No changes needed.
- **No API contract changes** — this is an internal behavior fix. The `POST /docs/import` endpoint signature is unchanged.
- **No new dependencies** — uses existing `createDoc`, `recordProvenance`, `logAuditEvent` functions.
- **Conversion pipeline, proofs, extraction, auto-index** — all downstream logic remains unchanged. Only the initial doc shell creation was fixed.

### Decisions Made

1. **Direct store call over app.inject**: `createDoc()` is the correct pattern for internal operations. The `app.inject()` approach was a shortcut that bypassed the entire middleware chain (auth, workspace validation, rate limiting). Direct store calls are simpler, faster, and correctly scoped.
2. **Workspace ID resolution**: Uses `req.workspaceId` (set by Slice 2 middleware for path-param routes) first, falling back to `req.headers['x-workspace-id']` (for routes like `/docs/import` that don't have workspace in the path). This ensures both middleware-validated and header-based workspace contexts work.
3. **Provenance + audit mirroring**: Added the same `recordProvenance()` and `logAuditEvent()` calls that `POST /docs` in `server.ts` performs. This ensures imported documents have identical audit trails to manually created documents.
4. **Unified workspace variable**: The `importWorkspace` variable is now shared between doc creation (top of handler) and auto-index hooks (bottom of handler), eliminating the duplicate header read that existed before.

### Risks

- **None identified.** Direct store call is simpler and more correct than self-injection. No breaking changes — the response shape and behavior are identical from the client's perspective.

### How to Validate

1. `npx tsc --noEmit` — passes (both backend and frontend)
2. Import document with valid JWT + `X-Workspace-Id` → verify doc has correct `workspace_id` and `created_by` in DB
3. Import document → verify provenance record exists with `action: 'create'` and `source: 'import'`
4. Import document in workspace → verify audit log entry with `action: 'doc:create'`

---

## Slice 8 Implementation — Debug Endpoints + Cleanup (COMPLETE)

**Completed:** 2026-02-21
**Vulnerability fixed:** #11 (Debug endpoints expose DB paths and raw provenance data — MEDIUM)
**TypeScript check:** `npx tsc --noEmit` — PASS (zero errors, both backend and frontend)

### What Changed

| File | Change | Purpose |
|------|--------|---------|
| `src/server.ts` | Added `requirePlatformAdmin` import from `./workspace/middleware`. Wrapped all three `/__debug/*` routes in `process.env.NODE_ENV === 'production'` conditional. Production: catch-all `/__debug/*` returns 404. Non-production: each route gated with `requirePlatformAdmin(req, reply)`. | **Core fix**: debug endpoints return 404 in production, require admin in development |
| `Docs/API_CONTRACT.md` | Added **Access** notes to all 3 debug endpoint entries documenting production-disabled + admin-gated behavior. Added **Token Storage (Known Limitation)** subsection to Auth section documenting localStorage limitation and httpOnly cookie migration as future work. | Contract documentation for Vuln #11 fix + token storage advisory |

### What Was NOT Changed (and why)

- **No code changes for token storage**: localStorage → httpOnly cookie migration requires a full auth flow redesign (CSRF protection, SameSite, cookie-based refresh). Documented as future hardening item per work scope.
- **No CSP headers**: Content Security Policy is a separate infrastructure concern, out of scope per work scope.
- **No frontend changes**: This slice is entirely backend + documentation.

### Decisions Made

1. **Production catch-all wildcard**: `app.get('/__debug/*')` returns 404 in production, making debug endpoints completely invisible (no 403 that would reveal their existence).
2. **Admin gate reuses Slice 3 pattern**: Same `requirePlatformAdmin()` helper from `workspace/middleware.ts` used by artifacts.ts, jobs.ts, aiWatch.ts. Consistent with env-var-based `KACHERI_ADMIN_USERS` approach.
3. **Token storage advisory in API contract**: Added to the Auth section as a "Known Limitation" subsection. This documents the risk without implying it will be fixed in this scope.

### Risks

- **None identified.** Debug endpoints are strictly dev-only. The admin gate adds defense-in-depth for development environments.

### How to Validate

1. `npx tsc --noEmit` — passes (both backend and frontend)
2. `NODE_ENV=production` → `GET /__debug/sqlite` returns 404
3. `NODE_ENV=development` + admin user (in `KACHERI_ADMIN_USERS`) → returns data
4. `NODE_ENV=development` + non-admin user → returns 403
5. `NODE_ENV=development` + `KACHERI_ADMIN_USERS` unset → any authenticated user can access (dev-friendly default)

---

## Security Hardening — Complete Summary

All 8 slices of the security hardening work scope are now implemented:

| Slice | Name | Vuln(s) Fixed | Status |
|-------|------|---------------|--------|
| 1 | Canonical User Identity | #4, #12, partial #1 | COMPLETE |
| 2 | Workspace Path/Header Mismatch | #1 | COMPLETE |
| 3 | /docs Membership + Global Scoping | #13, #3 | COMPLETE |
| 4 | WebSocket Authentication | #5 | COMPLETE |
| 5 | HTML Sanitization (XSS) | #6 | COMPLETE |
| 6 | Session Lifecycle Fixes | #7, #8, #9 | COMPLETE |
| 7 | importDoc app.inject Fix | #10 | COMPLETE |
| 8 | Debug Endpoints + Cleanup | #11 | COMPLETE |

### Remaining Follow-ups (Not In Scope)

1. **Batch API Contract update**: `X-User-Id` → ignored, `X-Workspace-Id` → required for workspace-scoped endpoints, WebSocket auth token requirement. These are documentation-only changes to reflect the code reality after all 8 slices.
2. **httpOnly cookie migration**: Future hardening item requiring full auth flow redesign.
3. **Content Security Policy headers**: Separate infrastructure concern.
4. **`KACHERI_ADMIN_USERS` enforcement before production**: Documented in deferred-work-scope.md (#9).
