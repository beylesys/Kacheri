// KACHERI FRONTEND/src/components/DiffModal.tsx
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  before: string;
  after: string;
  onAccept: () => void;
  onCancel: () => void;
  title?: string;
};

export default function DiffModal({
  open,
  before,
  after,
  onAccept,
  onCancel,
  title = "Compose — review & approve",
}: Props) {
  const [fontPx, setFontPx] = useState<number>(16);
  const [full, setFull] = useState<boolean>(false);

  // prevent background scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const Header = (
    <div style={{
      padding: "12px 16px",
      borderBottom: "1px solid #e5e7eb",
      display: "flex",
      alignItems: "center",
      gap: 12,
      background: "#fff",
    }}>
      <div style={{ fontWeight: 700, color: "#334155" }}>{title}</div>
      <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
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

  const PanelLabel = ({ children }: { children: string }) => (
    <div style={{ fontSize: 12, color: "#64748b", margin: "0 0 6px" }}>{children}</div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
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
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div
        style={{
          width: full ? "96vw" : "1000px",
          maxWidth: "96vw",
          height: full ? "88vh" : "72vh",
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

        {/* Content */}
        <div style={{ display: "flex", gap: 12, padding: 16, height: "100%", background: "#f8fafc" }}>
          {/* Before */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <PanelLabel>Before</PanelLabel>
            <textarea
              readOnly
              value={before}
              style={{
                flex: 1,
                minHeight: 0,
                width: "100%",
                resize: "none",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 12,
                background: "#0f172a",
                color: "#e2e8f0",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                fontSize: fontPx,
                lineHeight: 1.6,
              }}
            />
          </div>

          {/* After */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <PanelLabel>After</PanelLabel>
            <textarea
              readOnly
              value={after}
              style={{
                flex: 1,
                minHeight: 0,
                width: "100%",
                resize: "none",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 12,
                background: "#0f172a",
                color: "#e2e8f0",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                fontSize: fontPx,
                lineHeight: 1.6,
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
            padding: "12px 16px",
            borderTop: "1px solid #e5e7eb",
            background: "#fff",
          }}
        >
          <button className="button subtle" onClick={onCancel}>Cancel</button>
          <button className="button primary" onClick={onAccept}>Accept</button>
        </div>
      </div>
    </div>
  );
}
