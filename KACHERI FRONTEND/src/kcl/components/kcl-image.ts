/* === kcl-image — Image Display v1.0.0 === */

import { KCLBaseElement } from '../base.ts';
import type { PropertySchema, ImageData } from '../types.ts';

export class KCLImage extends KCLBaseElement {
  static get observedAttributes(): string[] {
    return ['src', 'alt', 'fit', 'aspect-ratio', 'lazy', 'width', 'radius', 'filters'];
  }

  static override get editableProperties(): PropertySchema[] {
    return [
      { name: 'src', label: 'Image Source', type: 'image', isAttribute: true, group: 'content' },
      { name: 'alt', label: 'Alt Text', type: 'text', isAttribute: true, group: 'content' },
      { name: 'fit', label: 'Object Fit', type: 'select', options: ['cover', 'contain', 'fill', 'none'], isAttribute: true, group: 'appearance', defaultValue: 'cover' },
      { name: 'aspect-ratio', label: 'Aspect Ratio', type: 'select', options: ['16/9', '4/3', '1/1', '3/4', '9/16', 'auto'], isAttribute: true, group: 'layout' },
      { name: 'radius', label: 'Border Radius', type: 'number', min: 0, max: 200, step: 4, isAttribute: true, group: 'appearance', defaultValue: 0 },
      { name: 'filters', label: 'Filter', type: 'select', options: ['none', 'grayscale', 'sepia', 'blur', 'brightness', 'contrast'], isAttribute: true, group: 'appearance', defaultValue: 'none' },
    ];
  }

  protected render(): void {
    const data = this.data as ImageData | undefined;
    const src = data?.src ?? this.attr('src');
    const alt = this.attr('alt');
    const fit = this.attr('fit', 'cover');
    const aspect = this.attr('aspect-ratio');
    const lazy = this.boolAttr('lazy') || !this.hasAttribute('lazy'); // default to lazy
    const width = this.attr('width', '100%');
    const radius = this.numAttr('radius', 0);

    if (!alt && src) {
      console.warn(`[KCL] <kcl-image> missing alt attribute for src="${src}". Add alt text for accessibility.`);
    }

    let container = this.querySelector(':scope > .kcl-image-container') as HTMLDivElement | null;
    if (!container) {
      this.innerHTML = '';
      container = document.createElement('div');
      container.className = 'kcl-image-container';
      this.appendChild(container);
    }

    if (aspect) {
      container.style.aspectRatio = aspect;
    }
    container.style.borderRadius = `${radius}px`;
    container.style.overflow = 'hidden';
    container.style.width = width;

    if (!src) {
      container.innerHTML = '<div class="kcl-image-placeholder">No image</div>';
      return;
    }

    let img = container.querySelector(':scope > .kcl-image-el') as HTMLImageElement | null;
    if (!img) {
      container.innerHTML = '';
      img = document.createElement('img');
      img.className = 'kcl-image-el';
      container.appendChild(img);
    }

    img.src = src;
    img.alt = alt;
    img.style.objectFit = fit;
    if (lazy) {
      img.loading = 'lazy';
    }

    // Image filter (Phase 6 — F1)
    const filters = this.attr('filters', 'none');
    const filterMap: Record<string, string> = {
      none: '',
      grayscale: 'grayscale(100%)',
      sepia: 'sepia(100%)',
      blur: 'blur(4px)',
      brightness: 'brightness(1.3)',
      contrast: 'contrast(1.4)',
    };
    img.style.filter = filterMap[filters] ?? '';
  }
}

customElements.define('kcl-image', KCLImage);
