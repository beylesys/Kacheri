import { describe, it, expect } from 'vitest';
import { htmlToPlainText, extractSections, runComplianceCheck } from '../engine.js';
import type { CompliancePolicy } from '../../store/compliancePolicies.js';

/* ============= Helpers ============= */

function makePolicy(overrides: Partial<CompliancePolicy>): CompliancePolicy {
  return {
    id: 'pol_test',
    workspaceId: 'ws_1',
    name: 'Test Policy',
    description: null,
    category: 'general',
    ruleType: 'text_match',
    ruleConfig: { pattern: 'CONFIDENTIAL', matchType: 'contains', caseSensitive: false },
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

/* ============= htmlToPlainText ============= */

describe('htmlToPlainText', () => {
  it('strips HTML tags', () => {
    const result = htmlToPlainText('<p>Hello <b>World</b></p>');
    expect(result).toBe('Hello World');
  });

  it('converts <br> to newline', () => {
    const result = htmlToPlainText('Line 1<br>Line 2<br/>Line 3');
    expect(result).toContain('Line 1');
    expect(result).toContain('Line 2');
    expect(result).toContain('Line 3');
  });

  it('converts closing </p> and </h> to double newlines', () => {
    const result = htmlToPlainText('<p>Paragraph 1</p><p>Paragraph 2</p>');
    expect(result).toContain('Paragraph 1');
    expect(result).toContain('Paragraph 2');
  });

  it('decodes HTML entities', () => {
    const result = htmlToPlainText('5 &lt; 10 &amp; 10 &gt; 5 &quot;quoted&quot; &#39;apos&#39;');
    expect(result).toContain('5 < 10 & 10 > 5 "quoted" \'apos\'');
  });

  it('decodes &nbsp; to space', () => {
    const result = htmlToPlainText('Hello&nbsp;World');
    expect(result).toBe('Hello World');
  });

  it('collapses multiple newlines to max 2', () => {
    const result = htmlToPlainText('<p>A</p><p></p><p></p><p>B</p>');
    const newlines = (result.match(/\n/g) || []).length;
    expect(newlines).toBeLessThanOrEqual(4); // max 2 double-newlines
  });

  it('trims whitespace', () => {
    const result = htmlToPlainText('  <p>  Hello  </p>  ');
    expect(result).not.toMatch(/^\s/);
    expect(result).not.toMatch(/\s$/);
  });

  it('handles empty string', () => {
    expect(htmlToPlainText('')).toBe('');
  });
});

/* ============= extractSections ============= */

describe('extractSections', () => {
  it('extracts heading and body text', () => {
    const html = '<h2>Introduction</h2><p>This is the introduction paragraph with several words.</p>';
    const sections = extractSections(html);
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe('Introduction');
    expect(sections[0].level).toBe(2);
    expect(sections[0].body).toContain('introduction paragraph');
    expect(sections[0].wordCount).toBeGreaterThan(0);
  });

  it('extracts multiple sections', () => {
    const html =
      '<h1>Title</h1><p>Intro text</p>' +
      '<h2>Section A</h2><p>Content A</p>' +
      '<h2>Section B</h2><p>Content B</p>';
    const sections = extractSections(html);
    expect(sections).toHaveLength(3);
    expect(sections[0].heading).toBe('Title');
    expect(sections[1].heading).toBe('Section A');
    expect(sections[2].heading).toBe('Section B');
  });

  it('computes word count correctly', () => {
    const html = '<h2>Test</h2><p>one two three four five</p>';
    const sections = extractSections(html);
    expect(sections[0].wordCount).toBe(5);
  });

  it('strips inner tags from headings', () => {
    const html = '<h2><strong>Bold Heading</strong></h2><p>Content</p>';
    const sections = extractSections(html);
    expect(sections[0].heading).toBe('Bold Heading');
  });

  it('returns empty array for no headings', () => {
    const html = '<p>Just a paragraph with no headings.</p>';
    const sections = extractSections(html);
    expect(sections).toHaveLength(0);
  });

  it('handles heading levels correctly', () => {
    const html = '<h1>H1</h1><p>Text</p><h3>H3</h3><p>Text</p><h6>H6</h6><p>Text</p>';
    const sections = extractSections(html);
    expect(sections[0].level).toBe(1);
    expect(sections[1].level).toBe(3);
    expect(sections[2].level).toBe(6);
  });
});

/* ============= runComplianceCheck ============= */

describe('runComplianceCheck', () => {
  it('returns correct counts for all passing policies', async () => {
    const html = '<p>This CONFIDENTIAL document contains important terms.</p>';
    const policies = [
      makePolicy({
        id: 'p1',
        name: 'Confidentiality',
        ruleType: 'text_match',
        ruleConfig: { pattern: 'CONFIDENTIAL', matchType: 'contains', caseSensitive: false },
      }),
      makePolicy({
        id: 'p2',
        name: 'No Bad Words',
        ruleType: 'forbidden_term',
        ruleConfig: { terms: ['guaranteed', 'unlimited'], caseSensitive: false },
      }),
    ];

    const result = await runComplianceCheck({ html, policies });
    expect(result.totalPolicies).toBe(2);
    expect(result.passed).toBe(2);
    expect(result.violations).toBe(0);
    expect(result.warnings).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.results).toHaveLength(2);
  });

  it('counts violations correctly (failed + error severity)', async () => {
    const html = '<p>This document has guaranteed delivery.</p>';
    const policies = [
      makePolicy({
        id: 'p1',
        name: 'No Promotional Language',
        ruleType: 'forbidden_term',
        ruleConfig: { terms: ['guaranteed'], caseSensitive: false },
        severity: 'error',
      }),
    ];

    const result = await runComplianceCheck({ html, policies });
    expect(result.violations).toBe(1);
    expect(result.passed).toBe(0);
  });

  it('counts warnings correctly (failed + warning severity)', async () => {
    const html = '<p>This document has guaranteed delivery.</p>';
    const policies = [
      makePolicy({
        id: 'p1',
        name: 'No Promotional Language',
        ruleType: 'forbidden_term',
        ruleConfig: { terms: ['guaranteed'], caseSensitive: false },
        severity: 'warning',
      }),
    ];

    const result = await runComplianceCheck({ html, policies });
    expect(result.warnings).toBe(1);
    expect(result.violations).toBe(0);
  });

  it('handles evaluator errors via error status results', async () => {
    const html = '<p>Test</p>';
    const policies = [
      makePolicy({
        id: 'p1',
        name: 'Bad Config',
        ruleType: 'text_match',
        ruleConfig: {}, // invalid config — missing required fields
      }),
    ];

    const result = await runComplianceCheck({ html, policies });
    expect(result.errors).toBe(1);
    expect(result.results[0].status).toBe('error');
  });

  it('handles unknown rule type with error result', async () => {
    const html = '<p>Test</p>';
    const policies = [
      makePolicy({
        id: 'p1',
        name: 'Unknown Rule',
        ruleType: 'nonexistent_type' as any,
        ruleConfig: {},
      }),
    ];

    const result = await runComplianceCheck({ html, policies });
    expect(result.errors).toBe(1);
    expect(result.results[0].status).toBe('error');
    expect(result.results[0].message).toContain('No evaluator');
  });

  it('handles empty policy list', async () => {
    const html = '<p>Some content</p>';
    const result = await runComplianceCheck({ html, policies: [] });
    expect(result.totalPolicies).toBe(0);
    expect(result.results).toHaveLength(0);
    expect(result.passed).toBe(0);
    expect(result.violations).toBe(0);
  });

  it('isolates errors per-policy (one failure does not crash others)', async () => {
    const html = '<p>CONFIDENTIAL document</p>';
    const policies = [
      makePolicy({
        id: 'p1',
        name: 'Bad Config',
        ruleType: 'text_match',
        ruleConfig: {}, // will error
      }),
      makePolicy({
        id: 'p2',
        name: 'Good Policy',
        ruleType: 'text_match',
        ruleConfig: { pattern: 'CONFIDENTIAL', matchType: 'contains', caseSensitive: false },
      }),
    ];

    const result = await runComplianceCheck({ html, policies });
    expect(result.totalPolicies).toBe(2);
    expect(result.errors).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.results).toHaveLength(2);
  });

  it('passes metadata to evaluation context', async () => {
    const html = '<p>SLA document</p>';
    const policies = [
      makePolicy({
        id: 'p1',
        name: 'SLA Check',
        ruleType: 'numeric_constraint',
        ruleConfig: { fieldPath: 'sla', operator: 'lte', value: 99.9 },
      }),
    ];

    const result = await runComplianceCheck({
      html,
      policies,
      metadata: { sla: 99.5 },
    });
    expect(result.passed).toBe(1);
  });

  it('processes mixed pass/fail/error results correctly', async () => {
    const html = '<h2>Termination</h2><p>This agreement may be terminated with 30 days notice.</p>';
    const policies = [
      // Will pass (section exists)
      makePolicy({
        id: 'p1',
        name: 'Require Termination',
        ruleType: 'required_section',
        ruleConfig: { heading: 'Termination' },
        severity: 'warning',
      }),
      // Will fail (section missing)
      makePolicy({
        id: 'p2',
        name: 'Require Pricing',
        ruleType: 'required_section',
        ruleConfig: { heading: 'Pricing' },
        severity: 'error',
      }),
      // Will error (bad config)
      makePolicy({
        id: 'p3',
        name: 'Bad',
        ruleType: 'regex_pattern',
        ruleConfig: {},
      }),
    ];

    const result = await runComplianceCheck({ html, policies });
    expect(result.totalPolicies).toBe(3);
    expect(result.passed).toBe(1);
    expect(result.violations).toBe(1); // failed + error severity
    expect(result.errors).toBe(1);
  });
});
