# Session Report: Outline-First AI Generation for Design Studio

**Date:** 2026-02-24
**Goal:** Implement two-phase AI generation flow — outline first, then generate from confirmed outline
**Session Report File:** `Docs/session-reports/2026-02-24-outline-first-generation.md`

---

## Session Goal

Transform the Design Studio AI generation from single-shot (sparse output) to a conversational outline-first flow where:
1. AI proposes a structured slide-by-slide outline
2. User reviews, adjusts, confirms
3. AI generates full KCL HTML from confirmed outline

## Documents Read

- `KACHERI BACKEND/src/ai/designPrompts.ts` — System prompt assembly, action instructions, clarification instructions
- `KACHERI BACKEND/src/ai/designEngine.ts` — AI execution engine with validation and retry
- `KACHERI BACKEND/src/routes/canvasAi.ts` — Route handler, conversation history loading, clarification response
- `KACHERI BACKEND/src/store/canvasConversations.ts` — Conversation persistence (append-only)
- `KACHERI FRONTEND/src/hooks/useCanvasConversation.ts` — Frontend conversation hook
- `KACHERI FRONTEND/src/components/studio/ConversationPanel.tsx` — Chat UI component
- `KACHERI FRONTEND/src/types/canvas.ts` — Frontend type definitions
- `Docs/blueprint/architecture blueprint.md` — Architecture reference
- `Docs/API_CONTRACT.md` — API contract reference

## Architecture Alignment

- Uses **existing clarification mechanism** (no new endpoints, no new DB tables)
- Outline = clarification response (plain text, no `<kcl-slide>`, `isClarification: true`)
- Conversation history already persisted in `canvas_conversations` table
- Frontend already handles clarification display in chat panel
- No changes to KCL rendering layer

## Assumptions Ruled Out

- NOT adding a template system — AI generates unique content per topic
- NOT changing the KCL component library — rendering layer is already capable
- NOT adding new API endpoints — existing generate endpoint handles both phases
- NOT adding new dependencies

## Constraints

- Outline detection must work via conversation history inspection (no explicit phase flag in API)
- Token budget: 2048 for outline phase, 32768 for generation phase
- Few-shot examples limited to 2 (to control system prompt token usage)
- Density validation produces warnings not errors (non-blocking)

## Risks

- Regex-based confirmation detection may have edge cases (mitigated by checking for modification language)
- AI may not consistently follow outline format (mitigated by explicit format instructions)
- Two-round-trip flow increases latency (mitigated by lower maxTokens for outline phase)

---

## Slice 1: Prompt Constants and SystemPromptContext

**Status:** Complete

### What Changed
- Added `OUTLINE_INSTRUCTIONS` constant to designPrompts.ts
- Added `OUTLINE_CONFIRMED_INSTRUCTIONS` constant to designPrompts.ts
- Added `FEW_SHOT_GENERATION_EXAMPLES` constant (2 gold-standard slide examples) to designPrompts.ts
- Extended `SystemPromptContext` with `outlinePhase` and `generationPhase` fields
- Modified `buildSystemPrompt()` to conditionally inject outline prompts between action instructions and brand guidelines

### What Was NOT Changed
- Existing `CLARIFICATION_INSTRUCTIONS` remains (used by other actions)
- Existing `ACTION_INSTRUCTIONS` unchanged
- `buildUserPrompt()` unchanged

---

## Slice 2: Outline Phase Detection and Content Density Validation

**Status:** Complete

### What Changed
- Added `detectOutlinePhase()` function to designEngine.ts — inspects conversation history to determine phase (needs_outline / outline_confirmed / outline_revision / skip_outline)
- Added `validateContentDensity()` function to designEngine.ts — checks minimum component count (5) and minimum data component count (1) per frame
- Added `isOutline` field to `DesignResult` interface
- Added token budget constants: `OUTLINE_MAX_TOKENS = 2048`, `GENERATION_FROM_OUTLINE_MAX_TOKENS = 32768`

### What Was NOT Changed
- `executeWithValidation()` unchanged — outline detection is handled before it's called
- `parseFramesFromResponse()` unchanged
- `validateFrameCode()` unchanged

---

## Slice 3: Refactored generateFrames() and Route/Type Updates

**Status:** Complete

### What Changed
- Refactored `generateFrames()` to use phase-aware logic:
  - Calls `detectOutlinePhase()` to determine conversation state
  - Sets `allowClarification`, `maxTokens`, and `promptContext` based on phase
  - Tags outline responses with `isOutline: true`
  - Runs `validateContentDensity()` post-generation (warnings only)
- Added `isOutline` to canvasAi.ts clarification response payload (line ~359)
- Added `isOutline?: boolean` to frontend `GenerateFrameResponse` type
- Updated API_CONTRACT.md with `message`, `isClarification`, and `isOutline` response fields + outline-first flow documentation

### What Was NOT Changed
- No frontend component changes — outlines display via existing chat UI
- No changes to edit/style/content/compose action flows
- No database or migration changes
- No new dependencies

### Decisions Made
- Density validation produces warnings (not errors) — non-blocking
- Confirmation detection uses regex with modification-language guard ("yes, but change slide 3" → revision, not confirmation)
- Short confirmations (< 40 chars) are always treated as pure confirmations

### Validation
- Backend TypeScript compilation: clean (0 errors)
- Frontend TypeScript compilation: clean (0 errors)

### Next Steps
- Manual testing: start backend, create canvas, test the full outline → confirm → generate flow
- Test edge cases: "skip outline", "just generate", outline revision, "yes but change slide 3"
- Monitor AI output quality improvement with the new prompt structure

---
