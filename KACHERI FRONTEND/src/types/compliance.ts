// KACHERI FRONTEND/src/types/compliance.ts
// Compliance Checker: TypeScript types for compliance policies, checks, and templates.
//
// These types mirror the backend schemas defined in:
//   - KACHERI BACKEND/src/store/compliancePolicies.ts
//   - KACHERI BACKEND/src/store/complianceChecks.ts
//   - KACHERI BACKEND/src/compliance/templates.ts
//   - KACHERI BACKEND/src/routes/compliance.ts
//   - KACHERI BACKEND/src/routes/compliancePolicies.ts
//
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md — Slice A8

/* ============= Base Types ============= */

export type PolicyCategory =
  | 'general'
  | 'legal'
  | 'financial'
  | 'privacy'
  | 'custom';

export type PolicyRuleType =
  | 'text_match'
  | 'regex_pattern'
  | 'required_section'
  | 'forbidden_term'
  | 'numeric_constraint'
  | 'ai_check';

export type PolicySeverity = 'info' | 'warning' | 'error';

export type CheckStatus = 'pending' | 'running' | 'passed' | 'failed' | 'error';

export type CheckTrigger = 'manual' | 'auto_save' | 'pre_export';

/* ============= Domain Types ============= */

/** A workspace compliance policy definition */
export type CompliancePolicy = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  category: PolicyCategory;
  ruleType: PolicyRuleType;
  ruleConfig: Record<string, unknown>;
  severity: PolicySeverity;
  documentTypes: string[];
  enabled: boolean;
  autoCheck: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/** Individual policy result within a compliance check */
export type PolicyResult = {
  policyId: string;
  policyName: string;
  ruleType: string;
  severity: string;
  status: 'passed' | 'failed' | 'error';
  message: string;
  suggestion?: string;
  location?: string;
  details?: Record<string, unknown>;
};

/** A compliance check result for a document */
export type ComplianceCheck = {
  id: string;
  docId: string;
  workspaceId: string;
  status: CheckStatus;
  totalPolicies: number;
  passed: number;
  warnings: number;
  violations: number;
  results: PolicyResult[] | null;
  proofId: string | null;
  triggeredBy: CheckTrigger;
  checkedBy: string;
  createdAt: string;
  completedAt: string | null;
};

/** A built-in policy template (read-only, cloned into workspace policies) */
export type CompliancePolicyTemplate = {
  id: string;
  name: string;
  description: string;
  category: PolicyCategory;
  ruleType: PolicyRuleType;
  defaultConfig: Record<string, unknown>;
  severity: PolicySeverity;
  documentTypes: string[];
};

/* ============= API Request Types ============= */

export type CheckComplianceParams = {
  html: string;
  metadata?: Record<string, unknown>;
  triggeredBy?: CheckTrigger;
};

export type ListPoliciesOptions = {
  category?: PolicyCategory;
  enabled?: boolean;
};

export type CreatePolicyParams = {
  name: string;
  description?: string;
  category?: PolicyCategory;
  ruleType: PolicyRuleType;
  ruleConfig: Record<string, unknown>;
  severity?: PolicySeverity;
  documentTypes?: string[];
  enabled?: boolean;
  autoCheck?: boolean;
};

export type UpdatePolicyParams = {
  name?: string;
  description?: string | null;
  category?: PolicyCategory;
  ruleType?: PolicyRuleType;
  ruleConfig?: Record<string, unknown>;
  severity?: PolicySeverity;
  documentTypes?: string[];
  enabled?: boolean;
  autoCheck?: boolean;
};

export type ListTemplatesOptions = {
  category?: PolicyCategory;
};

export type CheckHistoryOptions = {
  limit?: number;
  offset?: number;
};

/* ============= API Response Types ============= */

/** Response from POST /docs/:id/compliance/check (successful check) */
export type CheckComplianceResponse = {
  checkId: string;
  docId: string;
  status: 'passed' | 'failed';
  totalPolicies: number;
  passed: number;
  warnings: number;
  violations: number;
  results: PolicyResult[];
  proofId: number | null;
  proofHash: string;
  checkedAt: string;
};

/** Response from POST /docs/:id/compliance/check when no policies exist */
export type CheckNoPoliciesResponse = {
  checkId: null;
  docId: string;
  status: 'passed';
  totalPolicies: 0;
  passed: 0;
  warnings: 0;
  violations: 0;
  results: [];
  message: string;
};

/** Response from POST /docs/:id/compliance/check when skipped (debounced or no auto-check policies) */
export type CheckSkippedResponse = {
  skipped: true;
  reason: 'debounced' | 'no_auto_check_policies';
  docId: string;
  message: string;
};

/** Response from GET /docs/:id/compliance */
export type GetLatestCheckResponse = {
  checkId: string;
  docId: string;
  status: CheckStatus;
  totalPolicies: number;
  passed: number;
  warnings: number;
  violations: number;
  results: PolicyResult[] | null;
  proofId: string | null;
  triggeredBy: CheckTrigger;
  checkedBy: string;
  createdAt: string;
  completedAt: string | null;
};

/** Summary entry in check history (without full results array) */
export type CheckHistorySummary = {
  checkId: string;
  status: CheckStatus;
  totalPolicies: number;
  passed: number;
  warnings: number;
  violations: number;
  triggeredBy: CheckTrigger;
  checkedBy: string;
  createdAt: string;
  completedAt: string | null;
};

/** Response from GET /docs/:id/compliance/history */
export type CheckHistoryResponse = {
  docId: string;
  checks: CheckHistorySummary[];
  total: number;
  limit: number;
  offset: number;
};

/** Response from GET /workspaces/:wid/compliance-policies */
export type ListPoliciesResponse = {
  workspaceId: string;
  policies: CompliancePolicy[];
  total: number;
};

/** Response from POST /workspaces/:wid/compliance-policies */
export type CreatePolicyResponse = {
  policy: CompliancePolicy;
  message: string;
};

/** Response from PATCH /workspaces/:wid/compliance-policies/:pid */
export type UpdatePolicyResponse = {
  policy: CompliancePolicy;
  message: string;
};

/** Response from DELETE /workspaces/:wid/compliance-policies/:pid */
export type DeletePolicyResponse = {
  policyId: string;
  message: string;
};

/** Response from GET /workspaces/:wid/compliance-policies/templates */
export type ListTemplatesResponse = {
  templates: CompliancePolicyTemplate[];
  total: number;
};
