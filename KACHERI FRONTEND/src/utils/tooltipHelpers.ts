// KACHERI FRONTEND/src/utils/tooltipHelpers.ts
// Shared tooltip content and builders for proof-related UI components

/**
 * Centralized tooltip text for proof system concepts.
 * Keeps messaging consistent across the UI.
 */
export const PROOF_TOOLTIPS = {
  healthStatus: {
    healthy: "All proofs verified successfully. Document integrity confirmed.",
    stale: "Proofs exist but haven't been re-verified recently. Consider re-verifying.",
    unverified: "Some exports or AI actions lack verification proofs.",
    failed: "One or more proof verifications failed. Review in Proofs panel.",
  },
  proofTypes: {
    export: "Cryptographic hash of the exported file, proving content hasn't changed.",
    pdf: "PDF export with SHA-256 hash for file integrity verification.",
    docx: "DOCX export with SHA-256 hash for file integrity verification.",
    compose: "Record of AI-generated content with model, prompt, and output hash.",
    rewrite: "Record of AI-assisted text modification with before/after hashes.",
    translate: "Record of AI translation with source/target text hashes.",
    extraction: "Record of AI document intelligence extraction with input text hash and output fields hash.",
    compliance: "Record of compliance check with policy evaluation results and pass/fail status.",
    clause: "Record of clause library insertion with clause metadata, version, and usage tracking.",
    knowledgeSearch: "Record of AI-powered semantic search across workspace documents with query, AI answer, and cited results.",
    knowledgeIndex: "Record of workspace knowledge graph indexing with entity harvesting, normalization, and relationship detection counts.",
    negotiationAnalyze: "Record of AI-powered negotiation change analysis with risk assessment, recommendation, and historical context.",
    negotiationCounterproposal: "Record of AI-generated counterproposal with compromise language, rationale, and clause library reference.",
    designGenerate: "Record of AI-generated canvas frames with prompt, frame count, and doc references used.",
    designEdit: "Record of AI frame edit with prompt, code diff, and modified frame.",
    designStyle: "Record of AI frame restyling with frames affected and before/after snapshots.",
    designExport: "Record of canvas export with format, frame count, and file hash.",
    designImage: "Record of AI-generated image with prompt, provider, and asset metadata.",
    designContent: "Record of AI content rewrite within a canvas frame.",
    designCompose: "Record of AI multi-frame composition with prompt and frame generation details.",
  },
  verificationBadges: {
    verified: "Hash matches recorded proof. File integrity confirmed.",
    pass: "Verification passed. Content matches the original proof.",
    fail: "Hash mismatch detected. File may have been modified.",
    miss: "Expected proof record is missing from the database.",
    pending: "Verification in progress or not yet checked.",
    drift: "Re-running AI with same input produced different output.",
  },
  features: {
    aiHeatmap: "Shows AI-touched sections with color-coded overlays.\nGreen = Compose, Blue = Rewrite, Yellow = Translate.",
    diffModal: "Compare AI output against original content.\nShows before/after with visual diff highlighting.",
    verifyNow: "Re-verify this proof against current content.\nConfirms file/content integrity hasn't changed.",
    proofHealth: "Overall verification status for this document.\nBased on export and AI action proof checks.",
  },
  learn: {
    proofsDocs: "Visit /help/proofs to learn more about the proof system.",
    learnMore: "Click for details. Visit /help/proofs to learn more.",
  },
} as const;

/**
 * Health status type matching the backend ProofHealthResult
 */
export type HealthStatus = "healthy" | "stale" | "unverified" | "failed";

/**
 * Shape of ProofHealthResult from the API
 */
export interface ProofHealthResult {
  docId: string;
  status: HealthStatus;
  score: number;
  exports: { total: number; pass: number; fail: number; miss: number };
  compose: { total: number; pass: number; drift: number; miss: number };
  lastVerified: string | null;
  lastActivity: string | null;
}

/**
 * Build a comprehensive tooltip for proof health badges.
 * Uses multi-line format for native title attribute.
 */
export function buildHealthTooltip(health: ProofHealthResult): string {
  const lines: string[] = [];

  // Status explanation
  lines.push(PROOF_TOOLTIPS.healthStatus[health.status]);
  lines.push("");

  // Score
  lines.push(`Health Score: ${health.score}%`);
  lines.push("");

  // Export stats
  const { exports: exp } = health;
  if (exp.total > 0) {
    lines.push(`Exports: ${exp.pass}/${exp.total} verified`);
    if (exp.fail > 0) lines.push(`  - ${exp.fail} failed`);
    if (exp.miss > 0) lines.push(`  - ${exp.miss} missing`);
  } else {
    lines.push("Exports: None yet");
  }

  // Compose stats
  const { compose: comp } = health;
  if (comp.total > 0) {
    lines.push(`AI Actions: ${comp.pass}/${comp.total} deterministic`);
    if (comp.drift > 0) lines.push(`  - ${comp.drift} drift`);
    if (comp.miss > 0) lines.push(`  - ${comp.miss} missing`);
  } else {
    lines.push("AI Actions: None yet");
  }

  // Last verified
  if (health.lastVerified) {
    const date = new Date(health.lastVerified);
    lines.push("");
    lines.push(`Last Verified: ${date.toLocaleDateString()}`);
  }

  // Learn more hint
  lines.push("");
  lines.push(PROOF_TOOLTIPS.learn.learnMore);

  return lines.join("\n");
}

/**
 * Build tooltip for export proof items in ProofsPanel.
 */
export function buildExportTooltip(
  kind: "pdf" | "docx",
  status: "pass" | "fail" | "miss" | "pending"
): string {
  const lines: string[] = [];

  lines.push(PROOF_TOOLTIPS.proofTypes[kind]);
  lines.push("");
  lines.push(`Status: ${status.toUpperCase()}`);
  lines.push(PROOF_TOOLTIPS.verificationBadges[status]);

  return lines.join("\n");
}

/**
 * Build tooltip for AI action proof items.
 */
export function buildAIActionTooltip(
  kind: "compose" | "rewrite" | "translate",
  status: "pass" | "drift" | "miss" | "pending"
): string {
  const lines: string[] = [];

  lines.push(PROOF_TOOLTIPS.proofTypes[kind]);
  lines.push("");
  lines.push(`Status: ${status.toUpperCase()}`);
  lines.push(PROOF_TOOLTIPS.verificationBadges[status]);

  return lines.join("\n");
}

/**
 * Build tooltip for the AI heatmap toggle button.
 */
export function buildHeatmapToggleTooltip(enabled: boolean): string {
  const lines: string[] = [];

  lines.push(enabled ? "Hide AI-touched sections" : "Show AI-touched sections");
  lines.push("");
  lines.push(PROOF_TOOLTIPS.features.aiHeatmap);

  return lines.join("\n");
}

/**
 * Format relative time for "last verified X ago" displays.
 */
export function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return "Never";

  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}
