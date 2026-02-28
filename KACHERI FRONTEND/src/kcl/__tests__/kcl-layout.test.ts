import { describe, it, expect, beforeEach } from 'vitest';
import '../kcl.ts';

function tick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

describe('kcl-layout', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders flex layout by default', async () => {
    const el = document.createElement('kcl-layout');
    document.body.appendChild(el);
    await tick();
    const container = el.querySelector('.kcl-layout-container') as HTMLDivElement;
    expect(container).toBeTruthy();
    expect(container.style.display).toBe('flex');
  });

  it('renders grid layout', async () => {
    const el = document.createElement('kcl-layout');
    el.setAttribute('type', 'grid');
    el.setAttribute('columns', '3');
    document.body.appendChild(el);
    await tick();
    const container = el.querySelector('.kcl-layout-container') as HTMLDivElement;
    expect(container.style.display).toBe('grid');
    expect(container.style.gridTemplateColumns).toBe('repeat(3, 1fr)');
  });

  it('applies gap', async () => {
    const el = document.createElement('kcl-layout');
    el.setAttribute('gap', '24');
    document.body.appendChild(el);
    await tick();
    const container = el.querySelector('.kcl-layout-container') as HTMLDivElement;
    expect(container.style.gap).toBe('24px');
  });

  it('preserves children in container', async () => {
    const el = document.createElement('kcl-layout');
    el.innerHTML = '<div>A</div><div>B</div>';
    document.body.appendChild(el);
    await tick();
    const container = el.querySelector('.kcl-layout-container');
    expect(container?.children.length).toBeGreaterThanOrEqual(2);
  });
});
