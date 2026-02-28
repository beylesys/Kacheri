// KACHERI FRONTEND/src/components/studio/FrameRenderer.tsx
// Sandboxed iframe renderer for Design Studio frames.
// Renders frame HTML/CSS/JS with KCL components in an isolated sandbox.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 4, Slice C3

import type { RefObject } from 'react';

interface FrameRendererProps {
  srcdoc: string;
  renderError: string | null;
  isLoading: boolean;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  onClearError: () => void;
}

/**
 * Sandboxed iframe that renders a single Design Studio frame.
 *
 * Security model (per Architecture Blueprint Layer 3 — Frame Isolation):
 * - sandbox="allow-scripts" ONLY
 * - No allow-same-origin (iframe cannot access parent DOM or storage)
 * - No allow-forms (no form submissions)
 * - No allow-popups (no window.open)
 * - Communication only via postMessage
 */
export function FrameRenderer({
  srcdoc,
  renderError,
  isLoading,
  iframeRef,
  onClearError,
}: FrameRendererProps) {
  return (
    <div className="frame-renderer">
      {/* Loading overlay */}
      {isLoading && (
        <div className="frame-renderer-loading" aria-live="polite">
          <div className="frame-renderer-loading-spinner" />
          <span className="frame-renderer-loading-text">Rendering frame...</span>
        </div>
      )}

      {/* Error overlay */}
      {renderError && (
        <div className="frame-renderer-error" role="alert">
          <div className="frame-renderer-error-icon" aria-hidden="true">
            &#x26A0;
          </div>
          <div className="frame-renderer-error-title">Frame Render Error</div>
          <div className="frame-renderer-error-message">{renderError}</div>
          <button
            className="frame-renderer-error-dismiss"
            onClick={onClearError}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Sandboxed iframe */}
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        sandbox="allow-scripts"
        title="Frame preview"
        className="frame-renderer-iframe"
        aria-label="Design Studio frame preview"
      />
    </div>
  );
}
