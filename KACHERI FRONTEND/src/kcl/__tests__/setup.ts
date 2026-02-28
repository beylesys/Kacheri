/* KCL Test Setup — no React dependency */

import { vi } from 'vitest';

// Mock matchMedia for reduced-motion detection
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver for kcl-animate trigger="enter"
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe(): void { /* noop */ }
  unobserve(): void { /* noop */ }
  disconnect(): void { /* noop */ }
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});

// Mock CSS.escape if not available in jsdom
if (typeof CSS === 'undefined' || !CSS.escape) {
  const cssObj = typeof CSS !== 'undefined' ? CSS : {};
  Object.defineProperty(globalThis, 'CSS', {
    value: {
      ...cssObj,
      escape: (str: string) =>
        str.replace(/([^\w-])/g, '\\$1'),
    },
    writable: true,
  });
}

// Mock ResizeObserver for kcl-chart responsive rendering
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(): void { /* noop */ }
  unobserve(): void { /* noop */ }
  disconnect(): void { /* noop */ }
}
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});

// Import KCL runtime — registers all custom elements
import '../kcl.ts';
