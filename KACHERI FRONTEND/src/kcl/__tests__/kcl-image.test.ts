import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../kcl.ts';

function tick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

describe('kcl-image', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders an img element with src', async () => {
    const el = document.createElement('kcl-image');
    el.setAttribute('src', 'https://example.com/img.png');
    el.setAttribute('alt', 'Test image');
    document.body.appendChild(el);
    await tick();
    const img = el.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.src).toContain('example.com/img.png');
    expect(img?.alt).toBe('Test image');
  });

  it('shows placeholder when no src', async () => {
    const el = document.createElement('kcl-image');
    document.body.appendChild(el);
    await tick();
    expect(el.querySelector('.kcl-image-placeholder')).toBeTruthy();
  });

  it('warns on missing alt text', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('kcl-image');
    el.setAttribute('src', 'https://example.com/img.png');
    document.body.appendChild(el);
    await tick();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('missing alt'));
    spy.mockRestore();
  });

  it('applies object-fit', async () => {
    const el = document.createElement('kcl-image');
    el.setAttribute('src', 'https://example.com/img.png');
    el.setAttribute('alt', 'Test');
    el.setAttribute('fit', 'contain');
    document.body.appendChild(el);
    await tick();
    const img = el.querySelector('img') as HTMLImageElement;
    expect(img.style.objectFit).toBe('contain');
  });
});
