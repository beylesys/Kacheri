// KACHERI BACKEND/src/compliance/evaluators/aiCheck.ts
// Compliance Checker: ai_check evaluator
//
// Async evaluator — calls composeText() to evaluate policies via natural language.
// System prompt instructs AI to answer YES or NO; response is parsed to pass/fail.
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slice A3

import type { CompliancePolicy } from "../../store/compliancePolicies";
import type { PolicyResult } from "../../store/complianceChecks";
import type { EvaluationContext, AiCheckConfig } from "../types";
import { composeText } from "../../ai/modelRouter";
import { withTimeout } from "../../ai/extractors/index";

/* ============= Constants ============= */

const AI_CHECK_TIMEOUT_MS = 15_000; // 15 seconds
const MAX_DOCUMENT_CHARS = 4_000; // truncate large documents for token efficiency
const MAX_TOKENS = 200; // short YES/NO + explanation

const SYSTEM_PROMPT =
  "You are a compliance checker analyzing a document. " +
  "Answer with YES or NO on the first line, followed by a brief explanation. " +
  "If you are confident, include a confidence percentage (e.g. 95%).";

/* ============= Config Validation ============= */

const VALID_FAIL_IF = ["yes", "no"] as const;

function isValidConfig(config: unknown): config is AiCheckConfig {
  if (!config || typeof config !== "object") return false;
  const c = config as Record<string, unknown>;
  if (typeof c.instruction !== "string" || c.instruction.trim().length === 0) return false;
  if (!VALID_FAIL_IF.includes(c.failIf as typeof VALID_FAIL_IF[number])) return false;
  return true;
}

/* ============= Response Parsing ============= */

/**
 * Parse AI response to extract YES/NO answer and optional confidence.
 * Returns null if neither YES nor NO can be determined.
 */
function parseAiResponse(response: string): {
  answer: "yes" | "no";
  confidence: number | null;
  explanation: string;
} | null {
  const trimmed = response.trim();
  if (!trimmed) return null;

  const firstLine = trimmed.split("\n")[0].trim().toUpperCase();

  // Check first line for YES or NO
  let answer: "yes" | "no" | null = null;
  if (firstLine.startsWith("YES")) {
    answer = "yes";
  } else if (firstLine.startsWith("NO")) {
    answer = "no";
  }

  // Fallback: scan entire response for yes/no if first line didn't match
  if (!answer) {
    const lower = trimmed.toLowerCase();
    if (lower.includes("yes") && !lower.includes("no")) {
      answer = "yes";
    } else if (lower.includes("no") && !lower.includes("yes")) {
      answer = "no";
    }
  }

  if (!answer) return null;

  // Extract confidence percentage if present (e.g. "95%", "(90% confident)")
  let confidence: number | null = null;
  const confidenceMatch = trimmed.match(/(\d{1,3})\s*%/);
  if (confidenceMatch) {
    const parsed = parseInt(confidenceMatch[1], 10);
    if (parsed >= 0 && parsed <= 100) {
      confidence = parsed;
    }
  }

  // Explanation is everything after the first line
  const lines = trimmed.split("\n");
  const explanation = lines.slice(1).join("\n").trim() || firstLine;

  return { answer, confidence, explanation };
}

/* ============= Document Truncation ============= */

function truncateText(text: string): string {
  if (text.length <= MAX_DOCUMENT_CHARS) return text;
  return text.slice(0, MAX_DOCUMENT_CHARS) + "\n\n...[truncated]";
}

/* ============= Evaluator ============= */

export async function evaluateAiCheck(
  ctx: EvaluationContext,
  policy: CompliancePolicy
): Promise<PolicyResult> {
  const base = {
    policyId: policy.id,
    policyName: policy.name,
    ruleType: policy.ruleType,
    severity: policy.severity,
  };

  const config = policy.ruleConfig as Record<string, unknown>;
  if (!isValidConfig(config)) {
    return {
      ...base,
      status: "error",
      message:
        "Invalid ai_check config: requires instruction (non-empty string), failIf ('yes' | 'no')",
    };
  }

  const documentText = truncateText(ctx.text);
  if (!documentText.trim()) {
    return {
      ...base,
      status: "error",
      message: "Cannot perform AI compliance check: document is empty",
    };
  }

  const userPrompt =
    `Question: ${config.instruction}\n\n` +
    `Document content:\n---\n${documentText}\n---`;

  try {
    const aiResult = await withTimeout(
      composeText(userPrompt, {
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: MAX_TOKENS,
      }),
      AI_CHECK_TIMEOUT_MS,
      `AI compliance check timed out after ${AI_CHECK_TIMEOUT_MS / 1000}s`
    );

    const parsed = parseAiResponse(aiResult.text);

    if (!parsed) {
      return {
        ...base,
        status: "error",
        message: "AI response could not be parsed as YES or NO",
        details: {
          provider: aiResult.provider,
          model: aiResult.model,
          aiResponse: aiResult.text,
        },
      };
    }

    // Determine pass/fail: if failIf matches the answer, the policy fails
    const failed = parsed.answer === config.failIf;

    return {
      ...base,
      status: failed ? "failed" : "passed",
      message: failed
        ? `AI check failed: "${config.instruction}" — AI answered ${parsed.answer.toUpperCase()}`
        : `AI check passed: "${config.instruction}" — AI answered ${parsed.answer.toUpperCase()}`,
      suggestion: failed ? parsed.explanation : undefined,
      details: {
        provider: aiResult.provider,
        model: aiResult.model,
        aiResponse: aiResult.text,
        answer: parsed.answer,
        confidence: parsed.confidence,
        instruction: config.instruction,
        failIf: config.failIf,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[compliance] ai_check evaluator failed for policy ${policy.id}:`,
      err
    );
    return {
      ...base,
      status: "error",
      message: `AI compliance check error: ${message}`,
    };
  }
}
