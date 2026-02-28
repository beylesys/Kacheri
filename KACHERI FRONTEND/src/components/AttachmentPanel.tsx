// KACHERI FRONTEND/src/components/AttachmentPanel.tsx
// Sidebar panel for document attachments: upload dropzone, file list, storage usage.

import { memo, useState, useRef, useCallback } from "react";
import { useAttachments } from "../hooks/useAttachments";
import { attachmentsApi, type DocAttachment } from "../api/attachments";
import "./attachmentPanel.css";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const MAX_FILE_BYTES = 26214400; // 25 MB

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

function getMimeIconInfo(mime: string): { label: string; className: string } {
  if (mime === "application/pdf") return { label: "PDF", className: "pdf" };
  if (mime.startsWith("image/")) return { label: "IMG", className: "image" };
  if (mime.includes("wordprocessingml")) return { label: "DOCX", className: "office" };
  if (mime.includes("spreadsheetml")) return { label: "XLSX", className: "office" };
  if (mime.includes("presentationml")) return { label: "PPTX", className: "office" };
  return { label: "FILE", className: "" };
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type Props = {
  docId: string;
  open: boolean;
  onClose: () => void;
  refreshKey?: number;
  currentUserId?: string;
  workspaceId: string;
  onViewAttachment: (attachment: DocAttachment) => void;
};

function AttachmentPanelInner({
  docId,
  open,
  onClose,
  refreshKey = 0,
  currentUserId,
  workspaceId,
  onViewAttachment,
}: Props) {
  const { attachments, totalSize, count, limits, loading, error, refetch } =
    useAttachments(docId, refreshKey);

  const [uploading, setUploading] = useState(false);
  const [uploadingName, setUploadingName] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const errorTimerRef = useRef<number | null>(null);

  const usagePercent =
    limits.maxTotalBytes > 0
      ? Math.min(100, (totalSize / limits.maxTotalBytes) * 100)
      : 0;

  const isAtCapacity = count >= limits.maxCount || totalSize >= limits.maxTotalBytes;

  const clearUploadError = useCallback(() => {
    if (errorTimerRef.current != null) {
      window.clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    setUploadError(null);
  }, []);

  const showUploadError = useCallback(
    (msg: string) => {
      clearUploadError();
      setUploadError(msg);
      errorTimerRef.current = window.setTimeout(() => {
        setUploadError(null);
        errorTimerRef.current = null;
      }, 5000);
    },
    [clearUploadError]
  );

  const handleUpload = useCallback(
    async (file: File) => {
      clearUploadError();

      // Client-side validation
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        showUploadError(
          `Unsupported file type: ${file.type || "unknown"}. Allowed: PDF, images, Office docs.`
        );
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        showUploadError(
          `File is too large (${formatBytes(file.size)}). Maximum: ${formatBytes(MAX_FILE_BYTES)}.`
        );
        return;
      }
      if (isAtCapacity) {
        showUploadError("Attachment limit reached for this document.");
        return;
      }

      setUploading(true);
      setUploadingName(file.name);

      try {
        await attachmentsApi.upload(docId, file, workspaceId);
        await refetch();
      } catch (err: any) {
        showUploadError(err?.message ?? "Failed to upload attachment");
      } finally {
        setUploading(false);
        setUploadingName("");
      }
    },
    [docId, workspaceId, isAtCapacity, refetch, clearUploadError, showUploadError]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
      // Reset input so re-selecting the same file triggers onChange
      e.target.value = "";
    },
    [handleUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const handleDelete = useCallback(
    async (att: DocAttachment) => {
      if (!confirm(`Delete attachment "${att.filename}"?`)) return;

      try {
        await attachmentsApi.delete(docId, att.id);
        await refetch();
      } catch (err: any) {
        showUploadError(err?.message ?? "Failed to delete attachment");
      }
    },
    [docId, refetch, showUploadError]
  );

  const canDelete = (att: DocAttachment): boolean => {
    // Frontend shows delete for own uploads; backend enforces full RBAC (editor+ or uploader)
    return att.uploadedBy === currentUserId;
  };

  const usageFillClass =
    usagePercent >= 95
      ? "attachments-usage-fill critical"
      : usagePercent >= 80
        ? "attachments-usage-fill warning"
        : "attachments-usage-fill";

  return (
    <div className={`attachments-panel ${open ? "open" : ""}`}>
      {/* Header */}
      <div className="attachments-header">
        <div className="attachments-title">Attachments</div>
        <button className="attachments-close" onClick={onClose} title="Close">
          &times;
        </button>
      </div>

      {/* Storage usage */}
      <div className="attachments-usage">
        <div className="attachments-usage-bar">
          <div
            className={usageFillClass}
            style={{ width: `${usagePercent}%` }}
          />
        </div>
        <div className="attachments-usage-text">
          {formatBytes(totalSize)} / {formatBytes(limits.maxTotalBytes)} ({count}/
          {limits.maxCount} files)
        </div>
        {usagePercent >= 80 && usagePercent < 95 && (
          <div className="attachments-usage-warning">Storage nearly full</div>
        )}
        {usagePercent >= 95 && (
          <div className="attachments-usage-warning" style={{ color: "#ef4444" }}>
            Storage almost at capacity
          </div>
        )}
      </div>

      {/* Upload dropzone */}
      <div
        className={`attachments-dropzone${isDragging ? " active" : ""}${isAtCapacity ? " disabled" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isAtCapacity && fileInputRef.current?.click()}
      >
        <input
          type="file"
          hidden
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.xlsx,.pptx"
        />
        {isAtCapacity ? (
          <div>Attachment limit reached</div>
        ) : (
          <>
            <div>
              Drop file here or{" "}
              <button
                className="attachments-dropzone-browse"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                browse
              </button>
            </div>
            <div className="attachments-dropzone-hint">
              PDF, images, Office docs (max 25 MB)
            </div>
          </>
        )}
      </div>

      {/* Upload progress */}
      {uploading && (
        <div className="attachments-uploading">Uploading {uploadingName}...</div>
      )}

      {/* Upload error */}
      {uploadError && (
        <div className="attachments-upload-error">{uploadError}</div>
      )}

      {/* File list */}
      <div className="attachments-list">
        {loading && <div className="attachments-loading">Loading attachments...</div>}
        {error && <div className="attachments-error">{error}</div>}
        {!loading && !error && attachments.length === 0 && (
          <div className="attachments-empty">
            No attachments yet. Upload a file above.
          </div>
        )}
        {attachments.map((att) => {
          const icon = getMimeIconInfo(att.mimeType);
          return (
            <div key={att.id} className="attachments-item">
              <div className={`attachments-item-icon ${icon.className}`}>
                {icon.label}
              </div>
              <div className="attachments-item-info">
                <div className="attachments-item-name" title={att.filename}>
                  {att.filename}
                </div>
                <div className="attachments-item-meta">
                  {formatBytes(att.sizeBytes)} &middot; {formatDate(att.uploadedAt)}
                </div>
              </div>
              <div className="attachments-item-actions">
                <button
                  className="attachments-action-btn"
                  onClick={() => onViewAttachment(att)}
                  title="View"
                >
                  View
                </button>
                {canDelete(att) && (
                  <button
                    className="attachments-action-btn danger"
                    onClick={() => handleDelete(att)}
                    title="Delete"
                  >
                    Del
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const AttachmentPanel = memo(AttachmentPanelInner);
