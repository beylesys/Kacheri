// backend/src/ai/rewriters/constrained.ts
import { createHash } from "crypto";
import {
  clampSelection,
  extract as extractSel,
  applySelectionPatch,
  type Selection,
} from "../../text/selectionUtils";

// Use the canonical model router; composeText returns { text, provider, model, raw }
import * as modelRouter from "../modelRouter";

// Optional (non-fatal) structure guardrails for full-doc strict rewrite
import { validateStrictRewrite } from "../validators/strictRewrite";

export interface ConstrainedRewriteParams {
  fullText: string;
  instructions: string;
  selection?: Selection | null;
  provider?: string;
  model?: string;
  seed?: string | number;
}

export interface ConstrainedRewriteResult {
  /** The full document text after applying the constrained rewrite */
  newFullText: string;

  /** If selection mode: the rewritten selection span (what was inserted) */
  rewritten?: string;

  /** sha256 hex of BEFORE span (selection mode) or BEFORE full doc (full mode) */
  beforeHash: string;

  /** sha256 hex of AFTER span (selection mode) or AFTER full doc (full mode) */
  afterHash: string;

  usedProvider?: string;
  usedModel?: string;

  /** Non-fatal notes (useful for debugging / telemetry) */
  notes?: string[];
}

/** stable sha256 hex */
function sha256Hex(text: string): string {
  const h = createHash("sha256");
  h.update(Buffer.from(text, "utf8"));
  return h.digest("hex");
}

const OUT_START = "<<<KACHERI_OUTPUT_START>>>";
const OUT_END = "<<<KACHERI_OUTPUT_END>>>";

function stripCodeFences(s: string): string {
  let out = s.trim();

  // Remove a single surrounding ```...``` fence if present
  if (out.startsWith("```")) {
    // remove first fence line
    const firstNl = out.indexOf("\n");
    if (firstNl !== -1) out = out.slice(firstNl + 1);

    // remove trailing fence
    const lastFence = out.lastIndexOf("```");
    if (lastFence !== -1) out = out.slice(0, lastFence);

    out = out.trim();
  }

  return out;
}

function extractBetweenMarkers(raw: string): { text: string; usedMarkers: boolean } {
  const s = raw;
  const i = s.indexOf(OUT_START);
  const j = s.indexOf(OUT_END);
  if (i !== -1 && j !== -1 && j > i) {
    const inner = s.slice(i + OUT_START.length, j).trim();
    return { text: inner, usedMarkers: true };
  }
  return { text: s.trim(), usedMarkers: false };
}

function normalizeModelOutput(raw: string): { text: string; usedMarkers: boolean } {
  const noFence = stripCodeFences(raw);
  const { text, usedMarkers } = extractBetweenMarkers(noFence);

  // Some models love to add quotes around the whole thing
  const unquoted =
    (text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))
      ? text.slice(1, -1).trim()
      : text;

  return { text: unquoted, usedMarkers };
}

function uniq<T>(arr: T[]): T[] {
  const s = new Set<T>();
  for (const x of arr) s.add(x);
  return Array.from(s);
}

/**
 * Extract placeholder-like tokens that should NOT disappear in strict rewrite.
 * These are common “variable anchors” in templates.
 */
function extractProtectedTokens(text: string): string[] {
  const tokens: string[] = [];
  const patterns: RegExp[] = [
    /\{\{[^}]+\}\}/g,      // {{NAME}}
    /\[\[[^\]]+\]\]/g,     // [[TOKEN]]
    /<<[^>]+>>/g,          // <<TOKEN>>
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const t = (m[0] || "").trim();
      if (!t) continue;
      if (t.length > 200) continue;
      tokens.push(t);
      if (tokens.length >= 50) break;
    }
    if (tokens.length >= 50) break;
  }

  return uniq(tokens);
}

function computeMaxTokensForSelection(selText: string): number {
  // Conservative-ish: always enough room to rewrite + expand a bit.
  // (This is not perfect token math; it’s a practical cap.)
  return Math.min(2048, Math.max(256, Math.ceil(selText.length / 2)));
}

function computeMaxTokensForFullDoc(fullText: string): number {
  // Full-doc rewrites can be longer; cap hard to avoid runaway.
  return Math.min(4096, Math.max(512, Math.ceil(fullText.length / 2)));
}

function buildSystemPrompt(scope: "selection" | "full"): string {
  if (scope === "selection") {
    return [
      "You are Kacheri’s STRICT constrained rewrite engine (SELECTION ONLY).",
      "",
      "You must follow these rules:",
      "1) Output ONLY the rewritten selection text (no commentary).",
      "2) Do NOT add explanations, headings like 'Rewritten:', or markdown fences.",
      "3) Preserve placeholder tokens like {{...}}, [[...]], <<...>> EXACTLY unless instructions explicitly require changing them.",
      "",
      "Return your output wrapped EXACTLY like this, and NOTHING outside it:",
      OUT_START,
      "<your rewritten selection text>",
      OUT_END,
    ].join("\n");
  }

  return [
    "You are Kacheri’s STRICT constrained rewrite engine (FULL DOCUMENT).",
    "",
    "You must follow these rules:",
    "1) Output ONLY the rewritten full document text (no commentary).",
    "2) Preserve structure as much as possible (paragraph/bullet rhythm).",
    "3) Preserve placeholder tokens like {{...}}, [[...]], <<...>> EXACTLY unless instructions explicitly require changing them.",
    "4) Do NOT add extra sections unless the instructions demand it.",
    "",
    "Return your output wrapped EXACTLY like this, and NOTHING outside it:",
    OUT_START,
    "<your rewritten full document text>",
    OUT_END,
  ].join("\n");
}

function buildPrompt(
  scope: "selection" | "full",
  fullText: string,
  selection: Selection | null,
  instructions: string
): string {
  if (scope === "selection" && selection) {
    const selected = extractSel(fullText, selection);
    return [
      "TASK: Constrained rewrite (SELECTION ONLY).",
      "",
      "INSTRUCTIONS:",
      instructions,
      "",
      "--- SELECTION START ---",
      selected,
      "--- SELECTION END ---",
    ].join("\n");
  }

  return [
    "TASK: Constrained rewrite (FULL DOCUMENT).",
    "",
    "INSTRUCTIONS:",
    instructions,
    "",
    "--- DOCUMENT START ---",
    fullText,
    "--- DOCUMENT END ---",
  ].join("\n");
}

export async function proposeConstrainedRewrite(
  params: ConstrainedRewriteParams
): Promise<ConstrainedRewriteResult> {
  const { fullText, instructions, model, provider, seed } = params;

  const notes: string[] = [];

  const sel =
    params.selection && params.selection.start < params.selection.end
      ? clampSelection(fullText, params.selection)
      : null;

  const scope: "selection" | "full" = sel ? "selection" : "full";

  const systemPrompt = buildSystemPrompt(scope);
  const prompt = buildPrompt(scope, fullText, sel, instructions.trim());

  // Call canonical router
  const anyRouter: any = modelRouter as any;
  const compose = anyRouter.composeText ?? anyRouter.textComplete;

  if (!compose) {
    throw new Error(
      "Model router entry point not found. Please expose composeText/textComplete in src/ai/modelRouter.ts"
    );
  }

  const maxTokens =
    scope === "selection"
      ? computeMaxTokensForSelection(sel ? extractSel(fullText, sel) : "")
      : computeMaxTokensForFullDoc(fullText);

  const result: any = await compose(prompt, {
    provider,
    model,
    seed,
    systemPrompt,
    maxTokens,
  });

  let rawText: string = "";
  let usedModel: string | undefined;
  let usedProvider: string | undefined;

  if (typeof result === "string") {
    rawText = result;
  } else if (result && typeof result.text === "string") {
    rawText = result.text;
    if (typeof result.model === "string") usedModel = result.model;
    if (typeof result.provider === "string") usedProvider = result.provider;
  } else {
    rawText = JSON.stringify(result);
  }

  const normalized = normalizeModelOutput(rawText);
  if (!normalized.usedMarkers) {
    notes.push("model_output_missing_markers");
  }

  if (scope === "selection" && sel) {
    const beforeSel = extractSel(fullText, sel);

    // Safety: if model returns empty by accident, fall back to no-op instead of deleting content.
    const rewritten = normalized.text.trim().length ? normalized.text.trim() : beforeSel;

    if (!normalized.text.trim().length) {
      notes.push("empty_model_output_fallback_to_noop");
    }

    const { newText } = applySelectionPatch(fullText, sel, rewritten);

    return {
      newFullText: newText,
      rewritten,
      beforeHash: sha256Hex(beforeSel),
      afterHash: sha256Hex(rewritten),
      usedModel: usedModel ?? model,
      usedProvider: usedProvider ?? provider,
      notes: notes.length ? notes : undefined,
    };
  }

  // Full-document strict rewrite
  const candidate = normalized.text.trim().length ? normalized.text.trim() : fullText;

  if (!normalized.text.trim().length) {
    notes.push("empty_model_output_fallback_to_noop");
  }

  // Non-fatal strictness checks: placeholders + rough structure
  try {
    const protectedTokens = extractProtectedTokens(fullText);
    const invariants = {
      // Use tokens as "required lines" — they must still exist somewhere in the output.
      requiredLines: protectedTokens.length ? protectedTokens : undefined,
      // Optionally check block count (paragraph rhythm). Non-fatal.
      blockCount: fullText.replace(/\r\n/g, "\n").split(/\n{2,}/).filter((b) => b.trim().length > 0).length,
    };

    const v = validateStrictRewrite(fullText, candidate, invariants);

    if (!v.ok && v.errors.length) {
      notes.push("strict_invariants_warn");
      // Keep notes short to avoid bloating DB meta
      for (const e of v.errors.slice(0, 3)) notes.push(e);
    }
  } catch {
    // ignore validator failures (never block rewriting)
    notes.push("strict_validator_failed_nonfatal");
  }

  return {
    newFullText: candidate,
    beforeHash: sha256Hex(fullText),
    afterHash: sha256Hex(candidate),
    usedModel: usedModel ?? model,
    usedProvider: usedProvider ?? provider,
    notes: notes.length ? notes : undefined,
  };
}
