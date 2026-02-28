import { describe, it, expect } from 'vitest';
import { evaluateNumericConstraint } from '../evaluators/numericConstraint.js';
import type { EvaluationContext } from '../types.js';
import type { CompliancePolicy } from '../../store/compliancePolicies.js';

/* ============= Helpers ============= */

function makeCtx(
  text: string,
  metadata?: Record<string, unknown>
): EvaluationContext {
  return { text, html: `<p>${text}</p>`, sections: [], metadata };
}

function makePolicy(config: Record<string, unknown>): CompliancePolicy {
  return {
    id: 'pol_numeric',
    workspaceId: 'ws_1',
    name: 'Numeric Constraint Policy',
    description: null,
    category: 'financial',
    ruleType: 'numeric_constraint',
    ruleConfig: config,
    severity: 'warning',
    documentTypes: ['all'],
    enabled: true,
    autoCheck: false,
    createdBy: 'user:test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/* ============= Tests ============= */

describe('evaluateNumericConstraint', () => {
  describe('operators from metadata', () => {
    it('lt: passes when value is less than threshold', () => {
      const ctx = makeCtx('', { sla: 99.5 });
      const policy = makePolicy({ fieldPath: 'sla', operator: 'lt', value: 99.9 });
      const result = evaluateNumericConstraint(ctx, policy);
      expect(result.status).toBe('passed');
    });

    it('lt: fails when value is not less than threshold', () => {
      const ctx = makeCtx('', { sla: 99.99 });
      const policy = makePolicy({ fieldPath: 'sla', operator: 'lt', value: 99.9 });
      const result = evaluateNumericConstraint(ctx, policy);
      expect(result.status).toBe('failed');
    });

    it('lte: passes when value equals threshold', () => {
      const ctx = makeCtx('', { netDays: 90 });
      const policy = makePolicy({ fieldPath: 'netDays', operator: 'lte', value: 90 });
      const result = evaluateNumericConstraint(ctx, policy);
      expect(result.status).toBe('passed');
    });

    it('lte: fails when value exceeds threshold', () => {
      const ctx = makeCtx('', { netDays: 120 });
      const policy = makePolicy({ fieldPath: 'netDays', operator: 'lte', value: 90 });
      const result = evaluateNumericConstraint(ctx, policy);
      expect(result.status).toBe('failed');
    });

    it('gt: passes when value is greater than threshold', () => {
      const ctx = makeCtx('', { amount: 5000 });
      const policy = makePolicy({ fieldPath: 'amount', operator: 'gt', value: 1000 });
      const result = evaluateNumericConstraint(ctx, policy);
      expect(result.status).toBe('passed');
    });

    it('gt: fails when value is not greater than threshold', () => {
      const ctx = makeCtx('', { amount: 500 });
      const policy = makePolicy({ fieldPath: 'amount', operator: 'gt', value: 1000 });
      const result = evaluateNumericConstraint(ctx, policy);
      expect(result.status).toBe('failed');
    });

    it('gte: passes when value equals threshold', () => {
      const ctx = makeCtx('', { amount: 1000 });
      const policy = makePolicy({ fieldPath: 'amount', operator: 'gte', value: 1000 });
      const result = evaluateNumericConstraint(ctx, policy);
      expect(result.status).toBe('passed');
    });

    it('eq: passes when value equals exactly', () => {
      const ctx = makeCtx('', { version: 2 });
      const policy = makePolicy({ fieldPath: 'version', operator: 'eq', value: 2 });
      const result = evaluateNumericConstraint(ctx, policy);
      expect(result.status).toBe('passed');
    });

    it('eq: fails when value does not equal', () => {
      const ctx = makeCtx('', { version: 3 });
      const policy = makePolicy({ fieldPath: 'version', operator: 'eq', value: 2 });
      const result = evaluateNumericConstraint(ctx, policy);
      expect(result.status).toBe('failed');
    });
  });

  describe('nested metadata path', () => {
    it('resolves dot-notation path', () => {
      const ctx = makeCtx('', { paymentTerms: { netDays: 60 } });
      const policy = makePolicy({ fieldPath: 'paymentTerms.netDays', operator: 'lte', value: 90 });
      const result = evaluateNumericConstraint(ctx, policy);
      expect(result.status).toBe('passed');
      expect((result.details as any).source).toBe('metadata');
    });
  });

  describe('text scanning fallback', () => {
    it('extracts numeric value from text near field label', () => {
      const ctx = makeCtx('SLA: 99.5%');
      const policy = makePolicy({ fieldPath: 'SLA', operator: 'lte', value: 99.9 });
      const result = evaluateNumericConstraint(ctx, policy);
      expect(result.status).toBe('passed');
      expect((result.details as any).source).toBe('text');
    });

    it('extracts value with colon separator', () => {
      const ctx = makeCtx('Net Days: 120');
      const policy = makePolicy({ fieldPath: 'Net Days', operator: 'lte', value: 90 });
      const result = evaluateNumericConstraint(ctx, policy);
      expect(result.status).toBe('failed');
    });
  });

  describe('field not found', () => {
    it('passes when field is not found (absence is not a violation)', () => {
      const ctx = makeCtx('This document has no numeric fields.');
      const policy = makePolicy({ fieldPath: 'sla', operator: 'lte', value: 99.9 });
      const result = evaluateNumericConstraint(ctx, policy);
      expect(result.status).toBe('passed');
      expect(result.message).toContain('not found');
      expect((result.details as any).fieldNotFound).toBe(true);
    });
  });

  describe('string metadata values', () => {
    it('parses string metadata value with percent sign', () => {
      const ctx = makeCtx('', { sla: '99.5%' });
      const policy = makePolicy({ fieldPath: 'sla', operator: 'lte', value: 99.9 });
      const result = evaluateNumericConstraint(ctx, policy);
      expect(result.status).toBe('passed');
    });
  });

  describe('error handling', () => {
    it('returns error for invalid config (missing fieldPath)', () => {
      const ctx = makeCtx('Test');
      const policy = makePolicy({ operator: 'lte', value: 10 });
      const result = evaluateNumericConstraint(ctx, policy);
      expect(result.status).toBe('error');
      expect(result.message).toContain('Invalid');
    });

    it('returns error for invalid config (bad operator)', () => {
      const ctx = makeCtx('Test');
      const policy = makePolicy({ fieldPath: 'x', operator: 'between', value: 10 });
      const result = evaluateNumericConstraint(ctx, policy);
      expect(result.status).toBe('error');
    });

    it('returns error for invalid config (NaN value)', () => {
      const ctx = makeCtx('Test');
      const policy = makePolicy({ fieldPath: 'x', operator: 'lte', value: NaN });
      const result = evaluateNumericConstraint(ctx, policy);
      expect(result.status).toBe('error');
    });
  });
});
