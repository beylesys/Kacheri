import { describe, it, expect, beforeEach } from 'vitest';
import '../kcl.ts';

function tick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

describe('kcl-embed', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders iframe for whitelisted domain', async () => {
    const el = document.createElement('kcl-embed');
    el.setAttribute('src', 'https://www.youtube.com/embed/abc123');
    el.setAttribute('title', 'Test Video');
    document.body.appendChild(el);
    await tick();
    const iframe = el.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute('src')).toBe('https://www.youtube.com/embed/abc123');
    expect(iframe?.getAttribute('title')).toBe('Test Video');
  });

  it('blocks non-whitelisted domains', async () => {
    const el = document.createElement('kcl-embed');
    el.setAttribute('src', 'https://evil.com/embed');
    document.body.appendChild(el);
    await tick();
    expect(el.querySelector('iframe')).toBeNull();
    expect(el.querySelector('.kcl-embed--blocked')).toBeTruthy();
    expect(el.querySelector('[role="alert"]')).toBeTruthy();
  });

  it('shows "no URL" message when src is empty', async () => {
    const el = document.createElement('kcl-embed');
    document.body.appendChild(el);
    await tick();
    expect(el.querySelector('.kcl-embed--blocked')).toBeTruthy();
    expect(el.textContent).toContain('No embed URL');
  });

  it('applies aspect ratio', async () => {
    const el = document.createElement('kcl-embed');
    el.setAttribute('src', 'https://www.youtube.com/embed/abc');
    el.setAttribute('aspect-ratio', '4/3');
    document.body.appendChild(el);
    await tick();
    const container = el.querySelector('.kcl-embed-container') as HTMLElement;
    expect(container.style.aspectRatio).toBe('4/3');
  });

  it('shows allowed domains list when blocked', async () => {
    const el = document.createElement('kcl-embed');
    el.setAttribute('src', 'https://malicious.com/exploit');
    document.body.appendChild(el);
    await tick();
    const domainsEl = el.querySelector('.kcl-embed-blocked-domains');
    expect(domainsEl?.textContent).toContain('YouTube');
  });

  it('allows Vimeo embeds', async () => {
    const el = document.createElement('kcl-embed');
    el.setAttribute('src', 'https://player.vimeo.com/video/123');
    document.body.appendChild(el);
    await tick();
    const iframe = el.querySelector('iframe');
    expect(iframe).toBeTruthy();
  });
});
