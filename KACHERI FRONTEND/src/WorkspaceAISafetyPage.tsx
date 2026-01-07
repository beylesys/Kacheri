// KACHERI FRONTEND/src/WorkspaceAISafetyPage.tsx
// Phase 5 - P2.1: Workspace-scoped AI Safety Dashboard
//
// Displays AI safety metrics for a specific workspace including:
// - Summary statistics (docs, AI actions, verification/determinism rates)
// - Health distribution (healthy, stale, unverified, failed)
// - Recent AI activity
// - Top providers used

import { useEffect, useState, type CSSProperties, type PropsWithChildren } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { WorkspaceAISafetyAPI, type WorkspaceAISafetyResult } from "./api";

export default function WorkspaceAISafetyPage() {
  const { id: workspaceId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<WorkspaceAISafetyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await WorkspaceAISafetyAPI.get(workspaceId);
        setData(result);
      } catch (err: any) {
        setError(err?.message || "Failed to load workspace safety data");
      } finally {
        setLoading(false);
      }
    }

    load();
    // Refresh every 30 seconds
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  if (loading && !data) {
    return (
      <div style={pageStyle}>
        <div style={shellStyle}>
          <div style={{ color: "#9ca3c7", fontSize: 14 }}>Loading workspace safety data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={shellStyle}>
          <div style={errorBannerStyle}>Error: {error}</div>
          <button
            type="button"
            onClick={() => navigate("/")}
            style={backButtonStyle}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={pageStyle}>
        <div style={shellStyle}>
          <div style={{ color: "#9ca3c7", fontSize: 14 }}>No data available</div>
        </div>
      </div>
    );
  }

  const totalHealth = data.health.healthy + data.health.stale + data.health.unverified + data.health.failed;

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        {/* Header */}
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>WORKSPACE AI SAFETY</div>
            <h1 style={titleStyle}>{data.workspaceName}</h1>
            <p style={subtitleStyle}>
              AI safety metrics and verification status for this workspace.
            </p>
          </div>
          <div style={headerRightStyle}>
            <Link to="/ai-watch" style={linkStyle}>
              View Global Dashboard
            </Link>
            <button
              type="button"
              onClick={() => navigate("/")}
              style={backButtonStyle}
            >
              Back to Files
            </button>
          </div>
        </header>

        {/* Summary Metrics */}
        <section style={{ marginTop: 20 }}>
          <div style={topGridStyle}>
            <MetricTile
              label="TOTAL DOCUMENTS"
              value={data.summary.totalDocs.toLocaleString()}
              caption="Documents in this workspace."
            />
            <MetricTile
              label="DOCS WITH AI"
              value={data.summary.docsWithAI.toLocaleString()}
              caption="Documents touched by AI."
            />
            <MetricTile
              label="AI ACTIONS"
              value={data.summary.totalAIActions.toLocaleString()}
              caption="Total AI invocations."
            />
            <MetricTile
              label="VERIFICATION RATE"
              value={`${data.summary.verificationRate}%`}
              caption="Export verification pass rate."
              tone={data.summary.verificationRate >= 90 ? "success" : "warning"}
            />
            <MetricTile
              label="DETERMINISM RATE"
              value={`${data.summary.determinismRate}%`}
              caption="Compose reproducibility."
              tone={data.summary.determinismRate >= 90 ? "success" : "warning"}
            />
          </div>
        </section>

        {/* Health Distribution + Top Providers */}
        <section style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Health Distribution */}
          <div style={panelCardStyle}>
            <PanelHeader
              title="Document Health"
              subtitle="Proof status distribution across workspace documents."
            />
            <div style={healthGridStyle}>
              <HealthBar
                label="Healthy"
                count={data.health.healthy}
                total={totalHealth}
                color="#22c55e"
              />
              <HealthBar
                label="Stale"
                count={data.health.stale}
                total={totalHealth}
                color="#eab308"
              />
              <HealthBar
                label="Unverified"
                count={data.health.unverified}
                total={totalHealth}
                color="#6b7280"
              />
              <HealthBar
                label="Failed"
                count={data.health.failed}
                total={totalHealth}
                color="#ef4444"
              />
            </div>
          </div>

          {/* Top Providers */}
          <div style={panelCardStyle}>
            <PanelHeader
              title="Top AI Providers"
              subtitle="Most used providers in this workspace."
            />
            <div style={tableShellStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <Th>Provider</Th>
                    <Th>Model</Th>
                    <Th align="right">Calls</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.topProviders.map((p, i) => (
                    <tr key={`${p.provider}-${p.model}-${i}`}>
                      <Td mono>{p.provider}</Td>
                      <Td mono style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.model}
                      </Td>
                      <Td align="right">{p.callCount.toLocaleString()}</Td>
                    </tr>
                  ))}
                  {data.topProviders.length === 0 && (
                    <tr>
                      <Td colSpan={3} style={{ color: "#9ca3c7" }}>
                        No provider data yet.
                      </Td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Recent Activity */}
        <section style={{ marginTop: 20 }}>
          <div style={panelCardStyle}>
            <PanelHeader
              title="Recent AI Activity"
              subtitle="Latest AI actions in this workspace."
            />
            <div style={tableShellStyle}>
              <table style={{ ...tableStyle, minWidth: 600 }}>
                <thead>
                  <tr>
                    <Th>Document</Th>
                    <Th>Action</Th>
                    <Th>Status</Th>
                    <Th>When</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentActivity.map((a, i) => (
                    <tr key={`${a.docId}-${a.ts}-${i}`}>
                      <Td>
                        <Link
                          to={`/doc/${a.docId}`}
                          style={{ color: "#93c5fd", textDecoration: "none" }}
                        >
                          {a.docTitle}
                        </Link>
                      </Td>
                      <Td mono>{a.action}</Td>
                      <Td>
                        <StatusBadge status={a.status} />
                      </Td>
                      <Td style={{ fontSize: 11, color: "#9ca3c7" }}>
                        {formatRelativeTime(a.ts)}
                      </Td>
                    </tr>
                  ))}
                  {data.recentActivity.length === 0 && (
                    <tr>
                      <Td colSpan={4} style={{ color: "#9ca3c7" }}>
                        No recent AI activity.
                      </Td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return isoString;
  }
}

/* ---------- UI Components ---------- */

function MetricTile(props: {
  label: string;
  value: string;
  caption: string;
  tone?: "default" | "success" | "warning";
}) {
  const border =
    props.tone === "success"
      ? "rgba(74, 222, 128, 0.45)"
      : props.tone === "warning"
      ? "rgba(251, 191, 36, 0.45)"
      : "rgba(129, 140, 248, 0.45)";
  const glow =
    props.tone === "success"
      ? "0 18px 40px rgba(22, 163, 74, 0.55)"
      : props.tone === "warning"
      ? "0 18px 40px rgba(245, 158, 11, 0.55)"
      : "0 18px 40px rgba(30, 64, 175, 0.55)";
  return (
    <div
      style={{
        borderRadius: 18,
        padding: "12px 16px",
        background:
          "radial-gradient(circle at top left, rgba(37,99,235,0.22), rgba(15,23,42,0.95))",
        border: `1px solid ${border}`,
        boxShadow: glow,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: "#9ca3c7", marginBottom: 4 }}>
        {props.label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#f9fafb" }}>
        {props.value}
      </div>
      <div style={{ fontSize: 10, color: "#9ca3c7", marginTop: 2 }}>
        {props.caption}
      </div>
    </div>
  );
}

function PanelHeader(props: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "#e5e7ff" }}>
        {props.title}
      </div>
      {props.subtitle && (
        <div style={{ fontSize: 11, color: "#9ca3c7", marginTop: 2 }}>
          {props.subtitle}
        </div>
      )}
    </div>
  );
}

function HealthBar(props: { label: string; count: number; total: number; color: string }) {
  const percent = props.total > 0 ? (props.count / props.total) * 100 : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "#e5e7ff" }}>{props.label}</span>
        <span style={{ fontSize: 12, color: "#9ca3c7" }}>{props.count}</span>
      </div>
      <div style={{ height: 6, background: "rgba(148, 163, 184, 0.2)", borderRadius: 3 }}>
        <div
          style={{
            height: "100%",
            width: `${percent}%`,
            background: props.color,
            borderRadius: 3,
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}

function StatusBadge(props: { status: "pass" | "fail" | "pending" }) {
  const styles: Record<string, CSSProperties> = {
    pass: {
      background: "rgba(34, 197, 94, 0.2)",
      color: "#86efac",
      borderColor: "rgba(34, 197, 94, 0.6)",
    },
    fail: {
      background: "rgba(248, 113, 113, 0.2)",
      color: "#fca5a5",
      borderColor: "rgba(248, 113, 113, 0.6)",
    },
    pending: {
      background: "rgba(148, 163, 184, 0.2)",
      color: "#9ca3c7",
      borderColor: "rgba(148, 163, 184, 0.6)",
    },
  };

  return (
    <span
      style={{
        ...badgeStyle,
        ...styles[props.status],
      }}
    >
      {props.status.toUpperCase()}
    </span>
  );
}

function Th(props: PropsWithChildren<{ align?: "left" | "right" }>) {
  return (
    <th
      style={{
        textAlign: props.align || "left",
        padding: "8px 10px",
        fontWeight: 600,
        fontSize: 11,
        color: "#cbd5f5",
        borderBottom: "1px solid rgba(30,64,175,0.7)",
        background: "linear-gradient(145deg, rgba(15,23,42,0.98), rgba(30,64,175,0.6))",
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

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  padding: "24px 18px 32px",
  background: "radial-gradient(circle at top left, #020617 0, #020617 40%, #020617 100%)",
  color: "#e5e7ff",
};

const shellStyle: CSSProperties = {
  maxWidth: 1000,
  margin: "0 auto",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 20,
  alignItems: "flex-start",
};

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: 2,
  textTransform: "uppercase",
  color: "#9ca3c7",
};

const titleStyle: CSSProperties = {
  fontSize: 26,
  fontWeight: 800,
  letterSpacing: 0.4,
  margin: "4px 0 4px",
};

const subtitleStyle: CSSProperties = {
  fontSize: 12,
  color: "#cbd5f5",
  maxWidth: 420,
};

const headerRightStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 8,
};

const linkStyle: CSSProperties = {
  fontSize: 12,
  color: "#93c5fd",
  textDecoration: "none",
};

const backButtonStyle: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.7)",
  background: "linear-gradient(145deg, #111827, #1f2937)",
  color: "#e5e7ff",
  fontSize: 12,
  cursor: "pointer",
};

const topGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const panelCardStyle: CSSProperties = {
  padding: 14,
  borderRadius: 18,
  background: "radial-gradient(circle at top left, rgba(15,23,42,0.98), rgba(15,23,42,0.98))",
  border: "1px solid rgba(148,163,184,0.55)",
  boxShadow: "0 20px 60px rgba(15,23,42,0.9)",
};

const healthGridStyle: CSSProperties = {
  marginTop: 10,
};

const tableShellStyle: CSSProperties = {
  marginTop: 10,
  borderRadius: 12,
  border: "1px solid rgba(30,64,175,0.7)",
  overflow: "auto",
  background: "linear-gradient(135deg, rgba(15,23,42,0.98), rgba(15,23,42,0.95))",
  maxHeight: 300,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const badgeStyle: CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: 0.5,
  padding: "2px 6px",
  borderRadius: 999,
  border: "1px solid",
};

const errorBannerStyle: CSSProperties = {
  marginTop: 16,
  padding: "8px 10px",
  borderRadius: 12,
  background: "rgba(248,113,113,0.14)",
  border: "1px solid rgba(248,113,113,0.7)",
  fontSize: 12,
  color: "#fca5a5",
};
