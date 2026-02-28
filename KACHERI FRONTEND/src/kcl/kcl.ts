/* === KCL Runtime === */
/* Entry point: registers all custom elements, binds data, installs error boundary */

import { CURRENT_VERSION } from './version.ts';
import type { KCLBaseElement } from './base.ts';
import { installEditModeListener } from './selection.ts';

// CSS import — enables Vite library mode to extract styles into kcl.css bundle
import './kcl.css';

// --- Import components (side-effect: registers custom elements) ---
import './components/kcl-slide.ts';
import './components/kcl-text.ts';
import './components/kcl-layout.ts';
import './components/kcl-image.ts';
import './components/kcl-list.ts';
import './components/kcl-quote.ts';
import './components/kcl-metric.ts';
import './components/kcl-icon.ts';
import './components/kcl-animate.ts';
import './components/kcl-code.ts';
import './components/kcl-embed.ts';
import './components/kcl-source.ts';
import './components/kcl-chart.ts';
import './components/kcl-table.ts';
import './components/kcl-timeline.ts';
import './components/kcl-compare.ts';

export const KCL_VERSION = CURRENT_VERSION;

// --- Type guard ---

function isKCLElement(el: Element | null): el is KCLBaseElement {
  return el !== null && 'bindData' in el && typeof (el as Record<string, unknown>).bindData === 'function';
}

// --- Data binding: single script ---

function bindSingleData(script: HTMLScriptElement): void {
  const targetId = script.getAttribute('data-for');
  if (!targetId) return;
  const target = document.getElementById(targetId);
  if (!target || !isKCLElement(target)) return;
  try {
    const data: unknown = JSON.parse(script.textContent ?? '');
    target.bindData(data);
  } catch (err) {
    console.error(`[KCL] Data binding error for #${targetId}:`, err);
    if (target && 'showError' in target) {
      (target as KCLBaseElement & { showError(e: Error): void }).showError(
        new Error(`Data binding: invalid JSON for #${targetId}`),
      );
    }
  }
}

// --- Data binding: full scan ---

function bindAllData(): void {
  const scripts = document.querySelectorAll<HTMLScriptElement>(
    'script[data-for][type="application/json"]',
  );
  for (const script of scripts) {
    bindSingleData(script);
  }
}

// --- MutationObserver for dynamic content ---

function observeDOM(): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (
          node instanceof HTMLScriptElement &&
          node.hasAttribute('data-for') &&
          node.type === 'application/json'
        ) {
          bindSingleData(node);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// --- Global error boundary ---

function installErrorBoundary(): void {
  window.addEventListener('error', (event) => {
    // Log but do not show overlay for global errors — component-level errors
    // are handled by KCLBaseElement.showError() already
    if (event.error) {
      console.error('[KCL] Uncaught error:', event.error);
    }
  });
}

// --- Init ---

function init(): void {
  installErrorBoundary();
  bindAllData();
  observeDOM();
  // Phase 6 — F1: Listen for edit mode postMessage commands from parent
  installEditModeListener();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
