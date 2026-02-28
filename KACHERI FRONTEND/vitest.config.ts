import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.tsx', 'src/kcl/__tests__/**/*.test.ts'],
    exclude: ['tests/**'],
  },
});
