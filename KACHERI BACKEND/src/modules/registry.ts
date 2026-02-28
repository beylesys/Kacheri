/**
 * Product Module Registry — Slices M1 + P3
 *
 * Reads ENABLED_PRODUCTS from environment and provides
 * isProductEnabled() for conditional route registration.
 *
 * P3 adds isFeatureEnabled() for feature flags like MEMORY_GRAPH_ENABLED.
 *
 * Pattern follows: src/auth/config.ts (singleton + env helpers)
 */

/** Known product identifiers */
export type ProductId = 'docs' | 'design-studio' | 'jaal';

/** Known feature flag identifiers */
export type FeatureId = 'memoryGraph';

export interface ProductRegistryConfig {
  /** Ordered list of enabled product IDs */
  enabledProducts: ProductId[];
  /** Set for O(1) lookup */
  enabledSet: ReadonlySet<ProductId>;
}

// --- Env helpers (mirroring auth/config.ts) ---

function env(name: string, fallback?: string): string {
  return (process.env[name] ?? fallback ?? '').toString();
}

// --- Known products ---

const KNOWN_PRODUCTS: ReadonlySet<string> = new Set<string>(['docs', 'design-studio', 'jaal']);

/** Default: all products enabled */
const DEFAULT_ENABLED = 'docs,design-studio,jaal';

function parseEnabledProducts(raw: string): ProductId[] {
  const parts = raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0);

  const seen = new Set<string>();
  const valid: ProductId[] = [];
  for (const p of parts) {
    if (KNOWN_PRODUCTS.has(p) && !seen.has(p)) {
      valid.push(p as ProductId);
      seen.add(p);
    }
  }

  if (valid.length === 0) {
    throw new Error(
      `ENABLED_PRODUCTS resolved to empty list (raw: "${raw}"). ` +
      `At least one product must be enabled. Known products: ${[...KNOWN_PRODUCTS].join(', ')}`
    );
  }

  return valid;
}

export function loadProductRegistry(): ProductRegistryConfig {
  const raw = env('ENABLED_PRODUCTS', DEFAULT_ENABLED);
  const enabledProducts = parseEnabledProducts(raw);
  return {
    enabledProducts,
    enabledSet: new Set(enabledProducts),
  };
}

// --- Singleton ---

let _registry: ProductRegistryConfig | null = null;

export function getProductRegistry(): ProductRegistryConfig {
  if (!_registry) {
    _registry = loadProductRegistry();
  }
  return _registry;
}

/** For testing: reset registry so it re-reads env */
export function resetProductRegistry(): void {
  _registry = null;
}

// --- Public API ---

/**
 * Check whether a specific product is enabled.
 * Primary API used by server.ts for conditional route registration.
 */
export function isProductEnabled(product: ProductId): boolean {
  return getProductRegistry().enabledSet.has(product);
}

/**
 * Check whether ALL of the specified products are enabled.
 * Used for cross-product route registration.
 */
export function areAllProductsEnabled(...products: ProductId[]): boolean {
  const reg = getProductRegistry();
  return products.every(p => reg.enabledSet.has(p));
}

// --- Feature Flags (Slice P3) ---

/**
 * Check whether a specific feature flag is enabled.
 * Currently supports:
 *   - memoryGraph: controlled by MEMORY_GRAPH_ENABLED env var (defaults to true)
 *
 * Used by server.ts for conditional route registration and by
 * config.ts for the /config response.
 */
export function isFeatureEnabled(feature: FeatureId): boolean {
  switch (feature) {
    case 'memoryGraph': {
      const raw = env('MEMORY_GRAPH_ENABLED', 'true').trim().toLowerCase();
      return raw !== 'false' && raw !== '0';
    }
    default:
      return false;
  }
}
