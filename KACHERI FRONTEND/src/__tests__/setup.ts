import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

/* Provide a minimal localStorage with auth defaults for API module headers */
const store: Record<string, string> = {
  devUser: 'test-user',
  userId: 'test-user',
  accessToken: 'test-token',
};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { store[k] = v; }),
    removeItem: vi.fn((k: string) => { delete store[k]; }),
    clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]); }),
    key: vi.fn((_i: number) => null),
    get length() { return Object.keys(store).length; },
  },
  writable: true,
});

/* Stub window.matchMedia (required by some responsive components) */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
