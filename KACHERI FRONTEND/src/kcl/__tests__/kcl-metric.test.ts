import { describe, it, expect, beforeEach } from 'vitest';
import '../kcl.ts';

function tick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

describe('kcl-metric', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders value from data binding', async () => {
    const el = document.createElement('kcl-metric') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('label', 'Revenue');
    document.body.appendChild(el);
    el.bindData({ value: 42000 });
    await tick();
    const numberEl = el.querySelector('.kcl-metric-number');
    expect(numberEl?.textContent).toContain('42');
  });

  it('renders label', async () => {
    const el = document.createElement('kcl-metric') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('label', 'Users');
    document.body.appendChild(el);
    el.bindData({ value: 100 });
    await tick();
    const labelEl = el.querySelector('.kcl-metric-label');
    expect(labelEl?.textContent).toBe('Users');
  });

  it('renders prefix and suffix', async () => {
    const el = document.createElement('kcl-metric') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('prefix', '$');
    el.setAttribute('suffix', 'M');
    document.body.appendChild(el);
    el.bindData({ value: 5 });
    await tick();
    expect(el.querySelector('.kcl-metric-prefix')?.textContent).toBe('$');
    expect(el.querySelector('.kcl-metric-suffix')?.textContent).toBe('M');
  });

  it('renders trend indicator', async () => {
    const el = document.createElement('kcl-metric') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('trend', 'up');
    document.body.appendChild(el);
    el.bindData({ value: 100, delta: 12 });
    await tick();
    const trend = el.querySelector('.kcl-metric-trend--up');
    expect(trend).toBeTruthy();
    expect(trend?.textContent).toContain('+12%');
  });

  it('renders negative trend', async () => {
    const el = document.createElement('kcl-metric') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('trend', 'down');
    document.body.appendChild(el);
    el.bindData({ value: 50, delta: -8 });
    await tick();
    const trend = el.querySelector('.kcl-metric-trend--down');
    expect(trend).toBeTruthy();
    expect(trend?.textContent).toContain('-8%');
  });

  it('exposes editableProperties', () => {
    const Ctor = customElements.get('kcl-metric') as unknown as { editableProperties: unknown[] };
    expect(Ctor.editableProperties.length).toBeGreaterThan(0);
  });
});
