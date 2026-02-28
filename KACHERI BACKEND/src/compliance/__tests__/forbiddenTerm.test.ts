import { describe, it, expect } from 'vitest';
import { evaluateForbiddenTerm } from '../evaluators/forbiddenTerm.js';
import type { EvaluationContext } from '../types.js';
import type { CompliancePolicy } from '../../store/compliancePolicies.js';

/* ============= Helpers ============= */

function makeCtx(text: string): EvaluationContext {
  return { text, html: `<p>${text}</p>`, sections: [] };
}

function makePolicy(config: Record<string, unknown>): CompliancePolicy {
  return {
    id: 'pol_forbidden',
    workspaceId: 'ws_1',
    name: 'Forbidden Term Policy',
    description: null,
    category: 'legal',
    ruleType: 'forbidden_term',
    ruleConfig: config,
    severity: 'error',
    documentTypes: ['all'],
    enabled: true,
    autoCheck: false,
    createdBy: 'user:test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/* ============= Tests ============= */

describe('evaluateForbiddenTerm', () => {
  it('passes when no forbidden terms found', () => {
    const ctx = makeCtx('This is a standard business document.');
    const policy = makePolicy({
      terms: ['unlimited liability', 'guaranteed'],
      caseSensitive: false,
    });
    const result = evaluateForbiddenTerm(ctx, policy);
    expect(result.status).toBe('passed');
    expect(result.message).toContain('2 terms');
  });

  it('fails when one forbidden term is found', () => {
    const ctx = makeCtx('This product is guaranteed to work.');
    const policy = makePolicy({
      terms: ['guaranteed', 'unlimited liability'],
      caseSensitive: false,
    });
    const result = evaluateForbiddenTerm(ctx, policy);
    expect(result.status).toBe('failed');
    expect(result.message).toContain("'guaranteed'");
    expect(result.suggestion).toBeDefined();
  });

  it('fails when multiple forbidden terms are found', () => {
    const ctx = makeCtx('This guaranteed product has unlimited liability coverage.');
    const policy = makePolicy({
      terms: ['guaranteed', 'unlimited liability'],
      caseSensitive: false,
    });
    const result = evaluateForbiddenTerm(ctx, policy);
    expect(result.status).toBe('failed');
    expect(result.message).toContain("'guaranteed'");
    expect(result.message).toContain("'unlimited liability'");
    const details = result.details as any;
    expect(details.foundTerms).toHaveLength(2);
  });

  it('reports occurrence counts in details', () => {
    const ctx = makeCtx('guaranteed results. Our guaranteed service provides guaranteed delivery.');
    const policy = makePolicy({
      terms: ['guaranteed'],
      caseSensitive: false,
    });
    const result = evaluateForbiddenTerm(ctx, policy);
    expect(result.status).toBe('failed');
    const details = result.details as any;
    expect(details.occurrences['guaranteed']).toBe(3);
    expect(result.message).toContain('3 total');
  });

  it('respects case-sensitive mode', () => {
    const ctx = makeCtx('This is GUARANTEED to work.');
    const policy = makePolicy({
      terms: ['guaranteed'],
      caseSensitive: true,
    });
    const result = evaluateForbiddenTerm(ctx, policy);
    expect(result.status).toBe('passed');
  });

  it('case-insensitive finds regardless of casing', () => {
    const ctx = makeCtx('This is GUARANTEED to work.');
    const policy = makePolicy({
      terms: ['guaranteed'],
      caseSensitive: false,
    });
    const result = evaluateForbiddenTerm(ctx, policy);
    expect(result.status).toBe('failed');
  });

  it('returns error for invalid config (empty terms array)', () => {
    const ctx = makeCtx('Test');
    const policy = makePolicy({ terms: [], caseSensitive: false });
    const result = evaluateForbiddenTerm(ctx, policy);
    expect(result.status).toBe('error');
    expect(result.message).toContain('Invalid');
  });

  it('returns error for invalid config (missing caseSensitive)', () => {
    const ctx = makeCtx('Test');
    const policy = makePolicy({ terms: ['test'] });
    const result = evaluateForbiddenTerm(ctx, policy);
    expect(result.status).toBe('error');
  });

  it('returns error for invalid config (terms not an array)', () => {
    const ctx = makeCtx('Test');
    const policy = makePolicy({ terms: 'guaranteed', caseSensitive: false });
    const result = evaluateForbiddenTerm(ctx, policy);
    expect(result.status).toBe('error');
  });
});
