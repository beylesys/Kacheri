import { describe, it, expect } from 'vitest';
import { universalRules } from '../rules/universalRules.js';
import type { RuleContext } from '../rules/types.js';
import type { ExtractionResult } from '../types.js';

function makeContext(
  extraction: Partial<ExtractionResult> & { documentType: string },
  fieldConfidences: Record<string, number> = {}
): RuleContext {
  return {
    extraction: extraction as ExtractionResult,
    fieldConfidences,
  };
}

function findRule(code: string) {
  const rule = universalRules.find((r) => r.meta.code === code);
  if (!rule) throw new Error(`Rule ${code} not found`);
  return rule;
}

/* ============= MISSING_TITLE ============= */

describe('MISSING_TITLE rule', () => {
  const rule = findRule('MISSING_TITLE');

  it('triggers when title is missing', () => {
    const ctx = makeContext({ documentType: 'contract' } as ExtractionResult);
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].code).toBe('MISSING_TITLE');
  });

  it('triggers for generic title "Untitled Document"', () => {
    const ctx = makeContext({
      documentType: 'contract',
      title: 'Untitled Document',
    } as ExtractionResult);
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(1);
  });

  it('triggers for empty string title', () => {
    const ctx = makeContext({
      documentType: 'contract',
      title: '',
    } as ExtractionResult);
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(1);
  });

  it('does not trigger for valid title', () => {
    const ctx = makeContext({
      documentType: 'contract',
      title: 'Service Agreement 2026',
    } as ExtractionResult);
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(0);
  });
});

/* ============= NO_DATES_FOUND ============= */

describe('NO_DATES_FOUND rule', () => {
  const rule = findRule('NO_DATES_FOUND');

  it('triggers when no date fields exist', () => {
    const ctx = makeContext({
      documentType: 'contract',
      title: 'Test',
    } as ExtractionResult);
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].code).toBe('NO_DATES_FOUND');
  });

  it('does not trigger when effectiveDate exists', () => {
    const ctx = makeContext({
      documentType: 'contract',
      title: 'Test',
      effectiveDate: '2026-01-01',
    } as unknown as ExtractionResult);
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(0);
  });

  it('does not trigger when dates array is non-empty', () => {
    const ctx = makeContext({
      documentType: 'other',
      title: 'Test',
      dates: [{ date: '2026-01-01', context: 'posted' }],
    } as unknown as ExtractionResult);
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(0);
  });

  it('does not trigger when signatures have dates', () => {
    const ctx = makeContext({
      documentType: 'contract',
      title: 'Test',
      signatures: [{ party: 'A', signedDate: '2026-01-01' }],
    } as unknown as ExtractionResult);
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(0);
  });

  it('ignores "Unknown" date values', () => {
    const ctx = makeContext({
      documentType: 'contract',
      title: 'Test',
      effectiveDate: 'Unknown',
    } as unknown as ExtractionResult);
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(1);
  });
});

/* ============= NO_PARTIES_IDENTIFIED ============= */

describe('NO_PARTIES_IDENTIFIED rule', () => {
  const rule = findRule('NO_PARTIES_IDENTIFIED');

  it('triggers when no entities found', () => {
    const ctx = makeContext({
      documentType: 'other',
      title: 'Test',
    } as ExtractionResult);
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].code).toBe('NO_PARTIES_IDENTIFIED');
  });

  it('does not trigger when parties exist', () => {
    const ctx = makeContext({
      documentType: 'contract',
      title: 'Test',
      parties: [{ name: 'Acme', role: 'party_a' }],
    } as unknown as ExtractionResult);
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('does not trigger when vendor exists', () => {
    const ctx = makeContext({
      documentType: 'invoice',
      title: 'Test',
      vendor: { name: 'Vendor Corp' },
    } as unknown as ExtractionResult);
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('does not trigger when attendees exist', () => {
    const ctx = makeContext({
      documentType: 'meeting_notes',
      title: 'Test',
      attendees: ['Alice', 'Bob'],
    } as unknown as ExtractionResult);
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('does not trigger when author exists', () => {
    const ctx = makeContext({
      documentType: 'report',
      title: 'Test',
      author: 'John Doe',
    } as unknown as ExtractionResult);
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });
});

/* ============= LOW_CONFIDENCE_CRITICAL_FIELD ============= */

describe('LOW_CONFIDENCE_CRITICAL_FIELD rule', () => {
  const rule = findRule('LOW_CONFIDENCE_CRITICAL_FIELD');

  it('triggers when critical field confidence is below 50%', () => {
    const ctx = makeContext(
      { documentType: 'contract', title: 'Test' } as ExtractionResult,
      { parties: 0.3, effectiveDate: 0.8 }
    );
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].message).toContain('parties');
  });

  it('does not trigger when all critical fields are above 50%', () => {
    const ctx = makeContext(
      { documentType: 'contract', title: 'Test' } as ExtractionResult,
      { parties: 0.8, effectiveDate: 0.7, paymentTerms: 0.6 }
    );
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('triggers multiple anomalies for multiple low-confidence fields', () => {
    const ctx = makeContext(
      { documentType: 'invoice', title: 'Test' } as unknown as ExtractionResult,
      { invoiceNumber: 0.2, total: 0.1, dueDate: 0.3, vendor: 0.4 }
    );
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(4);
  });

  it('does not trigger when confidence is exactly 50%', () => {
    const ctx = makeContext(
      { documentType: 'contract', title: 'Test' } as ExtractionResult,
      { parties: 0.5 }
    );
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('uses correct critical fields per document type', () => {
    const ctx = makeContext(
      { documentType: 'meeting_notes', title: 'Test' } as ExtractionResult,
      { actionItems: 0.3, attendees: 0.4, date: 0.2 }
    );
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(3);
  });
});
