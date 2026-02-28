/* === kcl-layout — Flexbox/Grid Composition v1.0.0 === */

import { KCLBaseElement } from '../base.ts';
import type { PropertySchema } from '../types.ts';

const JUSTIFY_MAP: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
};

const ALIGN_MAP: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

export class KCLLayout extends KCLBaseElement {
  static get observedAttributes(): string[] {
    return ['type', 'direction', 'columns', 'gap', 'align', 'justify', 'wrap', 'breakpoint', 'padding'];
  }

  static override get editableProperties(): PropertySchema[] {
    return [
      { name: 'type', label: 'Layout Type', type: 'select', options: ['flex', 'grid'], isAttribute: true, group: 'layout', defaultValue: 'flex' },
      { name: 'direction', label: 'Direction', type: 'select', options: ['row', 'column', 'row-reverse', 'column-reverse'], isAttribute: true, group: 'layout', defaultValue: 'row' },
      { name: 'columns', label: 'Columns', type: 'number', min: 1, max: 12, step: 1, isAttribute: true, group: 'layout', defaultValue: 2 },
      { name: 'gap', label: 'Gap (px)', type: 'number', min: 0, max: 96, step: 4, isAttribute: true, group: 'layout', defaultValue: 16 },
      { name: 'align', label: 'Align Items', type: 'select', options: ['start', 'center', 'end', 'stretch'], isAttribute: true, group: 'layout', defaultValue: 'stretch' },
      { name: 'justify', label: 'Justify Content', type: 'select', options: ['start', 'center', 'end', 'between', 'around', 'evenly'], isAttribute: true, group: 'layout', defaultValue: 'start' },
      { name: 'breakpoint', label: 'Stack Breakpoint (px)', type: 'number', min: 0, max: 1920, step: 40, isAttribute: true, group: 'layout', defaultValue: 0 },
      { name: 'padding', label: 'Padding (px)', type: 'number', min: 0, max: 120, step: 4, isAttribute: true, group: 'layout', defaultValue: 0 },
    ];
  }

  private _styleEl: HTMLStyleElement | null = null;

  protected render(): void {
    const container = this.ensureContainer('kcl-layout-container');
    const type = this.attr('type', 'flex');
    const direction = this.attr('direction', 'row');
    const columns = this.numAttr('columns', 2);
    const gap = this.numAttr('gap', 16);
    const align = this.attr('align', 'stretch');
    const justify = this.attr('justify', 'start');
    const wrap = this.boolAttr('wrap');
    const breakpoint = this.numAttr('breakpoint', 0);

    if (type === 'grid') {
      container.style.display = 'grid';
      container.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
      container.style.flexDirection = '';
      container.style.flexWrap = '';
    } else {
      container.style.display = 'flex';
      container.style.flexDirection = direction;
      container.style.flexWrap = wrap ? 'wrap' : 'nowrap';
      container.style.gridTemplateColumns = '';
    }

    container.style.gap = `${gap}px`;
    container.style.alignItems = ALIGN_MAP[align] ?? 'stretch';
    container.style.justifyContent = JUSTIFY_MAP[justify] ?? 'flex-start';

    // Padding (Phase 6 — F1)
    const padding = this.numAttr('padding', 0);
    container.style.padding = padding > 0 ? `${padding}px` : '';

    // Responsive breakpoint via injected <style>
    if (breakpoint > 0) {
      if (!this._styleEl) {
        this._styleEl = document.createElement('style');
        this.appendChild(this._styleEl);
      }
      const uid = this.id || `kcl-layout-${Math.random().toString(36).slice(2, 8)}`;
      container.dataset.layoutId = uid;
      this._styleEl.textContent = `
        @media (max-width: ${breakpoint}px) {
          [data-layout-id="${uid}"] {
            grid-template-columns: 1fr !important;
            flex-direction: column !important;
          }
        }`;
    } else if (this._styleEl) {
      this._styleEl.textContent = '';
    }
  }

  protected override onDisconnect(): void {
    this._styleEl = null;
  }
}

customElements.define('kcl-layout', KCLLayout);
