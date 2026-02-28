/* === kcl-quote — Blockquote v1.0.0 === */

import { KCLBaseElement } from '../base.ts';
import type { PropertySchema, QuoteData } from '../types.ts';

const VALID_VARIANTS = new Set(['default', 'large', 'minimal', 'highlight']);

export class KCLQuote extends KCLBaseElement {
  static get observedAttributes(): string[] {
    return ['attribution', 'cite', 'variant'];
  }

  static override get editableProperties(): PropertySchema[] {
    return [
      { name: 'text', label: 'Quote Text', type: 'text', isAttribute: false, group: 'content' },
      { name: 'attribution', label: 'Attribution', type: 'text', isAttribute: true, group: 'content' },
      { name: 'cite', label: 'Citation URL', type: 'text', isAttribute: true, group: 'content' },
      { name: 'variant', label: 'Style', type: 'select', options: ['default', 'large', 'minimal', 'highlight'], isAttribute: true, group: 'appearance', defaultValue: 'default' },
    ];
  }

  protected render(): void {
    const variant = this.attr('variant', 'default');
    const variantClass = VALID_VARIANTS.has(variant) ? variant : 'default';
    const cite = this.attr('cite');

    const data = this.data as QuoteData | undefined;
    const text = data?.text ?? this.initialContent;
    const attribution = data?.attribution ?? this.attr('attribution');

    this.innerHTML = '';

    const figure = document.createElement('figure');
    figure.className = `kcl-quote-container kcl-quote--${variantClass}`;

    const blockquote = document.createElement('blockquote');
    blockquote.className = 'kcl-quote-text';
    if (cite) {
      blockquote.setAttribute('cite', cite);
    }

    const p = document.createElement('p');
    p.innerHTML = text;
    blockquote.appendChild(p);
    figure.appendChild(blockquote);

    if (attribution) {
      const figcaption = document.createElement('figcaption');
      figcaption.className = 'kcl-quote-attribution';
      figcaption.textContent = `\u2014 ${attribution}`;
      figure.appendChild(figcaption);
    }

    this.appendChild(figure);
  }
}

customElements.define('kcl-quote', KCLQuote);
