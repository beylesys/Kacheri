// KACHERI FRONTEND/src/components/studio/CanvasCard.tsx
// Canvas card for the File Manager "Canvases" section.
// Displays canvas metadata (title, mode, timestamps) in a grid card.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 5, Slice D5

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Canvas } from '../../types/canvas';
import './canvasCard.css';

const COMP_MODE_LABELS: Record<string, string> = {
  deck: 'Deck',
  page: 'Page',
  notebook: 'Notebook',
  widget: 'Widget',
};

const COMP_MODE_COLORS: Record<string, string> = {
  deck: 'rgba(124, 92, 255, 0.7)',
  page: 'rgba(59, 130, 246, 0.7)',
  notebook: 'rgba(16, 185, 129, 0.7)',
  widget: 'rgba(245, 158, 11, 0.7)',
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface CanvasCardProps {
  canvas: Canvas;
  workspaceId: string;
  canEdit: boolean;
  onRename: (canvasId: string, currentTitle: string) => void;
  onDelete: (canvasId: string, title: string) => void;
  onDuplicate: (canvasId: string) => void;
}

export function CanvasCard({
  canvas,
  workspaceId,
  canEdit,
  onRename,
  onDelete,
  onDuplicate,
}: CanvasCardProps) {
  const navigate = useNavigate();
  const [showActions, setShowActions] = useState(false);

  const modeLabel = COMP_MODE_LABELS[canvas.compositionMode] || canvas.compositionMode;
  const modeColor = COMP_MODE_COLORS[canvas.compositionMode] || 'rgba(148,163,184,0.7)';

  return (
    <div
      className="canvas-card"
      onClick={() => navigate(`/workspaces/${workspaceId}/studio/${canvas.id}`)}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Gradient thumbnail placeholder */}
      <div className="canvas-card-thumbnail">
        <span className="canvas-card-thumbnail-icon" aria-hidden="true">
          &#x1F3A8;
        </span>
      </div>

      {/* Metadata */}
      <div className="canvas-card-meta">
        <div className="canvas-card-title" title={canvas.title}>
          {canvas.title}
        </div>
        <div className="canvas-card-badges">
          <span
            className="canvas-card-badge"
            style={{ borderColor: modeColor, color: modeColor }}
          >
            {modeLabel}
          </span>
        </div>
        <div className="canvas-card-footer">
          <span className="canvas-card-time">
            {relativeTime(canvas.updatedAt)}
          </span>
        </div>
      </div>

      {/* Actions (visible on hover) */}
      {showActions && canEdit && (
        <div
          className="canvas-card-actions"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="canvas-card-action-btn"
            onClick={() => onRename(canvas.id, canvas.title)}
            title="Rename"
          >
            Rename
          </button>
          <button
            type="button"
            className="canvas-card-action-btn"
            onClick={() => onDuplicate(canvas.id)}
            title="Duplicate"
          >
            Duplicate
          </button>
          <button
            type="button"
            className="canvas-card-action-btn canvas-card-action-btn--danger"
            onClick={() => onDelete(canvas.id, canvas.title)}
            title="Delete"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
