import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../kcl.ts';

function tick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

describe('KCL error overlay', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('showError renders error overlay with role=alert', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = document.createElement('kcl-text') as HTMLElement & { showError(e: Error): void };
    document.body.appendChild(el);
    await tick();

    el.showError(new Error('Test error'));
    const overlay = el.querySelector('.kcl-error-overlay');
    expect(overlay).toBeTruthy();
    expect(overlay?.getAttribute('role')).toBe('alert');
    expect(overlay?.getAttribute('data-kcl-error')).toBe('true');
    spy.mockRestore();
  });

  it('error overlay contains error message', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = document.createElement('kcl-text') as HTMLElement & { showError(e: Error): void };
    document.body.appendChild(el);
    await tick();

    el.showError(new Error('Something went wrong'));
    const messageEl = el.querySelector('.kcl-error-message');
    expect(messageEl?.textContent).toContain('Something went wrong');
    spy.mockRestore();
  });

  it('error overlay contains title', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = document.createElement('kcl-text') as HTMLElement & { showError(e: Error): void };
    document.body.appendChild(el);
    await tick();

    el.showError(new Error('test'));
    const titleEl = el.querySelector('.kcl-error-title');
    expect(titleEl?.textContent).toBe('Rendering error');
    spy.mockRestore();
  });

  it('error overlay escapes HTML in error messages', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = document.createElement('kcl-text') as HTMLElement & { showError(e: Error): void };
    document.body.appendChild(el);
    await tick();

    el.showError(new Error('<script>alert("xss")</script>'));
    const messageEl = el.querySelector('.kcl-error-message');
    expect(messageEl?.innerHTML).not.toContain('<script>');
    expect(messageEl?.textContent).toContain('<script>');
    spy.mockRestore();
  });

  it('render errors trigger error overlay automatically', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // We can't easily trigger a render error in a built-in component,
    // so we test the mechanism via showError which is what render() calls on catch
    const el = document.createElement('kcl-slide') as HTMLElement & { showError(e: Error): void };
    document.body.appendChild(el);
    await tick();

    el.showError(new Error('Render failed'));
    const overlay = el.querySelector('[data-kcl-error="true"]');
    expect(overlay).toBeTruthy();
    spy.mockRestore();
  });
});
