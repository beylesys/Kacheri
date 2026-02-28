// KACHERI FRONTEND/src/components/PDFImportModal.tsx
// Side-by-side PDF import modal: original PDF + extracted editable text
import { useEffect, useState, useRef } from "react";
import PDFViewer from "./PDFViewer";
import { useFocusTrap } from '../hooks/useFocusTrap';
import { sanitizeHtml } from '../utils/sanitize';
import type { DetectedField } from "../api";

type Props = {
  open: boolean;
  docId: string;
  pdfUrl: string;
  extractedHtml: string;
  onAccept: (html: string) => void;
  onCancel: () => void;
  onDetectFields?: () => Promise<DetectedField[]>;
  detectedFields?: DetectedField[];
};

export default function PDFImportModal({
  open,
  docId,
  pdfUrl,
  extractedHtml,
  onAccept,
  onCancel,
  onDetectFields,
  detectedFields = [],
}: Props) {
  const [fontPx, setFontPx] = useState<number>(16);
  const [full, setFull] = useState<boolean>(false);
  const [editedHtml, setEditedHtml] = useState(extractedHtml);
  const [detecting, setDetecting] = useState(false);
  const [fields, setFields] = useState<DetectedField[]>(detectedFields);
  const [pdfPage, setPdfPage] = useState({ current: 1, total: 0 });
  const editableRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  // Sync extractedHtml when it changes
  useEffect(() => {
    setEditedHtml(extractedHtml);
  }, [extractedHtml]);

  // Sync detectedFields when passed in
  useEffect(() => {
    setFields(detectedFields);
  }, [detectedFields]);

  // Prevent background scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Handle escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  const handleDetectFields = async () => {
    if (!onDetectFields) return;
    setDetecting(true);
    try {
      const detected = await onDetectFields();
      setFields(detected);
    } catch (err) {
      console.error("Failed to detect fields:", err);
    } finally {
      setDetecting(false);
    }
  };

  const handleAccept = () => {
    // Get the current content from the editable div
    const html = editableRef.current?.innerHTML || editedHtml;
    onAccept(html);
  };

  const Header = (
    <div
      style={{
        padding: "12px 16px",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "#fff",
      }}
    >
      <div id="pdf-import-title" style={{ fontWeight: 700, color: "#334155" }}>
        Import PDF — Review & Approve
      </div>
      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <button
          className="button subtle sm"
          onClick={() => setFontPx((f) => Math.max(12, f - 2))}
          title="Decrease text size"
        >
          A−
        </button>
        <button
          className="button subtle sm"
          onClick={() => setFontPx((f) => Math.min(24, f + 2))}
          title="Increase text size"
        >
          A+
        </button>
        <button
          className="button subtle sm"
          onClick={() => setFull((x) => !x)}
          title={full ? "Exit full screen" : "Full screen"}
        >
          {full ? "Exit full" : "Full screen"}
        </button>
      </div>
    </div>
  );

  const PanelLabel = ({
    children,
    extra,
  }: {
    children: string;
    extra?: React.ReactNode;
  }) => (
    <div
      style={{
        fontSize: 12,
        color: "#64748b",
        margin: "0 0 6px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <span>{children}</span>
      {extra}
    </div>
  );

  // Highlight fields in HTML by wrapping matched values with <mark>
  const highlightFields = (html: string, flds: DetectedField[]): string => {
    if (flds.length === 0) return html;

    // Sort fields by position descending to avoid offset issues
    const sorted = [...flds].sort((a, b) => b.start - a.start);

    // For each field, find and wrap in the HTML
    let result = html;
    for (const field of sorted) {
      const fieldValue = field.value;
      const typeClass = `field-highlight-${field.type}`;

      // Simple replacement - find the value in the HTML
      const regex = new RegExp(
        fieldValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "g"
      );
      result = result.replace(
        regex,
        `<mark class="${typeClass}" data-field-type="${field.type}" style="background: ${getFieldColor(field.type)}; padding: 1px 3px; border-radius: 2px;">${fieldValue}</mark>`
      );
    }

    return result;
  };

  const getFieldColor = (type: string): string => {
    switch (type) {
      case "date":
        return "#dbeafe"; // blue
      case "name":
        return "#fef3c7"; // yellow
      case "amount":
        return "#dcfce7"; // green
      default:
        return "#f3e8ff"; // purple
    }
  };

  const displayHtml =
    fields.length > 0 ? highlightFields(editedHtml, fields) : editedHtml;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-import-title"
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
          width: full ? "96vw" : "1200px",
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
        {Header}

        {/* Content - Side by side */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            padding: 16,
            flex: 1,
            minHeight: 0,
            background: "#f8fafc",
          }}
        >
          {/* Left: Original PDF */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <PanelLabel
              extra={
                pdfPage.total > 0 && (
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>
                    Page {pdfPage.current} of {pdfPage.total}
                  </span>
                )
              }
            >
              Original PDF
            </PanelLabel>
            <div
              style={{
                flex: 1,
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                overflow: "hidden",
                background: "#e5e7eb",
              }}
            >
              <PDFViewer
                url={pdfUrl}
                scale={1.0}
                onPageChange={(current, total) => setPdfPage({ current, total })}
              />
            </div>
          </div>

          {/* Right: Extracted Text */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <PanelLabel
              extra={
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {fields.length > 0 && (
                    <span
                      style={{
                        fontSize: 11,
                        background: "#e0e7ff",
                        color: "#4338ca",
                        padding: "2px 6px",
                        borderRadius: 4,
                      }}
                    >
                      {fields.length} fields detected
                    </span>
                  )}
                  {onDetectFields && (
                    <button
                      className="button subtle sm"
                      onClick={handleDetectFields}
                      disabled={detecting}
                      style={{ fontSize: 11, padding: "3px 8px" }}
                    >
                      {detecting ? "Detecting..." : "Detect Fields"}
                    </button>
                  )}
                </div>
              }
            >
              Extracted Text (editable)
            </PanelLabel>
            <div
              ref={editableRef}
              contentEditable
              suppressContentEditableWarning
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(displayHtml) }}
              style={{
                flex: 1,
                minHeight: 0,
                overflow: "auto",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 16,
                background: "#fff",
                fontSize: fontPx,
                lineHeight: 1.6,
                outline: "none",
              }}
              onInput={(e) => {
                setEditedHtml((e.target as HTMLDivElement).innerHTML);
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "flex-end",
            alignItems: "center",
            padding: "12px 16px",
            borderTop: "1px solid #e5e7eb",
            background: "#fff",
          }}
        >
          <span style={{ marginRight: "auto", fontSize: 12, color: "#64748b" }}>
            Document: {docId}
          </span>
          <button className="button subtle" onClick={onCancel}>
            Cancel
          </button>
          <button className="button primary" onClick={handleAccept}>
            Accept & Import
          </button>
        </div>
      </div>
    </div>
  );
}
