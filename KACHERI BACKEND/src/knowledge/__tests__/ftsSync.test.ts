import { describe, it, expect } from 'vitest';
import { sanitizeFtsQuery, FtsSync } from '../ftsSync.js';

/* ============= sanitizeFtsQuery ============= */

describe('sanitizeFtsQuery', () => {
  it('wraps a single token in double quotes', () => {
    expect(sanitizeFtsQuery('hello')).toBe('"hello"');
  });

  it('wraps each token separately for multiple words', () => {
    expect(sanitizeFtsQuery('hello world')).toBe('"hello" "world"');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeFtsQuery('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(sanitizeFtsQuery('   ')).toBe('');
  });

  it('neutralizes FTS5 operators by quoting them', () => {
    expect(sanitizeFtsQuery('AND OR NOT')).toBe('"AND" "OR" "NOT"');
  });

  it('neutralizes special FTS5 chars (asterisk, caret)', () => {
    expect(sanitizeFtsQuery('term* ^boost')).toBe('"term*" "^boost"');
  });

  it('escapes internal double quotes by doubling', () => {
    expect(sanitizeFtsQuery('say "hello" now')).toBe('"say" """hello""" "now"');
  });

  it('trims leading and trailing whitespace before splitting', () => {
    expect(sanitizeFtsQuery('  acme corp  ')).toBe('"acme" "corp"');
  });

  it('handles tabs and mixed whitespace', () => {
    expect(sanitizeFtsQuery('foo\tbar   baz')).toBe('"foo" "bar" "baz"');
  });

  it('preserves single character tokens', () => {
    expect(sanitizeFtsQuery('a')).toBe('"a"');
  });

  it('neutralizes NEAR operator', () => {
    expect(sanitizeFtsQuery('NEAR acme')).toBe('"NEAR" "acme"');
  });

  it('handles colon prefix (column qualifier) safely', () => {
    expect(sanitizeFtsQuery('name:value')).toBe('"name:value"');
  });
});

/* ============= FtsSync exports ============= */

describe('FtsSync exports', () => {
  it('exports expected methods', () => {
    expect(typeof FtsSync.syncDoc).toBe('function');
    expect(typeof FtsSync.removeDoc).toBe('function');
    expect(typeof FtsSync.syncWorkspaceDocs).toBe('function');
    expect(typeof FtsSync.syncEntity).toBe('function');
    expect(typeof FtsSync.removeEntity).toBe('function');
    expect(typeof FtsSync.syncWorkspaceEntities).toBe('function');
    expect(typeof FtsSync.searchDocs).toBe('function');
    expect(typeof FtsSync.searchEntities).toBe('function');
    expect(typeof FtsSync.sanitizeQuery).toBe('function');
  });
});
