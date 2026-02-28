/* === KCL Selection Manager — Edit Mode Selection Bridge (Phase 6 — F1 + F3) === */
/*
 * Runs INSIDE the sandboxed iframe. Manages:
 * - Click/hover handlers on KCL elements for selection feedback
 * - postMessage bridge to communicate selection and property updates with parent
 * - Visual feedback (outlines, component label badges)
 * - Property update routing (attribute vs data-bound)
 * - Inline text editing on kcl-text elements (F3)
 */

import { isKCLElement, inspectElement } from './inspector.ts';
import type { KCLBaseElement } from './base.ts';
import type {
  KCLPropertyUpdateMessage,
  KCLHighlightMessage,
  KCLRequestBoundsMessage,
  KCLApplyStyleMessage,
  ElementBounds,
} from './types.ts';

// --- State ---

let _active = false;
let _selectedElement: KCLBaseElement | null = null;
let _labelEl: HTMLDivElement | null = null;

// --- Inline editing state (F3) ---

let _inlineEditingElement: KCLBaseElement | null = null;
let _inlineEditingInner: HTMLElement | null = null;
let _originalContent: string = '';
let _toolbarEl: HTMLDivElement | null = null;

// --- Cleanup registries ---

const _listeners: Array<{ target: EventTarget; event: string; handler: EventListener }> = [];

function addListener(target: EventTarget, event: string, handler: EventListener): void {
  target.addEventListener(event, handler);
  _listeners.push({ target, event, handler });
}

function removeAllListeners(): void {
  for (const { target, event, handler } of _listeners) {
    target.removeEventListener(event, handler);
  }
  _listeners.length = 0;
}

// --- MC2: Bounds Helpers ---

/** Compute an element's bounding rect relative to .kcl-slide-container */
function getElementBounds(el: HTMLElement): ElementBounds {
  const container = document.querySelector('.kcl-slide-container');
  if (!container) return { left: 0, top: 0, width: 0, height: 0 };

  const containerRect = container.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();

  return {
    left: elRect.left - containerRect.left,
    top: elRect.top - containerRect.top,
    width: elRect.width,
    height: elRect.height,
  };
}

/** Check if an element has position: absolute or fixed */
function isAbsolutelyPositioned(el: HTMLElement): boolean {
  const pos = window.getComputedStyle(el).position;
  return pos === 'absolute' || pos === 'fixed';
}

// --- Visual Feedback ---

function clearHoverOutline(el: Element): void {
  el.classList.remove('kcl-hover-outline');
}

function clearSelection(): void {
  if (_selectedElement) {
    _selectedElement.classList.remove('kcl-selected-outline');
    _selectedElement = null;
  }
  if (_labelEl) {
    _labelEl.remove();
    _labelEl = null;
  }
}

function showSelectionLabel(el: KCLBaseElement): void {
  if (_labelEl) {
    _labelEl.remove();
  }
  _labelEl = document.createElement('div');
  _labelEl.className = 'kcl-component-label';
  _labelEl.textContent = el.tagName.toLowerCase();
  // Position relative to the selected element
  el.style.position = el.style.position || 'relative';
  el.appendChild(_labelEl);
}

function selectElement(el: KCLBaseElement): void {
  clearSelection();
  _selectedElement = el;
  el.classList.add('kcl-selected-outline');
  showSelectionLabel(el);

  // Inspect and send schema + bounds to parent
  const schema = inspectElement(el);
  window.parent.postMessage({
    type: 'kcl:element-selected',
    elementId: schema.elementId,
    component: schema.component,
    schema,
    bounds: getElementBounds(el),
    isAbsolute: isAbsolutelyPositioned(el),
  }, '*');
}

function deselectElement(): void {
  if (_selectedElement) {
    clearSelection();
    window.parent.postMessage({ type: 'kcl:element-deselected' }, '*');
  }
}

// --- Event Handlers ---

function findClosestKCLElement(target: EventTarget | null): KCLBaseElement | null {
  if (!(target instanceof Element)) return null;
  let el: Element | null = target;
  while (el) {
    if (isKCLElement(el)) return el;
    el = el.parentElement;
  }
  return null;
}

function handleClick(event: Event): void {
  if (!_active) return;

  // If inline editing is active, check for click-away to confirm
  if (_inlineEditingElement && _inlineEditingInner) {
    const target = event.target as Node;
    // Clicks on the toolbar or the editing element should not confirm
    if (_toolbarEl && _toolbarEl.contains(target)) return;
    if (_inlineEditingInner.contains(target) || _inlineEditingInner === target) return;
    if (_inlineEditingElement.contains(target)) return;

    // Click outside — confirm edit
    event.stopPropagation();
    event.preventDefault();
    confirmInlineEdit();
    return;
  }

  const kcl = findClosestKCLElement(event.target);
  if (kcl) {
    event.stopPropagation();
    event.preventDefault();
    selectElement(kcl);
  } else {
    deselectElement();
  }
}

function handleMouseOver(event: Event): void {
  if (!_active || _inlineEditingElement) return;
  const kcl = findClosestKCLElement(event.target);
  if (kcl && kcl !== _selectedElement) {
    kcl.classList.add('kcl-hover-outline');
  }
}

function handleMouseOut(event: Event): void {
  if (!_active || _inlineEditingElement) return;
  const kcl = findClosestKCLElement(event.target);
  if (kcl) {
    clearHoverOutline(kcl);
  }
}

// --- Inline Text Editing (F3) ---

/** Find the inner text element of a kcl-text component (h1–h6, p, span) */
function findInnerTextElement(kclText: KCLBaseElement): HTMLElement | null {
  // kcl-text renders an h1–h6, p, or span as its first child element
  const firstChild = kclText.querySelector('h1, h2, h3, h4, h5, h6, p, span');
  return firstChild as HTMLElement | null;
}

function handleDoubleClick(event: Event): void {
  if (!_active) return;
  // Don't start a new inline edit while one is active
  if (_inlineEditingElement) return;

  const kcl = findClosestKCLElement(event.target);
  if (!kcl) return;

  // Only kcl-text elements support inline editing
  if (kcl.tagName.toLowerCase() !== 'kcl-text') return;

  event.stopPropagation();
  event.preventDefault();

  startInlineEdit(kcl);
}

function startInlineEdit(kclEl: KCLBaseElement): void {
  const innerEl = findInnerTextElement(kclEl);
  if (!innerEl) return;

  // Store state
  _inlineEditingElement = kclEl;
  _inlineEditingInner = innerEl;
  _originalContent = innerEl.innerHTML;

  // Activate contenteditable
  innerEl.setAttribute('contenteditable', 'true');
  innerEl.classList.add('kcl-inline-editing');

  // Show mini formatting toolbar
  showInlineToolbar(kclEl, innerEl);

  // Focus the text element
  innerEl.focus();

  // Select all text for easy replacement
  const sel = window.getSelection();
  if (sel) {
    const range = document.createRange();
    range.selectNodeContents(innerEl);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Notify parent
  window.parent.postMessage({
    type: 'kcl:inline-edit-start',
    elementId: kclEl.id || '',
  }, '*');
}

function confirmInlineEdit(): void {
  if (!_inlineEditingInner || !_inlineEditingElement) return;

  const newContent = _inlineEditingInner.innerHTML;
  const elementId = _inlineEditingElement.id || '';

  // Clean up editing state
  cleanupInlineEdit();

  // Notify parent with new content
  window.parent.postMessage({
    type: 'kcl:inline-edit-complete',
    elementId,
    newContent,
  }, '*');
}

function cancelInlineEdit(): void {
  if (!_inlineEditingInner || !_inlineEditingElement) return;

  const elementId = _inlineEditingElement.id || '';

  // Restore original content
  _inlineEditingInner.innerHTML = _originalContent;

  // Clean up editing state
  cleanupInlineEdit();

  // Notify parent
  window.parent.postMessage({
    type: 'kcl:inline-edit-cancel',
    elementId,
  }, '*');
}

function cleanupInlineEdit(): void {
  if (_inlineEditingInner) {
    _inlineEditingInner.removeAttribute('contenteditable');
    _inlineEditingInner.classList.remove('kcl-inline-editing');
  }

  removeInlineToolbar();

  _inlineEditingElement = null;
  _inlineEditingInner = null;
  _originalContent = '';
}

function handleInlineKeydown(event: Event): void {
  if (!_inlineEditingElement) return;

  const e = event as KeyboardEvent;

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    confirmInlineEdit();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    cancelInlineEdit();
  }
}

// --- Mini Formatting Toolbar (F3) ---

function showInlineToolbar(kclEl: KCLBaseElement, innerEl: HTMLElement): void {
  removeInlineToolbar();

  const toolbar = document.createElement('div');
  toolbar.className = 'kcl-inline-toolbar';

  // Bold button
  const boldBtn = createToolbarButton('B', 'Bold', () => {
    document.execCommand('bold', false);
    innerEl.focus();
    updateToolbarState(toolbar);
  });
  boldBtn.style.fontWeight = '800';
  toolbar.appendChild(boldBtn);

  // Italic button
  const italicBtn = createToolbarButton('I', 'Italic', () => {
    document.execCommand('italic', false);
    innerEl.focus();
    updateToolbarState(toolbar);
  });
  italicBtn.style.fontStyle = 'italic';
  toolbar.appendChild(italicBtn);

  // Underline button
  const underlineBtn = createToolbarButton('U', 'Underline', () => {
    document.execCommand('underline', false);
    innerEl.focus();
    updateToolbarState(toolbar);
  });
  underlineBtn.style.textDecoration = 'underline';
  toolbar.appendChild(underlineBtn);

  // Separator
  const sep1 = document.createElement('div');
  sep1.className = 'kcl-inline-toolbar-sep';
  toolbar.appendChild(sep1);

  // Color picker
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = '#ffffff';
  colorInput.title = 'Text color';
  colorInput.addEventListener('input', () => {
    document.execCommand('foreColor', false, colorInput.value);
    innerEl.focus();
  });
  toolbar.appendChild(colorInput);

  // Separator
  const sep2 = document.createElement('div');
  sep2.className = 'kcl-inline-toolbar-sep';
  toolbar.appendChild(sep2);

  // Font size selector
  const sizeSelect = document.createElement('select');
  sizeSelect.title = 'Font size';
  const sizes = [12, 14, 16, 18, 20, 24, 32, 40, 48, 64];
  for (const size of sizes) {
    const opt = document.createElement('option');
    opt.value = String(size);
    opt.textContent = `${size}px`;
    sizeSelect.appendChild(opt);
  }
  // Try to get current font size
  const computedSize = Math.round(parseFloat(window.getComputedStyle(innerEl).fontSize));
  const closestSize = sizes.reduce((prev, curr) =>
    Math.abs(curr - computedSize) < Math.abs(prev - computedSize) ? curr : prev
  );
  sizeSelect.value = String(closestSize);
  sizeSelect.addEventListener('change', () => {
    // execCommand fontSize uses 1-7 scale, use CSS instead
    document.execCommand('fontSize', false, '7');
    // Replace the font size with actual pixel value
    const fontElements = innerEl.querySelectorAll('font[size="7"]');
    fontElements.forEach(fe => {
      (fe as HTMLElement).removeAttribute('size');
      (fe as HTMLElement).style.fontSize = `${sizeSelect.value}px`;
    });
    innerEl.focus();
  });
  toolbar.appendChild(sizeSelect);

  // Position toolbar above the element
  document.body.appendChild(toolbar);
  positionToolbar(toolbar, kclEl);

  _toolbarEl = toolbar;

  // Listen for selection changes to update active states
  document.addEventListener('selectionchange', () => updateToolbarState(toolbar));
}

function createToolbarButton(
  label: string,
  title: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.title = title;
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault(); // Prevent losing selection
    onClick();
  });
  return btn;
}

function positionToolbar(toolbar: HTMLDivElement, refEl: Element): void {
  const rect = refEl.getBoundingClientRect();
  const toolbarHeight = 40; // Approximate height
  const gap = 8;

  let top = rect.top - toolbarHeight - gap;
  let left = rect.left;

  // If not enough room above, position below
  if (top < 0) {
    top = rect.bottom + gap;
  }

  // Clamp to viewport
  const maxLeft = window.innerWidth - 260; // Approximate toolbar width
  if (left > maxLeft) left = maxLeft;
  if (left < 4) left = 4;

  toolbar.style.top = `${top}px`;
  toolbar.style.left = `${left}px`;
}

function updateToolbarState(toolbar: HTMLDivElement): void {
  const buttons = toolbar.querySelectorAll('button');
  const commands = ['bold', 'italic', 'underline'];
  buttons.forEach((btn, i) => {
    if (i < commands.length) {
      try {
        const active = document.queryCommandState(commands[i]);
        btn.classList.toggle('kcl-toolbar-active', active);
      } catch {
        // queryCommandState can throw in some edge cases
      }
    }
  });
}

function removeInlineToolbar(): void {
  if (_toolbarEl) {
    _toolbarEl.remove();
    _toolbarEl = null;
  }
}

// --- Property Update Handling ---

function handlePropertyUpdate(msg: KCLPropertyUpdateMessage): void {
  const el = msg.elementId
    ? document.getElementById(msg.elementId)
    : null;
  if (!el || !isKCLElement(el)) return;

  // Look up schema to determine attribute vs data-bound
  const ctor = el.constructor as typeof KCLBaseElement;
  const propSchema = ctor.editableProperties.find(p => p.name === msg.property);
  if (!propSchema) return;

  if (propSchema.isAttribute) {
    // Attribute-based property
    if (propSchema.type === 'boolean') {
      if (msg.value) {
        el.setAttribute(msg.property, '');
      } else {
        el.removeAttribute(msg.property);
      }
    } else {
      el.setAttribute(msg.property, String(msg.value ?? ''));
    }
  } else {
    // Data-bound property — merge into existing data and rebind
    const currentData = (el as KCLBaseElement & { data: unknown }).data as Record<string, unknown> | undefined;
    const updated = { ...(currentData ?? {}), [msg.property]: msg.value };
    el.bindData(updated);
  }
}

function handleHighlight(msg: KCLHighlightMessage): void {
  const el = msg.elementId
    ? document.getElementById(msg.elementId)
    : null;
  if (el && isKCLElement(el)) {
    selectElement(el);
  }
}

/** Handle kcl:start-inline-edit from parent (F3) */
function handleStartInlineEdit(elementId: string): void {
  if (_inlineEditingElement) return; // Already editing
  const el = elementId ? document.getElementById(elementId) : null;
  if (!el || !isKCLElement(el)) return;
  if (el.tagName.toLowerCase() !== 'kcl-text') return;

  // Select the element first
  selectElement(el);
  // Then start inline edit
  startInlineEdit(el);
}

// --- MC2: Drag/Resize Message Handlers ---

/** Handle kcl:request-bounds — return bounds for requested element IDs */
function handleRequestBounds(msg: KCLRequestBoundsMessage): void {
  const results = msg.elementIds.map(id => {
    const el = document.getElementById(id);
    return {
      elementId: id,
      bounds: el ? getElementBounds(el) : { left: 0, top: 0, width: 0, height: 0 },
      isAbsolute: el ? isAbsolutelyPositioned(el) : false,
    };
  });
  window.parent.postMessage({ type: 'kcl:element-bounds', elements: results }, '*');
}

/** Handle kcl:apply-style — live style update during drag/resize (no code change) */
function handleApplyStyle(msg: KCLApplyStyleMessage): void {
  const el = msg.elementId ? document.getElementById(msg.elementId) : null;
  if (!el) return;
  for (const [prop, value] of Object.entries(msg.style)) {
    el.style.setProperty(prop, value);
  }
}

/** Handle kcl:request-all-bounds — return bounds for all ID'd children of slide container */
function handleRequestAllBounds(): void {
  const container = document.querySelector('.kcl-slide-container');
  if (!container) {
    window.parent.postMessage({ type: 'kcl:all-bounds', elements: [] }, '*');
    return;
  }

  const children = Array.from(container.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && !!el.id,
  );

  const elements = children.map(el => ({
    elementId: el.id,
    component: el.tagName.toLowerCase(),
    bounds: getElementBounds(el),
    isAbsolute: isAbsolutelyPositioned(el),
    zIndex: parseInt(window.getComputedStyle(el).zIndex) || 0, // MC4: z-index for layer ordering
  }));

  window.parent.postMessage({ type: 'kcl:all-bounds', elements }, '*');
}

// --- Parent Message Listener ---

function handleParentMessage(event: MessageEvent): void {
  const data = event.data;
  if (!data || typeof data.type !== 'string') return;

  switch (data.type) {
    case 'kcl:update-property':
      handlePropertyUpdate(data as KCLPropertyUpdateMessage);
      break;
    case 'kcl:highlight-element':
      handleHighlight(data as KCLHighlightMessage);
      break;
    case 'kcl:init-edit-mode':
      initEditMode();
      break;
    case 'kcl:exit-edit-mode':
      exitEditMode();
      break;
    case 'kcl:start-inline-edit':
      handleStartInlineEdit(data.elementId as string);
      break;
    case 'kcl:request-bounds':
      handleRequestBounds(data as KCLRequestBoundsMessage);
      break;
    case 'kcl:apply-style':
      handleApplyStyle(data as KCLApplyStyleMessage);
      break;
    case 'kcl:request-all-bounds':
      handleRequestAllBounds();
      break;
  }
}

// --- Public API ---

export function initEditMode(): void {
  if (_active) return;
  _active = true;

  // Install click/hover handlers on document (delegation)
  addListener(document, 'click', handleClick);
  addListener(document, 'mouseover', handleMouseOver);
  addListener(document, 'mouseout', handleMouseOut);
  addListener(document, 'dblclick', handleDoubleClick);
  addListener(document, 'keydown', handleInlineKeydown);
}

export function exitEditMode(): void {
  if (!_active) return;

  // Cancel any active inline edit before exiting
  if (_inlineEditingElement) {
    cancelInlineEdit();
  }

  _active = false;

  // Clear all visual state
  deselectElement();
  // Remove hover outlines from any elements
  document.querySelectorAll('.kcl-hover-outline').forEach(el => {
    el.classList.remove('kcl-hover-outline');
  });

  removeAllListeners();
}

/** Install the parent message listener. Called once from kcl.ts init. */
export function installEditModeListener(): void {
  window.addEventListener('message', handleParentMessage);
}
