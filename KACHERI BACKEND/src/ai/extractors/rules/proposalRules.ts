// KACHERI BACKEND/src/ai/extractors/rules/proposalRules.ts
// Document Intelligence: Proposal-specific anomaly detection rules
//
// See: Docs/Roadmap/document-intelligence-work-scope.md - Slice 3

import type { Anomaly } from '../../../store/extractions';
import type { ProposalExtraction } from '../types';
import type { Rule, RuleContext } from './types';
import { createAnomaly } from './types';

/* ============= Type Guard ============= */

function isProposalExtraction(ext: unknown): ext is ProposalExtraction {
  return (ext as ProposalExtraction)?.documentType === 'proposal';
}

/* ============= Rule: No Pricing Information ============= */

const noPricingRule: Rule = {
  meta: {
    code: 'NO_PRICING_INFORMATION',
    name: 'No Pricing Information',
    description: 'Proposal has no pricing details',
    documentTypes: ['proposal'],
    defaultSeverity: 'warning',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    if (!isProposalExtraction(ctx.extraction)) return [];

    const { pricing } = ctx.extraction;
    const hasPricing =
      pricing &&
      (pricing.total !== undefined ||
        (pricing.breakdown && pricing.breakdown.length > 0));

    if (!hasPricing) {
      return [
        createAnomaly(
          'NO_PRICING_INFORMATION',
          'warning',
          'No pricing information found in this proposal',
          'Proposals typically include cost estimates or pricing breakdown'
        ),
      ];
    }
    return [];
  },
};

/* ============= Rule: No Timeline/Deliverables ============= */

const noTimelineDeliverablesRule: Rule = {
  meta: {
    code: 'NO_TIMELINE_DELIVERABLES',
    name: 'No Timeline or Deliverables',
    description: 'Proposal lacks timeline or deliverables',
    documentTypes: ['proposal'],
    defaultSeverity: 'warning',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    if (!isProposalExtraction(ctx.extraction)) return [];

    const { timeline, deliverables } = ctx.extraction;
    const anomalies: Anomaly[] = [];

    const hasTimeline =
      timeline &&
      (timeline.startDate ||
        timeline.endDate ||
        (timeline.milestones && timeline.milestones.length > 0));

    const hasDeliverables = deliverables && deliverables.length > 0;

    if (!hasTimeline && !hasDeliverables) {
      anomalies.push(
        createAnomaly(
          'NO_TIMELINE_DELIVERABLES',
          'warning',
          'No timeline or deliverables found in this proposal',
          'Clear deliverables and timelines help set expectations'
        )
      );
    } else if (!hasDeliverables) {
      anomalies.push(
        createAnomaly(
          'NO_DELIVERABLES',
          'info',
          'No specific deliverables identified',
          'Consider explicitly listing what will be delivered'
        )
      );
    } else if (!hasTimeline) {
      anomalies.push(
        createAnomaly(
          'NO_TIMELINE',
          'info',
          'No timeline or milestones identified',
          'Consider adding project timeline or key milestones'
        )
      );
    }

    return anomalies;
  },
};

/* ============= Rule: Valid-Until Date Passed ============= */

const validUntilPassedRule: Rule = {
  meta: {
    code: 'VALID_UNTIL_PASSED',
    name: 'Validity Period Expired',
    description: 'Proposal valid-until date has passed',
    documentTypes: ['proposal'],
    defaultSeverity: 'error',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    if (!isProposalExtraction(ctx.extraction)) return [];

    const { validUntil } = ctx.extraction;
    if (!validUntil) return [];

    try {
      const expiry = new Date(validUntil);
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      if (expiry < now) {
        const daysExpired = Math.floor(
          (now.getTime() - expiry.getTime()) / (24 * 60 * 60 * 1000)
        );
        return [
          createAnomaly(
            'VALID_UNTIL_PASSED',
            'error',
            `Proposal validity period expired ${daysExpired} day(s) ago (${validUntil})`,
            'This proposal may no longer be valid - contact the vendor for an updated proposal'
          ),
        ];
      }
    } catch {
      // Invalid date, skip
    }
    return [];
  },
};

/* ============= Rule: Missing Scope Definition ============= */

const missingScopeRule: Rule = {
  meta: {
    code: 'MISSING_SCOPE',
    name: 'Missing Scope Definition',
    description: 'Proposal has no scope items defined',
    documentTypes: ['proposal'],
    defaultSeverity: 'warning',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    if (!isProposalExtraction(ctx.extraction)) return [];

    const { scope } = ctx.extraction;
    if (!scope || scope.length === 0) {
      return [
        createAnomaly(
          'MISSING_SCOPE',
          'warning',
          'No scope definition found in this proposal',
          'A clear scope helps prevent misunderstandings about what is included'
        ),
      ];
    }
    return [];
  },
};

/* ============= Export All Proposal Rules ============= */

export const proposalRules: Rule[] = [
  noPricingRule,
  noTimelineDeliverablesRule,
  validUntilPassedRule,
  missingScopeRule,
];
