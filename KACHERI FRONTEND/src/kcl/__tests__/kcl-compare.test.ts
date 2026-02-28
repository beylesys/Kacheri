import { describe, it, expect, beforeEach } from 'vitest';
import '../kcl.ts';

function tick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

const sampleData = {
  before: { src: 'before.jpg', label: 'Before' },
  after: { src: 'after.jpg', label: 'After' },
};

describe('kcl-compare', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders slider mode by default', async () => {
    const el = document.createElement('kcl-compare') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    expect(el.querySelector('.kcl-compare--slider')).toBeTruthy();
  });

  it('renders before and after images', async () => {
    const el = document.createElement('kcl-compare') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const images = el.querySelectorAll('img');
    expect(images.length).toBe(2);
    // After is first in DOM (bottom layer), before is second (top layer with clip)
    expect(images[0].alt).toBe('After');
    expect(images[1].alt).toBe('Before');
  });

  it('handle has role="slider" with ARIA attributes', async () => {
    const el = document.createElement('kcl-compare') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const handle = el.querySelector('.kcl-compare-handle');
    expect(handle?.getAttribute('role')).toBe('slider');
    expect(handle?.getAttribute('aria-valuenow')).toBe('50');
    expect(handle?.getAttribute('aria-valuemin')).toBe('0');
    expect(handle?.getAttribute('aria-valuemax')).toBe('100');
    expect(handle?.getAttribute('aria-label')).toBe('Comparison slider');
  });

  it('defaults initial position to 50%', async () => {
    const el = document.createElement('kcl-compare') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const handle = el.querySelector('.kcl-compare-handle') as HTMLElement;
    expect(handle.style.left).toBe('50%');
  });

  it('sets custom initial-position', async () => {
    const el = document.createElement('kcl-compare') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('initial-position', '30');
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const handle = el.querySelector('.kcl-compare-handle') as HTMLElement;
    expect(handle.style.left).toBe('30%');
    expect(handle.getAttribute('aria-valuenow')).toBe('30');
  });

  it('renders side-by-side mode', async () => {
    const el = document.createElement('kcl-compare') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('mode', 'side-by-side');
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    expect(el.querySelector('.kcl-compare--side-by-side')).toBeTruthy();
    const panels = el.querySelectorAll('.kcl-compare-panel');
    expect(panels.length).toBe(2);
  });

  it('keyboard ArrowRight increases position', async () => {
    const el = document.createElement('kcl-compare') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();

    const handle = el.querySelector('.kcl-compare-handle') as HTMLElement;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(handle.getAttribute('aria-valuenow')).toBe('52');
  });

  it('keyboard ArrowLeft decreases position', async () => {
    const el = document.createElement('kcl-compare') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();

    const handle = el.querySelector('.kcl-compare-handle') as HTMLElement;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

    expect(handle.getAttribute('aria-valuenow')).toBe('48');
  });

  it('keyboard Home sets to 0, End sets to 100', async () => {
    const el = document.createElement('kcl-compare') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();

    const handle = el.querySelector('.kcl-compare-handle') as HTMLElement;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(handle.getAttribute('aria-valuenow')).toBe('0');

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(handle.getAttribute('aria-valuenow')).toBe('100');
  });

  it('shows empty state when no data', async () => {
    const el = document.createElement('kcl-compare') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData({});
    await tick();
    expect(el.querySelector('.kcl-compare-empty')).toBeTruthy();
  });

  it('renders labels for before and after', async () => {
    const el = document.createElement('kcl-compare') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const labels = el.querySelectorAll('.kcl-compare-label');
    expect(labels.length).toBe(2);
  });

  it('has group role with aria-label', async () => {
    const el = document.createElement('kcl-compare') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const container = el.querySelector('[role="group"]');
    expect(container?.getAttribute('aria-label')).toBe('Before and after comparison');
  });

  it('exposes editableProperties', () => {
    const Ctor = customElements.get('kcl-compare') as unknown as { editableProperties: unknown[] };
    expect(Ctor.editableProperties.length).toBeGreaterThan(0);
  });
});
