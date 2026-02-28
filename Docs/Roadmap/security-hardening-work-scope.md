# Security Hardening Work Scope

**Created:** 2026-02-20
**Triggered by:** Security audit identifying 11 confirmed + 1 partially confirmed vulnerabilities
**Audit report:** Inline in session report `Docs/session-reports/2026-02-20-security-hardening.md`

---

## Context

A security audit of the BEYLE KACHERI codebase identified critical authorization, authentication, and input sanitization vulnerabilities. The root cause is a dual-identity design flaw: JWT middleware correctly sets `req.user`, but most code paths rely on client-supplied `x-user-id` and `x-workspace-id` headers instead. Combined with missing WebSocket auth, unsanitized HTML rendering, and session rotation bugs, the system has multiple exploitable paths.

This work scope addresses all confirmed vulnerabilities in priority order.

---

## Roadmap Alignment

### Covered Roadmap Sections
- **1.3 Workspace, Auth, RBAC & Sharing** — "Real authentication (e.g. OIDC/JWT) with stable user IDs used in proofs and provenance", "Workspace boundaries via workspace_id", "Doc-level permissions... enforced on read/write/AI/export", "Workspace-level roles (owner/admin/member)"
- **1.7 Ops, Safety & Platform** — "Basic guardrails: timeouts, retries, rate limits"
- **2.3 Advanced RBAC & Enterprise IT** — This work is a prerequisite. Without correct authorization primitives, RBAC is decorative.

### Architecture Alignment
- Blueprint: "RBAC", "SOC2 Logs", "Workspace Broadcasts" — all require auth correctness
- No new architectural boundaries introduced. All changes enforce existing boundaries that are currently unenforced.

---

## Slice Plan

### Phase 1: Identity Foundation (Slices 1-3)
Fix the root cause: eliminate client-supplied identity headers from authorization decisions.

### Phase 2: Channel Security (Slices 4-5)
Secure WebSocket connections and sanitize rendered HTML.

### Phase 3: Session & Edge Cases (Slices 6-8)
Fix session lifecycle, importDoc bypass, and debug exposure.

---

## Slice 1: Canonical User Identity — Eliminate x-user-id Trust

**Fixes:** Vuln #4 (Notification API spoofing), Vuln #12 (Rate limit bypass), partial fix for #1
**Severity:** CRITICAL
**Files:** ~15 backend files

### Problem
`x-user-id` header is used for:
- Notification read/write (notifications.ts, notificationPreferences.ts)
- Rate limiting key (rateLimit.ts)
- AI action attribution (compose.ts, translate.ts, etc.)
- Audit logging

But JWT middleware already sets `req.user.id` with the authenticated identity.

### Changes

1. **Auth middleware** (`src/auth/middleware.ts`):
   - After JWT validation sets `req.user`, also set `req.headers['x-user-id'] = req.user.id` (overwrite any client value)
   - This makes downstream code that reads `x-user-id` automatically get the authenticated user
   - In dev bypass mode, keep existing behavior (synthetic user)

2. **`getUserId()` helpers** (workspace/middleware.ts, notificationPreferences.ts):
   - Change priority order: `req.user?.id` first, then header fallback (dev mode only)
   - Add `req.userId` convenience property in auth middleware for clean access

3. **Rate limiting** (`src/middleware/rateLimit.ts`):
   - Change `getUserKey()` to use `req.user?.id ?? req.ip` (ignore headers entirely)

4. **Notification routes** (`src/routes/notifications.ts`, `src/routes/notificationPreferences.ts`):
   - Replace all `request.headers['x-user-id']` reads with `request.user?.id`

### Validation
- `npx tsc --noEmit` passes
- Manual test: send request with spoofed `x-user-id` header, verify it's ignored

### Risks
- AI routes that use `x-user-id` for attribution will switch to authenticated user. This is correct behavior.
- Dev mode still allows header-based identity when `DEV_BYPASS_AUTH=true`

---

## Slice 2: Workspace Path/Header Mismatch — Enforce Consistency

**Fixes:** Vuln #1 (Cross-workspace authorization bypass)
**Severity:** CRITICAL
**Files:** workspace/middleware.ts + all routes with `:wid` or `:workspaceId` path params

### Problem
`req.workspaceRole` is derived from `X-Workspace-Id` header, but routes operate on workspace ID from the URL path. Attacker sets header to a workspace where they're ADMIN and operates on a different workspace in the path.

### Changes

1. **Workspace middleware** (`src/workspace/middleware.ts`):
   - Add path-param extraction: check `req.params.wid` or `req.params.workspaceId`
   - If path param exists AND header workspace differs → return 400 `workspace_mismatch`
   - If path param exists AND no header → derive workspace from path param (use path as source of truth)
   - Store `req.workspaceId` from the resolved (validated) workspace ID

2. **Route-level validation** (defense in depth):
   - Add a shared `requireWorkspaceMatch(req)` helper that routes can call explicitly
   - Apply to all workspace-scoped routes: clauses.ts, compliancePolicies.ts, extractionStandards.ts, notificationPreferences.ts, knowledge.ts, negotiations.ts, compliance.ts, docReviewers.ts

### Validation
- `npx tsc --noEmit` passes
- Test: send `PUT /workspaces/A/clauses` with `X-Workspace-Id: B` → expect 400

### Risks
- Clients that currently omit `X-Workspace-Id` but use path params will now work correctly (middleware derives from path). No breaking change.

---

## Slice 3: /docs Membership Enforcement + Global Endpoint Scoping

**Fixes:** Vuln #13 (/docs returns all docs), Vuln #3 (Global endpoints unscoped)
**Severity:** CRITICAL (docs) + MEDIUM (global endpoints)
**Files:** server.ts, artifacts.ts, jobs.ts, aiWatch.ts, proofHealth.ts

### Problem
- `/docs` and `/docs/trash` return ALL documents when `X-Workspace-Id` is omitted
- `/artifacts`, `/jobs`, `/ai/watch/*` return global data to any authenticated user

### Changes

1. **`GET /docs` and `GET /docs/trash`** (server.ts):
   - Require `workspaceId` — if missing, return 400 `workspace_required`
   - Add membership check: verify user is a member of the workspace before listing

2. **Global admin endpoints** (artifacts.ts, jobs.ts):
   - Add admin-only guard: check `req.user.role === 'admin'` or equivalent
   - If no admin role system exists yet, require a specific env-configured admin user list (`KACHERI_ADMIN_USERS`)

3. **AI Watch endpoints** (aiWatch.ts):
   - Workspace-scoped endpoints (already have `workspaceId` param): validate membership
   - Global summary endpoints: restrict to admin or require workspace filter

4. **Proof health batch** (proofHealth.ts):
   - `POST /docs/proof-health/batch`: validate all provided docIds belong to workspaces the user has access to

### Validation
- `npx tsc --noEmit` passes
- Test: `GET /docs` without workspace header → 400
- Test: `GET /artifacts` as non-admin → 403

### Risks
- Breaking change for any client that relies on unscoped `/docs` → must add `X-Workspace-Id` header. This is correct behavior.

---

## Slice 4: WebSocket Authentication

**Fixes:** Vuln #5 (WebSocket auth missing)
**Severity:** CRITICAL
**Files:** realtime/workspaceWs.ts, realtime/yjsStandalone.ts (or equivalent paths)

### Problem
- Workspace WebSocket trusts `userId`/`displayName` from query params
- Yjs standalone server has zero authentication

### Changes

1. **Workspace WebSocket** (workspaceWs.ts):
   - On `upgrade`: extract `token` from query params or `Authorization` header
   - Validate JWT (reuse `verifyToken()` from auth module)
   - Extract `userId` from validated JWT payload (ignore query param)
   - Validate workspace membership before allowing connection
   - Reject with 401/403 on failure (destroy socket)

2. **Yjs Standalone** (yjsStandalone.ts):
   - On `upgrade`: extract and validate JWT token from query param `?token=<jwt>`
   - Parse `docName` from URL path
   - Validate user has access to the document (query doc permissions)
   - Reject unauthorized connections

3. **Frontend WebSocket clients** (useWorkspaceSocket.ts, Editor.tsx Yjs provider):
   - Include `accessToken` in WebSocket connection URL as query param
   - Handle 401 reconnection (refresh token, reconnect)

### Validation
- Connect without token → rejected
- Connect with valid token to authorized workspace → accepted
- Connect with valid token to unauthorized workspace → 403

### Risks
- Breaking change for any external WebSocket clients. Internal frontend updated in same slice.
- Token in query param is visible in server logs — ensure logs don't record full query strings

---

## Slice 5: HTML Sanitization — Eliminate Stored XSS

**Fixes:** Vuln #6 (Stored XSS via dangerouslySetInnerHTML)
**Severity:** HIGH
**Files:** 5 frontend components + 1 new dependency
**New dependency:** `dompurify` (+ `@types/dompurify`)

### Problem
5 components render user-controlled HTML with `dangerouslySetInnerHTML` without sanitization. Combined with tokens in localStorage, this enables account takeover.

### Changes

1. **Install DOMPurify**:
   - `npm install dompurify` (runtime) + `npm install -D @types/dompurify` (types)
   - DOMPurify is the industry-standard HTML sanitizer (~20KB gzipped, zero dependencies)
   - Alternatives considered: `sanitize-html` (heavier, server-side focused), custom regex (fragile, bypassable)

2. **Create shared sanitizer** (`src/utils/sanitize.ts`):
   - `sanitizeHtml(html: string): string` — DOMPurify with strict allowlist
   - Allowed tags: `p, br, strong, em, u, s, h1-h6, ul, ol, li, a, table, thead, tbody, tr, th, td, blockquote, pre, code, mark, span, div, img`
   - Allowed attributes: `href, src, alt, class, style` (style limited to safe properties)
   - Strip `<script>`, `<iframe>`, `<object>`, `<embed>`, event handlers (`on*`)

3. **Apply to all 5 vulnerable locations**:
   - `EditorPage.tsx:2488,2504` — header/footer HTML: `sanitizeHtml(layoutSettings.header.content)`
   - `ClausePreviewModal.tsx:124` — clause content: `sanitizeHtml(clause.contentHtml)`
   - `WorkspaceKnowledgeExplorerPage.tsx:464` — snippet: `sanitizeHtml(doc.snippet)`
   - `PDFImportModal.tsx:326` — extracted text: `sanitizeHtml(displayHtml)`
   - `RoundCard.tsx:159` — negotiation snapshot: `sanitizeHtml(detail.snapshotHtml)`

4. **Backend input validation** (defense in depth):
   - `server.ts` (header/footer save): strip `<script>` and event handlers on write
   - `routes/clauses.ts` (clause create/update): sanitize `contentHtml` on write

### Validation
- `npx tsc --noEmit` passes
- Test: create clause with `<img src=x onerror="alert(1)">` → rendered without `onerror`
- Test: set header content with `<script>alert(1)</script>` → script stripped

### Risks
- DOMPurify may strip legitimate formatting if allowlist is too restrictive. Start permissive, tighten based on actual content patterns.
- New runtime dependency — requires approval per dependency policy

---

## Slice 6: Session Lifecycle Fixes

**Fixes:** Vuln #7 (Empty token hashes), Vuln #8 (Throwaway sessions), Vuln #9 (Access tokens not checked against revocation)
**Severity:** HIGH
**Files:** src/auth/routes.ts, src/auth/middleware.ts

### Problem
- Refresh rotation creates sessions with hash of empty string (predictable)
- Registration creates orphaned session records
- Access tokens are not validated against session revocation or user status

### Changes

1. **Refresh rotation** (routes.ts, ~line 276):
   - Create session AFTER generating new refresh token
   - `sessionStore.create(user.id, newRefreshToken)` — pass actual token, not empty string
   - Or: create session first, then update token hash after token generation

2. **Registration** (routes.ts, ~line 135):
   - Remove throwaway session creation
   - Generate session and tokens in single pass: create session → generate tokens with session ID → update session with refresh token hash

3. **Access token middleware validation** (middleware.ts, ~line 95):
   - After JWT validation, add lightweight session check:
     - Extract `sid` from token payload (if present) or skip (access tokens may not carry session ID)
     - Check user status: `usersStore.getById(payload.sub)?.status === 'active'`
     - Cache user status check (e.g., 60-second TTL) to avoid DB hit per request
   - If user is suspended/deleted → return 401

### Validation
- `npx tsc --noEmit` passes
- Test: register → verify only 1 session created (not 2)
- Test: refresh → verify session has non-empty token hash
- Test: suspend user → verify subsequent access token requests return 401 within cache TTL

### Risks
- Adding a DB lookup to access token validation adds latency (~1ms for SQLite). Mitigate with in-memory cache (60s TTL).
- Changing token flow in registration could break existing refresh tokens. Include backward-compatible handling for old token format.

---

## Slice 7: importDoc app.inject Fix

**Fixes:** Vuln #10 (importDoc bypasses auth/workspace)
**Severity:** HIGH
**Files:** src/routes/importDoc.ts

### Problem
`app.inject({ method: 'POST', url: '/docs', payload: { title } })` creates a document without auth or workspace headers, bypassing all authorization.

### Changes

1. **Replace app.inject with direct store call**:
   - Import `createDoc` from `src/store/docs.ts`
   - Call `createDoc({ title, workspaceId, userId: req.user.id })` directly
   - Remove the `app.inject()` call entirely
   - This is the correct pattern — internal operations should call store functions, not HTTP endpoints

2. **Pass workspace context**:
   - Extract `workspaceId` from request context (already available in the import handler)
   - Pass to `createDoc` so the new document is workspace-scoped

### Validation
- `npx tsc --noEmit` passes
- Test: import document → verify it's created in the correct workspace with correct owner

### Risks
- None. Direct store call is simpler and more correct than self-injection.

---

## Slice 8: Debug Endpoints + Cleanup

**Fixes:** Vuln #11 (Debug endpoints exposed)
**Severity:** MEDIUM
**Files:** src/server.ts

### Problem
`/__debug/sqlite`, `/__debug/docIds`, `/__debug/doc/:id/provRaw` have no access control. They expose DB file paths and raw provenance data to any authenticated user.

### Changes

1. **Guard debug endpoints**:
   - Wrap all `/__debug/*` routes in a `NODE_ENV !== 'production'` check
   - If `NODE_ENV === 'production'`, return 404 (endpoints don't exist)
   - If `NODE_ENV !== 'production'`, require admin user (same guard as Slice 3)

2. **Token storage advisory** (informational, no code change):
   - Document in API contract that localStorage token storage is a known limitation
   - Recommend httpOnly cookie migration as a future hardening item (blocked on cookie-based auth flow)

### Validation
- `NODE_ENV=production` → `GET /__debug/sqlite` returns 404
- `NODE_ENV=development` + admin user → returns data
- `NODE_ENV=development` + non-admin → returns 403

### Risks
- None. Debug endpoints are explicitly dev-only per API contract.

---

## Slice Summary

| Slice | Name | Severity Fixed | Est. Days | Dependencies |
|-------|------|----------------|-----------|--------------|
| 1 | Canonical User Identity | CRITICAL | 1 | None |
| 2 | Workspace Path/Header Mismatch | CRITICAL | 1.5 | Slice 1 |
| 3 | /docs Membership + Global Scoping | CRITICAL + MEDIUM | 1.5 | Slice 1 |
| 4 | WebSocket Authentication | CRITICAL | 2 | Slice 1 |
| 5 | HTML Sanitization (XSS) | HIGH | 1 | None (parallel with 1-4) |
| 6 | Session Lifecycle Fixes | HIGH | 1 | None (parallel with 1-5) |
| 7 | importDoc app.inject Fix | HIGH | 0.5 | Slice 1 |
| 8 | Debug Endpoints + Cleanup | MEDIUM | 0.5 | Slice 3 (admin guard) |
| **TOTAL** | | | **9** | |

---

## Execution Order

```
Phase 1 (Days 1-4):  Slice 1 → Slice 2 → Slice 3
                      Slice 5 (parallel)
                      Slice 6 (parallel)

Phase 2 (Days 4-6):  Slice 4 (depends on Slice 1)
                      Slice 7 (depends on Slice 1)

Phase 3 (Day 6-7):   Slice 8 (depends on Slice 3)
                      Final integration test pass
```

---

## New Dependency Required

| Dependency | Type | Version | Why | Alternatives |
|------------|------|---------|-----|--------------|
| `dompurify` | runtime | `^3.x` | HTML sanitization for XSS prevention | `sanitize-html` (heavier), custom regex (fragile/bypassable) |
| `@types/dompurify` | devDependency | `^3.x` | TypeScript types | N/A |

**Approval required per CLAUDE.md Section 7.**

---

## API Contract Changes Required

1. **Common Headers** (line 136-137): Update `X-Workspace-Id` to "Required for workspace-scoped endpoints". Update `X-User-Id` description to "Ignored — user identity derived from JWT".
2. **`GET /docs`**: Add "Requires X-Workspace-Id" to description.
3. **`GET /docs/trash`**: Same.
4. **Debug endpoints**: Add "Development only. Disabled in production." note.
5. **WebSocket Events**: Add "Authentication: token required as query parameter" note.
6. **`POST /docs/import`**: No contract change (internal behavior fix).

---

## Out of Scope

- **httpOnly cookie migration**: Requires full auth flow redesign (cookie-based CSRF protection, SameSite, etc.). Documented as future item.
- **Content Security Policy (CSP) headers**: Should be added but is a separate infrastructure concern.
- **Advanced RBAC (Roadmap 2.3)**: This work fixes the authorization *primitives*. Group roles, SCIM, legal hold remain deferred.
- **File manager cross-tenant access**: Audit confirmed FALSE — already properly scoped. No changes needed.
