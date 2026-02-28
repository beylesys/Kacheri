/**
 * KCL Build Configuration
 *
 * Vite library-mode config for building the Kacheri Component Library
 * as a standalone JS + CSS bundle with no React dependency.
 *
 * Usage:
 *   npx vite build -c src/kcl/build.ts
 *   # or via npm script:
 *   npm run build:kcl
 *
 * Override version via env:
 *   KCL_BUILD_VERSION=1.1.0 npm run build:kcl
 */

import { defineConfig } from 'vite';
import { resolve } from 'path';
import { CURRENT_VERSION } from './version.ts';

const version = process.env.KCL_BUILD_VERSION || CURRENT_VERSION;

// Resolve paths relative to this file's location (src/kcl/)
const kclDir = resolve(__dirname, '.');
const backendStorageDir = resolve(__dirname, '../../../KACHERI BACKEND/storage/kcl', version);

export default defineConfig({
  // No plugins — KCL is pure vanilla JS, no React
  plugins: [],

  build: {
    lib: {
      entry: resolve(kclDir, 'kcl.ts'),
      formats: ['iife'],
      name: 'KCL',
      fileName: () => 'kcl.js',
    },

    // Output to backend storage directory for serving
    outDir: backendStorageDir,

    // CSS extracted from the JS import in kcl.ts
    cssFileName: 'kcl',

    // Clean the output directory before build
    emptyOutDir: true,

    // Production optimizations
    minify: true,
    sourcemap: false,

    // Ensure no external dependencies leak in
    rollupOptions: {
      output: {
        // Single file — no code splitting for IIFE
        inlineDynamicImports: true,
      },
    },
  },

  // Disable CSS modules — KCL uses plain CSS with custom properties
  css: {
    modules: false,
  },
});
