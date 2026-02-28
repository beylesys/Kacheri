/* === KCL Base Element v1.0.0 === */

import type { PropertySchema } from './types.ts';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export abstract class KCLBaseElement extends HTMLElement {
  private _renderPending = false;
  private _connected = false;
  private _boundData: unknown = undefined;
  private _initialContent: string | null = null;

  static get editableProperties(): PropertySchema[] {
    return [];
  }

  /** Read current values for all editable properties (Phase 6 — F1) */
  getCurrentValues(): Record<string, unknown> {
    const schema = (this.constructor as typeof KCLBaseElement).editableProperties;
    const values: Record<string, unknown> = {};
    for (const prop of schema) {
      if (prop.isAttribute) {
        const raw = this.getAttribute(prop.name);
        if (prop.type === 'boolean') {
          values[prop.name] = this.hasAttribute(prop.name);
        } else if (prop.type === 'number') {
          values[prop.name] = raw !== null ? Number(raw) : prop.defaultValue ?? null;
        } else {
          values[prop.name] = raw ?? prop.defaultValue ?? null;
        }
      } else {
        const data = this._boundData as Record<string, unknown> | undefined;
        values[prop.name] = data?.[prop.name] ?? prop.defaultValue ?? null;
      }
    }
    return values;
  }

  // --- Lifecycle ---

  connectedCallback(): void {
    this._connected = true;
    // NOTE: Do NOT capture innerHTML here — during HTML parsing,
    // connectedCallback fires BEFORE child text nodes are added.
    // Content is captured lazily on first access via the initialContent getter.

    // Self-bind: check if a data script already exists for this element
    if (this.id && this._boundData === undefined) {
      const script = document.querySelector(
        `script[data-for="${CSS.escape(this.id)}"][type="application/json"]`,
      );
      if (script) {
        try {
          this._boundData = JSON.parse(script.textContent ?? '');
        } catch {
          // Handled in render via error overlay
        }
      }
    }
    this.scheduleRender();
  }

  disconnectedCallback(): void {
    this._connected = false;
    this.onDisconnect();
  }

  attributeChangedCallback(
    _name: string,
    _oldVal: string | null,
    _newVal: string | null,
  ): void {
    if (this._connected) {
      this.scheduleRender();
    }
  }

  // --- Data Binding ---

  bindData(data: unknown): void {
    this._boundData = data;
    if (this._connected) {
      this.scheduleRender();
    }
  }

  protected get data(): unknown {
    return this._boundData;
  }

  protected get initialContent(): string {
    // Lazy capture: innerHTML is read on first access (at render time),
    // when all children are guaranteed to be in the DOM.
    if (this._initialContent === null) {
      this._initialContent = this.innerHTML;
    }
    return this._initialContent;
  }

  // --- Render Scheduling (microtask coalescing) ---

  protected scheduleRender(): void {
    if (this._renderPending) return;
    this._renderPending = true;

    const doRender = () => {
      this._renderPending = false;
      if (!this._connected) return;
      try {
        this.render();
      } catch (err) {
        this.showError(err as Error);
      }
    };

    // During HTML parsing, connectedCallback fires BEFORE the parser adds
    // child text nodes.  queueMicrotask runs at the next microtask checkpoint
    // (immediately after connectedCallback returns), which is still too early.
    // setTimeout(0) defers to the next event-loop task — by then the parser
    // has finished and all child content is in the DOM.
    if (document.readyState === 'loading') {
      setTimeout(doRender, 0);
    } else {
      queueMicrotask(doRender);
    }
  }

  protected abstract render(): void;

  protected onDisconnect(): void {
    // Override in subclass if cleanup needed
  }

  // --- Error Handling ---

  protected showError(err: Error): void {
    console.error(`[KCL] Error in <${this.tagName.toLowerCase()}>:`, err);
    this.innerHTML = `
      <div class="kcl-error-overlay" role="alert" data-kcl-error="true">
        <div class="kcl-error-icon">&#9888;</div>
        <div class="kcl-error-title">Rendering error</div>
        <div class="kcl-error-message">${escapeHtml(err.message)}</div>
      </div>`;
  }

  // --- Utilities ---

  protected get prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  protected attr(name: string, fallback = ''): string {
    return this.getAttribute(name) ?? fallback;
  }

  protected numAttr(name: string, fallback = 0): number {
    const val = this.getAttribute(name);
    if (val === null) return fallback;
    const n = Number(val);
    return Number.isNaN(n) ? fallback : n;
  }

  protected boolAttr(name: string): boolean {
    return this.hasAttribute(name);
  }

  /**
   * Ensures a container div exists inside this element.
   * On first call, wraps all existing children into the container.
   * On subsequent calls, returns the existing container.
   */
  protected ensureContainer(className: string): HTMLDivElement {
    let container = this.querySelector(`:scope > .${className}`) as HTMLDivElement | null;
    if (!container) {
      container = document.createElement('div');
      container.className = className;
      // Move existing children into container
      while (this.firstChild) {
        container.appendChild(this.firstChild);
      }
      this.appendChild(container);
    }
    return container;
  }

  /**
   * Build a CSS animation shorthand string from KCL keyframe name.
   * Returns empty string if animation is 'none' or reduced motion is preferred.
   */
  protected buildAnimation(
    type: string,
    duration = 400,
    delay = 0,
    easing = 'var(--kcl-easing-default)',
  ): string {
    if (type === 'none' || this.prefersReducedMotion) return '';
    return `kcl-${type} ${duration}ms ${easing} ${delay}ms both`;
  }
}
