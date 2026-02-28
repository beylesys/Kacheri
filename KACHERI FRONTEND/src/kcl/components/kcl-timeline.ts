/* === kcl-timeline — Timeline v1.0.0 === */

import { KCLBaseElement } from '../base.ts';
import type { PropertySchema, TimelineData } from '../types.ts';
import { getIconSvg } from '../icons.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

export class KCLTimeline extends KCLBaseElement {
  static get observedAttributes(): string[] {
    return ['direction', 'connector-style', 'animate'];
  }

  static override get editableProperties(): PropertySchema[] {
    return [
      { name: 'events', label: 'Events', type: 'json', isAttribute: false, group: 'content' },
      { name: 'direction', label: 'Direction', type: 'select', options: ['vertical', 'horizontal'], isAttribute: true, group: 'layout', defaultValue: 'vertical' },
      { name: 'connector-style', label: 'Connector Style', type: 'select', options: ['solid', 'dashed', 'dotted'], isAttribute: true, group: 'appearance', defaultValue: 'solid' },
      { name: 'animate', label: 'Animate', type: 'boolean', isAttribute: true, group: 'animation', defaultValue: true },
    ];
  }

  protected render(): void {
    const direction = this.attr('direction', 'vertical');
    const connectorStyle = this.attr('connector-style', 'solid');
    const shouldAnimate = this.boolAttr('animate') && !this.prefersReducedMotion;
    const data = this.data as TimelineData | undefined;

    if (!data?.events?.length) {
      this.innerHTML = '<div class="kcl-timeline-empty">No events</div>';
      return;
    }

    this.innerHTML = '';

    const container = document.createElement('div');
    container.className = `kcl-timeline kcl-timeline--${direction}`;
    container.setAttribute('role', 'list');
    container.setAttribute('aria-label', 'Timeline');

    if (direction === 'horizontal') {
      this.renderHorizontal(container, data, connectorStyle, shouldAnimate);
    } else {
      this.renderVertical(container, data, connectorStyle, shouldAnimate);
    }

    this.appendChild(container);
  }

  private renderVertical(
    container: HTMLElement,
    data: TimelineData,
    connectorStyle: string,
    animate: boolean,
  ): void {
    // SVG connector layer
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.className.baseVal = 'kcl-timeline-connector';
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    container.appendChild(svg);

    const dashArray = this.getDashArray(connectorStyle);

    for (let i = 0; i < data.events.length; i++) {
      const event = data.events[i];
      const eventEl = document.createElement('div');
      eventEl.className = 'kcl-timeline-event';
      eventEl.setAttribute('role', 'listitem');

      if (animate) {
        const anim = this.buildAnimation('slide-up', 400, i * 150);
        if (anim) eventEl.style.animation = anim;
      }

      // Node
      const node = document.createElement('div');
      node.className = 'kcl-timeline-node';

      const dot = document.createElement('div');
      dot.className = 'kcl-timeline-dot';
      if (event.color) dot.style.backgroundColor = event.color;
      dot.setAttribute('aria-hidden', 'true');

      if (event.icon) {
        const iconSvg = getIconSvg(event.icon, 10, 2);
        if (iconSvg) dot.innerHTML = iconSvg;
      }

      node.appendChild(dot);
      eventEl.appendChild(node);

      // Content
      const content = document.createElement('div');
      content.className = 'kcl-timeline-content';

      if (event.date) {
        const dateEl = document.createElement('div');
        dateEl.className = 'kcl-timeline-date';
        // Try to use <time> element
        const time = document.createElement('time');
        time.textContent = event.date;
        time.setAttribute('datetime', event.date);
        dateEl.appendChild(time);
        content.appendChild(dateEl);
      }

      const titleEl = document.createElement('div');
      titleEl.className = 'kcl-timeline-title';
      titleEl.textContent = event.title;
      content.appendChild(titleEl);

      if (event.description) {
        const descEl = document.createElement('div');
        descEl.className = 'kcl-timeline-desc';
        descEl.textContent = event.description;
        content.appendChild(descEl);
      }

      eventEl.appendChild(content);
      container.appendChild(eventEl);

      // Connector line (between events, not after last)
      if (i < data.events.length - 1) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('class', 'kcl-timeline-line');
        line.setAttribute('stroke', event.color || 'var(--kcl-border, #e2e8f0)');
        line.setAttribute('stroke-width', '2');
        if (dashArray) line.setAttribute('stroke-dasharray', dashArray);

        // Position is approximate — SVG covers full container area.
        // Vertical: lines run from dot to dot, positioned using percentage-based offsets.
        // Since precise positioning requires layout measurement (not available in SSR/test),
        // use CSS-based connectors as fallback.
        line.setAttribute('data-connector', String(i));
        svg.appendChild(line);
      }
    }

    // CSS-based fallback connectors (more reliable than SVG positioning without layout)
    this.addCssConnectors(container, data.events.length, connectorStyle, animate);
  }

  private renderHorizontal(
    container: HTMLElement,
    data: TimelineData,
    connectorStyle: string,
    animate: boolean,
  ): void {
    for (let i = 0; i < data.events.length; i++) {
      const event = data.events[i];
      const eventEl = document.createElement('div');
      eventEl.className = 'kcl-timeline-event';
      eventEl.setAttribute('role', 'listitem');
      eventEl.style.flex = '1';
      eventEl.style.textAlign = 'center';
      eventEl.style.position = 'relative';

      if (animate) {
        const anim = this.buildAnimation('slide-up', 400, i * 150);
        if (anim) eventEl.style.animation = anim;
      }

      // Node
      const node = document.createElement('div');
      node.className = 'kcl-timeline-node';
      node.style.position = 'relative';
      node.style.display = 'flex';
      node.style.justifyContent = 'center';
      node.style.marginBottom = '12px';

      const dot = document.createElement('div');
      dot.className = 'kcl-timeline-dot';
      if (event.color) dot.style.backgroundColor = event.color;
      dot.setAttribute('aria-hidden', 'true');

      if (event.icon) {
        const iconSvg = getIconSvg(event.icon, 10, 2);
        if (iconSvg) dot.innerHTML = iconSvg;
      }

      node.appendChild(dot);

      // Horizontal connector (between dots)
      if (i < data.events.length - 1) {
        const connector = document.createElement('div');
        connector.className = 'kcl-timeline-h-connector';
        connector.style.position = 'absolute';
        connector.style.top = '50%';
        connector.style.left = '50%';
        connector.style.width = '100%';
        connector.style.height = '2px';
        connector.style.backgroundColor = event.color || 'var(--kcl-border, #e2e8f0)';
        connector.style.transform = 'translateY(-50%)';

        if (connectorStyle === 'dashed') {
          connector.style.backgroundImage = `repeating-linear-gradient(to right, ${event.color || '#e2e8f0'} 0, ${event.color || '#e2e8f0'} 8px, transparent 8px, transparent 12px)`;
          connector.style.backgroundColor = 'transparent';
        } else if (connectorStyle === 'dotted') {
          connector.style.backgroundImage = `repeating-linear-gradient(to right, ${event.color || '#e2e8f0'} 0, ${event.color || '#e2e8f0'} 2px, transparent 2px, transparent 6px)`;
          connector.style.backgroundColor = 'transparent';
        }

        if (animate) {
          connector.style.animation = `kcl-fade-in 400ms var(--kcl-easing-out, cubic-bezier(0,0,0.2,1)) ${i * 150 + 200}ms both`;
        }

        node.appendChild(connector);
      }

      eventEl.appendChild(node);

      // Content
      const content = document.createElement('div');
      content.className = 'kcl-timeline-content';

      if (event.date) {
        const dateEl = document.createElement('div');
        dateEl.className = 'kcl-timeline-date';
        const time = document.createElement('time');
        time.textContent = event.date;
        time.setAttribute('datetime', event.date);
        dateEl.appendChild(time);
        content.appendChild(dateEl);
      }

      const titleEl = document.createElement('div');
      titleEl.className = 'kcl-timeline-title';
      titleEl.textContent = event.title;
      content.appendChild(titleEl);

      if (event.description) {
        const descEl = document.createElement('div');
        descEl.className = 'kcl-timeline-desc';
        descEl.textContent = event.description;
        content.appendChild(descEl);
      }

      eventEl.appendChild(content);
      container.appendChild(eventEl);
    }
  }

  private addCssConnectors(
    container: HTMLElement,
    eventCount: number,
    connectorStyle: string,
    animate: boolean,
  ): void {
    // Add a pseudo-connector line via a div that runs alongside the dots
    if (eventCount < 2) return;

    const line = document.createElement('div');
    line.className = 'kcl-timeline-v-connector';
    line.style.position = 'absolute';
    line.style.left = 'calc(var(--kcl-space-7, 32px) * -1 + 6px)';
    line.style.top = '28px';
    line.style.bottom = '28px';
    line.style.width = '2px';
    line.style.backgroundColor = 'var(--kcl-border, #e2e8f0)';

    if (connectorStyle === 'dashed') {
      line.style.backgroundImage = 'repeating-linear-gradient(to bottom, var(--kcl-border, #e2e8f0) 0, var(--kcl-border, #e2e8f0) 8px, transparent 8px, transparent 12px)';
      line.style.backgroundColor = 'transparent';
    } else if (connectorStyle === 'dotted') {
      line.style.backgroundImage = 'repeating-linear-gradient(to bottom, var(--kcl-border, #e2e8f0) 0, var(--kcl-border, #e2e8f0) 2px, transparent 2px, transparent 6px)';
      line.style.backgroundColor = 'transparent';
    }

    if (animate) {
      line.style.animation = `kcl-fade-in 600ms var(--kcl-easing-out, cubic-bezier(0,0,0.2,1)) 0ms both`;
    }

    container.appendChild(line);
  }

  private getDashArray(style: string): string {
    switch (style) {
      case 'dashed': return '8 4';
      case 'dotted': return '2 4';
      default: return '';
    }
  }
}

customElements.define('kcl-timeline', KCLTimeline);
