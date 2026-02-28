// KACHERI FRONTEND/src/components/AttachmentViewer.tsx
// Modal viewer for attachment files: PDF (iframe), images (img), office docs (download).

import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { DocAttachment } from "../api/attachments";
import "./attachmentViewer.css";

type Props = {
  open: boolean;
  attachment: DocAttachment | null;
  fileUrl: string;
  onClose: () => void;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

function getFormatLabel(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime === "image/png") return "PNG";
  if (mime === "image/jpeg") return "JPEG";
  if (mime === "image/gif") return "GIF";
  if (mime === "image/webp") return "WebP";
  if (mime.includes("wordprocessingml")) return "DOCX";
  if (mime.includes("spreadsheetml")) return "XLSX";
  if (mime.includes("presentationml")) return "PPTX";
  return "File";
}

function getDocIcon(mime: string): string {
  if (mime.includes("wordprocessingml")) return "W";
  if (mime.includes("spreadsheetml")) return "X";
  if (mime.includes("presentationml")) return "P";
  return "F";
}

export default function AttachmentViewer({ open, attachment, fileUrl, onClose }: Props) {
  const [full, setFull] = useState(false);
  const [imageError, setImageError] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  // Prevent background scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Handle Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Reset image error when attachment changes
  useEffect(() => {
    setImageError(false);
    setFull(false);
  }, [attachment?.id]);

  if (!open || !attachment) return null;

  const mime = attachment.mimeType;
  const isPdf = mime === "application/pdf";
  const isImage = mime.startsWith("image/");
  const formatLabel = getFormatLabel(mime);

  const renderContent = () => {
    if (isPdf) {
      return (
        <iframe
          src={fileUrl}
          style={{ width: "100%", height: "100%", border: "none", flex: 1 }}
          title={attachment.filename}
        />
      );
    }

    if (isImage) {
      if (imageError) {
        return (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ef4444",
            }}
          >
            Failed to load image
          </div>
        );
      }
      return (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            flex: 1,
            padding: 20,
            background: "#f1f5f9",
            overflow: "auto",
          }}
        >
          <img
            src={fileUrl}
            alt={attachment.filename}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              background: "#fff",
            }}
            onError={() => setImageError(true)}
          />
        </div>
      );
    }

    // Non-viewable format (Office docs) — icon + download
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          padding: 40,
          textAlign: "center",
          background: "#f8fafc",
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            fontWeight: 700,
            borderRadius: 16,
            background: "rgba(59, 130, 246, 0.1)",
            color: "#3b82f6",
            border: "2px solid rgba(59, 130, 246, 0.2)",
            marginBottom: 16,
          }}
        >
          {getDocIcon(mime)}
        </div>
        <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8, color: "#334155" }}>
          {formatLabel} File
        </div>
        <div style={{ color: "#64748b", marginBottom: 24, maxWidth: 300 }}>
          This file type cannot be previewed in the browser. You can download it to view.
        </div>
        <a
          href={fileUrl}
          download
          className="button primary"
          style={{ textDecoration: "none" }}
        >
          Download File
        </a>
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="attachment-viewer-title"
      ref={dialogRef}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: full ? "96vw" : "900px",
          maxWidth: "96vw",
          height: full ? "88vh" : "80vh",
          background: "#fff",
          color: "#111",
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div className="attachment-viewer-header">
          <div className="attachment-viewer-title" id="attachment-viewer-title" title={attachment.filename}>
            {attachment.filename}
          </div>
          <span className="attachment-viewer-badge">{formatLabel}</span>
          <span className="attachment-viewer-size">
            {formatBytes(attachment.sizeBytes)}
          </span>
          <div className="attachment-viewer-actions">
            <a
              href={fileUrl}
              download
              className="button subtle sm"
              style={{ textDecoration: "none" }}
            >
              Download
            </a>
            <button className="button subtle sm" onClick={() => setFull((f) => !f)}>
              {full ? "Exit full" : "Full screen"}
            </button>
            <button className="button subtle sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="attachment-viewer-content">{renderContent()}</div>

        {/* Footer with metadata */}
        <div className="attachment-viewer-footer">
          <span>Uploaded by: {attachment.uploadedBy}</span>
          <span>Date: {new Date(attachment.uploadedAt).toLocaleString()}</span>
          <span>SHA-256: {attachment.sha256.slice(0, 16)}...</span>
        </div>
      </div>
    </div>
  );
}
