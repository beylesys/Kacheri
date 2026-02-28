import { describe, it, expect } from 'vitest';
import { invoiceRules } from '../rules/invoiceRules.js';
import type { RuleContext } from '../rules/types.js';
import type { InvoiceExtraction } from '../types.js';

function makeInvoiceCtx(
  extraction: Partial<InvoiceExtraction>,
  fieldConfidences: Record<string, number> = {}
): RuleContext {
  return {
    extraction: {
      documentType: 'invoice',
      invoiceNumber: 'INV-001',
      vendor: { name: 'Vendor' },
      customer: { name: 'Customer' },
      issueDate: '2026-01-01',
      dueDate: '2026-02-01',
      lineItems: [],
      subtotal: 0,
      total: 0,
      currency: 'USD',
      ...extraction,
    } as InvoiceExtraction,
    fieldConfidences,
  };
}

function findRule(code: string) {
  const rule = invoiceRules.find((r) => r.meta.code === code);
  if (!rule) throw new Error(`Rule ${code} not found`);
  return rule;
}

/* ============= DUE_DATE_IN_PAST ============= */

describe('DUE_DATE_IN_PAST rule', () => {
  const rule = findRule('DUE_DATE_IN_PAST');

  it('triggers when due date is in the past', () => {
    const ctx = makeInvoiceCtx({ dueDate: '2020-01-01' });
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].code).toBe('DUE_DATE_IN_PAST');
    expect(anomalies[0].severity).toBe('error');
  });

  it('does not trigger for future due date', () => {
    const ctx = makeInvoiceCtx({ dueDate: '2099-12-31' });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('does not trigger for "Unknown" due date', () => {
    const ctx = makeInvoiceCtx({ dueDate: 'Unknown' });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('skips non-invoice documents', () => {
    const ctx: RuleContext = {
      extraction: { documentType: 'contract' } as any,
      fieldConfidences: {},
    };
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });
});

/* ============= MISSING_INVOICE_NUMBER ============= */

describe('MISSING_INVOICE_NUMBER rule', () => {
  const rule = findRule('MISSING_INVOICE_NUMBER');

  it('triggers when invoiceNumber is empty', () => {
    const ctx = makeInvoiceCtx({ invoiceNumber: '' });
    expect(rule.evaluate(ctx)).toHaveLength(1);
  });

  it('triggers when invoiceNumber is "Unknown"', () => {
    const ctx = makeInvoiceCtx({ invoiceNumber: 'Unknown' });
    expect(rule.evaluate(ctx)).toHaveLength(1);
  });

  it('does not trigger for valid invoice number', () => {
    const ctx = makeInvoiceCtx({ invoiceNumber: 'INV-2026-001' });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });
});

/* ============= LINE_ITEMS_SUM_MISMATCH ============= */

describe('LINE_ITEMS_SUM_MISMATCH rule', () => {
  const rule = findRule('LINE_ITEMS_SUM_MISMATCH');

  it('triggers when line items do not sum to subtotal', () => {
    const ctx = makeInvoiceCtx({
      lineItems: [
        { description: 'A', amount: 100 },
        { description: 'B', amount: 200 },
      ],
      subtotal: 500,
      total: 500,
    });
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].code).toBe('LINE_ITEMS_SUM_MISMATCH');
  });

  it('does not trigger when items sum matches subtotal', () => {
    const ctx = makeInvoiceCtx({
      lineItems: [
        { description: 'A', amount: 100 },
        { description: 'B', amount: 200 },
      ],
      subtotal: 300,
      total: 330,
      tax: 30,
    });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('allows small floating point tolerance', () => {
    const ctx = makeInvoiceCtx({
      lineItems: [
        { description: 'A', amount: 100.005 },
        { description: 'B', amount: 200.005 },
      ],
      subtotal: 300.01,
      total: 300.01,
    });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('does not trigger for empty line items', () => {
    const ctx = makeInvoiceCtx({ lineItems: [], subtotal: 100, total: 100 });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('checks against total minus tax when subtotal is 0', () => {
    const ctx = makeInvoiceCtx({
      lineItems: [{ description: 'A', amount: 100 }],
      subtotal: 0,
      total: 120,
      tax: 20,
    });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });
});

/* ============= MISSING_TAX ============= */

describe('MISSING_TAX rule', () => {
  const rule = findRule('MISSING_TAX');

  it('triggers when total > 100 and no tax', () => {
    const ctx = makeInvoiceCtx({ total: 500, tax: undefined });
    expect(rule.evaluate(ctx)).toHaveLength(1);
  });

  it('triggers when total > 100 and tax is 0', () => {
    const ctx = makeInvoiceCtx({ total: 500, tax: 0 });
    expect(rule.evaluate(ctx)).toHaveLength(1);
  });

  it('does not trigger when total <= 100', () => {
    const ctx = makeInvoiceCtx({ total: 50, tax: undefined });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('does not trigger when tax is present', () => {
    const ctx = makeInvoiceCtx({ total: 500, tax: 50 });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });
});

/* ============= UNUSUAL_INVOICE_PAYMENT_TERMS ============= */

describe('UNUSUAL_INVOICE_PAYMENT_TERMS rule', () => {
  const rule = findRule('UNUSUAL_INVOICE_PAYMENT_TERMS');

  it('triggers when payment terms > 90 days', () => {
    const ctx = makeInvoiceCtx({
      issueDate: '2026-01-01',
      dueDate: '2026-06-01', // ~150 days
    });
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].message).toContain('days');
  });

  it('does not trigger for normal payment terms', () => {
    const ctx = makeInvoiceCtx({
      issueDate: '2026-01-01',
      dueDate: '2026-01-31', // 30 days
    });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('does not trigger for "Unknown" dates', () => {
    const ctx = makeInvoiceCtx({
      issueDate: 'Unknown',
      dueDate: 'Unknown',
    });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('does not trigger when dates are missing', () => {
    const ctx = makeInvoiceCtx({
      issueDate: '',
      dueDate: '',
    });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });
});
