// KACHERI BACKEND/src/compliance/engine.ts
// Compliance Checker: Engine orchestrator
//
// Main entry point for running compliance checks against a document.
// Pre-processes HTML (text extraction, section parsing), then dispatches
// each policy to the appropriate evaluator via the registry.
// Async to support ai_check evaluator (Slice A3).
//
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slices A2, A3

import type { PolicyResult } from "../store/complianceChecks";
import type {
  ComplianceEngineInput,
  ComplianceEngineResult,
  EvaluationContext,
  Section,
} from "./types";
import { evaluatorRegistry } from "./evaluators";

/* ============= HTML Utilities ============= */

/**
 * Strip HTML tags and decode common entities to produce plain text.
 * Regex-based approach matching existing importDoc.ts pattern (no external dependency).
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract sections from HTML based on heading tags (h1-h6).
 * Returns array of Section objects with heading text, body, and word count.
 * Sufficient for clean Tiptap HTML output.
 */
export function extractSections(html: string): Section[] {
  const sections: Section[] = [];
  const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const headings: Array<{ level: number; heading: string; endIndex: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(html)) !== null) {
    headings.push({
      level: parseInt(match[1], 10),
      heading: match[2].replace(/<[^>]*>/g, "").trim(), // strip inner tags
      endIndex: match.index + match[0].length,
    });
  }

  for (let i = 0; i < headings.length; i++) {
    const startIndex = headings[i].endIndex;

    // Find end of this section: either the next heading of same/higher level or end of HTML
    let endIndex = html.length;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= headings[i].level) {
        // Find the start of the next heading tag
        const nextHeadingStart = html.lastIndexOf("<h", headings[j].endIndex - 1);
        if (nextHeadingStart > startIndex) {
          endIndex = nextHeadingStart;
        }
        break;
      }
    }
    // If no same/higher-level heading found, take up to next heading at any level
    if (endIndex === html.length && i + 1 < headings.length) {
      const nextHeadingStart = html.lastIndexOf("<h", headings[i + 1].endIndex - 1);
      if (nextHeadingStart > startIndex) {
        endIndex = nextHeadingStart;
      }
    }

    const bodyHtml = html.slice(startIndex, endIndex);
    const bodyText = htmlToPlainText(bodyHtml);
    const words = bodyText.split(/\s+/).filter((w) => w.length > 0);

    sections.push({
      level: headings[i].level,
      heading: headings[i].heading,
      body: bodyText,
      wordCount: words.length,
    });
  }

  return sections;
}

/* ============= Engine Orchestrator ============= */

/**
 * Run compliance checks against a document.
 *
 * Flow:
 * 1. Pre-process document (HTML -> text, extract sections) — computed once
 * 2. Build evaluation context (shared across all evaluators)
 * 3. Loop through policies, dispatch to appropriate evaluator
 * 4. Await evaluator result (supports both sync and async evaluators)
 * 5. Catch errors per-evaluator (one failure does NOT crash the whole check)
 * 6. Aggregate results and summary counts
 */
export async function runComplianceCheck(input: ComplianceEngineInput): Promise<ComplianceEngineResult> {
  const { html, policies, metadata } = input;

  // Step 1: Pre-process document (computed once)
  const text = htmlToPlainText(html);
  const sections = extractSections(html);

  // Step 2: Build evaluation context
  const ctx: EvaluationContext = { text, html, sections, metadata };

  // Step 3: Evaluate each policy
  const results: PolicyResult[] = [];
  let passed = 0;
  let warnings = 0;
  let violations = 0;
  let errors = 0;

  for (const policy of policies) {
    // Lookup evaluator from registry
    const evaluator = evaluatorRegistry[policy.ruleType];
    if (!evaluator) {
      results.push({
        policyId: policy.id,
        policyName: policy.name,
        ruleType: policy.ruleType,
        severity: policy.severity,
        status: "error",
        message: `No evaluator registered for rule type: ${policy.ruleType}`,
      });
      errors++;
      continue;
    }

    // Evaluate with error isolation (await handles both sync and async evaluators)
    try {
      const result = await evaluator(ctx, policy);
      results.push(result);

      if (result.status === "passed") {
        passed++;
      } else if (result.status === "failed") {
        if (result.severity === "error") {
          violations++;
        } else {
          warnings++;
        }
      } else if (result.status === "error") {
        errors++;
      }
    } catch (err) {
      console.error(
        `[compliance] Evaluator ${policy.ruleType} failed for policy ${policy.id}:`,
        err
      );
      results.push({
        policyId: policy.id,
        policyName: policy.name,
        ruleType: policy.ruleType,
        severity: policy.severity,
        status: "error",
        message: `Evaluator error: ${err instanceof Error ? err.message : String(err)}`,
      });
      errors++;
    }
  }

  return {
    results,
    totalPolicies: policies.length,
    passed,
    warnings,
    violations,
    errors,
  };
}
