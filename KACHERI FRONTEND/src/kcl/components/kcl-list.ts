/* === kcl-list — Animated List v1.0.0 === */

import { KCLBaseElement } from '../base.ts';
import type { PropertySchema, ListData, ListItem } from '../types.ts';
import { getIconSvg } from '../icons.ts';

export class KCLList extends KCLBaseElement {
  static get observedAttributes(): string[] {
    return ['type', 'animate', 'stagger-delay'];
  }

  static override get editableProperties(): PropertySchema[] {
    return [
      { name: 'items', label: 'List Items', type: 'json', isAttribute: false, group: 'content' },
      { name: 'type', label: 'List Style', type: 'select', options: ['bullet', 'number', 'icon', 'none'], isAttribute: true, group: 'appearance', defaultValue: 'bullet' },
      { name: 'animate', label: 'Animation', type: 'select', options: ['none', 'fade', 'slide-up', 'slide-left', 'scale'], isAttribute: true, group: 'animation', defaultValue: 'none' },
      { name: 'stagger-delay', label: 'Stagger Delay (ms)', type: 'number', min: 0, max: 1000, step: 50, isAttribute: true, group: 'animation', defaultValue: 100 },
    ];
  }

  protected render(): void {
    const listType = this.attr('type', 'bullet');
    const animate = this.attr('animate', 'none');
    const staggerDelay = this.numAttr('stagger-delay', 100);
    const data = this.data as ListData | undefined;

    if (!data?.items?.length) {
      // If no data, keep initial content
      if (!this.data) return;
      this.innerHTML = '<div class="kcl-list-empty" style="color: var(--kcl-text-muted); font-size: var(--kcl-font-size-sm);">No items</div>';
      return;
    }

    const tag = listType === 'number' ? 'ol' : 'ul';
    const list = document.createElement(tag);
    list.className = `kcl-list-container${listType === 'none' ? ' kcl-list-container--none' : ''}`;
    list.setAttribute('role', 'list');

    this.renderItems(list, data.items, listType, animate, staggerDelay, 0);

    this.innerHTML = '';
    this.appendChild(list);
  }

  private renderItems(
    parent: HTMLElement,
    items: ListItem[],
    listType: string,
    animate: string,
    staggerDelay: number,
    startIndex: number,
  ): void {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const li = document.createElement('li');
      li.className = 'kcl-list-item';
      li.setAttribute('role', 'listitem');

      // Animation
      const animName = animate === 'fade' ? 'fade-in' : animate;
      const anim = this.buildAnimation(animName, 400, (startIndex + i) * staggerDelay);
      if (anim) {
        li.style.animation = anim;
      }

      // Marker
      const marker = document.createElement('span');
      marker.className = 'kcl-list-marker';
      marker.setAttribute('aria-hidden', 'true');

      if (listType === 'bullet') {
        marker.textContent = '\u2022';
      } else if (listType === 'number') {
        marker.textContent = `${startIndex + i + 1}.`;
      } else if (listType === 'icon' && item.icon) {
        const svg = getIconSvg(item.icon, 16, 2);
        marker.innerHTML = svg ?? '\u2022';
      } else if (listType !== 'none') {
        marker.textContent = '\u2022';
      }

      if (listType !== 'none') {
        li.appendChild(marker);
      }

      // Text
      const text = document.createElement('span');
      text.className = 'kcl-list-text';
      text.textContent = item.text;
      li.appendChild(text);

      parent.appendChild(li);

      // Nested items
      if (item.items?.length) {
        const nested = document.createElement('ul');
        nested.className = 'kcl-list-nested';
        this.renderItems(nested, item.items, listType, animate, staggerDelay, startIndex + i + 1);
        li.appendChild(nested);
      }
    }
  }
}

customElements.define('kcl-list', KCLList);
