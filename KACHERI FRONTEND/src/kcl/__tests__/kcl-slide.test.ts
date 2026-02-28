import { describe, it, expect, beforeEach } from 'vitest';
import '../kcl.ts';

function tick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

describe('kcl-slide', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders a container with default styles', async () => {
    const el = document.createElement('kcl-slide');
    document.body.appendChild(el);
    await tick();
    const container = el.querySelector('.kcl-slide-container');
    expect(container).toBeTruthy();
    expect(container?.getAttribute('role')).toBe('region');
  });

  it('applies background attribute', async () => {
    const el = document.createElement('kcl-slide');
    el.setAttribute('background', '#ff0000');
    document.body.appendChild(el);
    await tick();
    const container = el.querySelector('.kcl-slide-container') as HTMLDivElement;
    expect(container.style.background).toBe('rgb(255, 0, 0)');
  });

  it('applies aspect-ratio and padding', async () => {
    const el = document.createElement('kcl-slide');
    el.setAttribute('aspect-ratio', '4/3');
    el.setAttribute('padding', '32');
    document.body.appendChild(el);
    await tick();
    const container = el.querySelector('.kcl-slide-container') as HTMLDivElement;
    expect(container.style.aspectRatio).toBe('4/3');
    expect(container.style.padding).toBe('32px');
  });

  it('preserves child content inside container', async () => {
    const el = document.createElement('kcl-slide');
    el.innerHTML = '<p>Hello</p>';
    document.body.appendChild(el);
    await tick();
    const container = el.querySelector('.kcl-slide-container');
    expect(container?.querySelector('p')?.textContent).toBe('Hello');
  });

  it('exposes editableProperties', () => {
    const Ctor = customElements.get('kcl-slide') as unknown as { editableProperties: unknown[] };
    expect(Array.isArray(Ctor.editableProperties)).toBe(true);
    expect(Ctor.editableProperties.length).toBeGreaterThan(0);
  });
});
