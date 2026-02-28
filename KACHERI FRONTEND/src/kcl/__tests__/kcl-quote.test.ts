import { describe, it, expect, beforeEach } from 'vitest';
import '../kcl.ts';

function tick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

describe('kcl-quote', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders a blockquote with attribution', async () => {
    const el = document.createElement('kcl-quote');
    el.setAttribute('attribution', 'John Doe');
    el.textContent = 'Great quote';
    document.body.appendChild(el);
    await tick();
    expect(el.querySelector('blockquote')).toBeTruthy();
    expect(el.querySelector('figcaption')?.textContent).toContain('John Doe');
  });

  it('applies variant class', async () => {
    const el = document.createElement('kcl-quote');
    el.setAttribute('variant', 'large');
    el.textContent = 'Big quote';
    document.body.appendChild(el);
    await tick();
    expect(el.querySelector('.kcl-quote--large')).toBeTruthy();
  });

  it('supports data binding', async () => {
    const el = document.createElement('kcl-quote') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData({ text: 'Dynamic quote', attribution: 'AI' });
    await tick();
    expect(el.querySelector('blockquote')?.textContent).toContain('Dynamic quote');
    expect(el.querySelector('figcaption')?.textContent).toContain('AI');
  });
});
