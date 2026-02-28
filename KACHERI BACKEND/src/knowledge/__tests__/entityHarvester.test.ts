import { describe, it, expect } from 'vitest';
import { normalizeName, EntityHarvester } from '../entityHarvester.js';

/* ============= normalizeName ============= */

describe('normalizeName', () => {
  it('trims whitespace and lowercases', () => {
    expect(normalizeName('  Acme Corp  ')).toBe('acme corp');
  });

  it('returns unchanged for already normalized input', () => {
    expect(normalizeName('acme corp')).toBe('acme corp');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeName('')).toBe('');
  });

  it('returns empty string for null input', () => {
    expect(normalizeName(null as any)).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(normalizeName(undefined as any)).toBe('');
  });

  it('applies Unicode NFC normalization (combining accent → precomposed)', () => {
    // "cafe" + combining acute accent → should normalize to precomposed "café"
    const combining = 'cafe\u0301';
    const precomposed = 'caf\u00e9';
    expect(normalizeName(combining)).toBe(precomposed);
  });

  it('preserves apostrophes and lowercases mixed case', () => {
    expect(normalizeName("  John O'Brien  ")).toBe("john o'brien");
  });

  it('preserves numbers and currency symbols', () => {
    expect(normalizeName('$150,000')).toBe('$150,000');
  });

  it('returns empty string for all-whitespace input', () => {
    expect(normalizeName('   ')).toBe('');
  });
});

/* ============= EntityHarvester exports ============= */

describe('EntityHarvester exports', () => {
  it('exports expected methods', () => {
    expect(typeof EntityHarvester.harvestFromDoc).toBe('function');
    expect(typeof EntityHarvester.harvestFromExtraction).toBe('function');
    expect(typeof EntityHarvester.harvestWorkspace).toBe('function');
    expect(typeof EntityHarvester.normalizeName).toBe('function');
  });
});
