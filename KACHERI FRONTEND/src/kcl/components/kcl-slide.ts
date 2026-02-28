/* === kcl-slide — Frame Container v1.0.0 === */

import { KCLBaseElement } from '../base.ts';
import type { PropertySchema, SlideData } from '../types.ts';

export class KCLSlide extends KCLBaseElement {
  static get observedAttributes(): string[] {
    return ['background', 'transition', 'aspect-ratio', 'padding', 'background-gradient'];
  }

  static override get editableProperties(): PropertySchema[] {
    return [
      { name: 'background', label: 'Background', type: 'color', isAttribute: true, group: 'appearance' },
      { name: 'background-gradient', label: 'Background Gradient', type: 'text', isAttribute: true, group: 'appearance' },
      { name: 'transition', label: 'Transition', type: 'select', options: ['none', 'fade', 'slide-left', 'slide-right', 'zoom'], isAttribute: true, group: 'animation' },
      { name: 'aspect-ratio', label: 'Aspect Ratio', type: 'select', options: ['16/9', '4/3', '1/1', '9/16'], isAttribute: true, group: 'layout', defaultValue: '16/9' },
      { name: 'padding', label: 'Padding', type: 'number', min: 0, max: 120, step: 4, isAttribute: true, group: 'layout', defaultValue: 48 },
      { name: 'backgroundImage', label: 'Background Image', type: 'image', isAttribute: false, group: 'appearance' },
    ];
  }

  protected render(): void {
    const container = this.ensureContainer('kcl-slide-container');
    const bg = this.attr('background', 'var(--kcl-bg)');
    const aspect = this.attr('aspect-ratio', '16/9');
    const padding = this.attr('padding', '48');
    const transition = this.attr('transition', 'none');

    // Gradient overrides solid color (Phase 6 — F1)
    const gradient = this.attr('background-gradient');
    container.style.background = gradient || bg;
    container.style.aspectRatio = aspect;
    container.style.padding = `${padding}px`;

    // Slide transition animation
    if (transition !== 'none' && !this.prefersReducedMotion) {
      container.style.animation = `kcl-transition-${transition} var(--kcl-duration-normal) var(--kcl-easing-default)`;
    } else {
      container.style.animation = '';
    }

    // Data binding: background image
    const data = this.data as SlideData | undefined;
    if (data?.backgroundImage) {
      container.style.backgroundImage = `url(${data.backgroundImage})`;
      container.style.backgroundSize = 'cover';
      container.style.backgroundPosition = 'center';
    }

    // Accessibility
    if (!container.getAttribute('role')) {
      container.setAttribute('role', 'region');
      const heading = container.querySelector('h1, h2, h3, h4, h5, h6');
      if (heading?.textContent) {
        container.setAttribute('aria-label', heading.textContent);
      }
    }
  }
}

customElements.define('kcl-slide', KCLSlide);
