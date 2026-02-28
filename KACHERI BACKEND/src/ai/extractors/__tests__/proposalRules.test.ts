import { describe, it, expect } from 'vitest';
import { proposalRules } from '../rules/proposalRules.js';
import type { RuleContext } from '../rules/types.js';
import type { ProposalExtraction } from '../types.js';

function makeProposalCtx(
  extraction: Partial<ProposalExtraction>,
  fieldConfidences: Record<string, number> = {}
): RuleContext {
  return {
    extraction: {
      documentType: 'proposal',
      title: 'Test Proposal',
      vendor: 'Vendor',
      client: 'Client',
      date: '2026-01-01',
      scope: [],
      deliverables: [],
      pricing: {},
      ...extraction,
    } as ProposalExtraction,
    fieldConfidences,
  };
}

function findRule(code: string) {
  const rule = proposalRules.find((r) => r.meta.code === code);
  if (!rule) throw new Error(`Rule ${code} not found`);
  return rule;
}

/* ============= NO_PRICING_INFORMATION ============= */

describe('NO_PRICING_INFORMATION rule', () => {
  const rule = findRule('NO_PRICING_INFORMATION');

  it('triggers when pricing has no total or breakdown', () => {
    const ctx = makeProposalCtx({ pricing: {} });
    expect(rule.evaluate(ctx)).toHaveLength(1);
    expect(rule.evaluate(ctx)[0].code).toBe('NO_PRICING_INFORMATION');
  });

  it('does not trigger when pricing has total', () => {
    const ctx = makeProposalCtx({ pricing: { total: 50000 } });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('does not trigger when pricing has breakdown', () => {
    const ctx = makeProposalCtx({
      pricing: { breakdown: [{ item: 'Phase 1', amount: 25000 }] },
    });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('skips non-proposal documents', () => {
    const ctx: RuleContext = {
      extraction: { documentType: 'contract' } as any,
      fieldConfidences: {},
    };
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });
});

/* ============= NO_TIMELINE_DELIVERABLES ============= */

describe('NO_TIMELINE_DELIVERABLES rule', () => {
  const rule = findRule('NO_TIMELINE_DELIVERABLES');

  it('triggers warning when neither timeline nor deliverables', () => {
    const ctx = makeProposalCtx({ timeline: undefined, deliverables: [] });
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].code).toBe('NO_TIMELINE_DELIVERABLES');
    expect(anomalies[0].severity).toBe('warning');
  });

  it('triggers info when deliverables missing but timeline exists', () => {
    const ctx = makeProposalCtx({
      timeline: { startDate: '2026-01-01' },
      deliverables: [],
    });
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].code).toBe('NO_DELIVERABLES');
    expect(anomalies[0].severity).toBe('info');
  });

  it('triggers info when timeline missing but deliverables exist', () => {
    const ctx = makeProposalCtx({
      timeline: undefined,
      deliverables: [{ name: 'Phase 1' }],
    });
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].code).toBe('NO_TIMELINE');
    expect(anomalies[0].severity).toBe('info');
  });

  it('does not trigger when both exist', () => {
    const ctx = makeProposalCtx({
      timeline: { startDate: '2026-01-01' },
      deliverables: [{ name: 'Phase 1' }],
    });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('recognizes milestones as timeline', () => {
    const ctx = makeProposalCtx({
      timeline: { milestones: [{ name: 'M1', date: '2026-03-01' }] },
      deliverables: [{ name: 'Phase 1' }],
    });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });
});

/* ============= VALID_UNTIL_PASSED ============= */

describe('VALID_UNTIL_PASSED rule', () => {
  const rule = findRule('VALID_UNTIL_PASSED');

  it('triggers when validUntil has passed', () => {
    const ctx = makeProposalCtx({ validUntil: '2020-01-01' });
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].severity).toBe('error');
  });

  it('does not trigger for future validUntil', () => {
    const ctx = makeProposalCtx({ validUntil: '2099-12-31' });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('does not trigger when validUntil is absent', () => {
    const ctx = makeProposalCtx({ validUntil: undefined });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });
});

/* ============= MISSING_SCOPE ============= */

describe('MISSING_SCOPE rule', () => {
  const rule = findRule('MISSING_SCOPE');

  it('triggers when scope is empty', () => {
    const ctx = makeProposalCtx({ scope: [] });
    expect(rule.evaluate(ctx)).toHaveLength(1);
    expect(rule.evaluate(ctx)[0].code).toBe('MISSING_SCOPE');
  });

  it('does not trigger when scope has items', () => {
    const ctx = makeProposalCtx({ scope: ['Web development', 'Testing'] });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });
});
