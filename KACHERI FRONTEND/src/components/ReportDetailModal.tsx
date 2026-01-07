// KACHERI FRONTEND/src/components/ReportDetailModal.tsx
// Phase 5 - P0.3: Modal to display full verification report details
import { useEffect, useState, type CSSProperties } from "react";
import {
  AIWatchAPI,
  type VerificationReportFull,
  type VerificationReportMeta,
  type VerificationReportStatus,
} from "../api";

/* ---------- Helpers ---------- */
function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusBadge(status: VerificationReportStatus): {
  label: string;
  bg: string;
  border: string;
  color: string;
} {
  switch (status) {
    case "pass":
      return {
        label: "PASS",
        bg: "rgba(22,163,74,0.18)",
        border: "rgba(34,197,94,0.8)",
        color: "#bbf7d0",
      };
    case "fail":
      return {
        label: "FAIL",
        bg: "rgba(248,113,113,0.14)",
        border: "rgba(248,113,113,0.7)",
        color: "#fecaca",
      };
    case "partial":
      return {
        label: "PARTIAL",
        bg: "rgba(251,191,36,0.14)",
        border: "rgba(251,191,36,0.7)",
        color: "#fef9c3",
      };
    default:
      return {
        label: status,
        bg: "rgba(148,163,184,0.14)",
        border: "rgba(148,163,184,0.5)",
        color: "#e5e7ff",
      };
  }
}

/* ---------- Props ---------- */
export interface ReportDetailModalProps {
  report: VerificationReportMeta;
  onClose: () => void;
}

/* ---------- Component ---------- */
export default function ReportDetailModal({
  report,
  onClose,
}: ReportDetailModalProps) {
  const [fullReport, setFullReport] = useState<VerificationReportFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  useEffect(() => {
    async function loadFull() {
      setLoading(true);
      setError(null);
      try {
        const full = await AIWatchAPI.reportById(report.id, true);
        setFullReport(full);
      } catch (err: any) {
        setError(err?.message || "Failed to load report details");
      } finally {
        setLoading(false);
      }
    }
    loadFull();
  }, [report.id]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const badge = statusBadge(report.status);

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div>
            <div style={titleRowStyle}>
              <h2 style={titleStyle}>Verification Report</h2>
              <span
                style={{
                  display: "inline-block",
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.8,
                  background: badge.bg,
                  border: `1px solid ${badge.border}`,
                  color: badge.color,
                  marginLeft: 12,
                }}
              >
                {badge.label}
              </span>
            </div>
            <div style={subtitleStyle}>
              {fmtDate(report.createdAt)} &middot; Triggered by: {report.triggeredBy}
            </div>
          </div>
          <button type="button" onClick={onClose} style={closeButtonStyle}>
            &times;
          </button>
        </div>

        {/* Content */}
        {loading && <div style={loadingStyle}>Loading report details...</div>}
        {error && <div style={errorStyle}>Error: {error}</div>}

        {!loading && !error && (
          <>
            {/* Summary metrics */}
            <div style={metricsGridStyle}>
              <MetricCard title="Exports" metrics={[
                { label: "Pass", value: report.exportsPass, tone: "success" },
                { label: "Fail", value: report.exportsFail, tone: "danger" },
                { label: "Miss", value: report.exportsMiss, tone: "muted" },
              ]} />
              <MetricCard title="Compose" metrics={[
                { label: "Pass", value: report.composePass, tone: "success" },
                { label: "Drift", value: report.composeDrift, tone: "warning" },
                { label: "Miss", value: report.composeMiss, tone: "muted" },
              ]} />
            </div>

            {/* Raw JSON toggle */}
            <div style={jsonSectionStyle}>
              <button
                type="button"
                onClick={() => setShowRawJson(!showRawJson)}
                style={toggleButtonStyle}
              >
                {showRawJson ? "Hide" : "Show"} raw JSON
              </button>
              {showRawJson && fullReport?.reportJson && (
                <pre style={jsonPreStyle}>
                  {JSON.stringify(fullReport.reportJson, null, 2)}
                </pre>
              )}
            </div>

            {/* Report ID */}
            <div style={footerInfoStyle}>
              <span style={idLabelStyle}>Report ID:</span>
              <code style={idCodeStyle}>{report.id}</code>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Metric Card ---------- */
function MetricCard(props: {
  title: string;
  metrics: Array<{
    label: string;
    value: number;
    tone: "success" | "danger" | "warning" | "muted";
  }>;
}) {
  return (
    <div style={metricCardStyle}>
      <div style={metricCardTitleStyle}>{props.title}</div>
      <div style={metricRowStyle}>
        {props.metrics.map((m) => (
          <div key={m.label} style={metricItemStyle}>
            <div style={metricLabelStyle}>{m.label}</div>
            <div style={{ ...metricValueStyle, color: toneColor(m.tone) }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function toneColor(tone: "success" | "danger" | "warning" | "muted"): string {
  switch (tone) {
    case "success": return "#bbf7d0";
    case "danger": return "#fecaca";
    case "warning": return "#fef9c3";
    default: return "#9ca3c7";
  }
}

/* ---------- Styles ---------- */
const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
  padding: 20,
};

const modalStyle: CSSProperties = {
  width: "100%",
  maxWidth: 680,
  maxHeight: "90vh",
  overflow: "auto",
  borderRadius: 22,
  background:
    "radial-gradient(circle at top left, rgba(15,23,42,0.99), rgba(15,23,42,0.99))",
  border: "1px solid rgba(148,163,184,0.55)",
  boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
  padding: 24,
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 20,
};

const titleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
};

const titleStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: "#f9fafb",
  margin: 0,
};

const subtitleStyle: CSSProperties = {
  fontSize: 12,
  color: "#9ca3c7",
  marginTop: 4,
};

const closeButtonStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  fontSize: 28,
  color: "#9ca3c7",
  cursor: "pointer",
  lineHeight: 1,
  padding: 0,
};

const loadingStyle: CSSProperties = {
  fontSize: 13,
  color: "#9ca3c7",
  padding: "20px 0",
  textAlign: "center",
};

const errorStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(248,113,113,0.14)",
  border: "1px solid rgba(248,113,113,0.7)",
  color: "#fecaca",
  fontSize: 12,
};

const metricsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 16,
  marginBottom: 20,
};

const metricCardStyle: CSSProperties = {
  padding: 14,
  borderRadius: 16,
  background:
    "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,64,175,0.65))",
  border: "1px solid rgba(148,163,184,0.5)",
};

const metricCardTitleStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: "#9ca3c7",
  marginBottom: 10,
};

const metricRowStyle: CSSProperties = {
  display: "flex",
  gap: 16,
};

const metricItemStyle: CSSProperties = {
  flex: 1,
  textAlign: "center",
};

const metricLabelStyle: CSSProperties = {
  fontSize: 10,
  color: "#9ca3c7",
  marginBottom: 2,
};

const metricValueStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
};

const jsonSectionStyle: CSSProperties = {
  marginTop: 16,
};

const toggleButtonStyle: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.6)",
  background: "rgba(15,23,42,0.8)",
  color: "#e5e7ff",
  fontSize: 12,
  cursor: "pointer",
};

const jsonPreStyle: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  background: "rgba(0,0,0,0.3)",
  border: "1px solid rgba(148,163,184,0.3)",
  fontSize: 11,
  color: "#cbd5f5",
  overflow: "auto",
  maxHeight: 300,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
};

const footerInfoStyle: CSSProperties = {
  marginTop: 20,
  paddingTop: 14,
  borderTop: "1px solid rgba(148,163,184,0.3)",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const idLabelStyle: CSSProperties = {
  fontSize: 11,
  color: "#9ca3c7",
};

const idCodeStyle: CSSProperties = {
  fontSize: 11,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  color: "#cbd5f5",
  background: "rgba(0,0,0,0.2)",
  padding: "2px 6px",
  borderRadius: 4,
};
