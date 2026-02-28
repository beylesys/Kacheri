# Session Report: Intent-Based AI Prompts + Interactive Clarification

**Date:** 2026-02-23
**Session Goal:** Replace prescriptive AI design prompts with intent-based prompts and add interactive clarification flow
**Roadmap Section:** Phase 5 — Design Studio, AI Code Engine refinement
**Architecture Sections:** AI layer (designPrompts, designEngine), Route layer (canvasAi), Frontend hooks

---

## Documents Read

- `Docs/Roadmap/beyle-platform-unified-roadmap.md` (prior sessions)
- `Docs/blueprint/architecture blueprint.md` (prior sessions)
- `Docs/API_CONTRACT.md` (prior sessions)
- Prior session reports: 2026-02-22, 2026-02-23

## Context

In the previous session, we resolved KCL rendering bugs (blank slides, content positioning) and attempted to improve AI output quality through prescriptive prompts. The user identified two problems:

1. **Prescriptive prompts restrict the AI**: Exact colors, exact component combos, rigid content density rules prevent the AI from exercising creative judgement
2. **No interactive flow**: The AI generates immediately without understanding context (audience, occasion, style preference)

The user explicitly requested:
- "Make the AI realize that it is inside this setup and allow it to understand the intent of the user and act accordingly"
- "Make it more interactive — let the AI clarify things like color choice, occasion, context"

## Changes Made

### 1. `KACHERI BACKEND/src/ai/designPrompts.ts` — Intent-Based Rewrite

**Removed:**
- Exact color prescriptions (`#0f172a`, `#1e1b4b`, `#ffffff`, `#94a3b8`)
- Exact component combinations per slide type (title slide = h1 + h4 + 3 metrics OR list)
- Rigid "60-80% viewport" density rules
- Example code blocks prescribing specific layouts

**Kept (technical constraints):**
- `BASE_SYSTEM_PROMPT` — KCL output rules, multi-frame separator, data binding pattern
- `buildKCLReference()` — full component API
- `ERROR_PREVENTION_RULES` — validation rules
- `edit`, `style`, `content` action instructions (behavioral, not design)

**Added:**
- Intent-based `generate` instructions: "You are a professional presentation designer with full creative freedom. Choose colors, typography, layouts, and animations that best serve the user's topic, audience, and intent."
- Intent-based `compose` instructions: Same philosophy
- Simplified `deck` composition hint: Layout rules + "Design for impact" guidance
- `CLARIFICATION_INSTRUCTIONS` block: Tells the AI when and how to ask questions
- `conversationHistory` support in `UserPromptParams` and `buildUserPrompt()`

### 2. `KACHERI BACKEND/src/ai/designEngine.ts` — Clarification Detection

- Added `conversationHistory` to `DesignContext`
- Added `isClarification` and `clarificationMessage` to `DesignResult`
- Added `allowClarification` to `DesignEngineOptions`
- In `executeWithValidation()`: detects clarification via `/<kcl-slide[\s>]/i` regex test — if no `<kcl-slide>` tag found on first attempt with `allowClarification`, returns early with `isClarification: true`
- `generateFrames()` and `composeFromDocs()` pass `allowClarification: true`
- `editFrame()`, `styleFrames()`, `updateContent()` do NOT allow clarification

### 3. `KACHERI BACKEND/src/routes/canvasAi.ts` — Conversation History + Clarification

- Generate endpoint now queries `CanvasConversationStore.getByCanvas(cid, { limit: 20 })` before calling AI
- Passes conversation history to `designContext.conversationHistory`
- Handles clarification response: stores user + assistant messages, returns `{ frames: [], message, isClarification: true }` early (no frame persistence, no proofs)

### 4. `KACHERI FRONTEND/src/types/canvas.ts` — Response Types

- Added `message?: string` to `GenerateFrameResponse`
- Added `isClarification?: boolean` to `GenerateFrameResponse`
- Made `proofId` optional (no proof for clarification responses)

### 5. `KACHERI FRONTEND/src/hooks/useCanvasConversation.ts` — Frontend Handling

- `appendAssistantMessage()` uses `response.message` when present (shows AI's actual questions)
- `generate()` only calls `onFramesGenerated` when `frames.length > 0 && !isClarification`

## What Was Intentionally Not Changed

- `ConversationMessage.tsx` — already renders `message.content` as plain text; clarification questions display naturally
- `canvasAiApi` (frontend API client) — no changes needed; response type covers new fields via `types/canvas.ts`
- API contract — clarification is a behavioral change within the existing generate endpoint, not a new endpoint
- `edit`, `style`, `content` action prompts — these are already behavioral and correct
- KCL components and CSS — no rendering changes needed

## Verification

- `npx tsc --noEmit` on backend: **PASS** (0 errors)
- `npx tsc --noEmit` on frontend: **PASS** (0 errors)

## Risks / Notes

- **Clarification detection relies on absence of `<kcl-slide>`**: If the AI includes a code example in a clarification response, it could be misdetected as code. Mitigation: the prompt instructs "Respond with plain text ONLY — no HTML, no KCL tags, no code fences."
- **Conversation history limit**: Set to 20 messages. If conversations grow very long, older context is lost. This is intentional — recent context is most relevant.
- **No forced clarification**: The AI decides whether to ask questions based on prompt specificity. Very specific prompts ("Create a 5-slide VC pitch deck about Q4 revenue with dark blue and gold colors") will skip clarification. This is desired behavior.

## Slice 2: Design Principles Tuning (post-manual-test)

### Problem Observed

Manual testing confirmed clarification flow works end-to-end. However, the generated slides had quality issues:
1. **Broken images**: AI invented fake URLs for `<kcl-image>` (e.g., "Challenges in EV Image") — the AI has no access to actual images during generation
2. **Sparse content**: Many slides had just heading + plain bullet list, ignoring data components (kcl-metric, kcl-chart, kcl-timeline)
3. **No color personality**: User requested "slightly playful" but every slide defaulted to white background with dark navy text
4. **Layout repetition**: Frames 2 and 4 were nearly identical (heading + bullets + broken image)
5. **Missing data richness**: No metrics, no charts on data-appropriate slides

### Root Cause

The intent-based rewrite removed prescriptive rules but didn't replace them with **design principles**. The AI had "full creative freedom" but no design vocabulary — no guidance on what good slides look like, when to use which components, or how to handle the absence of image URLs.

### Changes Made: `KACHERI BACKEND/src/ai/designPrompts.ts`

**Added to `generate` action instructions:**
- **Image Rule (CRITICAL)**: Do NOT use `<kcl-image>` with invented URLs. Use kcl-chart, kcl-metric, kcl-timeline, kcl-icon, kcl-quote, and colored layouts instead.
- **Design Principles** — 4 principles:
  - Color commitment: Match palette to mood. Don't default to white. Use `background` on `<kcl-slide>`.
  - Component variety: Each content slide MUST use a different primary component. Minimum 3 different component types across a 5-slide deck.
  - Visual density: Every slide must have 3+ visual elements. Heading + plain bullet list = INCOMPLETE.
  - Slide archetypes: Title → Overview → Data slides → Content slides → Closing. Each with recommended components.

**Added to `compose` action instructions:**
- Same image rule and design principles, adapted for document-to-presentation flow
- Data extraction principle: Mine source documents for numbers/dates/comparisons → present as data components

**Updated `deck` composition mode hint:**
- "EVERY `<kcl-slide>` should have a background color set"
- Title/closing slides should have bold, saturated backgrounds
- Data slides should use kcl-metric/kcl-chart/kcl-table as primary element

**Added to Error Prevention Rules:**
- Rule 15: Do NOT use `<kcl-image>` unless the user provides a real URL

**Updated data binding example in BASE_SYSTEM_PROMPT:**
- Added subtitle text, animation attributes, and a note reinforcing bold visual impact

### Verification
- `npx tsc --noEmit` on backend: **PASS** (0 errors)
- `npx tsc --noEmit` on frontend: **PASS** (0 errors)

### Design Philosophy: The Balance

| Aspect | Before (prescriptive) | After slice 1 (too open) | After slice 2 (balanced) |
|--------|----------------------|--------------------------|--------------------------|
| Colors | Exact hex codes | "Full creative freedom" | Principles: match mood, use backgrounds, commit boldly |
| Components | Exact combos per slide type | "Use full range" | Must vary across slides, minimum 3 types per deck |
| Layout | Exact grid configs | No guidance | Archetypes: title/data/content/closing patterns |
| Images | Not addressed | Not addressed | BLOCKED unless user provides URLs |
| Density | "60-80% viewport" | "Avoid sparse" | 3+ visual elements per slide, heading+bullets = incomplete |

## Next Steps

- Restart servers, re-test with same prompt ("create a presentation on EV mobility")
- Compare output quality: expect colored backgrounds, no broken images, varied components
- Consider brand guidelines UI for workspace-level color/style preferences
