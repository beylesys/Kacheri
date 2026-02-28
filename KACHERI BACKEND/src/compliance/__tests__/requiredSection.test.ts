import { describe, it, expect } from 'vitest';
import { evaluateRequiredSection } from '../evaluators/requiredSection.js';
import { extractSections } from '../engine.js';
import type { EvaluationContext } from '../types.js';
import type { CompliancePolicy } from '../../store/compliancePolicies.js';

/* ============= Helpers ============= */

function makeCtx(html: string): EvaluationContext {
  return {
    text: html.replace(/<[^>]*>/g, ' ').trim(),
    html,
    sections: extractSections(html),
  };
}

function makePolicy(config: Record<string, unknown>): CompliancePolicy {
  return {
    id: 'pol_section',
    workspaceId: 'ws_1',
    name: 'Section Test Policy',
    description: null,
    category: 'legal',
    ruleType: 'required_section',
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

describe('evaluateRequiredSection', () => {
  it('passes when required heading is found', () => {
    const ctx = makeCtx('<h2>Termination</h2><p>Either party may terminate this agreement.</p>');
    const policy = makePolicy({ heading: 'Termination' });
    const result = evaluateRequiredSection(ctx, policy);
    expect(result.status).toBe('passed');
    expect(result.location).toBe('Termination');
  });

  it('fails when required heading is not found', () => {
    const ctx = makeCtx('<h2>Introduction</h2><p>This is the introduction.</p>');
    const policy = makePolicy({ heading: 'Termination' });
    const result = evaluateRequiredSection(ctx, policy);
    expect(result.status).toBe('failed');
    expect(result.suggestion).toContain('Termination');
  });

  it('matching is case-insensitive', () => {
    const ctx = makeCtx('<h2>GOVERNING LAW</h2><p>This agreement shall be governed by...</p>');
    const policy = makePolicy({ heading: 'governing law' });
    const result = evaluateRequiredSection(ctx, policy);
    expect(result.status).toBe('passed');
  });

  it('passes when heading found with sufficient word count', () => {
    const ctx = makeCtx(
      '<h2>Termination</h2><p>Either party may terminate this agreement with thirty days written notice to the other party. Upon termination all obligations cease.</p>'
    );
    const policy = makePolicy({ heading: 'Termination', minWords: 10 });
    const result = evaluateRequiredSection(ctx, policy);
    expect(result.status).toBe('passed');
  });

  it('fails when heading found but word count too low', () => {
    const ctx = makeCtx('<h2>Termination</h2><p>See terms.</p>');
    const policy = makePolicy({ heading: 'Termination', minWords: 20 });
    const result = evaluateRequiredSection(ctx, policy);
    expect(result.status).toBe('failed');
    expect(result.message).toContain('word');
    expect(result.details).toBeDefined();
    expect((result.details as any).minWords).toBe(20);
  });

  it('returns error for invalid config (missing heading)', () => {
    const ctx = makeCtx('<h2>Test</h2><p>Content</p>');
    const policy = makePolicy({ minWords: 10 });
    const result = evaluateRequiredSection(ctx, policy);
    expect(result.status).toBe('error');
    expect(result.message).toContain('Invalid');
  });

  it('returns error for invalid config (negative minWords)', () => {
    const ctx = makeCtx('<h2>Test</h2><p>Content</p>');
    const policy = makePolicy({ heading: 'Test', minWords: -5 });
    const result = evaluateRequiredSection(ctx, policy);
    expect(result.status).toBe('error');
  });

  it('handles multiple heading levels', () => {
    const ctx = makeCtx(
      '<h1>Agreement</h1><p>Intro</p>' +
      '<h3>Termination</h3><p>This section covers the termination conditions for both parties involved.</p>'
    );
    const policy = makePolicy({ heading: 'Termination' });
    const result = evaluateRequiredSection(ctx, policy);
    expect(result.status).toBe('passed');
  });
});
