import { describe, it, expect, beforeEach } from 'vitest';
import '../kcl.ts';

function tick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

describe('kcl-code', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders code with syntax highlighting', async () => {
    const el = document.createElement('kcl-code') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('language', 'javascript');
    document.body.appendChild(el);
    el.bindData({ code: 'const x = 42;' });
    await tick();
    expect(el.querySelector('.kcl-code-container')).toBeTruthy();
    expect(el.querySelector('.kcl-tok-keyword')).toBeTruthy();
  });

  it('shows language label in header', async () => {
    const el = document.createElement('kcl-code') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('language', 'python');
    document.body.appendChild(el);
    el.bindData({ code: 'print("hello")' });
    await tick();
    const langLabel = el.querySelector('.kcl-code-lang');
    expect(langLabel?.textContent).toBe('Python');
  });

  it('renders line numbers when enabled', async () => {
    const el = document.createElement('kcl-code') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('language', 'javascript');
    el.setAttribute('line-numbers', '');
    document.body.appendChild(el);
    el.bindData({ code: 'const a = 1;\nconst b = 2;' });
    await tick();
    const lineNums = el.querySelectorAll('.kcl-code-ln');
    expect(lineNums.length).toBe(2);
    expect(lineNums[0].textContent).toBe('1');
    expect(lineNums[1].textContent).toBe('2');
  });

  it('highlights specified lines', async () => {
    const el = document.createElement('kcl-code') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('language', 'javascript');
    el.setAttribute('highlight-lines', '2');
    document.body.appendChild(el);
    el.bindData({ code: 'line 1\nline 2\nline 3' });
    await tick();
    const rows = el.querySelectorAll('.kcl-code-line');
    expect(rows[1].classList.contains('kcl-code-line--highlight')).toBe(true);
    expect(rows[0].classList.contains('kcl-code-line--highlight')).toBe(false);
  });

  it('applies dark theme by default', async () => {
    const el = document.createElement('kcl-code') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData({ code: 'x = 1' });
    await tick();
    expect(el.querySelector('.kcl-code--dark')).toBeTruthy();
  });

  it('applies light theme', async () => {
    const el = document.createElement('kcl-code') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('theme', 'light');
    document.body.appendChild(el);
    el.bindData({ code: 'x = 1' });
    await tick();
    expect(el.querySelector('.kcl-code--light')).toBeTruthy();
  });

  it('resolves language aliases', async () => {
    const el = document.createElement('kcl-code') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('language', 'js');
    document.body.appendChild(el);
    el.bindData({ code: 'const x = 1;' });
    await tick();
    const langLabel = el.querySelector('.kcl-code-lang');
    expect(langLabel?.textContent).toBe('Javascript');
  });

  it('uses initial content when no data bound', async () => {
    const el = document.createElement('kcl-code');
    el.setAttribute('language', 'python');
    el.textContent = 'def hello(): pass';
    document.body.appendChild(el);
    await tick();
    expect(el.querySelector('.kcl-tok-keyword')).toBeTruthy();
  });

  it('exposes editableProperties', () => {
    const Ctor = customElements.get('kcl-code') as unknown as { editableProperties: unknown[] };
    expect(Ctor.editableProperties.length).toBeGreaterThan(0);
  });
});
