/* === kcl-text — Typography v1.0.0 === */

import { KCLBaseElement } from '../base.ts';
import type { PropertySchema, TextData } from '../types.ts';

const VALID_LEVELS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span']);

export class KCLText extends KCLBaseElement {
  static get observedAttributes(): string[] {
    return ['level', 'align', 'color', 'animate', 'delay', 'font-family', 'font-size', 'font-weight'];
  }

  static override get editableProperties(): PropertySchema[] {
    return [
      { name: 'content', label: 'Text Content', type: 'text', isAttribute: false, group: 'content' },
      { name: 'level', label: 'Level', type: 'select', options: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span'], isAttribute: true, group: 'typography', defaultValue: 'p' },
      { name: 'align', label: 'Alignment', type: 'select', options: ['left', 'center', 'right', 'justify'], isAttribute: true, group: 'typography', defaultValue: 'left' },
      { name: 'color', label: 'Color', type: 'color', isAttribute: true, group: 'typography' },
      { name: 'font-family', label: 'Font Family', type: 'select', options: ['system-ui', 'serif', 'monospace', 'Georgia', 'Garamond', 'Palatino'], isAttribute: true, group: 'typography' },
      { name: 'font-size', label: 'Font Size (px)', type: 'number', min: 12, max: 120, step: 2, isAttribute: true, group: 'typography' },
      { name: 'font-weight', label: 'Font Weight', type: 'select', options: ['400', '500', '600', '700', '800'], isAttribute: true, group: 'typography' },
      { name: 'animate', label: 'Animation', type: 'select', options: ['none', 'fade', 'slide-up', 'slide-down', 'scale', 'bounce'], isAttribute: true, group: 'animation', defaultValue: 'none' },
      { name: 'delay', label: 'Delay (ms)', type: 'number', min: 0, max: 5000, step: 100, isAttribute: true, group: 'animation', defaultValue: 0 },
    ];
  }

  protected render(): void {
    const level = this.attr('level', 'p');
    const tag = VALID_LEVELS.has(level) ? level : 'p';
    const align = this.attr('align', 'left');
    const color = this.attr('color');
    const animate = this.attr('animate', 'none');
    const delay = this.numAttr('delay', 0);

    // Determine content: data binding overrides initial content
    const data = this.data as TextData | undefined;
    const content = data?.content ?? this.initialContent;

    // Find or create the semantic element
    let el = this.querySelector(`:scope > ${tag}`) as HTMLElement | null;
    if (!el || el.tagName.toLowerCase() !== tag) {
      this.innerHTML = '';
      el = document.createElement(tag);
      el.className = 'kcl-text-content';
      this.appendChild(el);
    }

    el.innerHTML = content;
    el.style.textAlign = align;
    if (color) {
      el.style.color = color;
    } else {
      el.style.color = '';
    }

    // Typography overrides (Phase 6 — F1)
    const fontFamily = this.attr('font-family');
    const fontSize = this.attr('font-size');
    const fontWeight = this.attr('font-weight');
    el.style.fontFamily = fontFamily || '';
    el.style.fontSize = fontSize ? `${fontSize}px` : '';
    el.style.fontWeight = fontWeight || '';

    // Animation
    const anim = this.buildAnimation(animate === 'fade' ? 'fade-in' : animate, 400, delay);
    el.style.animation = anim;
  }
}

customElements.define('kcl-text', KCLText);
