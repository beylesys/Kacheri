// KACHERI BACKEND/src/compliance/templates.ts
// Compliance Checker: Built-in policy templates
//
// Read-only templates that users can clone into workspace policies.
// 13 templates across 4 categories: legal, financial, privacy, general.
//
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slice A4

import type {
  PolicyCategory,
  PolicyRuleType,
  PolicySeverity,
} from "../store/compliancePolicies";

/* ---------- Template Type ---------- */

export interface CompliancePolicyTemplate {
  /** Stable slug identifier (e.g. "legal-no-unlimited-liability") */
  id: string;
  /** Human-readable template name */
  name: string;
  /** What this policy enforces */
  description: string;
  /** Policy category */
  category: PolicyCategory;
  /** Rule type for the evaluator */
  ruleType: PolicyRuleType;
  /** Default rule configuration (cloned into workspace policy) */
  defaultConfig: Record<string, unknown>;
  /** Default severity level */
  severity: PolicySeverity;
  /** Which document types this applies to */
  documentTypes: string[];
}

/* ---------- Built-in Templates ---------- */

export const BUILTIN_POLICY_TEMPLATES: readonly CompliancePolicyTemplate[] = [
  // ========== LEGAL (3) ==========
  {
    id: "legal-no-unlimited-liability",
    name: "No Unlimited Liability",
    description:
      "Flags documents that contain phrases implying unlimited liability exposure, such as 'unlimited liability' or 'no liability cap'.",
    category: "legal",
    ruleType: "forbidden_term",
    defaultConfig: {
      terms: [
        "unlimited liability",
        "no liability cap",
        "uncapped liability",
        "without limitation of liability",
      ],
      caseSensitive: false,
    },
    severity: "error",
    documentTypes: ["all"],
  },
  {
    id: "legal-require-termination-clause",
    name: "Require Termination Clause",
    description:
      "Ensures the document includes a 'Termination' section with at least 20 words describing termination terms.",
    category: "legal",
    ruleType: "required_section",
    defaultConfig: {
      heading: "Termination",
      minWords: 20,
    },
    severity: "warning",
    documentTypes: ["all"],
  },
  {
    id: "legal-require-governing-law",
    name: "Require Governing Law",
    description:
      "Ensures the document includes a 'Governing Law' section specifying the legal jurisdiction.",
    category: "legal",
    ruleType: "required_section",
    defaultConfig: {
      heading: "Governing Law",
    },
    severity: "warning",
    documentTypes: ["all"],
  },

  // ========== FINANCIAL (3) ==========
  {
    id: "financial-sla-cap",
    name: "SLA Cap (99.9%)",
    description:
      "Uses AI to detect whether the document promises a service level agreement above 99.9% uptime.",
    category: "financial",
    ruleType: "ai_check",
    defaultConfig: {
      instruction:
        "Does this document promise or guarantee a Service Level Agreement (SLA) with uptime or availability above 99.9%? Look for phrases like '99.95%', '99.99%', 'five nines', or '100% uptime'.",
      failIf: "yes",
    },
    severity: "error",
    documentTypes: ["all"],
  },
  {
    id: "financial-payment-terms-max",
    name: "Payment Terms Max (Net-90)",
    description:
      "Uses AI to detect whether the document sets payment terms longer than Net-90 days.",
    category: "financial",
    ruleType: "ai_check",
    defaultConfig: {
      instruction:
        "Does this document set payment terms longer than Net-90 (90 days)? Look for payment terms like 'Net-120', 'Net-180', '120 days', or any payment period exceeding 90 days.",
      failIf: "yes",
    },
    severity: "warning",
    documentTypes: ["all"],
  },
  {
    id: "financial-require-pricing-section",
    name: "Require Pricing Section",
    description:
      "Ensures the document includes a 'Pricing' section with at least 10 words.",
    category: "financial",
    ruleType: "required_section",
    defaultConfig: {
      heading: "Pricing",
      minWords: 10,
    },
    severity: "warning",
    documentTypes: ["all"],
  },

  // ========== PRIVACY (3) ==========
  {
    id: "privacy-require-gdpr-clause",
    name: "GDPR Clause Required",
    description:
      "Ensures the document references GDPR or the General Data Protection Regulation.",
    category: "privacy",
    ruleType: "text_match",
    defaultConfig: {
      pattern: "GDPR|General Data Protection Regulation",
      matchType: "contains",
      caseSensitive: false,
    },
    severity: "error",
    documentTypes: ["all"],
  },
  {
    id: "privacy-no-pii-in-titles",
    name: "No PII in Document Titles",
    description:
      "Warns if the document contains email addresses or phone numbers in its opening text, which may indicate PII exposure in titles or headers.",
    category: "privacy",
    ruleType: "regex_pattern",
    defaultConfig: {
      pattern:
        "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}|\\+?\\d[\\d\\s()-]{7,}\\d",
      flags: "",
      mustMatch: false,
    },
    severity: "warning",
    documentTypes: ["all"],
  },
  {
    id: "privacy-require-data-processing",
    name: "Require Data Processing Terms",
    description:
      "Ensures the document includes a 'Data Processing' section describing how personal data is handled.",
    category: "privacy",
    ruleType: "required_section",
    defaultConfig: {
      heading: "Data Processing",
      minWords: 15,
    },
    severity: "warning",
    documentTypes: ["all"],
  },

  // ========== GENERAL (4) ==========
  {
    id: "general-confidentiality-notice",
    name: "Confidentiality Notice",
    description:
      "Checks that the document includes a confidentiality notice or marking.",
    category: "general",
    ruleType: "text_match",
    defaultConfig: {
      pattern: "confidential",
      matchType: "contains",
      caseSensitive: false,
    },
    severity: "info",
    documentTypes: ["all"],
  },
  {
    id: "general-require-disclaimer",
    name: "Require Disclaimer Section",
    description:
      "Ensures the document includes a 'Disclaimer' section.",
    category: "general",
    ruleType: "required_section",
    defaultConfig: {
      heading: "Disclaimer",
    },
    severity: "info",
    documentTypes: ["all"],
  },
  {
    id: "general-no-promotional-language",
    name: "No Promotional Language",
    description:
      "Flags the use of promotional or absolute marketing language that may create legal exposure.",
    category: "general",
    ruleType: "forbidden_term",
    defaultConfig: {
      terms: [
        "guaranteed",
        "risk-free",
        "best in class",
        "industry-leading",
        "world-class",
        "unmatched",
        "number one",
        "#1",
      ],
      caseSensitive: false,
    },
    severity: "warning",
    documentTypes: ["all"],
  },
  {
    id: "general-require-effective-date",
    name: "Require Effective Date",
    description:
      "Ensures the document contains a recognizable date pattern indicating an effective or execution date.",
    category: "general",
    ruleType: "regex_pattern",
    defaultConfig: {
      pattern:
        "\\b(?:effective\\s+date|dated?|as\\s+of)\\s*:?\\s*\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|\\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},?\\s+\\d{4}",
      flags: "i",
      mustMatch: true,
    },
    severity: "warning",
    documentTypes: ["all"],
  },
];

/* ---------- Lookup Helpers ---------- */

/** Get a template by its stable ID */
export function getTemplateById(
  id: string
): CompliancePolicyTemplate | undefined {
  return BUILTIN_POLICY_TEMPLATES.find((t) => t.id === id);
}

/** Get all templates in a given category */
export function getTemplatesByCategory(
  category: PolicyCategory
): CompliancePolicyTemplate[] {
  return BUILTIN_POLICY_TEMPLATES.filter((t) => t.category === category);
}
