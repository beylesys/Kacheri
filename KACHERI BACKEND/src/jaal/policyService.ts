// KACHERI BACKEND/src/jaal/policyService.ts
// JAAL Policy Service: Evaluates actions against the seed policy bundle.
// Ported from BEYLE JAAL/policy/policy.js — Slice S5
//
// Policy rules (in evaluation order):
//   1. Mode gate — only 'Guide' and 'Research' modes are allowed
//   2. Action allowlist — action must be in the mode's allowlist
//   3. Domain deny — hostname checked against deny_domains_contains
//   4. Domain readonly — hostname checked against read_only_domains_contains

import { JaalProofStore } from "../store/jaalProofs";

/* ---------- Seed Policy (from BEYLE JAAL/policy/policy.json, v0.3) ---------- */

const SEED_POLICY = {
  bundleId: "policy-seed-v0.3",
  version: "0.3",
  guide_actions_allowlist: [
    "summarize",
    "summarize_llm",
    "extract_links",
    "compare",
  ],
  research_actions_allowlist: [
    "summarize",
    "summarize_llm",
    "extract_links",
    "compare",
    "userscript.readonly.collect_outline",
    "userscript.readonly.citations_extract",
    "userscript.mutate.annotate_citations",
    "research.plan",
    "research.synthesize",
    "research.crawl",
    "research.aggregate",
  ],
  research_mutation_actions_allowlist: [
    "userscript.mutate.annotate_citations",
  ],
  providers_allowlist: ["openai", "anthropic"],
  models_allowlist: {
    openai: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"],
    anthropic: [
      "claude-sonnet-4-5-20250929",
      "claude-opus-4",
      "claude-3-7-sonnet",
    ],
  } as Record<string, string[]>,
  regions_allowlist: ["us", "eu", "global"],
  require_zero_retention: true,
  max_chars_per_request: 20_000,
  deny_domains_contains: ["paypal.com"],
  read_only_domains_contains: [
    "docs.google.com",
    "drive.google.com",
    "mail.google.com",
  ],
} as const;

/* ---------- Types ---------- */

export interface PolicyEvaluateInput {
  action: string;
  url?: string;
  mode?: string;
}

// Matches frontend PolicyEvaluation interface
export interface PolicyEvaluation {
  allowed: boolean;
  readOnly?: boolean;
  reasons: string[];
  policy: { version: string; bundleId: string };
}

export interface PrivacyReceiptItem {
  id: string;
  action: string;
  timestamp: string;
  details: Record<string, unknown>;
}

export interface PrivacyReceiptResponse {
  receipts: PrivacyReceiptItem[];
}

/* ---------- Helpers ---------- */

function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function domainContains(
  hostname: string,
  patterns: readonly string[],
): boolean {
  for (const pattern of patterns) {
    if (hostname === pattern || hostname.endsWith(`.${pattern}`)) {
      return true;
    }
  }
  return false;
}

/* ---------- Evaluate ---------- */

/**
 * Evaluate an action against the seed policy.
 * Ported from BEYLE JAAL/policy/policy.js evaluate() lines 196–293.
 */
export function evaluate(input: PolicyEvaluateInput): PolicyEvaluation {
  const { action, url, mode: rawMode } = input;
  const mode = (rawMode ?? "Guide").toLowerCase();
  const reasons: string[] = [];
  let allowed = true;
  let readOnly = false;

  const policyMeta = {
    version: SEED_POLICY.version,
    bundleId: SEED_POLICY.bundleId,
  };

  // Rule 1: Mode gate — only 'guide' and 'research' are allowed
  if (mode !== "guide" && mode !== "research") {
    reasons.push(`Mode '${rawMode ?? mode}' is not allowed. Only Guide and Research modes are permitted.`);
    return { allowed: false, readOnly: false, reasons, policy: policyMeta };
  }

  // Rule 2: Action allowlist
  const allowlist =
    mode === "guide"
      ? SEED_POLICY.guide_actions_allowlist
      : SEED_POLICY.research_actions_allowlist;

  if (!(allowlist as readonly string[]).includes(action)) {
    reasons.push(`Action '${action}' is not in the ${mode} actions allowlist.`);
    allowed = false;
  }

  // Rule 2b: Mutating actions in research mode need extra check
  if (
    mode === "research" &&
    action.startsWith("userscript.mutate.") &&
    !(SEED_POLICY.research_mutation_actions_allowlist as readonly string[]).includes(action)
  ) {
    reasons.push(`Mutating action '${action}' is not in the research mutation allowlist.`);
    allowed = false;
  }

  // Rule 3: Domain deny
  if (url) {
    const hostname = extractHostname(url);
    if (hostname) {
      if (domainContains(hostname, SEED_POLICY.deny_domains_contains)) {
        reasons.push(`Domain '${hostname}' is in the deny list.`);
        allowed = false;
      }

      // Rule 4: Domain readonly
      if (domainContains(hostname, SEED_POLICY.read_only_domains_contains)) {
        reasons.push(`Domain '${hostname}' is marked as read-only.`);
        readOnly = true;
      }
    }
  }

  if (allowed && reasons.length === 0) {
    reasons.push("Action permitted by policy.");
  }

  return { allowed, readOnly, reasons, policy: policyMeta };
}

/**
 * Generate a privacy receipt for a user by listing their recent proof actions.
 */
export async function getPrivacyReceipt(
  workspaceId: string,
  userId: string,
): Promise<PrivacyReceiptResponse> {
  const proofs = await JaalProofStore.listByWorkspace(workspaceId, { limit: 50 });

  // Filter to user's proofs
  const userProofs = proofs.filter((p) => p.userId === userId);

  const receipts: PrivacyReceiptItem[] = userProofs.map((p) => ({
    id: p.id,
    action: p.kind,
    timestamp: p.createdAt,
    details: p.payload,
  }));

  return { receipts };
}
