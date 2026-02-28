/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_WS_URL?: string;
  /** Comma-separated list of enabled products (e.g., "docs,design-studio") — Slice M2/M3 */
  readonly VITE_ENABLED_PRODUCTS?: string;
  /** Memory graph feature flag ("true"/"false") — Slice M3/P3 */
  readonly VITE_MEMORY_GRAPH_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
