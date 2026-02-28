import { describe, it, expect, beforeEach } from 'vitest';
import '../kcl.ts';

function tick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

describe('KCL accessibility (WCAG AA)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  // --- kcl-slide ---
  it('kcl-slide has role="region"', async () => {
    const el = document.createElement('kcl-slide');
    document.body.appendChild(el);
    await tick();
    const container = el.querySelector('.kcl-slide-container');
    expect(container?.getAttribute('role')).toBe('region');
  });

  // --- kcl-text ---
  it('kcl-text uses correct semantic heading tags', async () => {
    for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      const el = document.createElement('kcl-text');
      el.setAttribute('level', level);
      el.textContent = `Heading ${level}`;
      document.body.appendChild(el);
      await tick();
      expect(el.querySelector(level)).toBeTruthy();
      document.body.removeChild(el);
    }
  });

  // --- kcl-image ---
  it('kcl-image passes alt text to img element', async () => {
    const el = document.createElement('kcl-image');
    el.setAttribute('src', 'https://example.com/img.png');
    el.setAttribute('alt', 'Descriptive alt text');
    document.body.appendChild(el);
    await tick();
    const img = el.querySelector('img');
    expect(img?.alt).toBe('Descriptive alt text');
  });

  // --- kcl-icon ---
  it('kcl-icon sets aria-hidden when decorative', async () => {
    const el = document.createElement('kcl-icon');
    el.setAttribute('name', 'check');
    document.body.appendChild(el);
    await tick();
    const container = el.querySelector('.kcl-icon-container');
    expect(container?.getAttribute('aria-hidden')).toBe('true');
  });

  it('kcl-icon sets role=img and aria-label when labeled', async () => {
    const el = document.createElement('kcl-icon');
    el.setAttribute('name', 'check');
    el.setAttribute('label', 'Verified');
    document.body.appendChild(el);
    await tick();
    const container = el.querySelector('.kcl-icon-container');
    expect(container?.getAttribute('role')).toBe('img');
    expect(container?.getAttribute('aria-label')).toBe('Verified');
  });

  // --- kcl-code ---
  it('kcl-code has role=region and label', async () => {
    const el = document.createElement('kcl-code') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('language', 'javascript');
    document.body.appendChild(el);
    el.bindData({ code: 'const x = 1;' });
    await tick();
    const region = el.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toBe('Code block');
  });

  it('kcl-code line numbers are aria-hidden', async () => {
    const el = document.createElement('kcl-code') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('language', 'javascript');
    el.setAttribute('line-numbers', '');
    document.body.appendChild(el);
    el.bindData({ code: 'const x = 1;' });
    await tick();
    const lineNum = el.querySelector('.kcl-code-ln');
    expect(lineNum?.getAttribute('aria-hidden')).toBe('true');
  });

  // --- kcl-embed ---
  it('kcl-embed blocked state has role=alert', async () => {
    const el = document.createElement('kcl-embed');
    el.setAttribute('src', 'https://evil.com/exploit');
    document.body.appendChild(el);
    await tick();
    expect(el.querySelector('[role="alert"]')).toBeTruthy();
  });

  it('kcl-embed iframe has title attribute', async () => {
    const el = document.createElement('kcl-embed');
    el.setAttribute('src', 'https://www.youtube.com/embed/abc');
    el.setAttribute('title', 'My Video');
    document.body.appendChild(el);
    await tick();
    const iframe = el.querySelector('iframe');
    expect(iframe?.getAttribute('title')).toBe('My Video');
  });

  // --- kcl-metric ---
  it('kcl-metric container has aria-label', async () => {
    const el = document.createElement('kcl-metric') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('label', 'Revenue');
    document.body.appendChild(el);
    el.bindData({ value: 1000 });
    await tick();
    const container = el.querySelector('.kcl-metric-container');
    expect(container?.getAttribute('aria-label')).toBeTruthy();
    expect(container?.getAttribute('aria-label')).toContain('Revenue');
  });

  // --- kcl-list ---
  it('kcl-list uses semantic list elements', async () => {
    const el = document.createElement('kcl-list') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData({ items: [{ text: 'Item 1' }] });
    await tick();
    const ul = el.querySelector('ul');
    expect(ul).toBeTruthy();
  });

  it('kcl-list numbered uses ol element', async () => {
    const el = document.createElement('kcl-list') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('type', 'number');
    document.body.appendChild(el);
    el.bindData({ items: [{ text: 'First' }] });
    await tick();
    const ol = el.querySelector('ol');
    expect(ol).toBeTruthy();
  });

  // --- kcl-quote ---
  it('kcl-quote uses figure and blockquote elements', async () => {
    const el = document.createElement('kcl-quote');
    el.setAttribute('attribution', 'Author');
    el.textContent = 'A quote';
    document.body.appendChild(el);
    await tick();
    expect(el.querySelector('figure')).toBeTruthy();
    expect(el.querySelector('blockquote')).toBeTruthy();
    expect(el.querySelector('figcaption')).toBeTruthy();
  });

  // --- kcl-source ---
  it('kcl-source uses cite element', async () => {
    const el = document.createElement('kcl-source');
    el.setAttribute('doc-id', 'test-doc');
    document.body.appendChild(el);
    await tick();
    expect(el.querySelector('cite')).toBeTruthy();
  });

  // --- Error overlay ---
  it('error overlay has role=alert', async () => {
    const el = document.createElement('kcl-text') as HTMLElement & { showError(e: Error): void };
    document.body.appendChild(el);
    await tick();
    el.showError(new Error('test'));
    expect(el.querySelector('[role="alert"]')).toBeTruthy();
  });
});
