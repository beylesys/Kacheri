import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../kcl.ts';

function tick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

describe('kcl-source', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { delete window.__KCL_DOCS_ENABLED; });

  it('renders plain cite when docs is not enabled', async () => {
    const el = document.createElement('kcl-source');
    el.setAttribute('doc-id', 'contract-123');
    el.setAttribute('label', 'Employment Agreement');
    document.body.appendChild(el);
    await tick();
    expect(el.querySelector('cite')).toBeTruthy();
    expect(el.querySelector('a')).toBeNull();
    expect(el.querySelector('.kcl-source--plain')).toBeTruthy();
    expect(el.textContent).toContain('Employment Agreement');
  });

  it('renders link when docs is enabled', async () => {
    window.__KCL_DOCS_ENABLED = true;
    const el = document.createElement('kcl-source');
    el.setAttribute('doc-id', 'contract-123');
    el.setAttribute('label', 'Employment Agreement');
    document.body.appendChild(el);
    await tick();
    const link = el.querySelector('a.kcl-source-link');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/docs/contract-123');
    expect(link?.getAttribute('target')).toBe('_top');
  });

  it('includes section in link href', async () => {
    window.__KCL_DOCS_ENABLED = true;
    const el = document.createElement('kcl-source');
    el.setAttribute('doc-id', 'doc-456');
    el.setAttribute('section', '3.1');
    document.body.appendChild(el);
    await tick();
    const link = el.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/docs/doc-456#section-3.1');
  });

  it('builds default label from doc-id', async () => {
    const el = document.createElement('kcl-source');
    el.setAttribute('doc-id', 'contract-789');
    document.body.appendChild(el);
    await tick();
    expect(el.textContent).toContain('contract-789');
  });

  it('builds default label with section', async () => {
    const el = document.createElement('kcl-source');
    el.setAttribute('doc-id', 'doc-1');
    el.setAttribute('section', '2.5');
    document.body.appendChild(el);
    await tick();
    expect(el.textContent).toContain('Section 2.5');
  });

  it('shows "Source" when no doc-id', async () => {
    const el = document.createElement('kcl-source');
    document.body.appendChild(el);
    await tick();
    expect(el.textContent).toContain('Source');
  });

  it('renders doc icon', async () => {
    const el = document.createElement('kcl-source');
    el.setAttribute('doc-id', 'test');
    document.body.appendChild(el);
    await tick();
    const icon = el.querySelector('.kcl-source-icon');
    expect(icon).toBeTruthy();
  });
});
