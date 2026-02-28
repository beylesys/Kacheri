/* === kcl-animate — Animation Wrapper v1.0.0 === */

import { KCLBaseElement } from '../base.ts';
import type { PropertySchema } from '../types.ts';

export class KCLAnimate extends KCLBaseElement {
  private _observer: IntersectionObserver | null = null;
  private _triggered = false;

  static get observedAttributes(): string[] {
    return ['type', 'trigger', 'duration', 'delay', 'easing', 'repeat'];
  }

  static override get editableProperties(): PropertySchema[] {
    return [
      { name: 'type', label: 'Animation', type: 'select', options: ['fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'scale', 'bounce', 'zoom'], isAttribute: true, group: 'animation', defaultValue: 'fade' },
      { name: 'trigger', label: 'Trigger', type: 'select', options: ['enter', 'hover', 'click'], isAttribute: true, group: 'animation', defaultValue: 'enter' },
      { name: 'duration', label: 'Duration (ms)', type: 'number', min: 100, max: 3000, step: 100, isAttribute: true, group: 'animation', defaultValue: 400 },
      { name: 'delay', label: 'Delay (ms)', type: 'number', min: 0, max: 5000, step: 100, isAttribute: true, group: 'animation', defaultValue: 0 },
    ];
  }

  protected render(): void {
    const trigger = this.attr('trigger', 'enter');

    const container = this.ensureContainer('kcl-animate-container');

    if (this.prefersReducedMotion) {
      container.style.animation = '';
      container.style.opacity = '1';
      return;
    }

    // Prepare for animation — hide until triggered
    if (trigger === 'enter' && !this._triggered) {
      container.style.opacity = '0';
      this.setupEnterTrigger(container);
    } else if (trigger === 'hover') {
      this.setupHoverTrigger(container);
    } else if (trigger === 'click') {
      this.setupClickTrigger(container);
    } else {
      // Already triggered or immediate
      this.applyAnimation(container);
    }
  }

  private applyAnimation(container: HTMLDivElement): void {
    const type = this.attr('type', 'fade');
    const duration = this.numAttr('duration', 400);
    const delay = this.numAttr('delay', 0);

    const animName = type === 'fade' ? 'fade-in' : type;
    const anim = this.buildAnimation(animName, duration, delay);
    container.style.animation = anim;
    container.style.opacity = '';
  }

  private setupEnterTrigger(container: HTMLDivElement): void {
    if (this._observer) return;

    this._observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !this._triggered) {
            this._triggered = true;
            this.applyAnimation(container);
            this._observer?.disconnect();
          }
        }
      },
      { threshold: 0.1 },
    );
    this._observer.observe(this);
  }

  private setupHoverTrigger(container: HTMLDivElement): void {
    container.style.opacity = '1';
    const handler = (): void => {
      this.applyAnimation(container);
    };
    this.addEventListener('mouseenter', handler, { once: false });
  }

  private setupClickTrigger(container: HTMLDivElement): void {
    container.style.opacity = '1';
    const handler = (): void => {
      // Reset animation
      container.style.animation = 'none';
      // Trigger reflow
      void container.offsetHeight;
      this.applyAnimation(container);
    };
    this.addEventListener('click', handler);
  }

  protected override onDisconnect(): void {
    this._observer?.disconnect();
    this._observer = null;
  }
}

customElements.define('kcl-animate', KCLAnimate);
