/**
 * Product Module Registry — Slices M2 + M3
 *
 * Frontend mirror of KACHERI BACKEND/src/modules/registry.ts.
 * Reads VITE_ENABLED_PRODUCTS from build-time env and provides
 * isProductEnabled() for conditional route rendering.
 *
 * M3 adds fetchProductConfig() which calls GET /api/config at runtime
 * and updates the singleton, notifying React subscribers.
 */

import { useSyncExternalStore } from 'react';

/** Known product identifiers — matches backend ProductId */
export type ProductId = 'docs' | 'design-studio' | 'jaal';

export interface FeatureFlags {
  docs: { enabled: boolean };
  designStudio: { enabled: boolean };
  jaal: { enabled: boolean };
  memoryGraph: { enabled: boolean };
}

export interface ProductRegistryConfig {
  /** Ordered list of enabled product IDs */
  enabledProducts: ProductId[];
  /** Set for O(1) lookup */
  enabledSet: ReadonlySet<ProductId>;
  /** Feature flags from backend config (populated after fetchProductConfig) */
  features: FeatureFlags;
  /** Platform version from backend (populated after fetchProductConfig) */
  version: string | null;
}

// --- Known products ---

const KNOWN_PRODUCTS: ReadonlySet<string> = new Set<string>(['docs', 'design-studio', 'jaal']);

/** Default: all products enabled */
const DEFAULT_ENABLED = 'docs,design-studio,jaal';

const DEFAULT_FEATURES: FeatureFlags = {
  docs: { enabled: true },
  designStudio: { enabled: true },
  jaal: { enabled: true },
  memoryGraph: { enabled: true },
};

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
    // Fallback to defaults rather than crashing the frontend
    console.warn(
      `VITE_ENABLED_PRODUCTS resolved to empty list (raw: "${raw}"). ` +
      `Falling back to default: ${DEFAULT_ENABLED}`
    );
    return parseEnabledProducts(DEFAULT_ENABLED);
  }

  return valid;
}

function loadProductRegistry(): ProductRegistryConfig {
  const raw: string =
    (import.meta as any).env?.VITE_ENABLED_PRODUCTS ?? DEFAULT_ENABLED;
  const enabledProducts = parseEnabledProducts(raw);
  return {
    enabledProducts,
    enabledSet: new Set(enabledProducts),
    features: DEFAULT_FEATURES,
    version: null,
  };
}

// --- Singleton ---

let _registry: ProductRegistryConfig | null = null;
let _listeners: Set<() => void> = new Set();

function emitChange(): void {
  for (const listener of _listeners) {
    listener();
  }
}

export function getProductRegistry(): ProductRegistryConfig {
  if (!_registry) {
    _registry = loadProductRegistry();
  }
  return _registry;
}

/** For testing: reset registry so it re-reads env */
export function resetProductRegistry(): void {
  _registry = null;
  emitChange();
}

// --- Public API ---

/**
 * Check whether a specific product is enabled.
 * Primary API used by ProductGuard for conditional route rendering.
 */
export function isProductEnabled(product: ProductId): boolean {
  return getProductRegistry().enabledSet.has(product);
}

/**
 * Check whether ALL of the specified products are enabled.
 * Used for cross-product features (e.g., Canvas-in-Docs embedding).
 */
export function areAllProductsEnabled(...products: ProductId[]): boolean {
  const reg = getProductRegistry();
  return products.every(p => reg.enabledSet.has(p));
}

/**
 * Check whether a specific feature flag is enabled.
 */
export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  return getProductRegistry().features[feature].enabled;
}

// --- Runtime config fetch (Slice M3) ---

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  (import.meta as any).env?.VITE_API_URL ??
  '/api';

let _fetchPromise: Promise<void> | null = null;

/**
 * Fetch platform config from GET /api/config at runtime.
 * Updates the singleton and notifies React subscribers.
 * Safe to call multiple times — deduplicates concurrent calls.
 * Never throws — silently keeps build-time defaults on failure.
 */
export function fetchProductConfig(): Promise<void> {
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/config`);
      if (!res.ok) return;

      const data = await res.json();

      if (!data || !Array.isArray(data.products)) return;

      const enabledProducts = data.products.filter(
        (p: string) => KNOWN_PRODUCTS.has(p)
      ) as ProductId[];

      if (enabledProducts.length === 0) return;

      const features: FeatureFlags = {
        docs: { enabled: data.features?.docs?.enabled ?? true },
        designStudio: { enabled: data.features?.designStudio?.enabled ?? true },
        jaal: { enabled: data.features?.jaal?.enabled ?? true },
        memoryGraph: { enabled: data.features?.memoryGraph?.enabled ?? true },
      };

      _registry = {
        enabledProducts,
        enabledSet: new Set(enabledProducts),
        features,
        version: data.version ?? null,
      };

      emitChange();
    } catch {
      // Silently keep build-time defaults on network failure
    } finally {
      _fetchPromise = null;
    }
  })();

  return _fetchPromise;
}

// --- React hook ---

function subscribe(callback: () => void): () => void {
  _listeners.add(callback);
  return () => { _listeners.delete(callback); };
}

function getSnapshot(): ProductRegistryConfig {
  return getProductRegistry();
}

/**
 * React hook that returns the current product registry config.
 * Components can use this to conditionally render based on enabled products.
 * Re-renders when fetchProductConfig() updates the config at runtime.
 */
export function useProductConfig(): ProductRegistryConfig {
  return useSyncExternalStore(subscribe, getSnapshot);
}
