/// <reference types="vite/client" />

// Optional: make your VITE_ vars strongly typed.
interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_WS_URL: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
