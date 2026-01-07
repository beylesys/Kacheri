// KACHERI FRONTEND/src/components/ReportHistoryTable.tsx
// Phase 5 - P0.3: Verification Report History Table
import { useEffect, useState, type CSSProperties, type PropsWithChildren } from "react";
import {
  AIWatchAPI,
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
export interface ReportHistoryTableProps {
  limit?: number;
  onSelectReport?: (report: VerificationReportMeta) => void;
  showViewAll?: boolean;
  onViewAll?: () => void;
}

/* ---------- Component ---------- */
export default function ReportHistoryTable({
  limit = 10,
  onSelectReport,
  showViewAll = false,
  onViewAll,
}: ReportHistoryTableProps) {
  const [reports, setReports] = useState<VerificationReportMeta[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<VerificationReportStatus | "">("");

  async function loadReports(before?: string) {
    setLoading(true);
    setError(null);
    try {
      const params: Parameters<typeof AIWatchAPI.reports>[0] = { limit };
      if (before) params.before = before;
      if (statusFilter) params.status = statusFilter;
      const res = await AIWatchAPI.reports(params);
      if (before) {
        setReports((prev) => [...prev, ...res.reports]);
      } else {
        setReports(res.reports);
      }
      setHasMore(res.hasMore);
    } catch (err: any) {
      setError(err?.message || "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
  }, [statusFilter, limit]);

  function handleLoadMore() {
    if (reports.length > 0 && hasMore) {
      loadReports(reports[reports.length - 1].id);
    }
  }

  return (
    <div style={containerStyle}>
      {/* Header with filter */}
      <div style={headerRowStyle}>
        <PanelHeader
          title="Verification History"
          subtitle="Historical records of nightly and manual verification runs."
        />
        <div style={filterRowStyle}>
          <label style={filterLabelStyle}>
            Status:
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as VerificationReportStatus | "")
              }
              style={selectStyle}
            >
              <option value="">All</option>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
              <option value="partial">Partial</option>
            </select>
          </label>
        </div>
      </div>

      {error && <div style={errorStyle}>Error: {error}</div>}

      {/* Table */}
      <div style={tableShellStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Status</Th>
              <Th align="right">Exports</Th>
              <Th align="right">Compose</Th>
              <Th>Trigger</Th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => {
              const badge = statusBadge(r.status);
              return (
                <tr
                  key={r.id}
                  style={rowStyle}
                  onClick={() => onSelectReport?.(r)}
                >
                  <Td>{fmtDate(r.createdAt)}</Td>
                  <Td>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "3px 8px",
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: 0.8,
                        background: badge.bg,
                        border: `1px solid ${badge.border}`,
                        color: badge.color,
                      }}
                    >
                      {badge.label}
                    </span>
                  </Td>
                  <Td align="right">
                    <span style={passStyle}>{r.exportsPass}</span>
                    {" / "}
                    <span style={failStyle}>{r.exportsFail}</span>
                    {" / "}
                    <span style={missStyle}>{r.exportsMiss}</span>
                  </Td>
                  <Td align="right">
                    <span style={passStyle}>{r.composePass}</span>
                    {" / "}
                    <span style={driftStyle}>{r.composeDrift}</span>
                    {" / "}
                    <span style={missStyle}>{r.composeMiss}</span>
                  </Td>
                  <Td mono>{r.triggeredBy}</Td>
                </tr>
              );
            })}
            {reports.length === 0 && !loading && (
              <tr>
                <Td colSpan={5} style={{ color: "#9ca3c7", textAlign: "center" }}>
                  No verification reports found.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer actions */}
      <div style={footerStyle}>
        {loading && <span style={loadingStyle}>Loading...</span>}
        {hasMore && !loading && (
          <button type="button" onClick={handleLoadMore} style={loadMoreStyle}>
            Load more
          </button>
        )}
        {showViewAll && onViewAll && (
          <button type="button" onClick={onViewAll} style={viewAllStyle}>
            View all reports
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Table cell helpers ---------- */
function PanelHeader(props: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: "#e5e7ff",
        }}
      >
        {props.title}
      </div>
      {props.subtitle && (
        <div style={{ fontSize: 12, color: "#9ca3c7", marginTop: 2 }}>
          {props.subtitle}
        </div>
      )}
    </div>
  );
}

function Th(props: PropsWithChildren<{ align?: "left" | "right" }>) {
  return (
    <th
      style={{
        textAlign: props.align || "left",
        padding: "8px 10px",
        fontWeight: 600,
        fontSize: 12,
        color: "#cbd5f5",
        borderBottom: "1px solid rgba(30,64,175,0.7)",
        background:
          "linear-gradient(145deg, rgba(15,23,42,0.98), rgba(30,64,175,0.6))",
        position: "sticky",
        top: 0,
        zIndex: 1,
      }}
    >
      {props.children}
    </th>
  );
}

function Td(
  props: PropsWithChildren<{
    align?: "left" | "right";
    mono?: boolean;
    colSpan?: number;
    style?: CSSProperties;
  }>
) {
  return (
    <td
      colSpan={props.colSpan}
      style={{
        textAlign: props.align || "left",
        padding: "7px 10px",
        fontSize: 12,
        color: "#e5e7ff",
        borderBottom: "1px solid rgba(30,64,175,0.35)",
        fontFamily: props.mono
          ? "ui-monospace, SFMono-Regular, Menlo, monospace"
          : undefined,
        ...props.style,
      }}
    >
      {props.children}
    </td>
  );
}

/* ---------- Styles ---------- */
const containerStyle: CSSProperties = {
  padding: 16,
  borderRadius: 22,
  background:
    "radial-gradient(circle at top left, rgba(15,23,42,0.98), rgba(15,23,42,0.98))",
  border: "1px solid rgba(148,163,184,0.55)",
  boxShadow: "0 20px 60px rgba(15,23,42,0.9)",
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  flexWrap: "wrap",
  gap: 12,
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
};

const filterLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#9ca3c7",
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const selectStyle: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.5)",
  background: "rgba(15,23,42,0.9)",
  color: "#e5e7ff",
  fontSize: 12,
};

const errorStyle: CSSProperties = {
  marginTop: 8,
  padding: "6px 10px",
  borderRadius: 8,
  background: "rgba(248,113,113,0.14)",
  border: "1px solid rgba(248,113,113,0.7)",
  color: "#fecaca",
  fontSize: 12,
};

const tableShellStyle: CSSProperties = {
  marginTop: 10,
  borderRadius: 14,
  border: "1px solid rgba(30,64,175,0.7)",
  overflow: "auto",
  maxHeight: 400,
  background:
    "linear-gradient(135deg, rgba(15,23,42,0.98), rgba(15,23,42,0.95))",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 500,
};

const rowStyle: CSSProperties = {
  cursor: "pointer",
  transition: "background 0.15s",
};

const footerStyle: CSSProperties = {
  marginTop: 12,
  display: "flex",
  gap: 10,
  justifyContent: "flex-end",
};

const loadingStyle: CSSProperties = {
  fontSize: 12,
  color: "#9ca3c7",
};

const loadMoreStyle: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.6)",
  background: "rgba(15,23,42,0.8)",
  color: "#e5e7ff",
  fontSize: 12,
  cursor: "pointer",
};

const viewAllStyle: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid rgba(59,130,246,0.8)",
  background:
    "linear-gradient(135deg, rgba(15,23,42,0.98), rgba(37,99,235,0.65))",
  color: "#dbeafe",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};

// Metric colors
const passStyle: CSSProperties = { color: "#bbf7d0" };
const failStyle: CSSProperties = { color: "#fecaca" };
const driftStyle: CSSProperties = { color: "#fef9c3" };
const missStyle: CSSProperties = { color: "#9ca3c7" };
