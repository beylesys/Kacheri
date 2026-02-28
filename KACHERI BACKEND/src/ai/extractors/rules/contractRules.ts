// KACHERI BACKEND/src/ai/extractors/rules/contractRules.ts
// Document Intelligence: Contract-specific anomaly detection rules
//
// See: Docs/Roadmap/document-intelligence-work-scope.md - Slice 3

import type { Anomaly } from '../../../store/extractions';
import type { ContractExtraction } from '../types';
import type { Rule, RuleContext } from './types';
import { createAnomaly } from './types';

/* ============= Type Guard ============= */

function isContractExtraction(ext: unknown): ext is ContractExtraction {
  return (ext as ContractExtraction)?.documentType === 'contract';
}

/* ============= Rule: No Termination Clause ============= */

const noTerminationClauseRule: Rule = {
  meta: {
    code: 'NO_TERMINATION_CLAUSE',
    name: 'No Termination Clause',
    description: 'Contract has no termination clause identified',
    documentTypes: ['contract'],
    defaultSeverity: 'warning',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    if (!isContractExtraction(ctx.extraction)) return [];

    const { terminationClause } = ctx.extraction;
    if (
      !terminationClause ||
      (!terminationClause.noticePeriod &&
        (!terminationClause.conditions || terminationClause.conditions.length === 0))
    ) {
      return [
        createAnomaly(
          'NO_TERMINATION_CLAUSE',
          'warning',
          'No termination clause found in this contract',
          'Consider adding or verifying termination terms for legal clarity'
        ),
      ];
    }
    return [];
  },
};

/* ============= Rule: No Liability Limit ============= */

const noLiabilityLimitRule: Rule = {
  meta: {
    code: 'NO_LIABILITY_LIMIT',
    name: 'No Liability Limit',
    description: 'Contract has no liability limit specified',
    documentTypes: ['contract'],
    defaultSeverity: 'warning',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    if (!isContractExtraction(ctx.extraction)) return [];

    const { liabilityLimit } = ctx.extraction;
    if (!liabilityLimit || liabilityLimit.amount === undefined) {
      return [
        createAnomaly(
          'NO_LIABILITY_LIMIT',
          'warning',
          'No liability limit specified in this contract',
          'Consider defining liability caps to manage risk exposure'
        ),
      ];
    }
    return [];
  },
};

/* ============= Rule: Unusual Payment Terms (>90 days) ============= */

const unusualPaymentTermsRule: Rule = {
  meta: {
    code: 'UNUSUAL_PAYMENT_TERMS',
    name: 'Unusual Payment Terms',
    description: 'Payment terms exceed 90 days',
    documentTypes: ['contract'],
    defaultSeverity: 'warning',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    if (!isContractExtraction(ctx.extraction)) return [];

    const { paymentTerms } = ctx.extraction;
    if (paymentTerms?.netDays !== undefined && paymentTerms.netDays > 90) {
      return [
        createAnomaly(
          'UNUSUAL_PAYMENT_TERMS',
          'warning',
          `Payment terms of ${paymentTerms.netDays} days exceed typical 30-90 day terms`,
          'Verify this extended payment period is intentional and acceptable'
        ),
      ];
    }
    return [];
  },
};

/* ============= Rule: Missing Signature Dates ============= */

const missingSignatureDatesRule: Rule = {
  meta: {
    code: 'MISSING_SIGNATURE_DATES',
    name: 'Missing Signature Dates',
    description: 'Signatures exist but lack dates',
    documentTypes: ['contract'],
    defaultSeverity: 'info',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    if (!isContractExtraction(ctx.extraction)) return [];

    const { signatures } = ctx.extraction;
    if (!signatures || signatures.length === 0) return [];

    const undatedSignatures = signatures.filter((sig) => !sig.signedDate);
    if (undatedSignatures.length > 0) {
      const parties = undatedSignatures.map((s) => s.party).join(', ');
      return [
        createAnomaly(
          'MISSING_SIGNATURE_DATES',
          'info',
          `Signatures without dates found for: ${parties}`,
          'Ensure all signatures are dated for proper contract execution'
        ),
      ];
    }
    return [];
  },
};

/* ============= Rule: No Governing Law ============= */

const noGoverningLawRule: Rule = {
  meta: {
    code: 'NO_GOVERNING_LAW',
    name: 'No Governing Law',
    description: 'Contract does not specify governing law/jurisdiction',
    documentTypes: ['contract'],
    defaultSeverity: 'info',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    if (!isContractExtraction(ctx.extraction)) return [];

    const { governingLaw } = ctx.extraction;
    if (!governingLaw || governingLaw.trim() === '') {
      return [
        createAnomaly(
          'NO_GOVERNING_LAW',
          'info',
          'No governing law or jurisdiction specified',
          "Consider specifying which jurisdiction's laws will govern this contract"
        ),
      ];
    }
    return [];
  },
};

/* ============= Rule: Long Term Without Auto-Renewal ============= */

const longTermNoAutoRenewalRule: Rule = {
  meta: {
    code: 'LONG_TERM_NO_AUTO_RENEWAL',
    name: 'Long Term Without Auto-Renewal',
    description: 'Contract term exceeds 5 years without auto-renewal option',
    documentTypes: ['contract'],
    defaultSeverity: 'info',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    if (!isContractExtraction(ctx.extraction)) return [];

    const { termLength, autoRenewal, effectiveDate, expirationDate } = ctx.extraction;

    // Try to detect >5 year terms
    let isLongTerm = false;

    // Check termLength string for years
    if (termLength) {
      const yearMatch = termLength.match(/(\d+)\s*years?/i);
      if (yearMatch && parseInt(yearMatch[1], 10) > 5) {
        isLongTerm = true;
      }
    }

    // Check by date difference
    if (!isLongTerm && effectiveDate && expirationDate) {
      try {
        const start = new Date(effectiveDate);
        const end = new Date(expirationDate);
        const years =
          (end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        if (years > 5) {
          isLongTerm = true;
        }
      } catch {
        // Invalid dates, skip
      }
    }

    if (isLongTerm && autoRenewal !== true) {
      return [
        createAnomaly(
          'LONG_TERM_NO_AUTO_RENEWAL',
          'info',
          'Contract term exceeds 5 years without an auto-renewal option',
          'Consider whether auto-renewal or periodic review clauses would be beneficial'
        ),
      ];
    }
    return [];
  },
};

/* ============= Export All Contract Rules ============= */

export const contractRules: Rule[] = [
  noTerminationClauseRule,
  noLiabilityLimitRule,
  unusualPaymentTermsRule,
  missingSignatureDatesRule,
  noGoverningLawRule,
  longTermNoAutoRenewalRule,
];
