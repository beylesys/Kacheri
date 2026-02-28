import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadProductRegistry,
  getProductRegistry,
  resetProductRegistry,
  isProductEnabled,
  areAllProductsEnabled,
} from '../registry.js';

// Save and restore ENABLED_PRODUCTS between tests
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env.ENABLED_PRODUCTS;
  resetProductRegistry();
});

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env.ENABLED_PRODUCTS;
  } else {
    process.env.ENABLED_PRODUCTS = originalEnv;
  }
  resetProductRegistry();
});

/* ============= Default behavior ============= */

describe('loadProductRegistry — defaults', () => {
  it('enables both products when ENABLED_PRODUCTS is not set', () => {
    delete process.env.ENABLED_PRODUCTS;
    const config = loadProductRegistry();
    expect(config.enabledProducts).toEqual(['docs', 'design-studio']);
    expect(config.enabledSet.has('docs')).toBe(true);
    expect(config.enabledSet.has('design-studio')).toBe(true);
  });
});

/* ============= Single product ============= */

describe('loadProductRegistry — single product', () => {
  it('enables only docs when ENABLED_PRODUCTS=docs', () => {
    process.env.ENABLED_PRODUCTS = 'docs';
    const config = loadProductRegistry();
    expect(config.enabledProducts).toEqual(['docs']);
    expect(config.enabledSet.has('docs')).toBe(true);
    expect(config.enabledSet.has('design-studio')).toBe(false);
  });

  it('enables only design-studio when ENABLED_PRODUCTS=design-studio', () => {
    process.env.ENABLED_PRODUCTS = 'design-studio';
    const config = loadProductRegistry();
    expect(config.enabledProducts).toEqual(['design-studio']);
    expect(config.enabledSet.has('docs')).toBe(false);
    expect(config.enabledSet.has('design-studio')).toBe(true);
  });
});

/* ============= Multiple products ============= */

describe('loadProductRegistry — multiple products', () => {
  it('enables both when ENABLED_PRODUCTS=docs,design-studio', () => {
    process.env.ENABLED_PRODUCTS = 'docs,design-studio';
    const config = loadProductRegistry();
    expect(config.enabledProducts).toEqual(['docs', 'design-studio']);
  });
});

/* ============= Whitespace and case tolerance ============= */

describe('loadProductRegistry — normalization', () => {
  it('trims whitespace and normalizes case', () => {
    process.env.ENABLED_PRODUCTS = ' Docs , DESIGN-STUDIO ';
    const config = loadProductRegistry();
    expect(config.enabledProducts).toEqual(['docs', 'design-studio']);
  });

  it('deduplicates repeated products', () => {
    process.env.ENABLED_PRODUCTS = 'docs,docs,docs';
    const config = loadProductRegistry();
    expect(config.enabledProducts).toEqual(['docs']);
  });
});

/* ============= Unknown products ============= */

describe('loadProductRegistry — unknown products', () => {
  it('ignores unknown products and keeps known ones', () => {
    process.env.ENABLED_PRODUCTS = 'docs,unknown,foo';
    const config = loadProductRegistry();
    expect(config.enabledProducts).toEqual(['docs']);
  });

  it('throws when all products are unknown (empty result)', () => {
    process.env.ENABLED_PRODUCTS = 'foo,bar';
    expect(() => loadProductRegistry()).toThrow('resolved to empty list');
  });

  it('throws on empty string', () => {
    process.env.ENABLED_PRODUCTS = '';
    expect(() => loadProductRegistry()).toThrow('resolved to empty list');
  });

  it('throws on whitespace-only string', () => {
    process.env.ENABLED_PRODUCTS = '   ';
    expect(() => loadProductRegistry()).toThrow('resolved to empty list');
  });
});

/* ============= isProductEnabled ============= */

describe('isProductEnabled', () => {
  it('returns true for enabled product', () => {
    process.env.ENABLED_PRODUCTS = 'docs';
    expect(isProductEnabled('docs')).toBe(true);
  });

  it('returns false for disabled product', () => {
    process.env.ENABLED_PRODUCTS = 'docs';
    expect(isProductEnabled('design-studio')).toBe(false);
  });
});

/* ============= areAllProductsEnabled ============= */

describe('areAllProductsEnabled', () => {
  it('returns true when all specified products are enabled', () => {
    process.env.ENABLED_PRODUCTS = 'docs,design-studio';
    expect(areAllProductsEnabled('docs', 'design-studio')).toBe(true);
  });

  it('returns false when not all products are enabled', () => {
    process.env.ENABLED_PRODUCTS = 'docs';
    expect(areAllProductsEnabled('docs', 'design-studio')).toBe(false);
  });

  it('returns true for single product check', () => {
    process.env.ENABLED_PRODUCTS = 'docs';
    expect(areAllProductsEnabled('docs')).toBe(true);
  });
});

/* ============= Singleton / reset ============= */

describe('getProductRegistry / resetProductRegistry', () => {
  it('caches the registry across calls', () => {
    process.env.ENABLED_PRODUCTS = 'docs';
    const a = getProductRegistry();
    const b = getProductRegistry();
    expect(a).toBe(b); // same reference
  });

  it('re-reads env after reset', () => {
    process.env.ENABLED_PRODUCTS = 'docs';
    expect(isProductEnabled('docs')).toBe(true);
    expect(isProductEnabled('design-studio')).toBe(false);

    process.env.ENABLED_PRODUCTS = 'design-studio';
    resetProductRegistry();
    expect(isProductEnabled('docs')).toBe(false);
    expect(isProductEnabled('design-studio')).toBe(true);
  });
});
