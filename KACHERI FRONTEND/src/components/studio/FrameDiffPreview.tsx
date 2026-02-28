// KACHERI FRONTEND/src/components/studio/FrameDiffPreview.tsx
// Inline before/after code comparison for edit/style operations.
// Shown in the conversation panel when a pending change awaits approval.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 4, Slice C4

interface FrameDiffPreviewProps {
  /** The original frame code (before change). Null for generate (new frames). */
  beforeCode: string | null;
  /** The new frame code from the AI response */
  afterCode: string;
  /** Action that produced this change */
  actionLabel: string;
  onApprove: () => void;
  onRequestChanges: () => void;
}

export function FrameDiffPreview({
  beforeCode,
  afterCode,
  actionLabel,
  onApprove,
  onRequestChanges,
}: FrameDiffPreviewProps) {
  const hasBefore = beforeCode !== null && beforeCode.length > 0;

  return (
    <div className="frame-diff-preview" role="region" aria-label="Frame diff preview">
      <div className="frame-diff-preview-header">
        <span className="frame-diff-preview-title">
          Review: {actionLabel}
        </span>
      </div>

      <div className="frame-diff-preview-panels">
        {hasBefore && (
          <div className="frame-diff-preview-panel">
            <div className="frame-diff-preview-panel-label">Before</div>
            <pre className="frame-diff-preview-code">{beforeCode}</pre>
          </div>
        )}

        <div className="frame-diff-preview-panel">
          <div className="frame-diff-preview-panel-label">
            {hasBefore ? 'After' : 'Generated'}
          </div>
          <pre className="frame-diff-preview-code">{afterCode}</pre>
        </div>
      </div>

      <div className="frame-diff-preview-actions">
        <button
          className="frame-diff-preview-btn frame-diff-preview-btn--approve"
          onClick={onApprove}
        >
          Approve
        </button>
        <button
          className="frame-diff-preview-btn frame-diff-preview-btn--reject"
          onClick={onRequestChanges}
        >
          Request Changes
        </button>
      </div>
    </div>
  );
}
