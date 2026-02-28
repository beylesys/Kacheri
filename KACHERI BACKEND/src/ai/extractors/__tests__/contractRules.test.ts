import { describe, it, expect } from 'vitest';
import { contractRules } from '../rules/contractRules.js';
import type { RuleContext } from '../rules/types.js';
import type { ContractExtraction } from '../types.js';

function makeContractCtx(
  extraction: Partial<ContractExtraction>,
  fieldConfidences: Record<string, number> = {}
): RuleContext {
  return {
    extraction: { documentType: 'contract', title: 'Test Contract', parties: [], ...extraction } as ContractExtraction,
    fieldConfidences,
  };
}

function findRule(code: string) {
  const rule = contractRules.find((r) => r.meta.code === code);
  if (!rule) throw new Error(`Rule ${code} not found`);
  return rule;
}

/* ============= NO_TERMINATION_CLAUSE ============= */

describe('NO_TERMINATION_CLAUSE rule', () => {
  const rule = findRule('NO_TERMINATION_CLAUSE');

  it('triggers when terminationClause is missing', () => {
    const ctx = makeContractCtx({});
    expect(rule.evaluate(ctx)).toHaveLength(1);
    expect(rule.evaluate(ctx)[0].code).toBe('NO_TERMINATION_CLAUSE');
  });

  it('triggers when terminationClause is empty', () => {
    const ctx = makeContractCtx({ terminationClause: {} });
    expect(rule.evaluate(ctx)).toHaveLength(1);
  });

  it('does not trigger when noticePeriod exists', () => {
    const ctx = makeContractCtx({
      terminationClause: { noticePeriod: '30 days' },
    });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('does not trigger when conditions exist', () => {
    const ctx = makeContractCtx({
      terminationClause: { conditions: ['Material breach'] },
    });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('skips non-contract documents', () => {
    const ctx: RuleContext = {
      extraction: { documentType: 'invoice' } as any,
      fieldConfidences: {},
    };
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });
});

/* ============= NO_LIABILITY_LIMIT ============= */

describe('NO_LIABILITY_LIMIT rule', () => {
  const rule = findRule('NO_LIABILITY_LIMIT');

  it('triggers when liabilityLimit is missing', () => {
    const ctx = makeContractCtx({});
    expect(rule.evaluate(ctx)).toHaveLength(1);
  });

  it('triggers when liabilityLimit has no amount', () => {
    const ctx = makeContractCtx({ liabilityLimit: { currency: 'USD' } });
    expect(rule.evaluate(ctx)).toHaveLength(1);
  });

  it('does not trigger when amount is specified', () => {
    const ctx = makeContractCtx({
      liabilityLimit: { amount: 500000, currency: 'USD' },
    });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });
});

/* ============= UNUSUAL_PAYMENT_TERMS ============= */

describe('UNUSUAL_PAYMENT_TERMS rule', () => {
  const rule = findRule('UNUSUAL_PAYMENT_TERMS');

  it('triggers when netDays > 90', () => {
    const ctx = makeContractCtx({
      paymentTerms: { netDays: 120 },
    });
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].message).toContain('120');
  });

  it('does not trigger for netDays <= 90', () => {
    const ctx = makeContractCtx({
      paymentTerms: { netDays: 30 },
    });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('does not trigger for exactly 90 days', () => {
    const ctx = makeContractCtx({
      paymentTerms: { netDays: 90 },
    });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('does not trigger when no payment terms', () => {
    const ctx = makeContractCtx({});
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });
});

/* ============= MISSING_SIGNATURE_DATES ============= */

describe('MISSING_SIGNATURE_DATES rule', () => {
  const rule = findRule('MISSING_SIGNATURE_DATES');

  it('triggers when signatures lack dates', () => {
    const ctx = makeContractCtx({
      signatures: [{ party: 'Acme' }, { party: 'Client', signedDate: '2026-01-01' }],
    });
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].message).toContain('Acme');
  });

  it('does not trigger when all signatures have dates', () => {
    const ctx = makeContractCtx({
      signatures: [
        { party: 'Acme', signedDate: '2026-01-01' },
        { party: 'Client', signedDate: '2026-01-02' },
      ],
    });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('does not trigger when no signatures', () => {
    const ctx = makeContractCtx({});
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('does not trigger for empty signatures array', () => {
    const ctx = makeContractCtx({ signatures: [] });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });
});

/* ============= NO_GOVERNING_LAW ============= */

describe('NO_GOVERNING_LAW rule', () => {
  const rule = findRule('NO_GOVERNING_LAW');

  it('triggers when governingLaw is missing', () => {
    const ctx = makeContractCtx({});
    expect(rule.evaluate(ctx)).toHaveLength(1);
  });

  it('triggers when governingLaw is empty', () => {
    const ctx = makeContractCtx({ governingLaw: '' });
    expect(rule.evaluate(ctx)).toHaveLength(1);
  });

  it('triggers when governingLaw is whitespace', () => {
    const ctx = makeContractCtx({ governingLaw: '   ' });
    expect(rule.evaluate(ctx)).toHaveLength(1);
  });

  it('does not trigger when governingLaw is specified', () => {
    const ctx = makeContractCtx({ governingLaw: 'State of California' });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });
});

/* ============= LONG_TERM_NO_AUTO_RENEWAL ============= */

describe('LONG_TERM_NO_AUTO_RENEWAL rule', () => {
  const rule = findRule('LONG_TERM_NO_AUTO_RENEWAL');

  it('triggers for >5 year term without auto-renewal (termLength)', () => {
    const ctx = makeContractCtx({ termLength: '7 years' });
    expect(rule.evaluate(ctx)).toHaveLength(1);
  });

  it('does not trigger for <=5 year term', () => {
    const ctx = makeContractCtx({ termLength: '3 years' });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('does not trigger when auto-renewal is true', () => {
    const ctx = makeContractCtx({ termLength: '10 years', autoRenewal: true });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('triggers for >5 year term via dates', () => {
    const ctx = makeContractCtx({
      effectiveDate: '2020-01-01',
      expirationDate: '2027-01-01',
    });
    expect(rule.evaluate(ctx)).toHaveLength(1);
  });

  it('does not trigger for <5 year term via dates', () => {
    const ctx = makeContractCtx({
      effectiveDate: '2026-01-01',
      expirationDate: '2028-01-01',
    });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('does not trigger when no term information', () => {
    const ctx = makeContractCtx({});
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });
});
