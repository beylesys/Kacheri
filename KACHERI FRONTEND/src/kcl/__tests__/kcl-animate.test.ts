import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../kcl.ts';

function tick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

describe('kcl-animate', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders a container element', async () => {
    const el = document.createElement('kcl-animate');
    el.innerHTML = '<div>Child</div>';
    document.body.appendChild(el);
    await tick();
    expect(el.querySelector('.kcl-animate-container')).toBeTruthy();
  });

  it('hides element when trigger is enter and not yet visible', async () => {
    const el = document.createElement('kcl-animate');
    el.setAttribute('trigger', 'enter');
    el.setAttribute('type', 'fade');
    el.innerHTML = '<div>Animate me</div>';
    document.body.appendChild(el);
    await tick();
    const container = el.querySelector('.kcl-animate-container') as HTMLDivElement;
    expect(container.style.opacity).toBe('0');
  });

  it('sets up hover trigger without hiding', async () => {
    const el = document.createElement('kcl-animate');
    el.setAttribute('trigger', 'hover');
    el.setAttribute('type', 'scale');
    el.innerHTML = '<div>Hover me</div>';
    document.body.appendChild(el);
    await tick();
    const container = el.querySelector('.kcl-animate-container') as HTMLDivElement;
    expect(container.style.opacity).toBe('1');
  });

  it('sets up click trigger without hiding', async () => {
    const el = document.createElement('kcl-animate');
    el.setAttribute('trigger', 'click');
    el.setAttribute('type', 'bounce');
    el.innerHTML = '<div>Click me</div>';
    document.body.appendChild(el);
    await tick();
    const container = el.querySelector('.kcl-animate-container') as HTMLDivElement;
    expect(container.style.opacity).toBe('1');
  });

  it('respects prefers-reduced-motion', async () => {
    // The setup.ts mocks matchMedia to return false by default,
    // so we override it temporarily
    const spy = vi.spyOn(window, 'matchMedia').mockImplementation(
      () => ({ matches: true, media: '', addEventListener: vi.fn(), removeEventListener: vi.fn(), onchange: null, addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }) as MediaQueryList,
    );
    const el = document.createElement('kcl-animate');
    el.setAttribute('trigger', 'enter');
    el.setAttribute('type', 'fade');
    el.innerHTML = '<div>No animation</div>';
    document.body.appendChild(el);
    await tick();
    const container = el.querySelector('.kcl-animate-container') as HTMLDivElement;
    // With reduced motion, opacity should be 1 (not hidden)
    expect(container.style.opacity).toBe('1');
    spy.mockRestore();
  });

  it('exposes editableProperties', () => {
    const Ctor = customElements.get('kcl-animate') as unknown as { editableProperties: unknown[] };
    expect(Ctor.editableProperties.length).toBeGreaterThan(0);
  });
});
