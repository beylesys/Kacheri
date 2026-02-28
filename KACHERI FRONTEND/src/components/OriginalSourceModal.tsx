// OriginalSourceModal.tsx - View-only modal for original imported source files
import { useEffect, useState, useRef } from "react";
import PDFViewer from "./PDFViewer";
import { useFocusTrap } from '../hooks/useFocusTrap';

type ImportMeta = {
  docId: string;
  kind: string;
  sourceUrl: string | null;
  meta: any;
  ts: number;
};

type Props = {
  open: boolean;
  importMeta: ImportMeta;
  onClose: () => void;
};

export default function OriginalSourceModal({ open, importMeta, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  const [full, setFull] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Prevent background scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
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

  if (!open) return null;

  const sourceUrl = importMeta.sourceUrl || `/api/docs/${importMeta.docId}/import/source`;
  const kind = importMeta.kind?.toLowerCase() || "";
  const isPdf = kind.includes("pdf");
  const isImage = /import:(jpg|jpeg|png|gif|webp|bmp|image)/i.test(kind);
  const importDate = new Date(importMeta.ts).toLocaleString();
  const tool = importMeta.meta?.tool || "unknown";
  const formatLabel = kind.replace("import:", "").replace(":ocr", " (OCR)").toUpperCase();

  const renderContent = () => {
    if (isPdf) {
      return <PDFViewer url={sourceUrl} scale={1.2} />;
    }

    if (isImage) {
      if (imageError) {
        return (
          <div style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ef4444",
          }}>
            Failed to load image
          </div>
        );
      }
      return (
        <div style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flex: 1,
          padding: 20,
          background: "#f1f5f9",
          overflow: "auto",
        }}>
          <img
            src={sourceUrl}
            alt="Original source"
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

    // Non-viewable format (DOCX, etc.) - show download option
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        padding: 40,
        textAlign: "center",
        background: "#f8fafc",
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>
          {kind.includes("docx") || kind.includes("doc") ? "📄" :
           kind.includes("xls") ? "📊" :
           kind.includes("ppt") ? "📽️" : "📁"}
        </div>
        <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8, color: "#334155" }}>
          {formatLabel} File
        </div>
        <div style={{ color: "#64748b", marginBottom: 24, maxWidth: 300 }}>
          This file type cannot be previewed in the browser. You can download the original file to view it.
        </div>
        <a
          href={sourceUrl}
          download
          className="button primary"
          style={{ textDecoration: "none" }}
        >
          Download Original
        </a>
      </div>
    );
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="original-source-title"
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
      <div style={{
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
      }}>
        {/* Header */}
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "#fff",
        }}>
          <div id="original-source-title" style={{ fontWeight: 700, color: "#334155" }}>
            View Original Source
          </div>
          <span style={{
            fontSize: 11,
            padding: "2px 8px",
            background: "#e0f2fe",
            color: "#0369a1",
            borderRadius: 4,
            fontWeight: 500,
          }}>
            {formatLabel}
          </span>
          <span style={{ fontSize: 12, color: "#64748b" }}>
            Imported {importDate}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button
              className="button subtle sm"
              onClick={() => setFull(f => !f)}
            >
              {full ? "Exit full" : "Full screen"}
            </button>
            <button
              className="button subtle sm"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {renderContent()}
        </div>

        {/* Footer with metadata */}
        <div style={{
          padding: "10px 16px",
          borderTop: "1px solid #e5e7eb",
          display: "flex",
          gap: 16,
          fontSize: 12,
          color: "#64748b",
          background: "#f9fafb",
        }}>
          <span>Conversion tool: {tool}</span>
          {importMeta.meta?.headingsDetected != null && (
            <span>Headings detected: {importMeta.meta.headingsDetected}</span>
          )}
          {importMeta.meta?.enhanced && (
            <span>Enhanced extraction</span>
          )}
        </div>
      </div>
    </div>
  );
}
