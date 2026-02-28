import { describe, it, expect } from 'vitest';
import { extractKeywords, jaccardSimilarity, parseAiSimilarityResponse } from '../clauseMatcher.js';

/* ============= extractKeywords ============= */

describe('extractKeywords', () => {
  it('extracts basic words and lowercases them', () => {
    const result = extractKeywords('Liability Indemnification Agreement');
    expect(result.has('liability')).toBe(true);
    expect(result.has('indemnification')).toBe(true);
    expect(result.has('agreement')).toBe(true);
  });

  it('removes stopwords', () => {
    const result = extractKeywords('The agreement is between the parties');
    expect(result.has('the')).toBe(false);
    expect(result.has('is')).toBe(false);
    expect(result.has('between')).toBe(false);
    expect(result.has('agreement')).toBe(true);
    expect(result.has('parties')).toBe(true);
  });

  it('filters out short words (less than 3 chars)', () => {
    const result = extractKeywords('an at to be do it go no');
    expect(result.size).toBe(0);
  });

  it('splits on non-alphanumeric characters', () => {
    const result = extractKeywords('term-sheet, liability/indemnity (section)');
    expect(result.has('term')).toBe(true);
    expect(result.has('sheet')).toBe(true);
    expect(result.has('liability')).toBe(true);
    expect(result.has('indemnity')).toBe(true);
    expect(result.has('section')).toBe(true);
  });

  it('returns empty set for empty string', () => {
    const result = extractKeywords('');
    expect(result.size).toBe(0);
  });

  it('deduplicates repeated words', () => {
    const result = extractKeywords('contract contract contract agreement agreement');
    expect(result.size).toBe(2);
    expect(result.has('contract')).toBe(true);
    expect(result.has('agreement')).toBe(true);
  });
});

/* ============= jaccardSimilarity ============= */

describe('jaccardSimilarity', () => {
  it('returns 1 for identical sets', () => {
    const a = new Set(['liability', 'contract', 'agreement']);
    const b = new Set(['liability', 'contract', 'agreement']);
    expect(jaccardSimilarity(a, b)).toBe(1);
  });

  it('returns 0 for completely disjoint sets', () => {
    const a = new Set(['liability', 'contract']);
    const b = new Set(['payment', 'invoice']);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it('returns correct value for partial overlap', () => {
    const a = new Set(['liability', 'contract', 'agreement']);
    const b = new Set(['liability', 'payment', 'terms']);
    // intersection: {liability} = 1
    // union: {liability, contract, agreement, payment, terms} = 5
    // Jaccard = 1/5 = 0.2
    expect(jaccardSimilarity(a, b)).toBeCloseTo(0.2);
  });

  it('returns 0 for both empty sets', () => {
    const a = new Set<string>();
    const b = new Set<string>();
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it('returns 0 when one set is empty', () => {
    const a = new Set(['liability', 'contract']);
    const b = new Set<string>();
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it('handles single element overlap', () => {
    const a = new Set(['contract']);
    const b = new Set(['contract']);
    expect(jaccardSimilarity(a, b)).toBe(1);
  });
});

/* ============= parseAiSimilarityResponse ============= */

describe('parseAiSimilarityResponse', () => {
  it('parses correct format responses', () => {
    const response = '1: 85 - Both clauses address liability\n2: 30 - Minor overlap in terms';
    const result = parseAiSimilarityResponse(response, 2);
    expect(result.size).toBe(2);
    expect(result.get(1)?.score).toBe(85);
    expect(result.get(1)?.reason).toBe('Both clauses address liability');
    expect(result.get(2)?.score).toBe(30);
  });

  it('handles multi-line response with varying separators', () => {
    const response = '1: 90 – High similarity\n2: 50 — Moderate overlap';
    const result = parseAiSimilarityResponse(response, 2);
    expect(result.size).toBe(2);
    expect(result.get(1)?.score).toBe(90);
    expect(result.get(2)?.score).toBe(50);
  });

  it('skips invalid format lines', () => {
    const response = '1: 85 - Valid line\nThis is not valid\n2: 30 - Another valid';
    const result = parseAiSimilarityResponse(response, 2);
    expect(result.size).toBe(2);
    expect(result.get(1)?.score).toBe(85);
    expect(result.get(2)?.score).toBe(30);
  });

  it('ignores indices out of range', () => {
    const response = '1: 85 - Valid\n5: 90 - Out of range\n0: 70 - Zero index';
    const result = parseAiSimilarityResponse(response, 3);
    expect(result.size).toBe(1);
    expect(result.has(1)).toBe(true);
    expect(result.has(5)).toBe(false);
    expect(result.has(0)).toBe(false);
  });

  it('ignores scores above 100', () => {
    const response = '1: 150 - Way too high';
    const result = parseAiSimilarityResponse(response, 1);
    expect(result.size).toBe(0);
  });

  it('returns empty map for empty response', () => {
    const result = parseAiSimilarityResponse('', 3);
    expect(result.size).toBe(0);
  });

  it('accepts score of 0', () => {
    const response = '1: 0 - No similarity at all';
    const result = parseAiSimilarityResponse(response, 1);
    expect(result.size).toBe(1);
    expect(result.get(1)?.score).toBe(0);
  });

  it('accepts score of 100', () => {
    const response = '1: 100 - Identical content';
    const result = parseAiSimilarityResponse(response, 1);
    expect(result.size).toBe(1);
    expect(result.get(1)?.score).toBe(100);
  });
});
