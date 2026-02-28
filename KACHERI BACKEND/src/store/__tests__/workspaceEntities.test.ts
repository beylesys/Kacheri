import { describe, it, expect } from 'vitest';
import { validateEntityType, ENTITY_LIMIT, WorkspaceEntitiesStore } from '../workspaceEntities.js';

/* ============= validateEntityType ============= */

describe('validateEntityType', () => {
  it('accepts "person"', () => {
    expect(validateEntityType('person')).toBe(true);
  });

  it('accepts "organization"', () => {
    expect(validateEntityType('organization')).toBe(true);
  });

  it('accepts "date"', () => {
    expect(validateEntityType('date')).toBe(true);
  });

  it('accepts "amount"', () => {
    expect(validateEntityType('amount')).toBe(true);
  });

  it('accepts "location"', () => {
    expect(validateEntityType('location')).toBe(true);
  });

  it('accepts "product"', () => {
    expect(validateEntityType('product')).toBe(true);
  });

  it('accepts "term"', () => {
    expect(validateEntityType('term')).toBe(true);
  });

  it('accepts "concept"', () => {
    expect(validateEntityType('concept')).toBe(true);
  });

  it('rejects invalid string', () => {
    expect(validateEntityType('invalid')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateEntityType('')).toBe(false);
  });

  it('rejects uppercase variant', () => {
    expect(validateEntityType('Person')).toBe(false);
  });

  it('rejects numeric string', () => {
    expect(validateEntityType('123')).toBe(false);
  });
});

/* ============= ENTITY_LIMIT ============= */

describe('ENTITY_LIMIT', () => {
  it('defaults to 10000', () => {
    expect(ENTITY_LIMIT).toBe(10_000);
  });

  it('is a number', () => {
    expect(typeof ENTITY_LIMIT).toBe('number');
  });
});

/* ============= WorkspaceEntitiesStore exports ============= */

describe('WorkspaceEntitiesStore exports', () => {
  it('exports expected methods', () => {
    expect(typeof WorkspaceEntitiesStore.create).toBe('function');
    expect(typeof WorkspaceEntitiesStore.getById).toBe('function');
    expect(typeof WorkspaceEntitiesStore.getByNormalizedName).toBe('function');
    expect(typeof WorkspaceEntitiesStore.getByWorkspace).toBe('function');
    expect(typeof WorkspaceEntitiesStore.search).toBe('function');
    expect(typeof WorkspaceEntitiesStore.update).toBe('function');
    expect(typeof WorkspaceEntitiesStore.delete).toBe('function');
    expect(typeof WorkspaceEntitiesStore.incrementCounts).toBe('function');
    expect(typeof WorkspaceEntitiesStore.recalculateCounts).toBe('function');
    expect(typeof WorkspaceEntitiesStore.recalculateAllCounts).toBe('function');
    expect(typeof WorkspaceEntitiesStore.merge).toBe('function');
    expect(typeof WorkspaceEntitiesStore.count).toBe('function');
    expect(typeof WorkspaceEntitiesStore.deleteByWorkspace).toBe('function');
    expect(typeof WorkspaceEntitiesStore.validateEntityType).toBe('function');
    expect(typeof WorkspaceEntitiesStore.ENTITY_LIMIT).toBe('number');
  });
});
