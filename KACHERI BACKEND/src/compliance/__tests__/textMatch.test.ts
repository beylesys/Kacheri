import { describe, it, expect } from 'vitest';
import { evaluateTextMatch } from '../evaluators/textMatch.js';
import type { EvaluationContext } from '../types.js';
import type { CompliancePolicy } from '../../store/compliancePolicies.js';

/* ============= Helpers ============= */

function makeCtx(text: string): EvaluationContext {
  return { text, html: `<p>${text}</p>`, sections: [] };
}

function makePolicy(config: Record<string, unknown>, overrides?: Partial<CompliancePolicy>): CompliancePolicy {
  return {
    id: 'pol_test',
    workspaceId: 'ws_1',
    name: 'Test Policy',
    description: null,
    category: 'general',
    ruleType: 'text_match',
    ruleConfig: config,
    severity: 'warning',
    documentTypes: ['all'],
    enabled: true,
    autoCheck: false,
    createdBy: 'user:test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/* ============= Tests ============= */

describe('evaluateTextMatch', () => {
  it('passes when document contains required text (contains)', () => {
    const ctx = makeCtx('This document is CONFIDENTIAL and should not be shared.');
    const policy = makePolicy({ pattern: 'CONFIDENTIAL', matchType: 'contains', caseSensitive: true });
    const result = evaluateTextMatch(ctx, policy);
    expect(result.status).toBe('passed');
  });

  it('fails when text not found (contains)', () => {
    const ctx = makeCtx('This is a regular document.');
    const policy = makePolicy({ pattern: 'CONFIDENTIAL', matchType: 'contains', caseSensitive: true });
    const result = evaluateTextMatch(ctx, policy);
    expect(result.status).toBe('failed');
    expect(result.suggestion).toBeDefined();
  });

  it('passes with case-insensitive contains', () => {
    const ctx = makeCtx('This document is confidential.');
    const policy = makePolicy({ pattern: 'CONFIDENTIAL', matchType: 'contains', caseSensitive: false });
    const result = evaluateTextMatch(ctx, policy);
    expect(result.status).toBe('passed');
  });

  it('fails with case-sensitive mismatch', () => {
    const ctx = makeCtx('This document is confidential.');
    const policy = makePolicy({ pattern: 'CONFIDENTIAL', matchType: 'contains', caseSensitive: true });
    const result = evaluateTextMatch(ctx, policy);
    expect(result.status).toBe('failed');
  });

  it('passes with exact match', () => {
    const ctx = makeCtx('Hello World');
    const policy = makePolicy({ pattern: 'Hello World', matchType: 'exact', caseSensitive: true });
    const result = evaluateTextMatch(ctx, policy);
    expect(result.status).toBe('passed');
  });

  it('fails with exact match when text differs', () => {
    const ctx = makeCtx('Hello World and more');
    const policy = makePolicy({ pattern: 'Hello World', matchType: 'exact', caseSensitive: true });
    const result = evaluateTextMatch(ctx, policy);
    expect(result.status).toBe('failed');
  });

  it('passes with startsWith', () => {
    const ctx = makeCtx('CONFIDENTIAL - This document...');
    const policy = makePolicy({ pattern: 'CONFIDENTIAL', matchType: 'startsWith', caseSensitive: true });
    const result = evaluateTextMatch(ctx, policy);
    expect(result.status).toBe('passed');
  });

  it('fails with startsWith when text starts differently', () => {
    const ctx = makeCtx('This document is CONFIDENTIAL');
    const policy = makePolicy({ pattern: 'CONFIDENTIAL', matchType: 'startsWith', caseSensitive: true });
    const result = evaluateTextMatch(ctx, policy);
    expect(result.status).toBe('failed');
  });

  it('returns error for invalid config (missing pattern)', () => {
    const ctx = makeCtx('Test');
    const policy = makePolicy({ matchType: 'contains', caseSensitive: true });
    const result = evaluateTextMatch(ctx, policy);
    expect(result.status).toBe('error');
    expect(result.message).toContain('Invalid');
  });

  it('returns error for invalid config (bad matchType)', () => {
    const ctx = makeCtx('Test');
    const policy = makePolicy({ pattern: 'test', matchType: 'regex', caseSensitive: true });
    const result = evaluateTextMatch(ctx, policy);
    expect(result.status).toBe('error');
  });

  it('returns error for invalid config (missing caseSensitive)', () => {
    const ctx = makeCtx('Test');
    const policy = makePolicy({ pattern: 'test', matchType: 'contains' });
    const result = evaluateTextMatch(ctx, policy);
    expect(result.status).toBe('error');
  });

  it('preserves policy metadata in result', () => {
    const ctx = makeCtx('CONFIDENTIAL');
    const policy = makePolicy(
      { pattern: 'CONFIDENTIAL', matchType: 'contains', caseSensitive: true },
      { id: 'pol_123', name: 'Confidentiality Check', severity: 'error' }
    );
    const result = evaluateTextMatch(ctx, policy);
    expect(result.policyId).toBe('pol_123');
    expect(result.policyName).toBe('Confidentiality Check');
    expect(result.severity).toBe('error');
    expect(result.ruleType).toBe('text_match');
  });
});
