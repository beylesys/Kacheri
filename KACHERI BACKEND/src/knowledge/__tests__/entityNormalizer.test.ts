import { describe, it, expect } from 'vitest';
import {
  levenshteinDistance,
  levenshteinSimilarity,
  parseAiNormalizationResponse,
  EntityNormalizer,
} from '../entityNormalizer.js';

/* ============= levenshteinDistance ============= */

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('kitten', 'kitten')).toBe(0);
  });

  it('returns correct distance for single substitution', () => {
    expect(levenshteinDistance('kitten', 'sitten')).toBe(1);
  });

  it('returns correct distance for classic example', () => {
    // kitten → sitten (sub) → sittin (sub) → sitting (insert) = 3
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });

  it('returns length of non-empty string when other is empty', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abcde', '')).toBe(5);
  });

  it('returns 0 for both empty strings', () => {
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('returns 1 for single deletion', () => {
    expect(levenshteinDistance('abcd', 'abc')).toBe(1);
  });

  it('returns full length for completely different strings of same length', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3);
  });

  it('returns 1 for single char substitution', () => {
    expect(levenshteinDistance('a', 'b')).toBe(1);
  });

  it('handles longer strings correctly', () => {
    // "acme corporation" vs "acme corp" = 7 deletions (oration)
    expect(levenshteinDistance('acme corporation', 'acme corp')).toBe(7);
  });
});

/* ============= levenshteinSimilarity ============= */

describe('levenshteinSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(levenshteinSimilarity('acme', 'acme')).toBe(1);
  });

  it('returns 0 when first string is shorter than 3 chars', () => {
    expect(levenshteinSimilarity('ab', 'abcde')).toBe(0);
  });

  it('returns 0 when second string is shorter than 3 chars', () => {
    expect(levenshteinSimilarity('abcde', 'ab')).toBe(0);
  });

  it('returns 0 for both strings shorter than 3 chars', () => {
    expect(levenshteinSimilarity('ab', 'ac')).toBe(0);
  });

  it('returns correct similarity for similar strings', () => {
    // "acme corp" (9) vs "acme corporation" (16)
    // distance = 7, maxLen = 16
    // similarity = 1 - 7/16 = 0.5625
    expect(levenshteinSimilarity('acme corp', 'acme corporation')).toBeCloseTo(0.5625);
  });

  it('returns 0 for completely different equal-length strings', () => {
    // "abc" vs "xyz" → distance = 3, maxLen = 3, similarity = 1 - 3/3 = 0
    expect(levenshteinSimilarity('abc', 'xyz')).toBe(0);
  });

  it('returns high similarity for single char difference', () => {
    // "contract" vs "contracts" → distance = 1, maxLen = 9
    // similarity = 1 - 1/9 ≈ 0.889
    expect(levenshteinSimilarity('contract', 'contracts')).toBeCloseTo(0.889, 2);
  });
});

/* ============= parseAiNormalizationResponse ============= */

describe('parseAiNormalizationResponse', () => {
  it('parses a valid single-line response', () => {
    const response = '1: 95 - Acme Corporation - Same company different abbreviation';
    const result = parseAiNormalizationResponse(response, 1);
    expect(result.size).toBe(1);
    expect(result.get(1)?.score).toBe(95);
    expect(result.get(1)?.canonicalName).toBe('Acme Corporation');
    expect(result.get(1)?.reason).toBe('Same company different abbreviation');
  });

  it('parses multiple lines correctly', () => {
    const response = '1: 95 - Acme Corp - Formal name\n2: 30 - John Smith - Low match';
    const result = parseAiNormalizationResponse(response, 2);
    expect(result.size).toBe(2);
    expect(result.get(1)?.score).toBe(95);
    expect(result.get(1)?.canonicalName).toBe('Acme Corp');
    expect(result.get(2)?.score).toBe(30);
    expect(result.get(2)?.canonicalName).toBe('John Smith');
  });

  it('handles en-dash and em-dash separators', () => {
    const response = '1: 85 \u2013 Acme Corp \u2014 Long dash separator';
    const result = parseAiNormalizationResponse(response, 1);
    expect(result.size).toBe(1);
    expect(result.get(1)?.score).toBe(85);
  });

  it('ignores out-of-range indices (above expected)', () => {
    const response = '5: 85 - Name - Reason';
    const result = parseAiNormalizationResponse(response, 3);
    expect(result.size).toBe(0);
  });

  it('ignores zero index', () => {
    const response = '0: 50 - Name - Reason';
    const result = parseAiNormalizationResponse(response, 3);
    expect(result.size).toBe(0);
  });

  it('ignores scores above 100', () => {
    const response = '1: 150 - Name - Reason';
    const result = parseAiNormalizationResponse(response, 1);
    expect(result.size).toBe(0);
  });

  it('accepts score of 0', () => {
    const response = '1: 0 - Different Entity - No match at all';
    const result = parseAiNormalizationResponse(response, 1);
    expect(result.size).toBe(1);
    expect(result.get(1)?.score).toBe(0);
  });

  it('accepts score of 100', () => {
    const response = '1: 100 - Same Entity - Perfect match';
    const result = parseAiNormalizationResponse(response, 1);
    expect(result.size).toBe(1);
    expect(result.get(1)?.score).toBe(100);
  });

  it('returns empty map for empty response', () => {
    const result = parseAiNormalizationResponse('', 3);
    expect(result.size).toBe(0);
  });

  it('skips invalid format lines and parses valid ones', () => {
    const response = 'This is garbage\n1: 80 - Acme Corp - Valid line\nAlso invalid';
    const result = parseAiNormalizationResponse(response, 2);
    expect(result.size).toBe(1);
    expect(result.get(1)?.score).toBe(80);
    expect(result.get(1)?.canonicalName).toBe('Acme Corp');
  });

  it('handles canonical name with non-greedy capture (stops at first dash)', () => {
    const response = '1: 85 - Acme - Corp - They are the same entity';
    const result = parseAiNormalizationResponse(response, 1);
    expect(result.size).toBe(1);
    // .+? is non-greedy: captures "Acme" before first separator
    expect(result.get(1)?.canonicalName).toBe('Acme');
  });
});

/* ============= EntityNormalizer exports ============= */

describe('EntityNormalizer exports', () => {
  it('exports expected methods', () => {
    expect(typeof EntityNormalizer.findDuplicateCandidates).toBe('function');
    expect(typeof EntityNormalizer.normalizeWorkspaceEntities).toBe('function');
    expect(typeof EntityNormalizer.executeMerge).toBe('function');
    expect(typeof EntityNormalizer.levenshteinDistance).toBe('function');
    expect(typeof EntityNormalizer.levenshteinSimilarity).toBe('function');
    expect(typeof EntityNormalizer.combinedSimilarity).toBe('function');
    expect(typeof EntityNormalizer.parseAiNormalizationResponse).toBe('function');
  });
});
