import { describe, it, expect } from 'vitest';
import {
  extractJsonFromResponse,
  normalizeDate,
  normalizeStringArray,
  calculateHeuristicConfidence,
  buildFieldConfidences,
  extractTitleHeuristic,
  OUT_START,
  OUT_END,
} from '../types.js';

/* ============= extractJsonFromResponse ============= */

describe('extractJsonFromResponse', () => {
  it('parses plain JSON', () => {
    const result = extractJsonFromResponse('{"title":"Test"}');
    expect(result.json).toEqual({ title: 'Test' });
    expect(result.parseError).toBeUndefined();
    expect(result.usedMarkers).toBe(false);
  });

  it('strips markdown code fences', () => {
    const raw = '```json\n{"title":"Test"}\n```';
    const result = extractJsonFromResponse(raw);
    expect(result.json).toEqual({ title: 'Test' });
    expect(result.usedMarkers).toBe(false);
  });

  it('extracts from output markers', () => {
    const raw = `Some preamble\n${OUT_START}\n{"title":"Test"}\n${OUT_END}\npostamble`;
    const result = extractJsonFromResponse(raw);
    expect(result.json).toEqual({ title: 'Test' });
    expect(result.usedMarkers).toBe(true);
  });

  it('handles markers inside code fences', () => {
    const raw = `\`\`\`\n${OUT_START}\n{"key":"value"}\n${OUT_END}\n\`\`\``;
    const result = extractJsonFromResponse(raw);
    expect(result.json).toEqual({ key: 'value' });
    expect(result.usedMarkers).toBe(true);
  });

  it('uses fallback regex for embedded JSON', () => {
    const raw = 'Here is the result: {"title":"Fallback"} end.';
    const result = extractJsonFromResponse(raw);
    expect(result.json).toEqual({ title: 'Fallback' });
    expect(result.usedMarkers).toBe(false);
  });

  it('returns null and error for unparseable text', () => {
    const result = extractJsonFromResponse('not json at all');
    expect(result.json).toBeNull();
    expect(result.parseError).toBeDefined();
  });

  it('returns null for empty string', () => {
    const result = extractJsonFromResponse('');
    expect(result.json).toBeNull();
    expect(result.parseError).toBeDefined();
  });

  it('handles nested JSON objects', () => {
    const raw = '{"parties":[{"name":"Acme","role":"party_a"}]}';
    const result = extractJsonFromResponse(raw);
    expect(result.json).toEqual({
      parties: [{ name: 'Acme', role: 'party_a' }],
    });
  });
});

/* ============= normalizeDate ============= */

describe('normalizeDate', () => {
  it('extracts ISO date from string', () => {
    expect(normalizeDate('2026-01-15')).toBe('2026-01-15');
  });

  it('extracts ISO date from longer string', () => {
    expect(normalizeDate('Signed on 2026-01-15 by the parties')).toBe('2026-01-15');
  });

  it('returns non-ISO string as-is', () => {
    expect(normalizeDate('January 15, 2026')).toBe('January 15, 2026');
  });

  it('returns undefined for empty string', () => {
    expect(normalizeDate('')).toBeUndefined();
  });

  it('returns undefined for null/undefined', () => {
    expect(normalizeDate(null)).toBeUndefined();
    expect(normalizeDate(undefined)).toBeUndefined();
  });

  it('returns undefined for non-string', () => {
    expect(normalizeDate(42)).toBeUndefined();
  });
});

/* ============= normalizeStringArray ============= */

describe('normalizeStringArray', () => {
  it('returns valid string array', () => {
    expect(normalizeStringArray(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('filters out non-strings and empty strings', () => {
    expect(normalizeStringArray(['a', '', 42, 'b', '   '] as unknown[])).toEqual(['a', 'b']);
  });

  it('returns undefined for empty array', () => {
    expect(normalizeStringArray([])).toBeUndefined();
  });

  it('returns undefined for non-array', () => {
    expect(normalizeStringArray('not-array')).toBeUndefined();
    expect(normalizeStringArray(null)).toBeUndefined();
    expect(normalizeStringArray(undefined)).toBeUndefined();
  });

  it('returns undefined when all elements are empty/non-string', () => {
    expect(normalizeStringArray(['', '   ', ''])).toBeUndefined();
  });
});

/* ============= calculateHeuristicConfidence ============= */

describe('calculateHeuristicConfidence', () => {
  it('returns 0 for null and undefined', () => {
    expect(calculateHeuristicConfidence(null)).toBe(0);
    expect(calculateHeuristicConfidence(undefined)).toBe(0);
  });

  it('returns 0.2 for empty string', () => {
    expect(calculateHeuristicConfidence('')).toBe(0.2);
  });

  it('returns 0.2 for empty array', () => {
    expect(calculateHeuristicConfidence([])).toBe(0.2);
  });

  it('returns 0.85 for date pattern', () => {
    expect(calculateHeuristicConfidence('2026-01-15')).toBe(0.85);
  });

  it('returns 0.85 for amount pattern', () => {
    expect(calculateHeuristicConfidence('150000.00')).toBe(0.85);
  });

  it('returns 0.5 for very short string', () => {
    expect(calculateHeuristicConfidence('ab')).toBe(0.5);
  });

  it('returns 0.75 for normal string', () => {
    expect(calculateHeuristicConfidence('Services Agreement')).toBe(0.75);
  });

  it('returns 0.75 for objects', () => {
    expect(calculateHeuristicConfidence({ key: 'value' })).toBe(0.75);
  });

  it('returns 0.75 for non-empty arrays', () => {
    expect(calculateHeuristicConfidence([1, 2, 3])).toBe(0.75);
  });
});

/* ============= buildFieldConfidences ============= */

describe('buildFieldConfidences', () => {
  it('uses AI-provided confidences when available', () => {
    const extraction = { title: 'Test', date: '2026-01-01' };
    const aiConf = { title: 0.95, date: 0.88 };
    const result = buildFieldConfidences(extraction, aiConf, ['title', 'date']);

    expect(result.title).toBe(0.95);
    expect(result.date).toBe(0.88);
  });

  it('clamps AI confidences to 0-1 range', () => {
    const extraction = { title: 'Test' };
    const aiConf = { title: 1.5 };
    const result = buildFieldConfidences(extraction, aiConf, ['title']);

    expect(result.title).toBe(1);
  });

  it('clamps negative confidences to 0', () => {
    const extraction = { title: 'Test' };
    const aiConf = { title: -0.5 };
    const result = buildFieldConfidences(extraction, aiConf, ['title']);

    expect(result.title).toBe(0);
  });

  it('uses heuristic when AI confidence missing', () => {
    const extraction = { title: 'Test', date: '2026-01-01' };
    const aiConf = { title: 0.95 };
    const result = buildFieldConfidences(extraction, aiConf, ['title', 'date']);

    expect(result.title).toBe(0.95);
    expect(result.date).toBe(0.85); // date pattern heuristic
  });

  it('handles missing fields with 0 confidence', () => {
    const extraction: Record<string, unknown> = { title: 'Test' };
    const result = buildFieldConfidences(extraction, {}, ['title', 'missingField']);

    expect(result.title).toBe(0.75); // normal string heuristic
    expect(result.missingField).toBe(0); // undefined value
  });
});

/* ============= extractTitleHeuristic ============= */

describe('extractTitleHeuristic', () => {
  it('extracts first line as title', () => {
    expect(extractTitleHeuristic('My Document\nMore content')).toBe('My Document');
  });

  it('truncates long titles to 100 chars', () => {
    const longTitle = 'A'.repeat(150);
    const result = extractTitleHeuristic(longTitle);
    expect(result.length).toBe(100);
    expect(result.endsWith('...')).toBe(true);
  });

  it('returns "Untitled Document" for empty text', () => {
    expect(extractTitleHeuristic('')).toBe('Untitled Document');
  });

  it('handles single-line text', () => {
    expect(extractTitleHeuristic('Only Line')).toBe('Only Line');
  });

  it('trims whitespace', () => {
    expect(extractTitleHeuristic('  Spaced Title  \nContent')).toBe('Spaced Title');
  });
});
