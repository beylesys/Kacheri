/* === kcl-compare — Before/After Comparison v1.0.0 === */

import { KCLBaseElement } from '../base.ts';
import type { PropertySchema, CompareData } from '../types.ts';
import { getIconSvg } from '../icons.ts';

export class KCLCompare extends KCLBaseElement {
  private _position = 50;
  private _dragging = false;
  private _onMove: ((e: MouseEvent | TouchEvent) => void) | null = null;
  private _onUp: (() => void) | null = null;

  static get observedAttributes(): string[] {
    return ['mode', 'initial-position'];
  }

  static override get editableProperties(): PropertySchema[] {
    return [
      { name: 'before', label: 'Before Image', type: 'json', isAttribute: false, group: 'content' },
      { name: 'after', label: 'After Image', type: 'json', isAttribute: false, group: 'content' },
      { name: 'mode', label: 'Mode', type: 'select', options: ['slider', 'side-by-side'], isAttribute: true, group: 'appearance', defaultValue: 'slider' },
      { name: 'initial-position', label: 'Initial Position (%)', type: 'number', min: 0, max: 100, step: 1, isAttribute: true, group: 'behavior', defaultValue: 50 },
    ];
  }

  protected render(): void {
    const mode = this.attr('mode', 'slider');
    const data = this.data as CompareData | undefined;

    if (!data?.before?.src || !data?.after?.src) {
      this.innerHTML = '<div class="kcl-compare-empty">No comparison data</div>';
      return;
    }

    // Clean up existing listeners before re-render
    this.cleanupListeners();

    this.innerHTML = '';
    this._position = this.numAttr('initial-position', 50);

    if (mode === 'side-by-side') {
      this.renderSideBySide(data);
    } else {
      this.renderSlider(data);
    }
  }

  private renderSlider(data: CompareData): void {
    const container = document.createElement('div');
    container.className = 'kcl-compare-container kcl-compare--slider';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Before and after comparison');

    // After image (bottom layer)
    const afterDiv = document.createElement('div');
    afterDiv.className = 'kcl-compare-after';
    const afterImg = document.createElement('img');
    afterImg.src = data.after.src;
    afterImg.alt = data.after.label;
    afterImg.draggable = false;
    afterDiv.appendChild(afterImg);
    if (data.after.label) {
      const afterLabel = document.createElement('div');
      afterLabel.className = 'kcl-compare-label kcl-compare-label--after';
      afterLabel.textContent = data.after.label;
      afterDiv.appendChild(afterLabel);
    }
    container.appendChild(afterDiv);

    // Before image (top layer with clip-path)
    const beforeDiv = document.createElement('div');
    beforeDiv.className = 'kcl-compare-before';
    beforeDiv.style.clipPath = `inset(0 ${100 - this._position}% 0 0)`;
    const beforeImg = document.createElement('img');
    beforeImg.src = data.before.src;
    beforeImg.alt = data.before.label;
    beforeImg.draggable = false;
    beforeDiv.appendChild(beforeImg);
    if (data.before.label) {
      const beforeLabel = document.createElement('div');
      beforeLabel.className = 'kcl-compare-label kcl-compare-label--before';
      beforeLabel.textContent = data.before.label;
      beforeDiv.appendChild(beforeLabel);
    }
    container.appendChild(beforeDiv);

    // Handle
    const handle = document.createElement('div');
    handle.className = 'kcl-compare-handle';
    handle.style.left = `${this._position}%`;
    handle.setAttribute('role', 'slider');
    handle.setAttribute('aria-valuenow', String(Math.round(this._position)));
    handle.setAttribute('aria-valuemin', '0');
    handle.setAttribute('aria-valuemax', '100');
    handle.setAttribute('aria-label', 'Comparison slider');
    handle.tabIndex = 0;

    const handleLine = document.createElement('div');
    handleLine.className = 'kcl-compare-handle-line';
    handle.appendChild(handleLine);

    const handleGrip = document.createElement('div');
    handleGrip.className = 'kcl-compare-handle-grip';
    const leftArrow = getIconSvg('chevron-left', 12, 2);
    const rightArrow = getIconSvg('chevron-right', 12, 2);
    handleGrip.innerHTML = `${leftArrow ?? ''}${rightArrow ?? ''}`;
    handle.appendChild(handleGrip);

    container.appendChild(handle);
    this.appendChild(container);

    this.setupSliderEvents(handle, container);
  }

  private renderSideBySide(data: CompareData): void {
    const container = document.createElement('div');
    container.className = 'kcl-compare-container kcl-compare--side-by-side';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Before and after comparison');

    // Before panel
    const beforePanel = document.createElement('div');
    beforePanel.className = 'kcl-compare-panel';
    if (data.before.label) {
      const label = document.createElement('div');
      label.className = 'kcl-compare-label';
      label.textContent = data.before.label;
      beforePanel.appendChild(label);
    }
    const beforeImg = document.createElement('img');
    beforeImg.src = data.before.src;
    beforeImg.alt = data.before.label;
    beforePanel.appendChild(beforeImg);
    container.appendChild(beforePanel);

    // After panel
    const afterPanel = document.createElement('div');
    afterPanel.className = 'kcl-compare-panel';
    if (data.after.label) {
      const label = document.createElement('div');
      label.className = 'kcl-compare-label';
      label.textContent = data.after.label;
      afterPanel.appendChild(label);
    }
    const afterImg = document.createElement('img');
    afterImg.src = data.after.src;
    afterImg.alt = data.after.label;
    afterPanel.appendChild(afterImg);
    container.appendChild(afterPanel);

    this.appendChild(container);
  }

  private setupSliderEvents(handle: HTMLElement, container: HTMLElement): void {
    // Mouse drag
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._dragging = true;
    });

    this._onMove = (e: MouseEvent | TouchEvent) => {
      if (!this._dragging) return;
      const rect = container.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const pos = Math.max(0, Math.min(100, ((clientX - rect.left) / (rect.width || 1)) * 100));
      this.updateSliderPosition(pos);
    };

    this._onUp = () => {
      this._dragging = false;
    };

    document.addEventListener('mousemove', this._onMove);
    document.addEventListener('mouseup', this._onUp);
    document.addEventListener('touchmove', this._onMove, { passive: true });
    document.addEventListener('touchend', this._onUp);

    // Touch on handle
    handle.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._dragging = true;
    }, { passive: false });

    // Keyboard
    handle.addEventListener('keydown', (e: KeyboardEvent) => {
      const step = e.shiftKey ? 10 : 2;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        this.updateSliderPosition(Math.max(0, this._position - step));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.updateSliderPosition(Math.min(100, this._position + step));
      } else if (e.key === 'Home') {
        e.preventDefault();
        this.updateSliderPosition(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        this.updateSliderPosition(100);
      }
    });
  }

  private updateSliderPosition(pos: number): void {
    this._position = pos;
    const beforeEl = this.querySelector('.kcl-compare-before') as HTMLElement | null;
    const handle = this.querySelector('.kcl-compare-handle') as HTMLElement | null;

    if (beforeEl) {
      beforeEl.style.clipPath = `inset(0 ${100 - pos}% 0 0)`;
    }
    if (handle) {
      handle.style.left = `${pos}%`;
      handle.setAttribute('aria-valuenow', String(Math.round(pos)));
    }
  }

  private cleanupListeners(): void {
    if (this._onMove) {
      document.removeEventListener('mousemove', this._onMove);
      document.removeEventListener('touchmove', this._onMove);
    }
    if (this._onUp) {
      document.removeEventListener('mouseup', this._onUp);
      document.removeEventListener('touchend', this._onUp);
    }
    this._onMove = null;
    this._onUp = null;
    this._dragging = false;
  }

  protected override onDisconnect(): void {
    this.cleanupListeners();
  }
}

customElements.define('kcl-compare', KCLCompare);
