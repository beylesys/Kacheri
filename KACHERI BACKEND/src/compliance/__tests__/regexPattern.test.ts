import { describe, it, expect } from 'vitest';
import { evaluateRegexPattern } from '../evaluators/regexPattern.js';
import type { EvaluationContext } from '../types.js';
import type { CompliancePolicy } from '../../store/compliancePolicies.js';

/* ============= Helpers ============= */

function makeCtx(text: string): EvaluationContext {
  return { text, html: `<p>${text}</p>`, sections: [] };
}

function makePolicy(config: Record<string, unknown>): CompliancePolicy {
  return {
    id: 'pol_regex',
    workspaceId: 'ws_1',
    name: 'Regex Test Policy',
    description: null,
    category: 'general',
    ruleType: 'regex_pattern',
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

describe('evaluateRegexPattern', () => {
  describe('mustMatch = true', () => {
    it('passes when required pattern is found', () => {
      const ctx = makeCtx('Effective Date: 01/15/2026');
      const policy = makePolicy({ pattern: '\\d{2}/\\d{2}/\\d{4}', flags: '', mustMatch: true });
      const result = evaluateRegexPattern(ctx, policy);
      expect(result.status).toBe('passed');
    });

    it('fails when required pattern is not found', () => {
      const ctx = makeCtx('No dates in this document');
      const policy = makePolicy({ pattern: '\\d{2}/\\d{2}/\\d{4}', flags: '', mustMatch: true });
      const result = evaluateRegexPattern(ctx, policy);
      expect(result.status).toBe('failed');
      expect(result.suggestion).toBeDefined();
    });
  });

  describe('mustMatch = false', () => {
    it('passes when forbidden pattern is not found', () => {
      const ctx = makeCtx('This document is fine.');
      const policy = makePolicy({
        pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
        flags: '',
        mustMatch: false,
      });
      const result = evaluateRegexPattern(ctx, policy);
      expect(result.status).toBe('passed');
    });

    it('fails when forbidden pattern is found (with occurrence count)', () => {
      const ctx = makeCtx('Contact us at john@example.com or jane@test.org');
      const policy = makePolicy({
        pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
        flags: '',
        mustMatch: false,
      });
      const result = evaluateRegexPattern(ctx, policy);
      expect(result.status).toBe('failed');
      expect(result.message).toContain('2 occurrence');
      expect(result.details).toBeDefined();
      expect((result.details as any).matches).toHaveLength(2);
    });
  });

  describe('flags', () => {
    it('applies case-insensitive flag', () => {
      const ctx = makeCtx('CONFIDENTIAL DOCUMENT');
      const policy = makePolicy({ pattern: 'confidential', flags: 'i', mustMatch: true });
      const result = evaluateRegexPattern(ctx, policy);
      expect(result.status).toBe('passed');
    });

    it('fails without case-insensitive flag', () => {
      const ctx = makeCtx('CONFIDENTIAL DOCUMENT');
      const policy = makePolicy({ pattern: 'confidential', flags: '', mustMatch: true });
      const result = evaluateRegexPattern(ctx, policy);
      expect(result.status).toBe('failed');
    });
  });

  describe('error handling', () => {
    it('returns error for invalid regex', () => {
      const ctx = makeCtx('Test');
      const policy = makePolicy({ pattern: '[invalid(', flags: '', mustMatch: true });
      const result = evaluateRegexPattern(ctx, policy);
      expect(result.status).toBe('error');
      expect(result.message).toContain('Invalid regex');
    });

    it('returns error for invalid config (missing pattern)', () => {
      const ctx = makeCtx('Test');
      const policy = makePolicy({ flags: '', mustMatch: true });
      const result = evaluateRegexPattern(ctx, policy);
      expect(result.status).toBe('error');
      expect(result.message).toContain('Invalid');
    });

    it('returns error for invalid config (missing mustMatch)', () => {
      const ctx = makeCtx('Test');
      const policy = makePolicy({ pattern: 'test', flags: '' });
      const result = evaluateRegexPattern(ctx, policy);
      expect(result.status).toBe('error');
    });
  });

  it('caps match reporting at 10', () => {
    // Create text with many email-like patterns
    const emails = Array.from({ length: 15 }, (_, i) => `user${i}@example.com`).join(' ');
    const ctx = makeCtx(emails);
    const policy = makePolicy({
      pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
      flags: '',
      mustMatch: false,
    });
    const result = evaluateRegexPattern(ctx, policy);
    expect(result.status).toBe('failed');
    expect((result.details as any).matches.length).toBeLessThanOrEqual(10);
  });
});
