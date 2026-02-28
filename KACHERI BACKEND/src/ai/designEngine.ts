/* src/ai/designEngine.ts
   Core AI Code Generation Engine for Beyle Design Studio.
   Provides 5 action methods that generate HTML/CSS/JS targeting KCL components.
   This module is a pure computation layer — no I/O side effects.
   Proof creation, DB writes, and WebSocket broadcasts are handled by the
   route layer (B3 — canvasAi.ts). */

import { createHash } from 'node:crypto';
import { composeText } from './modelRouter';
import type { ComposeOptions, ComposeResult, ProviderName } from './modelRouter';
import type { ProofKind } from '../types/proofs';
import type { IngestEntity } from '../knowledge/memoryIngester';
import { normalizeName } from '../knowledge/entityHarvester';
import {
  buildSystemPrompt,
  buildUserPrompt,
} from './designPrompts';
import type {
  DesignActionType,
  CompositionMode,
  FrameSummary,
  BrandGuidelines,
  DocReference,
  SystemPromptContext,
} from './designPrompts';

// Re-export prompt types for external consumers (B3, B2, etc.)
export type {
  DesignActionType,
  CompositionMode,
  FrameSummary,
  BrandGuidelines,
  DocReference,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Context object shared across all 5 action methods. */
export interface DesignContext {
  canvasId: string;
  compositionMode: CompositionMode;
  canvasTitle: string;
  kclVersion: string;
  existingFrames: FrameSummary[];
  brandGuidelines?: BrandGuidelines;
  provider?: ProviderName;
  model?: string;
  seed?: string | number;
  maxTokens?: number;
  /** BYOK: workspace-provided API key, passed through to composeText */
  apiKey?: string;
  /** Memory graph context string (injected by P7) */
  memoryContext?: string;
  /** Conversation history for multi-turn clarification flow */
  conversationHistory?: Array<{ role: string; content: string }>;
}

/** A single generated frame from the AI engine. */
export interface GeneratedFrame {
  code: string;
  codeHash: string;
  title?: string;
  speakerNotes?: string;
  /** E4: Narrative text displayed before this frame in notebook composition mode. */
  narrativeHtml?: string;
}

/** Code validation error. */
export interface ValidationError {
  type:
    | 'invalid_tag'
    | 'unclosed_tag'
    | 'invalid_nesting'
    | 'missing_data_script'
    | 'parse_error';
  message: string;
  line?: number;
}

/** Code validation warning. */
export interface ValidationWarning {
  type: 'missing_alt' | 'empty_content' | 'large_output' | 'unknown_attribute';
  message: string;
}

/** Code validation result. */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/** Unified result from any design AI action. */
export interface DesignResult {
  action: DesignActionType;
  frames: GeneratedFrame[];
  proofKind: ProofKind;
  provider: string;
  model: string;
  rawResponse: string;
  validation: ValidationResult;
  retriesUsed: number;
  /** True when the AI responded with clarification questions instead of code */
  isClarification: boolean;
  /** The clarification message text (present only when isClarification is true) */
  clarificationMessage?: string;
  /** True when the response is a structured slide outline (subset of clarification) */
  isOutline?: boolean;
}

/** Optional configuration for design engine calls. */
export interface DesignEngineOptions {
  /** Streaming callback — receives chunks as they arrive. */
  onChunk?: (chunk: string) => void;
  /** Allow the AI to respond with clarification questions instead of code */
  allowClarification?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_KCL_TAGS = new Set([
  'kcl-slide', 'kcl-text', 'kcl-layout', 'kcl-image', 'kcl-list',
  'kcl-quote', 'kcl-metric', 'kcl-icon', 'kcl-animate', 'kcl-code',
  'kcl-embed', 'kcl-source', 'kcl-chart', 'kcl-table', 'kcl-timeline',
  'kcl-compare',
]);

const DATA_REQUIRED_TAGS = new Set([
  'kcl-chart', 'kcl-table', 'kcl-timeline', 'kcl-compare',
]);

const FRAME_SEPARATOR = '<!-- FRAME_SEPARATOR -->';

const ACTION_TO_PROOF_KIND: Record<DesignActionType, ProofKind> = {
  generate: 'design:generate',
  edit: 'design:edit',
  style: 'design:style',
  content: 'design:content',
  compose: 'design:compose',
};

const MAX_DESIGN_RETRIES = 2;
const DEFAULT_MAX_TOKENS = 16384;
const OUTLINE_MAX_TOKENS = 2048;
const GENERATION_FROM_OUTLINE_MAX_TOKENS = 32768;

// ---------------------------------------------------------------------------
// Outline Phase Detection
// ---------------------------------------------------------------------------

/** Outline marker the AI is instructed to use. */
const OUTLINE_MARKER_RE = /^##\s*Slide Outline/m;
/** Numbered slide items: "1. **Title**" */
const OUTLINE_ITEM_RE = /^\d+\.\s+\*\*[^*]+\*\*/m;

/** User phrases that skip the outline entirely. */
const SKIP_OUTLINE_RE = /\b(just generate|skip outline|no outline|generate directly|don'?t outline)\b/i;

/** User phrases that confirm the outline. */
const CONFIRMATION_RE = /\b(looks good|go ahead|confirmed?|approved?|perfect|generate it|let'?s go|proceed|build it|make it|create it|that'?s great|love it|ship it|yes|do it|lgtm)\b/i;

/** User phrases that indicate revision, even after a confirmation word. */
const MODIFICATION_RE = /\b(but|however|change|modify|add|remove|swap|replace|update|move|instead|actually|wait|except)\b/i;

interface OutlinePhaseResult {
  phase: 'needs_outline' | 'outline_confirmed' | 'outline_revision' | 'skip_outline';
  confirmedOutline?: string;
}

/**
 * Inspect conversation history and current prompt to determine the outline phase.
 * Returns one of four phases:
 * - needs_outline: fresh request, propose an outline
 * - outline_confirmed: user confirmed the outline, generate HTML
 * - outline_revision: user wants changes to the outline
 * - skip_outline: user wants to bypass the outline flow
 */
function detectOutlinePhase(
  conversationHistory: Array<{ role: string; content: string }> | undefined,
  currentPrompt: string,
): OutlinePhaseResult {
  // If user explicitly skips outline
  if (SKIP_OUTLINE_RE.test(currentPrompt)) {
    return { phase: 'skip_outline' };
  }

  // If no conversation history, this is a fresh request → needs outline
  if (!conversationHistory || conversationHistory.length === 0) {
    return { phase: 'needs_outline' };
  }

  // Search for the most recent assistant outline in history (newest first)
  let outlineText: string | undefined;
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const msg = conversationHistory[i];
    if (
      msg.role === 'assistant' &&
      (OUTLINE_MARKER_RE.test(msg.content) || OUTLINE_ITEM_RE.test(msg.content))
    ) {
      outlineText = msg.content;
      break;
    }
  }

  // No outline found in history → needs outline
  if (!outlineText) {
    return { phase: 'needs_outline' };
  }

  // Outline found. Check if user is confirming or requesting changes.
  const trimmed = currentPrompt.trim();

  if (CONFIRMATION_RE.test(trimmed)) {
    // Short confirmations (< 40 chars) are pure confirmations
    if (trimmed.length < 40) {
      return { phase: 'outline_confirmed', confirmedOutline: outlineText };
    }
    // Longer messages with modification language → treat as revision
    if (MODIFICATION_RE.test(trimmed)) {
      return { phase: 'outline_revision' };
    }
    return { phase: 'outline_confirmed', confirmedOutline: outlineText };
  }

  // User sent something that isn't a confirmation → outline revision
  return { phase: 'outline_revision' };
}

// ---------------------------------------------------------------------------
// Content Density Validation
// ---------------------------------------------------------------------------

export interface DensityCheckResult {
  passed: boolean;
  slideIndex: number;
  componentCount: number;
  dataComponentCount: number;
  issues: string[];
}

const DATA_COMPONENT_TAGS = new Set([
  'kcl-metric', 'kcl-chart', 'kcl-table', 'kcl-timeline', 'kcl-compare',
]);

const MIN_COMPONENTS_PER_SLIDE = 5;
const MIN_DATA_COMPONENTS_PER_SLIDE = 1;

/**
 * Check that a generated frame has sufficient content density.
 * Returns warnings (not errors) — density failures don't block the response.
 */
export function validateContentDensity(
  frameCode: string,
  slideIndex: number,
): DensityCheckResult {
  const issues: string[] = [];

  // Count all KCL component instances (opening tags)
  const allKclTags = frameCode.match(/<kcl-[a-z-]+[\s>]/gi) || [];
  const componentCount = allKclTags.length;

  // Count data visualization components
  let dataComponentCount = 0;
  for (const tag of allKclTags) {
    const tagName = tag.match(/<(kcl-[a-z-]+)/i)?.[1]?.toLowerCase();
    if (tagName && DATA_COMPONENT_TAGS.has(tagName)) {
      dataComponentCount++;
    }
  }

  if (componentCount < MIN_COMPONENTS_PER_SLIDE) {
    issues.push(
      `Slide ${slideIndex + 1}: has ${componentCount} components, minimum is ${MIN_COMPONENTS_PER_SLIDE}. Add more KCL components to fill the viewport.`,
    );
  }

  if (dataComponentCount < MIN_DATA_COMPONENTS_PER_SLIDE) {
    issues.push(
      `Slide ${slideIndex + 1}: has ${dataComponentCount} data components, minimum is ${MIN_DATA_COMPONENTS_PER_SLIDE}. Add at least one kcl-metric, kcl-chart, kcl-table, kcl-timeline, or kcl-compare.`,
    );
  }

  return {
    passed: issues.length === 0,
    slideIndex,
    componentCount,
    dataComponentCount,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Code Validation
// ---------------------------------------------------------------------------

/**
 * Lightweight regex-based validation of generated frame HTML.
 * Checks root element, valid KCL tags, data binding refs, JSON, etc.
 */
export function validateFrameCode(code: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const trimmed = code.trim();

  // 1. Root element must be <kcl-slide>
  if (!/^<kcl-slide[\s>]/i.test(trimmed)) {
    errors.push({
      type: 'invalid_nesting',
      message: 'Frame must start with <kcl-slide> as root element',
    });
  }

  // 2. Forbidden document-level tags
  if (/<(!DOCTYPE|html|head|body)\b/i.test(trimmed)) {
    errors.push({
      type: 'invalid_tag',
      message: 'Frame must not contain <!DOCTYPE>, <html>, <head>, or <body>',
    });
  }

  // 3. Validate all KCL tags are from the known set
  const kclTagRegex = /<(kcl-[a-z-]+)/gi;
  let kclMatch: RegExpExecArray | null;
  while ((kclMatch = kclTagRegex.exec(trimmed)) !== null) {
    const tag = kclMatch[1].toLowerCase();
    if (!VALID_KCL_TAGS.has(tag)) {
      errors.push({
        type: 'invalid_tag',
        message: `Unknown KCL component: <${tag}>`,
      });
    }
  }

  // 4. Verify data-for references point to existing IDs
  const dataForRegex = /data-for="([^"]+)"/g;
  let dataForMatch: RegExpExecArray | null;
  while ((dataForMatch = dataForRegex.exec(trimmed)) !== null) {
    const targetId = dataForMatch[1];
    if (!trimmed.includes(`id="${targetId}"`)) {
      errors.push({
        type: 'missing_data_script',
        message: `data-for="${targetId}" references non-existent element id`,
      });
    }
  }

  // 5. Check that data-required components have data binding scripts
  for (const tag of DATA_REQUIRED_TAGS) {
    const tagIdRegex = new RegExp(
      `<${tag}[^>]*?\\bid="([^"]*)"`,
      'gi',
    );
    let tagIdMatch: RegExpExecArray | null;
    while ((tagIdMatch = tagIdRegex.exec(trimmed)) !== null) {
      const id = tagIdMatch[1];
      if (id && !trimmed.includes(`data-for="${id}"`)) {
        warnings.push({
          type: 'empty_content',
          message: `<${tag} id="${id}"> requires data binding but no <script data-for="${id}"> found`,
        });
      }
    }
  }

  // 6. Validate JSON in data binding scripts
  const scriptRegex =
    /<script[^>]*data-for="[^"]*"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch: RegExpExecArray | null;
  while ((scriptMatch = scriptRegex.exec(trimmed)) !== null) {
    try {
      JSON.parse(scriptMatch[1]);
    } catch {
      errors.push({
        type: 'parse_error',
        message: 'Invalid JSON in data binding script',
      });
    }
  }

  // 7. Accessibility: kcl-image should have alt attribute
  const imgNoAltRegex = /<kcl-image(?![^>]*\balt=)[^>]*>/gi;
  if (imgNoAltRegex.test(trimmed)) {
    warnings.push({
      type: 'missing_alt',
      message: '<kcl-image> is missing an alt attribute for accessibility',
    });
  }

  // 8. Large output warning
  if (trimmed.length > 20_000) {
    warnings.push({
      type: 'large_output',
      message: `Frame code is unusually large (${trimmed.length} chars)`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Frame Parsing
// ---------------------------------------------------------------------------

/**
 * Strip markdown code fences if the AI wrapped its output in them.
 */
function stripMarkdownFencing(text: string): string {
  let result = text.trim();
  // Match ```html ... ``` or ``` ... ```
  const fenceRegex = /^```(?:html)?\s*\n([\s\S]*?)\n```\s*$/;
  const match = fenceRegex.exec(result);
  if (match) {
    result = match[1];
  }
  return result.trim();
}

// E4: Narrative block markers used to separate narrative text from frame code
const NARRATIVE_START = '<!-- NARRATIVE_START -->';
const NARRATIVE_END = '<!-- NARRATIVE_END -->';

/**
 * Parse AI response into individual frames.
 * Splits on FRAME_SEPARATOR, computes hashes, extracts titles.
 * E4: Also extracts narrative blocks from NARRATIVE_START/NARRATIVE_END markers.
 */
export function parseFramesFromResponse(response: string): GeneratedFrame[] {
  const cleaned = stripMarkdownFencing(response);

  // Split on frame separator
  const rawFrames = cleaned
    .split(FRAME_SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // If no separator found and response is not empty, treat as single frame
  if (rawFrames.length === 0 && cleaned.length > 0) {
    rawFrames.push(cleaned);
  }

  return rawFrames.map((code) => {
    // Strip any per-frame markdown fencing
    let frameContent = stripMarkdownFencing(code);

    // E4: Extract narrative block if present (appears before <kcl-slide>)
    let narrativeHtml: string | undefined;
    const narrativeStartIdx = frameContent.indexOf(NARRATIVE_START);
    const narrativeEndIdx = frameContent.indexOf(NARRATIVE_END);

    if (narrativeStartIdx !== -1 && narrativeEndIdx !== -1 && narrativeEndIdx > narrativeStartIdx) {
      narrativeHtml = frameContent
        .slice(narrativeStartIdx + NARRATIVE_START.length, narrativeEndIdx)
        .trim();
      // Frame code is everything after NARRATIVE_END
      frameContent = frameContent.slice(narrativeEndIdx + NARRATIVE_END.length).trim();
      // Normalize empty narrative
      if (!narrativeHtml) narrativeHtml = undefined;
    }

    const frameCode = frameContent;
    const codeHash = createHash('sha256').update(frameCode, 'utf8').digest('hex');

    // Try to extract title from first h1 kcl-text
    const titleMatch = frameCode.match(
      /<kcl-text[^>]*level="h1"[^>]*>([^<]*)<\/kcl-text>/i,
    );
    const title = titleMatch?.[1]?.trim() || undefined;

    return { code: frameCode, codeHash, title, narrativeHtml };
  });
}

// ---------------------------------------------------------------------------
// AI Call Wrapper
// ---------------------------------------------------------------------------

/**
 * Call AI via composeText with optional streaming support.
 * When onChunk is not provided, uses standard composeText() (full response).
 * When onChunk is provided, falls back to full response + single chunk for now.
 * Full streaming via provider SDKs can be added in B3.
 */
async function callAI(
  prompt: string,
  systemPrompt: string,
  opts: ComposeOptions & { onChunk?: (chunk: string) => void },
): Promise<ComposeResult> {
  const { onChunk, ...composeOpts } = opts;

  const result = await composeText(prompt, {
    ...composeOpts,
    systemPrompt,
  });

  // If streaming callback is provided, deliver the full response as one chunk
  if (onChunk) {
    onChunk(result.text);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Core Execution with Validation + Retry
// ---------------------------------------------------------------------------

/**
 * Execute an AI design action with validation and retry.
 * On validation failure, retries with error context injected into the system prompt.
 */
async function executeWithValidation(
  action: DesignActionType,
  userPromptBuilder: () => string,
  promptContext: SystemPromptContext,
  context: DesignContext,
  opts?: DesignEngineOptions,
): Promise<DesignResult> {
  let lastValidation: ValidationResult | undefined;

  for (let attempt = 0; attempt <= MAX_DESIGN_RETRIES; attempt++) {
    // On retry, inject error context into system prompt
    const effectiveContext: SystemPromptContext =
      attempt > 0 && lastValidation
        ? {
            ...promptContext,
            retryContext: {
              attempt,
              previousError: lastValidation.errors
                .map((e) => `- ${e.message}`)
                .join('\n'),
            },
          }
        : promptContext;

    const systemPrompt = buildSystemPrompt(action, effectiveContext);
    const userPrompt = userPromptBuilder();

    const result = await callAI(userPrompt, systemPrompt, {
      provider: context.provider,
      model: context.model,
      seed: context.seed,
      maxTokens: context.maxTokens ?? DEFAULT_MAX_TOKENS,
      apiKey: context.apiKey,
      onChunk: opts?.onChunk,
    });

    // Clarification detection: if the AI responded with plain text
    // (no <kcl-slide> tag), treat it as a clarification response.
    // Only on first attempt, only when allowClarification is enabled.
    const responseText = result.text.trim();
    const hasKclSlide = /<kcl-slide[\s>]/i.test(responseText);

    if (!hasKclSlide && attempt === 0 && opts?.allowClarification) {
      return {
        action,
        frames: [],
        proofKind: ACTION_TO_PROOF_KIND[action],
        provider: result.provider,
        model: result.model,
        rawResponse: responseText,
        validation: { valid: true, errors: [], warnings: [] },
        retriesUsed: 0,
        isClarification: true,
        clarificationMessage: responseText,
      };
    }

    // Parse frames from AI response
    const frames = parseFramesFromResponse(result.text);

    // Validate each frame
    const allValidations = frames.map((f) => validateFrameCode(f.code));
    const mergedValidation: ValidationResult = {
      valid: allValidations.every((v) => v.valid),
      errors: allValidations.flatMap((v) => v.errors),
      warnings: allValidations.flatMap((v) => v.warnings),
    };

    // Return if valid or if we've exhausted retries
    if (mergedValidation.valid || attempt === MAX_DESIGN_RETRIES) {
      return {
        action,
        frames,
        proofKind: ACTION_TO_PROOF_KIND[action],
        provider: result.provider,
        model: result.model,
        rawResponse: result.text,
        validation: mergedValidation,
        retriesUsed: attempt,
        isClarification: false,
      };
    }

    lastValidation = mergedValidation;
  }

  // Unreachable — loop always returns on last attempt
  throw new Error('Unreachable: design engine retry loop exited without result');
}

// ---------------------------------------------------------------------------
// Public API: 5 Action Methods
// ---------------------------------------------------------------------------

/**
 * Generate new frame(s) from a text prompt.
 * Uses outline-first flow: proposes a slide outline for user confirmation,
 * then generates full KCL HTML once the outline is confirmed.
 * Users can skip the outline by saying "just generate" or "skip outline".
 * Proof kind: design:generate
 */
export async function generateFrames(
  prompt: string,
  context: DesignContext,
  opts?: DesignEngineOptions,
): Promise<DesignResult> {
  // --- Outline phase detection ---
  const outlinePhase = detectOutlinePhase(
    context.conversationHistory,
    prompt,
  );

  const promptContext: SystemPromptContext = {
    compositionMode: context.compositionMode,
    brandGuidelines: context.brandGuidelines,
    memoryContext: context.memoryContext,
  };

  // Configure based on detected phase
  let allowClarification = false;
  let effectiveMaxTokens = context.maxTokens ?? DEFAULT_MAX_TOKENS;

  switch (outlinePhase.phase) {
    case 'needs_outline':
      promptContext.outlinePhase = 'needs_outline';
      allowClarification = true; // outline = plain text = treated as clarification
      effectiveMaxTokens = OUTLINE_MAX_TOKENS;
      break;

    case 'outline_revision':
      promptContext.outlinePhase = 'outline_revision';
      allowClarification = true;
      effectiveMaxTokens = OUTLINE_MAX_TOKENS;
      break;

    case 'outline_confirmed':
      promptContext.generationPhase = {
        confirmedOutline: outlinePhase.confirmedOutline!,
      };
      allowClarification = false; // Must produce HTML
      effectiveMaxTokens = Math.max(
        context.maxTokens ?? DEFAULT_MAX_TOKENS,
        GENERATION_FROM_OUTLINE_MAX_TOKENS,
      );
      break;

    case 'skip_outline':
      // No outline flow — use existing direct generation behavior
      allowClarification = false;
      break;
  }

  // Override maxTokens for the AI call
  const effectiveContext = { ...context, maxTokens: effectiveMaxTokens };

  const result = await executeWithValidation(
    'generate',
    () =>
      buildUserPrompt({
        action: 'generate',
        prompt,
        existingFrames: context.existingFrames,
        conversationHistory: context.conversationHistory,
      }),
    promptContext,
    effectiveContext,
    { ...opts, allowClarification },
  );

  // Tag outline responses for the route/frontend layer
  if (
    result.isClarification &&
    (outlinePhase.phase === 'needs_outline' || outlinePhase.phase === 'outline_revision')
  ) {
    result.isOutline = true;
  }

  // --- Content density validation (post-generation, non-blocking warnings) ---
  if (!result.isClarification && result.frames.length > 0) {
    for (let i = 0; i < result.frames.length; i++) {
      const density = validateContentDensity(result.frames[i].code, i);
      if (!density.passed) {
        for (const issue of density.issues) {
          result.validation.warnings.push({
            type: 'empty_content',
            message: issue,
          });
        }
      }
    }
  }

  return result;
}

/**
 * Edit an existing frame's code based on a text instruction.
 * Preserves overall structure, applies targeted changes.
 * Proof kind: design:edit
 */
export async function editFrame(
  prompt: string,
  existingCode: string,
  context: DesignContext,
  opts?: DesignEngineOptions,
): Promise<DesignResult> {
  const promptContext: SystemPromptContext = {
    compositionMode: context.compositionMode,
    brandGuidelines: context.brandGuidelines,
    memoryContext: context.memoryContext,
  };

  return executeWithValidation(
    'edit',
    () =>
      buildUserPrompt({
        action: 'edit',
        prompt,
        existingCode,
        existingFrames: context.existingFrames,
      }),
    promptContext,
    context,
    opts,
  );
}

/**
 * Restyle frame(s) — change visual appearance ONLY.
 * Content, text, data, and structure are preserved.
 * Proof kind: design:style
 */
export async function styleFrames(
  prompt: string,
  frameCodes: Array<{ frameId: string; code: string }>,
  context: DesignContext,
  opts?: DesignEngineOptions,
): Promise<DesignResult> {
  const promptContext: SystemPromptContext = {
    compositionMode: context.compositionMode,
    brandGuidelines: context.brandGuidelines,
    memoryContext: context.memoryContext,
  };

  return executeWithValidation(
    'style',
    () =>
      buildUserPrompt({
        action: 'style',
        prompt,
        frameCodes,
        existingFrames: context.existingFrames,
      }),
    promptContext,
    context,
    opts,
  );
}

/**
 * Update data/text content in an existing frame, preserving design.
 * Only textual content and data values change.
 * Proof kind: design:content
 */
export async function updateContent(
  prompt: string,
  existingCode: string,
  context: DesignContext,
  opts?: DesignEngineOptions,
): Promise<DesignResult> {
  const promptContext: SystemPromptContext = {
    compositionMode: context.compositionMode,
    brandGuidelines: context.brandGuidelines,
    memoryContext: context.memoryContext,
  };

  return executeWithValidation(
    'content',
    () =>
      buildUserPrompt({
        action: 'content',
        prompt,
        existingCode,
        existingFrames: context.existingFrames,
      }),
    promptContext,
    context,
    opts,
  );
}

/**
 * Generate a full multi-frame canvas from one or more document references.
 * Always returns multiple frames.
 * Proof kind: design:compose
 */
export async function composeFromDocs(
  prompt: string,
  docRefs: DocReference[],
  context: DesignContext,
  opts?: DesignEngineOptions,
): Promise<DesignResult> {
  const promptContext: SystemPromptContext = {
    compositionMode: context.compositionMode,
    brandGuidelines: context.brandGuidelines,
    memoryContext: context.memoryContext,
  };

  return executeWithValidation(
    'compose',
    () =>
      buildUserPrompt({
        action: 'compose',
        prompt,
        docRefs,
        existingFrames: context.existingFrames,
        conversationHistory: context.conversationHistory,
      }),
    promptContext,
    context,
    { ...opts, allowClarification: false },
  );
}

// ---------------------------------------------------------------------------
// Helpers for B3 Route Layer
// ---------------------------------------------------------------------------

/**
 * Build proof input/output objects for a design action result.
 * Used by B3 (canvasAi.ts) to create proof packets via newProofPacket().
 */
export function buildProofPayload(
  prompt: string,
  result: DesignResult,
  canvasId: string,
): { input: Record<string, unknown>; output: Record<string, unknown> } {
  return {
    input: {
      prompt,
      action: result.action,
      canvasId,
      provider: result.provider,
      model: result.model,
    },
    output: {
      frameCount: result.frames.length,
      codeHashes: result.frames.map((f) => f.codeHash),
      validation: {
        valid: result.validation.valid,
        errorCount: result.validation.errors.length,
        warningCount: result.validation.warnings.length,
      },
      retriesUsed: result.retriesUsed,
    },
  };
}

/* ---------- S12: Entity Extraction for Memory Graph ---------- */

/**
 * Common organization name suffixes for entity classification.
 * Mirrors the ORG_SUFFIXES list in knowledge/entityHarvester.ts.
 */
const ORG_SUFFIXES = new Set([
  'corp', 'corporation', 'inc', 'incorporated', 'llc', 'llp',
  'ltd', 'limited', 'co', 'company', 'gmbh', 'ag', 'sa',
  'plc', 'pllc', 'lp', 'group', 'partners', 'associates',
  'holdings', 'enterprises', 'foundation', 'trust', 'bank',
  'institute', 'university', 'college',
]);

/** Minimum text length for a candidate entity name */
const MIN_ENTITY_LENGTH = 2;
/** Maximum text length for a candidate entity name */
const MAX_ENTITY_LENGTH = 120;
/** Default confidence for entities extracted from Design Studio frames */
const DESIGN_ENTITY_CONFIDENCE = 0.7;

/** Stop words excluded from concept entity extraction */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'about', 'up', 'down',
  'this', 'that', 'these', 'those', 'it', 'its', 'not', 'no', 'nor',
  'so', 'if', 'then', 'than', 'too', 'very', 'just', 'also', 'more',
  'here', 'there', 'when', 'where', 'how', 'all', 'each', 'every',
  'both', 'few', 'most', 'other', 'some', 'such', 'only', 'own',
  'same', 'new', 'old', 'high', 'low', 'click', 'slide', 'frame',
]);

/** Check if a name looks like an organization using suffix matching */
function isLikelyOrganization(name: string): boolean {
  const words = name.toLowerCase().trim().split(/\s+/);
  for (const word of words) {
    const cleaned = word.replace(/[.,;:]$/, '');
    if (ORG_SUFFIXES.has(cleaned)) return true;
  }
  return false;
}

/** Check if text matches a person name pattern (2-4 capitalized words) */
const PERSON_NAME_RE = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/;

/** Date-like patterns */
const DATE_RE = /\b(?:\d{4}[-/]\d{2}[-/]\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/gi;

/** Currency amount patterns */
const AMOUNT_RE = /[$€£¥₹]\s*[\d,]+(?:\.\d{1,2})?(?:\s*(?:million|billion|trillion|[MBT]))?|\d[\d,]*(?:\.\d{1,2})?\s*(?:USD|EUR|GBP|JPY|INR)/gi;

/**
 * Strip HTML tags and decode common HTML entities.
 * Returns plain text from HTML content.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '') // remove scripts entirely
    .replace(/<style[\s\S]*?<\/style>/gi, '')   // remove styles entirely
    .replace(/<[^>]+>/g, ' ')                   // strip all tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract text content from KCL component HTML elements.
 * Returns an array of { text, context } tuples for entity classification.
 */
function extractTextSegments(frameCode: string): Array<{ text: string; context: string }> {
  const segments: Array<{ text: string; context: string }> = [];

  // kcl-text content (titles, headings, body text)
  const kclTextRe = /<kcl-text[^>]*>([\s\S]*?)<\/kcl-text>/gi;
  let match: RegExpExecArray | null;
  while ((match = kclTextRe.exec(frameCode)) !== null) {
    const text = stripHtml(match[1]);
    if (text.length >= MIN_ENTITY_LENGTH) {
      // Detect heading level for context
      const levelMatch = match[0].match(/level="(h[1-6])"/i);
      const context = levelMatch ? `Heading (${levelMatch[1]})` : 'Text content';
      segments.push({ text, context });
    }
  }

  // kcl-list items
  const kclListRe = /<kcl-list[^>]*>([\s\S]*?)<\/kcl-list>/gi;
  while ((match = kclListRe.exec(frameCode)) !== null) {
    // Extract individual li items within the list
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch: RegExpExecArray | null;
    while ((liMatch = liRe.exec(match[1])) !== null) {
      const text = stripHtml(liMatch[1]);
      if (text.length >= MIN_ENTITY_LENGTH) {
        segments.push({ text, context: 'List item' });
      }
    }
    // Also try extracting all text if no <li> found (flat list content)
    if (!/<li/i.test(match[1])) {
      const text = stripHtml(match[1]);
      if (text.length >= MIN_ENTITY_LENGTH) {
        segments.push({ text, context: 'List content' });
      }
    }
  }

  // kcl-quote text
  const kclQuoteRe = /<kcl-quote[^>]*>([\s\S]*?)<\/kcl-quote>/gi;
  while ((match = kclQuoteRe.exec(frameCode)) !== null) {
    const text = stripHtml(match[1]);
    if (text.length >= MIN_ENTITY_LENGTH) {
      segments.push({ text, context: 'Quote' });
    }
  }

  // kcl-metric: extract label attribute
  const kclMetricRe = /<kcl-metric[^>]*\blabel="([^"]+)"[^>]*>/gi;
  while ((match = kclMetricRe.exec(frameCode)) !== null) {
    const label = match[1].trim();
    if (label.length >= MIN_ENTITY_LENGTH) {
      segments.push({ text: label, context: 'Metric label' });
    }
  }

  // Data binding scripts (chart/table labels and names)
  const dataScriptRe = /<script[^>]*data-for="[^"]*"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
  while ((match = dataScriptRe.exec(frameCode)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      extractFromDataBinding(data, segments);
    } catch {
      // Invalid JSON — skip silently
    }
  }

  return segments;
}

/**
 * Recursively extract text values from data binding JSON.
 * Looks for label, name, title, category fields in chart/table data.
 */
function extractFromDataBinding(
  data: unknown,
  segments: Array<{ text: string; context: string }>,
): void {
  if (data === null || data === undefined) return;

  if (typeof data === 'string') {
    // Only extract strings that look like meaningful names (not numbers, not too short)
    if (data.length >= MIN_ENTITY_LENGTH && data.length <= MAX_ENTITY_LENGTH && /[a-zA-Z]/.test(data)) {
      segments.push({ text: data, context: 'Data value' });
    }
    return;
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      extractFromDataBinding(item, segments);
    }
    return;
  }

  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    // Extract from known label/name/title fields
    for (const key of ['label', 'name', 'title', 'category', 'series', 'header']) {
      if (typeof obj[key] === 'string') {
        const val = (obj[key] as string).trim();
        if (val.length >= MIN_ENTITY_LENGTH && val.length <= MAX_ENTITY_LENGTH) {
          segments.push({ text: val, context: `Data ${key}` });
        }
      }
    }
    // Recurse into nested structures (columns, rows, datasets)
    for (const key of ['columns', 'rows', 'datasets', 'data', 'items', 'values']) {
      if (obj[key] !== undefined) {
        extractFromDataBinding(obj[key], segments);
      }
    }
  }
}

/**
 * Classify a text segment into an entity type using heuristic patterns.
 * Returns null if the text is not a meaningful entity candidate.
 */
function classifyEntity(
  text: string,
): { name: string; entityType: string } | null {
  const trimmed = text.trim();
  if (trimmed.length < MIN_ENTITY_LENGTH || trimmed.length > MAX_ENTITY_LENGTH) return null;

  // Check for organization
  if (isLikelyOrganization(trimmed)) {
    return { name: trimmed, entityType: 'organization' };
  }

  // Check for person name (2-4 capitalized words)
  if (PERSON_NAME_RE.test(trimmed) && trimmed.split(/\s+/).length <= 4) {
    return { name: trimmed, entityType: 'person' };
  }

  // For longer texts, don't classify as a single entity — extract subpatterns instead
  if (trimmed.length > 60) return null;

  // Filter out stop words and very short tokens
  const words = trimmed.split(/\s+/);
  const meaningful = words.filter(
    (w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()),
  );
  if (meaningful.length === 0) return null;

  // Remaining meaningful multi-word phrases → concept or term
  if (meaningful.length >= 2) {
    return { name: trimmed, entityType: 'concept' };
  }

  // Single meaningful word — only if it's capitalized (proper noun)
  if (meaningful.length === 1 && /^[A-Z]/.test(meaningful[0]) && meaningful[0].length >= 3) {
    return { name: meaningful[0], entityType: 'term' };
  }

  return null;
}

/**
 * Extract entities from generated Design Studio frames for Memory Graph ingestion.
 * Parses KCL HTML content, classifies text into entity types, and deduplicates.
 *
 * Slice S12 — pure computation, no I/O side effects.
 * Reuses normalization patterns from knowledge/entityHarvester.
 */
export function extractEntitiesFromFrames(
  frames: GeneratedFrame[],
  canvasId: string,
): IngestEntity[] {
  const seen = new Map<string, IngestEntity>();

  for (const frame of frames) {
    if (!frame.code) continue;

    // Extract text segments from KCL components
    const segments = extractTextSegments(frame.code);

    for (const segment of segments) {
      // Classify segment text into entity
      const entity = classifyEntity(segment.text);
      if (!entity) continue;

      const normalized = normalizeName(entity.name);
      if (!normalized) continue;

      // Dedup key: normalized name + entity type
      const dedupKey = `${normalized}::${entity.entityType}`;
      if (seen.has(dedupKey)) continue;

      seen.set(dedupKey, {
        name: entity.name,
        entityType: entity.entityType,
        context: segment.context,
        confidence: DESIGN_ENTITY_CONFIDENCE,
        sourceRef: canvasId,
      });
    }

    // Extract date entities from full frame text
    const plainText = stripHtml(frame.code);
    const dateMatches = plainText.match(DATE_RE);
    if (dateMatches) {
      for (const dateStr of dateMatches) {
        const normalized = normalizeName(dateStr);
        const dedupKey = `${normalized}::date`;
        if (!seen.has(dedupKey)) {
          seen.set(dedupKey, {
            name: dateStr.trim(),
            entityType: 'date',
            context: 'Date reference in frame',
            confidence: DESIGN_ENTITY_CONFIDENCE,
            sourceRef: canvasId,
          });
        }
      }
    }

    // Extract amount entities from full frame text
    const amountMatches = plainText.match(AMOUNT_RE);
    if (amountMatches) {
      for (const amtStr of amountMatches) {
        const normalized = normalizeName(amtStr);
        const dedupKey = `${normalized}::amount`;
        if (!seen.has(dedupKey)) {
          seen.set(dedupKey, {
            name: amtStr.trim(),
            entityType: 'amount',
            context: 'Amount reference in frame',
            confidence: DESIGN_ENTITY_CONFIDENCE,
            sourceRef: canvasId,
          });
        }
      }
    }
  }

  return Array.from(seen.values());
}

/* ---------- Image Asset Integration Helper (B5) ---------- */

/** Escape HTML attribute value to prevent XSS */
function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Build a kcl-image reference string for embedding an AI-generated asset in frame code.
 * Used by compose flows that reference generated images.
 * Slice B5 — minimal integration point.
 */
export function buildImageAssetRef(assetId: string, canvasId: string, alt: string): string {
  return `<kcl-image src="/canvases/${escapeAttr(canvasId)}/assets/${escapeAttr(assetId)}" alt="${escapeAttr(alt)}" />`;
}
