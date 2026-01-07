# CLAUDE.md — BEYLE KACHERI Engineering Guardrails

You are Claude Code operating inside the **BEYLE KACHERI** repository.

You must behave as a **production-grade engineering agent**, not a prototyper.

---

## CORE TRUTH MODEL (NON-NEGOTIABLE)

- The **repository is the source of truth** for what currently exists and runs.
- The **Docs directory is the source of truth for intent**: architecture, product philosophy, scope, and sequencing.
- **Session reports are system memory**: decisions, constraints, and continuity across sessions.

If these sources disagree, you must STOP.

You are NOT allowed to guess, infer missing requirements, or silently reconcile drift.

---

## 1. ABSOLUTE STOP RULES (NON-NEGOTIABLE)

You must NOT:
- Add or modify any code, file, schema, config, or dependency
- Generate migrations or change persistence formats
- Introduce new APIs, endpoints, background jobs, or execution paths

until you complete the **Repo & Docs Awareness Protocol** (Section 2).

If any required document is missing, unreadable, ambiguous, or contradictory:
→ STOP  
→ Document the issue  
→ Ask the user  

Inference is forbidden. Guessing is failure.

---

## 2. REPO & DOCS AWARENESS PROTOCOL (MANDATORY)

Before proposing or making *any* mutation, you must ground yourself in **both reality and authority**.

---

### 2.1 Repository Reality (What Exists)

You must inspect the relevant areas of the repository (e.g. backend or frontend) to understand:
- what is implemented
- what behavior currently exists
- how data and control flow actually behave

You may observe implementation.
You may NOT infer intent from it.

Code describes **what is**, not **what should be**.

---

### 2.2 Documentation Authority (What Is Allowed)

You must explicitly read and defer to the following documents.

#### Architecture Blueprint (Architecture Is Law)
- `Docs/blueprint/architecture blueprint.md`

This blueprint defines:
- system boundaries
- responsibilities
- allowed communication paths
- frontend vs backend ownership

You must not blur layers, collapse boundaries, or introduce shortcuts.

If the current codebase violates the blueprint:
- Call it out explicitly
- Do NOT “fix” it unless explicitly asked

---

#### Roadmap (Hard Constraint)
- `Docs/Roadmap/docs roadmap.md`

The roadmap defines:
- feature scope
- sequencing and phases
- allowed system evolution
- explicitly out-of-scope work

The roadmap is a **locked execution plan**, not guidance.

---

#### API Contract (Contract Is Law)
- `Docs/API_CONTRACT.md`

This contract defines:
- allowed endpoints
- request/response payloads
- field names and types
- status codes
- error formats
- auth-related expectations

You MUST:
- read the contract before any API-related work
- match it exactly in implementation
- update it whenever a new endpoint or behavior is introduced

If implementation and contract diverge:
→ STOP

---

### 2.3 Session Context (System Memory)

You must read relevant prior session reports (if present) before continuing work.

Session reports capture:
- prior decisions
- accepted and rejected approaches
- known risks and unresolved questions

You are not allowed to ignore or overwrite prior session context without explicit instruction.

---

## 3. DRIFT HANDLING (CRITICAL)

If you detect drift between:
- repository behavior
- architecture blueprint
- roadmap intent
- API contract
- prior session reports

You must:
1. Identify the drift explicitly
2. State which sources disagree
3. Record it in the active session report
4. STOP and ask for direction

You may NOT silently “fix” drift.

---

## 4. SESSION REPORTING (MANDATORY)

### 4.1 Session Initialization

At the **start of every session**, you must create a session report at:

`Docs/session-reports/YYYY-MM-DD-<context>.md`

This report must include:
- session goal
- architecture and roadmap sections involved
- documents read
- assumptions explicitly ruled out
- known constraints
- identified risks or drift

No work may proceed without an initialized session report.

---

### 4.2 Incremental Updates (Slice-Based)

After each meaningful slice of work, update the same session report with:
- what was completed
- what was intentionally not changed
- decisions made
- new risks or unknowns
- next intended slice

Session reports are append-only and chronological.

---

## 5. ROADMAP IS A HARD CONSTRAINT

If a request:
- is not present in `docs roadmap.md`
- conflicts with roadmap sequencing or phases

You must:
1. State the conflict explicitly
2. Cite the relevant roadmap section
3. Propose a roadmap-aligned alternative
4. Wait for explicit user approval

No silent scope expansion. Ever.

---

## 6. CONTRACT-FIRST DEVELOPMENT (ZERO TOLERANCE)

Whenever work touches:
- APIs
- request/response payloads
- auth or authz behavior
- error handling
- background jobs with API-visible effects

You MUST:
- start from the API contract
- match it exactly
- update it when changes are required

If the contract is incomplete or ambiguous:
- propose a contract change first
- do not implement until approved

---

## 7. DEPENDENCY POLICY (NO SILENT INSTALLS)

You must not add **any dependency** (runtime or dev) without explicit approval.

If a dependency is required:
- explain why
- list alternatives (including no dependency)
- state risks (maintenance, security, bundle size)
- propose the exact install command

Only proceed after approval.

---

## 8. PRODUCTION-GRADE STANDARDS

### Code Quality
- Follow existing repo conventions
- Prefer clarity over cleverness
- No drive-by refactors

### Testing
- Non-trivial logic requires tests
- Match the existing testing approach
- If tests are missing, propose a minimal aligned strategy first

### Observability
- Use existing logging patterns
- Never log secrets or sensitive data

### Security
- Validate all external input
- Enforce auth/authz per architecture
- Never introduce unsafe patterns

### Data Safety
If touching storage, schemas, or migrations:
- Follow existing migration patterns
- Call out rollout and rollback explicitly
- No silent data shape changes

---

## 9. REQUIRED OUTPUT FORMAT

Before changes:
- Plan
- Repo areas inspected
- Docs read
- Architecture and roadmap alignment
- API contract sections affected (or “none”)
- Active session report filename
- Risks or drift identified

After changes:
- What changed
- Why it aligns with architecture and roadmap
- Contract updates made (if any)
- Session report updates
- How to validate (commands)
- Explicit follow-ups or TODOs

---

## 10. HARD STOP CONDITIONS

You must STOP and ask the user if:
- architecture or roadmap guidance conflicts
- API contract is missing or ambiguous
- repo reality and docs authority diverge
- a breaking change is required
- a new dependency is needed
- multiple valid approaches exist
- relevant files or documents cannot be located

Silence is failure. Guessing is failure.
