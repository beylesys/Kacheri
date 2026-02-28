import { describe, it, expect } from 'vitest';
import { validateCategory, ClausesStore } from '../clauses.js';
import { ClauseVersionsStore } from '../clauseVersions.js';
import { validateInsertionMethod, ClauseUsageLogStore } from '../clauseUsageLog.js';

/* ============= validateCategory ============= */

describe('validateCategory', () => {
  it('accepts "general"', () => {
    expect(validateCategory('general')).toBe(true);
  });

  it('accepts "legal"', () => {
    expect(validateCategory('legal')).toBe(true);
  });

  it('accepts "financial"', () => {
    expect(validateCategory('financial')).toBe(true);
  });

  it('accepts "boilerplate"', () => {
    expect(validateCategory('boilerplate')).toBe(true);
  });

  it('accepts "custom"', () => {
    expect(validateCategory('custom')).toBe(true);
  });

  it('rejects invalid category string', () => {
    expect(validateCategory('invalid')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateCategory('')).toBe(false);
  });

  it('rejects uppercase variant', () => {
    expect(validateCategory('General')).toBe(false);
  });
});

/* ============= validateInsertionMethod ============= */

describe('validateInsertionMethod', () => {
  it('accepts "manual"', () => {
    expect(validateInsertionMethod('manual')).toBe(true);
  });

  it('accepts "ai_suggest"', () => {
    expect(validateInsertionMethod('ai_suggest')).toBe(true);
  });

  it('accepts "template"', () => {
    expect(validateInsertionMethod('template')).toBe(true);
  });

  it('rejects invalid method', () => {
    expect(validateInsertionMethod('unknown')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateInsertionMethod('')).toBe(false);
  });
});

/* ============= Store structural exports ============= */

describe('ClausesStore exports', () => {
  it('exports expected methods', () => {
    expect(typeof ClausesStore.create).toBe('function');
    expect(typeof ClausesStore.getById).toBe('function');
    expect(typeof ClausesStore.getByWorkspace).toBe('function');
    expect(typeof ClausesStore.getByCategory).toBe('function');
    expect(typeof ClausesStore.search).toBe('function');
    expect(typeof ClausesStore.update).toBe('function');
    expect(typeof ClausesStore.archive).toBe('function');
    expect(typeof ClausesStore.incrementUsage).toBe('function');
    expect(typeof ClausesStore.deleteByWorkspace).toBe('function');
    expect(typeof ClausesStore.count).toBe('function');
    expect(typeof ClausesStore.validateCategory).toBe('function');
  });
});

describe('ClauseVersionsStore exports', () => {
  it('exports expected methods', () => {
    expect(typeof ClauseVersionsStore.create).toBe('function');
    expect(typeof ClauseVersionsStore.getById).toBe('function');
    expect(typeof ClauseVersionsStore.getByClause).toBe('function');
    expect(typeof ClauseVersionsStore.getByVersion).toBe('function');
    expect(typeof ClauseVersionsStore.getLatest).toBe('function');
  });
});

describe('ClauseUsageLogStore exports', () => {
  it('exports expected methods', () => {
    expect(typeof ClauseUsageLogStore.logUsage).toBe('function');
    expect(typeof ClauseUsageLogStore.getById).toBe('function');
    expect(typeof ClauseUsageLogStore.getByClause).toBe('function');
    expect(typeof ClauseUsageLogStore.getByDoc).toBe('function');
    expect(typeof ClauseUsageLogStore.getByUser).toBe('function');
    expect(typeof ClauseUsageLogStore.validateInsertionMethod).toBe('function');
  });
});
