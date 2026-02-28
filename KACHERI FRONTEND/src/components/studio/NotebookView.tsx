// KACHERI FRONTEND/src/components/studio/NotebookView.tsx
// Vertical scrolling layout for notebook composition mode: alternates
// rich-text narrative blocks (Tiptap) with rendered KCL frames.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 7, Slice E4

import { useEffect, useRef } from 'react';
import type { CanvasFrame } from '../../types/canvas.ts';
import { useFrameRenderer } from '../../hooks/useFrameRenderer.ts';
import { FrameRenderer } from './FrameRenderer.tsx';
import { NotebookNarrative } from './NotebookNarrative.tsx';

/* ---------- Internal per-frame renderer ---------- */

interface NotebookFrameRendererProps {
  frame: CanvasFrame;
  kclVersion: string;
  isActive: boolean;
  embedWhitelist?: string[];
}

/**
 * Renders a single frame in notebook view.
 * Active frames use 'live' render mode (full KCL); inactive use 'thumbnail'.
 * This respects E2's "1-3 live iframes" constraint for notebooks with many frames.
 */
function NotebookFrameRenderer({ frame, kclVersion, isActive, embedWhitelist }: NotebookFrameRendererProps) {
  const { srcdoc, renderError, isLoading, iframeRef, clearError } = useFrameRenderer({
    frameCode: frame.code,
    kclVersion,
    renderMode: isActive ? 'live' : 'thumbnail',
    embedWhitelist,
  });

  return (
    <FrameRenderer
      srcdoc={srcdoc}
      renderError={renderError}
      isLoading={isLoading}
      iframeRef={iframeRef}
      onClearError={clearError}
    />
  );
}

/* ---------- Notebook View ---------- */

interface NotebookViewProps {
  sortedFrames: CanvasFrame[];
  activeFrameId: string | null;
  kclVersion: string;
  onSelectFrame: (frameId: string) => void;
  onNarrativeSave: (frameId: string, narrativeHtml: string) => void;
  readOnly?: boolean;
  /** E7: Effective embed whitelist domains for per-frame CSP */
  embedWhitelist?: string[];
}

export function NotebookView({
  sortedFrames,
  activeFrameId,
  kclVersion,
  onSelectFrame,
  onNarrativeSave,
  readOnly = false,
  embedWhitelist,
}: NotebookViewProps) {
  const activeRef = useRef<HTMLDivElement | null>(null);

  // Smooth-scroll active section into view when activeFrameId changes
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeFrameId]);

  if (sortedFrames.length === 0) {
    return (
      <div className="notebook-view">
        <div className="notebook-empty">
          No frames yet. Use the conversation panel to generate notebook content.
        </div>
      </div>
    );
  }

  return (
    <div className="notebook-view" role="region" aria-label="Notebook view">
      {sortedFrames.map((frame, index) => {
        const isActive = frame.id === activeFrameId;
        const narrativeHtml = ((frame.metadata as Record<string, unknown> | null)?.narrativeHtml as string) || '';

        return (
          <div
            key={frame.id}
            ref={isActive ? activeRef : undefined}
            className={`notebook-section${isActive ? ' active' : ''}`}
            onClick={() => onSelectFrame(frame.id)}
          >
            {/* Narrative block BEFORE this frame */}
            <NotebookNarrative
              narrativeHtml={narrativeHtml}
              onSave={(html) => onNarrativeSave(frame.id, html)}
              readOnly={readOnly}
              placeholder={index === 0 ? 'Add introduction...' : 'Add narrative between frames...'}
            />

            {/* Rendered frame */}
            <div className="notebook-frame-container">
              <div className="notebook-frame-label">
                Frame {index + 1}{frame.title ? `: ${frame.title}` : ''}
              </div>
              <div className="notebook-frame-render">
                <NotebookFrameRenderer
                  frame={frame}
                  kclVersion={kclVersion}
                  isActive={isActive}
                  embedWhitelist={embedWhitelist}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default NotebookView;
