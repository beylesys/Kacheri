/* === kcl-icon — Icon Display v1.0.0 === */

import { KCLBaseElement } from '../base.ts';
import type { PropertySchema } from '../types.ts';
import { getIconSvg, getIconNames } from '../icons.ts';

export class KCLIcon extends KCLBaseElement {
  static get observedAttributes(): string[] {
    return ['name', 'size', 'color', 'stroke-width', 'label'];
  }

  static override get editableProperties(): PropertySchema[] {
    return [
      { name: 'name', label: 'Icon', type: 'select', options: getIconNames(), isAttribute: true, group: 'content' },
      { name: 'size', label: 'Size (px)', type: 'number', min: 12, max: 96, step: 4, isAttribute: true, group: 'appearance', defaultValue: 24 },
      { name: 'color', label: 'Color', type: 'color', isAttribute: true, group: 'appearance' },
      { name: 'label', label: 'Accessible Label', type: 'text', isAttribute: true, group: 'accessibility' },
    ];
  }

  protected render(): void {
    const name = this.attr('name');
    const size = this.numAttr('size', 24);
    const color = this.attr('color', 'currentColor');
    const strokeWidth = this.numAttr('stroke-width', 2);
    const label = this.attr('label');

    if (!name) {
      this.innerHTML = '';
      return;
    }

    const svg = getIconSvg(name, size, strokeWidth);

    if (!svg) {
      console.warn(`[KCL] <kcl-icon> unknown icon name: "${name}"`);
      this.innerHTML = `<span class="kcl-icon-placeholder" style="width:${size}px;height:${size}px;" aria-hidden="true">?</span>`;
      return;
    }

    const hasLabel = !!label;
    this.innerHTML = `<span class="kcl-icon-container" style="width:${size}px;height:${size}px;color:${color};" ${hasLabel ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>${svg}</span>`;
  }
}

customElements.define('kcl-icon', KCLIcon);
