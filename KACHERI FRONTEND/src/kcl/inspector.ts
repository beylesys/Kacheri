/* === KCL Inspector — Runtime Element Inspection (Phase 6 — F1) === */

import type { KCLEditableSchema, EditableProperty } from './types.ts';
import type { KCLBaseElement } from './base.ts';

/** All KCL custom element tag names */
const KCL_TAGS = [
  'kcl-slide', 'kcl-text', 'kcl-layout', 'kcl-image', 'kcl-list',
  'kcl-quote', 'kcl-metric', 'kcl-icon', 'kcl-animate', 'kcl-code',
  'kcl-embed', 'kcl-source', 'kcl-chart', 'kcl-table', 'kcl-timeline',
  'kcl-compare',
] as const;

const KCL_TAG_SET = new Set<string>(KCL_TAGS);

/** Check if an element is a KCL custom element with inspection support */
export function isKCLElement(el: Element): el is KCLBaseElement {
  return KCL_TAG_SET.has(el.tagName.toLowerCase())
    && 'getCurrentValues' in el
    && typeof (el as Record<string, unknown>).getCurrentValues === 'function';
}

/** Build the full editable schema for a KCL element (tag name, id, properties with current values) */
export function inspectElement(el: KCLBaseElement): KCLEditableSchema {
  const ctor = el.constructor as typeof KCLBaseElement;
  const schema = ctor.editableProperties;
  const currentValues = el.getCurrentValues();

  const properties: EditableProperty[] = schema.map(prop => ({
    ...prop,
    currentValue: currentValues[prop.name],
  }));

  return {
    component: el.tagName.toLowerCase(),
    elementId: el.id || '',
    properties,
  };
}

/** Find all KCL elements in the document */
export function findKCLElements(): KCLBaseElement[] {
  const selector = KCL_TAGS.join(',');
  return Array.from(document.querySelectorAll(selector))
    .filter(isKCLElement) as KCLBaseElement[];
}
