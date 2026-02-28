import { describe, it, expect } from 'vitest';
import { RelationshipDetector } from '../relationshipDetector.js';

// Access pure functions via the exported object
const { calculateBaseStrength, parseAiRelationshipResponse } = RelationshipDetector;

/* ============= calculateBaseStrength ============= */

describe('calculateBaseStrength', () => {
  it('returns 0.1 for 1 shared document (minimum)', () => {
    expect(calculateBaseStrength(1)).toBeCloseTo(0.1);
  });

  it('returns 0.2 for 2 shared documents', () => {
    expect(calculateBaseStrength(2)).toBeCloseTo(0.2);
  });

  it('returns 0.5 for 5 shared documents', () => {
    expect(calculateBaseStrength(5)).toBeCloseTo(0.5);
  });

  it('returns 1.0 for 10 shared documents (cap)', () => {
    expect(calculateBaseStrength(10)).toBeCloseTo(1.0);
  });

  it('clamps to 1.0 for values above cap (15 docs)', () => {
    expect(calculateBaseStrength(15)).toBeCloseTo(1.0);
  });

  it('clamps to 1.0 for very large values (100 docs)', () => {
    expect(calculateBaseStrength(100)).toBeCloseTo(1.0);
  });
});

/* ============= parseAiRelationshipResponse ============= */

describe('parseAiRelationshipResponse', () => {
  it('parses a valid single-line response', () => {
    const response = '1: contractual - contracted with - 92 - Parties in agreement';
    const result = parseAiRelationshipResponse(response, 1);
    expect(result.size).toBe(1);
    expect(result.get(1)?.type).toBe('contractual');
    expect(result.get(1)?.label).toBe('contracted with');
    expect(result.get(1)?.confidence).toBe(92);
    expect(result.get(1)?.reason).toBe('Parties in agreement');
  });

  it('parses multiple lines correctly', () => {
    const response =
      '1: financial - pays - 85 - Invoice relationship\n2: organizational - reports to - 70 - Hierarchy';
    const result = parseAiRelationshipResponse(response, 2);
    expect(result.size).toBe(2);
    expect(result.get(1)?.type).toBe('financial');
    expect(result.get(1)?.label).toBe('pays');
    expect(result.get(2)?.type).toBe('organizational');
    expect(result.get(2)?.label).toBe('reports to');
  });

  it('maps unknown type to "custom"', () => {
    const response = '1: unknown_type - some label - 80 - Some reason';
    const result = parseAiRelationshipResponse(response, 1);
    expect(result.size).toBe(1);
    expect(result.get(1)?.type).toBe('custom');
  });

  it('preserves valid co_occurrence type', () => {
    const response = '1: co_occurrence - appears with - 60 - Same document';
    const result = parseAiRelationshipResponse(response, 1);
    expect(result.get(1)?.type).toBe('co_occurrence');
  });

  it('preserves valid temporal type', () => {
    const response = '1: temporal - precedes - 75 - Date sequence';
    const result = parseAiRelationshipResponse(response, 1);
    expect(result.get(1)?.type).toBe('temporal');
  });

  it('preserves valid financial type', () => {
    const response = '1: financial - invoiced by - 88 - Payment flow';
    const result = parseAiRelationshipResponse(response, 1);
    expect(result.get(1)?.type).toBe('financial');
  });

  it('ignores out-of-range indices', () => {
    const response = '5: contractual - label - 80 - Reason';
    const result = parseAiRelationshipResponse(response, 3);
    expect(result.size).toBe(0);
  });

  it('ignores confidence above 100', () => {
    const response = '1: contractual - label - 150 - Reason';
    const result = parseAiRelationshipResponse(response, 1);
    expect(result.size).toBe(0);
  });

  it('accepts confidence of 0', () => {
    const response = '1: contractual - no relation - 0 - No confidence';
    const result = parseAiRelationshipResponse(response, 1);
    expect(result.size).toBe(1);
    expect(result.get(1)?.confidence).toBe(0);
  });

  it('accepts confidence of 100', () => {
    const response = '1: contractual - strong relation - 100 - Max confidence';
    const result = parseAiRelationshipResponse(response, 1);
    expect(result.size).toBe(1);
    expect(result.get(1)?.confidence).toBe(100);
  });

  it('returns empty map for empty response', () => {
    const result = parseAiRelationshipResponse('', 3);
    expect(result.size).toBe(0);
  });

  it('skips invalid lines and parses valid ones', () => {
    const response = 'garbage line\n1: financial - pays - 85 - Valid\nmore garbage';
    const result = parseAiRelationshipResponse(response, 2);
    expect(result.size).toBe(1);
    expect(result.get(1)?.type).toBe('financial');
  });

  it('handles en-dash separators', () => {
    const response = '1: contractual \u2013 contracted with \u2013 92 \u2013 Match';
    const result = parseAiRelationshipResponse(response, 1);
    expect(result.size).toBe(1);
    expect(result.get(1)?.confidence).toBe(92);
  });
});

/* ============= RelationshipDetector exports ============= */

describe('RelationshipDetector exports', () => {
  it('exports expected methods', () => {
    expect(typeof RelationshipDetector.findCoOccurrences).toBe('function');
    expect(typeof RelationshipDetector.detectWorkspaceRelationships).toBe('function');
    expect(typeof RelationshipDetector.updateRelationshipsForEntity).toBe('function');
    expect(typeof RelationshipDetector.gatherEvidence).toBe('function');
    expect(typeof RelationshipDetector.calculateBaseStrength).toBe('function');
    expect(typeof RelationshipDetector.parseAiRelationshipResponse).toBe('function');
  });
});
