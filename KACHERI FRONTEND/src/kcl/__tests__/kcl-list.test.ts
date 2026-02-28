import { describe, it, expect, beforeEach } from 'vitest';
import '../kcl.ts';

function tick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

describe('kcl-list', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders list items from data binding', async () => {
    const el = document.createElement('kcl-list') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData({ items: [{ text: 'First' }, { text: 'Second' }] });
    await tick();
    const items = el.querySelectorAll('.kcl-list-item');
    expect(items.length).toBe(2);
  });

  it('renders bullet markers by default', async () => {
    const el = document.createElement('kcl-list') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData({ items: [{ text: 'Item' }] });
    await tick();
    const marker = el.querySelector('.kcl-list-marker');
    expect(marker?.textContent).toBe('\u2022');
  });

  it('renders numbered list', async () => {
    const el = document.createElement('kcl-list') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('type', 'number');
    document.body.appendChild(el);
    el.bindData({ items: [{ text: 'A' }, { text: 'B' }] });
    await tick();
    const list = el.querySelector('ol');
    expect(list).toBeTruthy();
  });

  it('handles nested items', async () => {
    const el = document.createElement('kcl-list') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData({ items: [{ text: 'Parent', items: [{ text: 'Child' }] }] });
    await tick();
    const nested = el.querySelector('.kcl-list-nested');
    expect(nested).toBeTruthy();
  });
});
