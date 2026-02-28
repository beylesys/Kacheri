import { describe, it, expect, beforeEach } from 'vitest';
import '../kcl.ts';

function tick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

describe('kcl-text', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders a paragraph by default', async () => {
    const el = document.createElement('kcl-text');
    el.textContent = 'Hello world';
    document.body.appendChild(el);
    await tick();
    expect(el.querySelector('p')).toBeTruthy();
  });

  it('renders correct heading level', async () => {
    const el = document.createElement('kcl-text');
    el.setAttribute('level', 'h2');
    el.textContent = 'Title';
    document.body.appendChild(el);
    await tick();
    expect(el.querySelector('h2')).toBeTruthy();
  });

  it('applies text alignment', async () => {
    const el = document.createElement('kcl-text');
    el.setAttribute('align', 'center');
    el.textContent = 'Centered';
    document.body.appendChild(el);
    await tick();
    const p = el.querySelector('p') as HTMLElement;
    expect(p.style.textAlign).toBe('center');
  });

  it('supports data binding', async () => {
    const el = document.createElement('kcl-text') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    await tick();
    el.bindData({ content: 'Dynamic content' });
    await tick();
    expect(el.textContent).toContain('Dynamic content');
  });

  it('exposes editableProperties', () => {
    const Ctor = customElements.get('kcl-text') as unknown as { editableProperties: unknown[] };
    expect(Ctor.editableProperties.length).toBeGreaterThan(0);
  });
});
