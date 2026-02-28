import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../kcl.ts';

function tick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

describe('KCL data binding integration', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('binds data from <script data-for> on DOMContentLoaded', async () => {
    const el = document.createElement('kcl-text');
    el.id = 'test-text';
    document.body.appendChild(el);

    const script = document.createElement('script');
    script.type = 'application/json';
    script.setAttribute('data-for', 'test-text');
    script.textContent = JSON.stringify({ content: 'Bound text' });
    document.body.appendChild(script);

    // The MutationObserver in kcl.ts should pick up the script
    await tick();
    // Allow two microtask cycles (observer + render)
    await tick();
    expect(el.textContent).toContain('Bound text');
  });

  it('handles multiple elements with data binding', async () => {
    const text = document.createElement('kcl-text');
    text.id = 'multi-text';
    document.body.appendChild(text);

    const quote = document.createElement('kcl-quote');
    quote.id = 'multi-quote';
    document.body.appendChild(quote);

    await tick();

    // Bind data manually since we're in test environment
    (text as unknown as { bindData(d: unknown): void }).bindData({ content: 'Hello' });
    (quote as unknown as { bindData(d: unknown): void }).bindData({ text: 'A quote', attribution: 'Author' });

    await tick();
    expect(text.textContent).toContain('Hello');
    expect(quote.querySelector('blockquote')?.textContent).toContain('A quote');
  });

  it('shows error on invalid JSON in data script', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = document.createElement('kcl-metric');
    el.id = 'bad-json';
    document.body.appendChild(el);

    const script = document.createElement('script');
    script.type = 'application/json';
    script.setAttribute('data-for', 'bad-json');
    script.textContent = '{invalid json}';
    document.body.appendChild(script);

    await tick();
    await tick();
    // Should log error (but not crash)
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('bindData overrides initial content', async () => {
    const el = document.createElement('kcl-text') as HTMLElement & { bindData(d: unknown): void };
    el.textContent = 'Initial';
    document.body.appendChild(el);
    await tick();

    el.bindData({ content: 'Updated' });
    await tick();
    expect(el.textContent).toContain('Updated');
  });

  it('multiple bindData calls coalesce renders', async () => {
    const el = document.createElement('kcl-text') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    await tick();

    // Call bindData multiple times synchronously
    el.bindData({ content: 'First' });
    el.bindData({ content: 'Second' });
    el.bindData({ content: 'Third' });
    await tick();

    // Should show the last value due to microtask coalescing
    expect(el.textContent).toContain('Third');
  });
});
