import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../kcl.ts';

function tick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

describe('kcl-icon', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders SVG for a known icon', async () => {
    const el = document.createElement('kcl-icon');
    el.setAttribute('name', 'arrow-right');
    document.body.appendChild(el);
    await tick();
    const svg = el.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('shows placeholder for unknown icon', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('kcl-icon');
    el.setAttribute('name', 'nonexistent-icon-xyz');
    document.body.appendChild(el);
    await tick();
    expect(el.querySelector('.kcl-icon-placeholder')).toBeTruthy();
    expect(el.querySelector('.kcl-icon-placeholder')?.textContent).toBe('?');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('unknown icon'));
    spy.mockRestore();
  });

  it('applies custom size', async () => {
    const el = document.createElement('kcl-icon');
    el.setAttribute('name', 'check');
    el.setAttribute('size', '32');
    document.body.appendChild(el);
    await tick();
    const container = el.querySelector('.kcl-icon-container') as HTMLElement;
    expect(container.style.width).toBe('32px');
    expect(container.style.height).toBe('32px');
  });

  it('sets aria-label when label provided', async () => {
    const el = document.createElement('kcl-icon');
    el.setAttribute('name', 'check');
    el.setAttribute('label', 'Success');
    document.body.appendChild(el);
    await tick();
    const container = el.querySelector('.kcl-icon-container');
    expect(container?.getAttribute('role')).toBe('img');
    expect(container?.getAttribute('aria-label')).toBe('Success');
  });

  it('sets aria-hidden when no label', async () => {
    const el = document.createElement('kcl-icon');
    el.setAttribute('name', 'check');
    document.body.appendChild(el);
    await tick();
    const container = el.querySelector('.kcl-icon-container');
    expect(container?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders nothing when no name', async () => {
    const el = document.createElement('kcl-icon');
    document.body.appendChild(el);
    await tick();
    expect(el.innerHTML).toBe('');
  });

  it('exposes editableProperties', () => {
    const Ctor = customElements.get('kcl-icon') as unknown as { editableProperties: unknown[] };
    expect(Ctor.editableProperties.length).toBeGreaterThan(0);
  });
});
