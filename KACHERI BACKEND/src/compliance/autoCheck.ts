// KACHERI BACKEND/src/compliance/autoCheck.ts
// Compliance Checker: Auto-check debounce and trigger utilities
//
// Provides debounce logic for auto-save triggered compliance checks
// and helper to determine if a workspace has auto-check policies.
//
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slice A7

import { ComplianceChecksStore } from "../store/complianceChecks";
import { CompliancePoliciesStore } from "../store/compliancePolicies";
import type { CompliancePolicy } from "../store/compliancePolicies";

/* ---------- Constants ---------- */

/** Minimum interval between auto-checks for the same document (30 seconds) */
export const DEBOUNCE_MS = 30_000;

/* ---------- Debounce ---------- */

/**
 * Check if enough time has passed since the last compliance check for this document.
 * Returns true if it's safe to run a new check (>30s since last check).
 * Returns false if a check was run recently (debounced).
 */
export async function shouldAutoCheck(docId: string): Promise<boolean> {
  const latest = await ComplianceChecksStore.getLatest(docId);
  if (!latest) return true; // no previous check — always run

  // Use createdAt (ISO string) to determine when the last check was initiated
  const lastCheckTime = new Date(latest.createdAt).getTime();
  const elapsed = Date.now() - lastCheckTime;

  return elapsed >= DEBOUNCE_MS;
}

/**
 * Check if a workspace has any enabled policies with autoCheck enabled.
 * Returns false if no auto-check policies exist (skip the check entirely).
 */
export async function hasAutoCheckPolicies(workspaceId: string): Promise<boolean> {
  const enabled = await CompliancePoliciesStore.getEnabled(workspaceId);
  return enabled.some((p) => p.autoCheck);
}

/**
 * Get only the auto-check enabled policies for a workspace.
 * Used when triggeredBy is 'auto_save' — only runs policies that opted into auto-check.
 */
export async function getAutoCheckPolicies(workspaceId: string): Promise<CompliancePolicy[]> {
  const enabled = await CompliancePoliciesStore.getEnabled(workspaceId);
  return enabled.filter((p) => p.autoCheck);
}
