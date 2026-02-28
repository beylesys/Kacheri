/* === kcl-embed — External Embeds v1.0.0 (E7: workspace whitelist support) === */

import { KCLBaseElement } from '../base.ts';
import type { PropertySchema } from '../types.ts';
import { EMBED_WHITELIST } from '../types.ts';

const PROVIDER_ALLOW: Record<string, string> = {
  'youtube.com': 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
  'www.youtube.com': 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
  'youtu.be': 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
  'vimeo.com': 'autoplay; fullscreen; picture-in-picture',
  'player.vimeo.com': 'autoplay; fullscreen; picture-in-picture',
  'loom.com': 'autoplay; fullscreen',
  'www.loom.com': 'autoplay; fullscreen',
};

/**
 * Build the effective embed whitelist by merging the hardcoded defaults
 * with any workspace-specific domains injected via window.__KACHERI_EMBED_WHITELIST__.
 * The frame renderer (useFrameRenderer.ts) injects this variable into the
 * iframe srcdoc when workspace custom domains are configured (E7).
 */
function getEffectiveWhitelist(): ReadonlySet<string> {
  const base = new Set(EMBED_WHITELIST);
  try {
    const injected = (window as any).__KACHERI_EMBED_WHITELIST__;
    if (Array.isArray(injected)) {
      for (const d of injected) {
        if (typeof d === 'string' && d.trim()) base.add(d.trim().toLowerCase());
      }
    }
  } catch {
    // Ignore — window may not be available in test environments
  }
  return base;
}

function isAllowedEmbed(url: string): { allowed: boolean; hostname: string } {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const whitelist = getEffectiveWhitelist();
    return { allowed: whitelist.has(hostname), hostname };
  } catch {
    return { allowed: false, hostname: 'invalid URL' };
  }
}

export class KCLEmbed extends KCLBaseElement {
  static get observedAttributes(): string[] {
    return ['src', 'aspect-ratio', 'title'];
  }

  static override get editableProperties(): PropertySchema[] {
    return [
      { name: 'src', label: 'Embed URL', type: 'text', isAttribute: true, group: 'content' },
      { name: 'title', label: 'Title', type: 'text', isAttribute: true, group: 'content' },
      { name: 'aspect-ratio', label: 'Aspect Ratio', type: 'select', options: ['16/9', '4/3', '1/1', '9/16'], isAttribute: true, group: 'layout', defaultValue: '16/9' },
    ];
  }

  protected render(): void {
    const src = this.attr('src');
    const aspect = this.attr('aspect-ratio', '16/9');
    const title = this.attr('title');

    if (!src) {
      this.innerHTML = '<div class="kcl-embed-container kcl-embed--blocked"><div class="kcl-embed-blocked-text">No embed URL provided</div></div>';
      return;
    }

    const { allowed, hostname } = isAllowedEmbed(src);

    if (!allowed) {
      this.innerHTML = `
        <div class="kcl-embed-container kcl-embed--blocked" style="aspect-ratio:${aspect};" role="alert">
          <div class="kcl-embed-blocked-icon">&#128274;</div>
          <div class="kcl-embed-blocked-text">Embed blocked: <strong>${hostname}</strong> is not in the allowed domains list.</div>
          <div class="kcl-embed-blocked-domains">Allowed: YouTube, Vimeo, Google Maps, Codepen, Loom</div>
        </div>`;
      return;
    }

    const iframeTitle = title || `Embedded content from ${hostname}`;
    const allowPermissions = PROVIDER_ALLOW[hostname] ?? '';

    this.innerHTML = `
      <div class="kcl-embed-container" style="aspect-ratio:${aspect};position:relative;">
        <iframe class="kcl-embed-frame"
          src="${src}"
          title="${iframeTitle}"
          ${allowPermissions ? `allow="${allowPermissions}"` : ''}
          allowfullscreen
          loading="lazy"
          style="position:absolute;inset:0;width:100%;height:100%;border:0;">
        </iframe>
      </div>`;
  }
}

customElements.define('kcl-embed', KCLEmbed);
