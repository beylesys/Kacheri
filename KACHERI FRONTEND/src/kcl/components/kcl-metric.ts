/* === kcl-metric — KPI Display v1.0.0 === */

import { KCLBaseElement } from '../base.ts';
import type { PropertySchema, MetricData } from '../types.ts';
import { getIconSvg } from '../icons.ts';

function formatNumber(value: number, format: string, prefix: string, suffix: string): string {
  let formatted: string;
  switch (format) {
    case 'compact':
      formatted = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
      break;
    case 'percent':
      formatted = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 }).format(value / 100);
      break;
    case 'currency':
      formatted = new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(value);
      break;
    default:
      formatted = new Intl.NumberFormat('en').format(value);
  }
  return `${prefix}${formatted}${suffix}`;
}

export class KCLMetric extends KCLBaseElement {
  private _animFrameId = 0;

  static get observedAttributes(): string[] {
    return ['label', 'prefix', 'suffix', 'trend', 'format', 'animate'];
  }

  static override get editableProperties(): PropertySchema[] {
    return [
      { name: 'value', label: 'Value', type: 'number', isAttribute: false, group: 'content' },
      { name: 'delta', label: 'Delta (%)', type: 'number', isAttribute: false, group: 'content' },
      { name: 'label', label: 'Label', type: 'text', isAttribute: true, group: 'content' },
      { name: 'prefix', label: 'Prefix', type: 'text', isAttribute: true, group: 'formatting' },
      { name: 'suffix', label: 'Suffix', type: 'text', isAttribute: true, group: 'formatting' },
      { name: 'trend', label: 'Trend', type: 'select', options: ['up', 'down', 'flat'], isAttribute: true, group: 'content' },
      { name: 'format', label: 'Format', type: 'select', options: ['number', 'compact', 'currency', 'percent'], isAttribute: true, group: 'formatting', defaultValue: 'number' },
    ];
  }

  protected render(): void {
    const label = this.attr('label');
    const prefix = this.attr('prefix');
    const suffix = this.attr('suffix');
    const trend = this.attr('trend');
    const format = this.attr('format', 'number');
    const shouldAnimate = this.boolAttr('animate') && !this.prefersReducedMotion;

    const data = this.data as MetricData | undefined;
    const value = data?.value ?? 0;
    const delta = data?.delta;

    this.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'kcl-metric-container';

    // Accessibility
    const ariaLabel = `${label}: ${formatNumber(value, format, prefix, suffix)}${trend && delta != null ? `, ${trend} ${Math.abs(delta)}%` : ''}`;
    container.setAttribute('aria-label', ariaLabel);

    // Label
    if (label) {
      const labelEl = document.createElement('div');
      labelEl.className = 'kcl-metric-label';
      labelEl.textContent = label;
      container.appendChild(labelEl);
    }

    // Value
    const valueEl = document.createElement('div');
    valueEl.className = 'kcl-metric-value';

    if (prefix) {
      const prefixSpan = document.createElement('span');
      prefixSpan.className = 'kcl-metric-prefix';
      prefixSpan.textContent = prefix;
      valueEl.appendChild(prefixSpan);
    }

    const numberSpan = document.createElement('span');
    numberSpan.className = 'kcl-metric-number';
    numberSpan.textContent = formatNumber(value, format, '', '');
    valueEl.appendChild(numberSpan);

    if (suffix) {
      const suffixSpan = document.createElement('span');
      suffixSpan.className = 'kcl-metric-suffix';
      suffixSpan.textContent = suffix;
      valueEl.appendChild(suffixSpan);
    }

    container.appendChild(valueEl);

    // Trend
    if (trend && delta != null) {
      const trendEl = document.createElement('div');
      trendEl.className = `kcl-metric-trend kcl-metric-trend--${trend}`;
      trendEl.setAttribute('aria-label', `${trend} ${Math.abs(delta)}%`);

      let iconName = 'minus';
      if (trend === 'up') iconName = 'trending-up';
      else if (trend === 'down') iconName = 'trending-down';

      const svg = getIconSvg(iconName, 16, 2);
      if (svg) {
        const iconSpan = document.createElement('span');
        iconSpan.innerHTML = svg;
        trendEl.appendChild(iconSpan);
      }

      const deltaSpan = document.createElement('span');
      const sign = delta >= 0 ? '+' : '';
      deltaSpan.textContent = `${sign}${delta}%`;
      trendEl.appendChild(deltaSpan);

      container.appendChild(trendEl);
    }

    this.appendChild(container);

    // Counting animation
    if (shouldAnimate && value !== 0) {
      this.animateCount(numberSpan, value, format);
    }
  }

  private animateCount(el: HTMLSpanElement, target: number, format: string): void {
    cancelAnimationFrame(this._animFrameId);
    const duration = 800;
    const start = performance.now();

    const step = (now: number): void => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      const current = target * eased;
      el.textContent = formatNumber(current, format, '', '');
      if (progress < 1) {
        this._animFrameId = requestAnimationFrame(step);
      } else {
        el.textContent = formatNumber(target, format, '', '');
      }
    };

    this._animFrameId = requestAnimationFrame(step);
  }

  protected override onDisconnect(): void {
    cancelAnimationFrame(this._animFrameId);
  }
}

customElements.define('kcl-metric', KCLMetric);
