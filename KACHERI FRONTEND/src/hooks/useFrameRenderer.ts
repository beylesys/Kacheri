// KACHERI FRONTEND/src/hooks/useFrameRenderer.ts
// Hook managing sandboxed iframe lifecycle for Design Studio frame rendering.
// Builds srcdoc HTML with KCL injection, handles postMessage communication for
// error reporting and render-complete signals.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 4, Slice C3

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import type { KCLEditableSchema, ElementBounds } from '../kcl/types.ts';

/**
 * Cache-buster token generated once per page load.
 * KCL assets are served with immutable cache headers (versioned URL strategy).
 * During development the version string stays "1.0.0" while the bundle changes,
 * so we append ?_cb=<timestamp> to force the browser to fetch the fresh file.
 */
const KCL_CACHE_BUSTER = Date.now();

/**
 * Render modes for Design Studio frames (E2 — Performance Optimization).
 * - 'live': Full iframe with KCL bundle — used for the active frame in viewport.
 * - 'thumbnail': Minimal HTML shell with no KCL — used for rail thumbnails (no iframe).
 * - 'presentation': Full iframe — used by PresentationMode (separate pipeline).
 *
 * Constraint: At most 1–3 live iframes at any time (viewport + Power Mode preview).
 */
export type RenderMode = 'live' | 'thumbnail' | 'presentation';

/** Message types sent from iframe to parent via postMessage */
type FrameMessage =
  | { type: 'kcl:render-complete' }
  | { type: 'kcl:error'; message: string; source?: string; line?: number }
  | { type: 'kcl:csp-violation'; blockedURI: string; violatedDirective: string; originalPolicy: string }
  | { type: 'kcl:element-selected'; elementId: string; component: string; schema: KCLEditableSchema; bounds?: ElementBounds; isAbsolute?: boolean }
  | { type: 'kcl:element-deselected' }
  | { type: 'kcl:inline-edit-start'; elementId: string }
  | { type: 'kcl:inline-edit-complete'; elementId: string; newContent: string }
  | { type: 'kcl:inline-edit-cancel'; elementId: string };

interface UseFrameRendererOptions {
  frameCode: string;
  kclVersion: string;
  /** Render mode — controls KCL loading strategy (E2). Default: 'live'. */
  renderMode?: RenderMode;
  editMode?: boolean;
  /** E7: Effective embed whitelist domains for per-frame CSP and kcl-embed validation. */
  embedWhitelist?: string[];
  onElementSelected?: (elementId: string, component: string, schema: KCLEditableSchema, bounds?: ElementBounds, isAbsolute?: boolean) => void;
  onElementDeselected?: () => void;
  onInlineEditStart?: (elementId: string) => void;
  onInlineEditComplete?: (elementId: string, newContent: string) => void;
  onInlineEditCancel?: (elementId: string) => void;
}

interface UseFrameRendererResult {
  srcdoc: string;
  renderError: string | null;
  isLoading: boolean;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  clearError: () => void;
  sendMessage: (msg: object) => void;
}

/**
 * Detect whether frame code contains `<kcl-embed` elements.
 * Used to determine if CSP should allow external iframe sources (E7).
 */
function frameUsesEmbeds(frameCode: string): boolean {
  return frameCode.indexOf('<kcl-embed') !== -1;
}

/**
 * Build the Content-Security-Policy for a sandboxed frame.
 *
 * CSP directives (per Architecture Blueprint Layer 3 — Frame Isolation):
 * - No network access (connect-src 'none')
 * - No form submissions (form-action 'none')
 * - No nested iframes by default (frame-src 'none')
 * - E7: Per-frame CSP relaxation — when embedDomains provided and frame uses
 *   embeds, frame-src allows those specific domains instead of 'none'
 * - Scripts/styles only from parent origin + inline (KCL components use both)
 * - Images from blob: (canvas/chart renders), data: URIs, and parent origin
 * - Fonts from parent origin (served via /kcl-assets/ proxy)
 */
function buildCsp(origin: string, embedDomains?: string[]): string {
  // E7: Per-frame CSP — only relax frame-src when embed domains are provided
  const frameSrc = embedDomains && embedDomains.length > 0
    ? `frame-src ${embedDomains.map(d => `https://${d}`).join(' ')}`
    : "frame-src 'none'";

  return [
    "default-src 'unsafe-inline'",
    `script-src 'unsafe-inline' ${origin}`,
    `style-src 'unsafe-inline' ${origin}`,
    `img-src blob: data: ${origin}`,
    `font-src ${origin}`,
    "connect-src 'none'",
    "form-action 'none'",
    frameSrc,
  ].join('; ');
}

/**
 * Build the full srcdoc HTML for a sandboxed frame iframe.
 *
 * Important: srcdoc iframes have a `null` origin, so relative URLs like
 * `/kcl/1.0.0/kcl.js` will NOT resolve. We use absolute URLs constructed
 * from window.location.origin so the iframe can fetch KCL assets.
 *
 * E2 — Render modes & lazy KCL loading:
 * - 'thumbnail': Returns minimal HTML with no KCL — used for static previews.
 * - 'live' / 'presentation': Full KCL with non-blocking dynamic script insertion
 *   so the HTML parser isn't blocked while the KCL bundle loads.
 */
export function buildSrcdoc(
  frameCode: string,
  kclVersion: string,
  editMode?: boolean,
  renderMode: RenderMode = 'live',
  embedWhitelist?: string[],
): string {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : '';

  // Thumbnail mode: minimal shell, no KCL, no iframe rendering overhead
  if (renderMode === 'thumbnail') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden;
      background: var(--bg, #1a1a2e); color: var(--text, #e0e0e0); }
  </style>
</head>
<body>${frameCode}</body>
</html>`;
  }

  // E7: Per-frame CSP — only pass embed domains to CSP when frame actually uses embeds
  const hasEmbeds = frameUsesEmbeds(frameCode);
  const cspEmbedDomains = hasEmbeds ? embedWhitelist : undefined;

  // E7: Inject effective whitelist for kcl-embed component runtime validation
  const whitelistInjection = hasEmbeds && embedWhitelist && embedWhitelist.length > 0
    ? `\n    window.__KACHERI_EMBED_WHITELIST__ = ${JSON.stringify(embedWhitelist)};`
    : '';

  // Live / presentation mode: full KCL with lazy (non-parser-blocking) loading
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${buildCsp(origin, cspEmbedDomains)}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    kcl-slide { display: block; width: 100%; height: 100%; overflow: hidden; }
    .kcl-slide-container { height: 100%; }
  </style>
  <script>
    // Error capture — post errors to parent
    window.onerror = function(message, source, lineno) {
      // Ignore benign ResizeObserver warnings (fired by kcl-chart)
      if (String(message).indexOf('ResizeObserver') !== -1) return true;
      try {
        window.parent.postMessage({
          type: 'kcl:error',
          message: String(message),
          source: String(source || ''),
          line: lineno || 0
        }, '${origin}');
      } catch(e) {}
      return true;
    };
    window.addEventListener('unhandledrejection', function(e) {
      try {
        window.parent.postMessage({
          type: 'kcl:error',
          message: 'Unhandled promise rejection: ' + String(e.reason)
        }, '${origin}');
      } catch(ex) {}
    });
    // CSP violation reporting — relay to parent via postMessage
    // (connect-src 'none' prevents using report-uri/report-to directly)
    document.addEventListener('securitypolicyviolation', function(e) {
      try {
        window.parent.postMessage({
          type: 'kcl:csp-violation',
          blockedURI: e.blockedURI || '',
          violatedDirective: e.violatedDirective || '',
          originalPolicy: e.originalPolicy || ''
        }, '${origin}');
      } catch(ex) {}
    });
${whitelistInjection}
    // E2 — Lazy KCL loading: dynamically insert script/link so the HTML parser
    // is not blocked while the KCL bundle loads. The browser can reuse cached
    // bundles across frames more efficiently with this approach.
    (function loadKCL() {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '${origin}/kcl/${kclVersion}/kcl.css?_cb=${KCL_CACHE_BUSTER}';
      document.head.appendChild(link);

      var script = document.createElement('script');
      script.src = '${origin}/kcl/${kclVersion}/kcl.js?_cb=${KCL_CACHE_BUSTER}';
      script.onload = function() {${editMode ? `
        // Enter edit mode after KCL initializes
        try { window.postMessage({ type: 'kcl:init-edit-mode' }, '*'); } catch(e) {}` : ''}
        // Signal render complete
        try {
          window.parent.postMessage({ type: 'kcl:render-complete' }, '${origin}');
        } catch(e) {}
      };
      script.onerror = function() {
        try {
          window.parent.postMessage({
            type: 'kcl:error',
            message: 'Failed to load KCL bundle'
          }, '${origin}');
        } catch(e) {}
      };
      document.head.appendChild(script);
    })();
  <\/script>
</head>
<body>
${frameCode}
</body>
</html>`;
}

export function useFrameRenderer({
  frameCode,
  kclVersion,
  renderMode = 'live',
  editMode,
  embedWhitelist,
  onElementSelected,
  onElementDeselected,
  onInlineEditStart,
  onInlineEditComplete,
  onInlineEditCancel,
}: UseFrameRendererOptions): UseFrameRendererResult {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(renderMode !== 'thumbnail');

  // Stable refs for callbacks so the message listener doesn't re-register
  const onSelectedRef = useRef(onElementSelected);
  onSelectedRef.current = onElementSelected;
  const onDeselectedRef = useRef(onElementDeselected);
  onDeselectedRef.current = onElementDeselected;
  const onInlineEditStartRef = useRef(onInlineEditStart);
  onInlineEditStartRef.current = onInlineEditStart;
  const onInlineEditCompleteRef = useRef(onInlineEditComplete);
  onInlineEditCompleteRef.current = onInlineEditComplete;
  const onInlineEditCancelRef = useRef(onInlineEditCancel);
  onInlineEditCancelRef.current = onInlineEditCancel;

  // Memoize srcdoc to avoid unnecessary iframe reloads
  const srcdoc = useMemo(
    () => buildSrcdoc(frameCode, kclVersion, editMode, renderMode, embedWhitelist),
    [frameCode, kclVersion, editMode, renderMode, embedWhitelist],
  );

  // Reset loading state when srcdoc changes (new frame or code update).
  // Thumbnail mode never loads — skip resetting to loading state.
  useEffect(() => {
    if (renderMode === 'thumbnail') {
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    setRenderError(null);
  }, [srcdoc, renderMode]);

  // Listen for postMessage from iframe
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // srcdoc iframes have origin 'null' (string).
      // Also accept same-origin messages (e.g., edit mode init).
      if (event.origin !== 'null' && event.origin !== window.location.origin) return;

      const data = event.data as FrameMessage | undefined;
      if (!data || typeof data.type !== 'string') return;
      if (!data.type.startsWith('kcl:')) return;

      switch (data.type) {
        case 'kcl:render-complete':
          setIsLoading(false);
          break;
        case 'kcl:error':
          setRenderError(data.message || 'Unknown frame error');
          setIsLoading(false);
          break;
        case 'kcl:csp-violation':
          if (import.meta.env.DEV) {
            console.warn(
              `[Frame CSP Violation] Directive: ${data.violatedDirective}, Blocked: ${data.blockedURI}`
            );
          }
          break;
        case 'kcl:element-selected':
          onSelectedRef.current?.(data.elementId, data.component, data.schema, data.bounds, data.isAbsolute);
          break;
        case 'kcl:element-deselected':
          onDeselectedRef.current?.();
          break;
        case 'kcl:inline-edit-start':
          onInlineEditStartRef.current?.(data.elementId);
          break;
        case 'kcl:inline-edit-complete':
          onInlineEditCompleteRef.current?.(data.elementId, data.newContent);
          break;
        case 'kcl:inline-edit-cancel':
          onInlineEditCancelRef.current?.(data.elementId);
          break;
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Fallback: if iframe doesn't post render-complete within 10s, clear loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 10_000);

    return () => clearTimeout(timer);
  }, [srcdoc]);

  const clearError = useCallback(() => {
    setRenderError(null);
  }, []);

  /** Send a message to the sandboxed iframe (e.g. property updates, highlight) */
  const sendMessage = useCallback((msg: object) => {
    iframeRef.current?.contentWindow?.postMessage(msg, '*');
  }, []);

  return { srcdoc, renderError, isLoading, iframeRef, clearError, sendMessage };
}
