/* === kcl-source — Doc Citation v1.0.0 === */

import { KCLBaseElement } from '../base.ts';
import type { PropertySchema } from '../types.ts';
import { getIconSvg } from '../icons.ts';

declare global {
  interface Window {
    __KCL_DOCS_ENABLED?: boolean;
  }
}

export class KCLSource extends KCLBaseElement {
  static get observedAttributes(): string[] {
    return ['doc-id', 'section', 'label'];
  }

  static override get editableProperties(): PropertySchema[] {
    return [
      { name: 'doc-id', label: 'Document ID', type: 'text', isAttribute: true, group: 'content' },
      { name: 'section', label: 'Section', type: 'text', isAttribute: true, group: 'content' },
      { name: 'label', label: 'Display Label', type: 'text', isAttribute: true, group: 'content' },
    ];
  }

  protected render(): void {
    const docId = this.attr('doc-id');
    const section = this.attr('section');
    const label = this.attr('label') || this.buildDefaultLabel(docId, section);
    const docsEnabled = window.__KCL_DOCS_ENABLED === true;
    const docIcon = getIconSvg('file-text', 14, 2) ?? '';

    if (docsEnabled && docId) {
      const href = `/docs/${docId}${section ? `#section-${section}` : ''}`;
      this.innerHTML = `
        <cite class="kcl-source-container">
          <a class="kcl-source-link" href="${href}" target="_top"
             data-kcl-source-doc="${docId}"
             ${section ? `data-kcl-source-section="${section}"` : ''}>
            <span class="kcl-source-icon">${docIcon}</span>
            <span class="kcl-source-label">${label}</span>
          </a>
        </cite>`;
    } else {
      this.innerHTML = `
        <cite class="kcl-source-container kcl-source--plain">
          <span class="kcl-source-icon">${docIcon}</span>
          <span class="kcl-source-label">${label}</span>
        </cite>`;
    }
  }

  private buildDefaultLabel(docId: string, section: string): string {
    if (!docId) return 'Source';
    const parts = [docId];
    if (section) parts.push(`Section ${section}`);
    return parts.join(', ');
  }
}

customElements.define('kcl-source', KCLSource);
