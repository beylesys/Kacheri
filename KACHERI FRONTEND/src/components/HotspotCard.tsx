// KACHERI FRONTEND/src/components/HotspotCard.tsx
// Phase 5 - P2.2: Card component for displaying AI usage hotspots
//
// Displays a document with high AI activity, showing risk level and stats.

import type { CSSProperties } from "react";
import type { HotspotData } from "../api";

export interface HotspotCardProps {
  hotspot: HotspotData;
  onNavigate?: (docId: string) => void;
}

export default function HotspotCard({ hotspot, onNavigate }: HotspotCardProps) {
  const riskStyles = getRiskStyles(hotspot.riskLevel);

  const handleClick = () => {
    if (onNavigate) {
      onNavigate(hotspot.docId);
    }
  };

  const lastActivityFormatted = formatRelativeTime(hotspot.lastActivity);

  return (
    <div style={{ ...cardStyle, borderColor: riskStyles.border }}>
      {/* Header with title and risk badge */}
      <div style={headerStyle}>
        <div style={titleContainerStyle}>
          <button
            type="button"
            onClick={handleClick}
            style={titleButtonStyle}
            title={`Open ${hotspot.docTitle}`}
          >
            {hotspot.docTitle}
          </button>
          {hotspot.workspaceName && (
            <div style={workspaceStyle}>{hotspot.workspaceName}</div>
          )}
        </div>
        <span style={{ ...badgeStyle, ...riskStyles.badge }}>
          {hotspot.riskLevel.toUpperCase()}
        </span>
      </div>

      {/* Stats row */}
      <div style={statsRowStyle}>
        <div style={statStyle}>
          <span style={statLabelStyle}>AI Actions</span>
          <span style={statValueStyle}>{hotspot.aiActionCount}</span>
        </div>
        <div style={statStyle}>
          <span style={statLabelStyle}>Failures</span>
          <span
            style={{
              ...statValueStyle,
              color: hotspot.verificationFailures > 0 ? "#fca5a5" : undefined,
            }}
          >
            {hotspot.verificationFailures}
          </span>
        </div>
        <div style={statStyle}>
          <span style={statLabelStyle}>Drift</span>
          <span
            style={{
              ...statValueStyle,
              color: hotspot.driftEvents > 0 ? "#fde047" : undefined,
            }}
          >
            {hotspot.driftEvents}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div style={footerStyle}>
        <span style={lastActivityStyle}>Last activity: {lastActivityFormatted}</span>
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */

function getRiskStyles(level: "high" | "medium" | "low") {
  switch (level) {
    case "high":
      return {
        border: "rgba(248, 113, 113, 0.8)",
        badge: {
          background: "rgba(248, 113, 113, 0.2)",
          color: "#fca5a5",
          borderColor: "rgba(248, 113, 113, 0.6)",
        },
      };
    case "medium":
      return {
        border: "rgba(251, 191, 36, 0.8)",
        badge: {
          background: "rgba(251, 191, 36, 0.2)",
          color: "#fde047",
          borderColor: "rgba(251, 191, 36, 0.6)",
        },
      };
    case "low":
    default:
      return {
        border: "rgba(34, 197, 94, 0.8)",
        badge: {
          background: "rgba(34, 197, 94, 0.2)",
          color: "#86efac",
          borderColor: "rgba(34, 197, 94, 0.6)",
        },
      };
  }
}

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

/* ---------- Styles ---------- */

const cardStyle: CSSProperties = {
  padding: 14,
  borderRadius: 16,
  background:
    "linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.95))",
  border: "1px solid",
  minWidth: 220,
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 8,
  marginBottom: 12,
};

const titleContainerStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const titleButtonStyle: CSSProperties = {
  all: "unset",
  fontSize: 14,
  fontWeight: 600,
  color: "#e5e7ff",
  cursor: "pointer",
  display: "block",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "100%",
};

const workspaceStyle: CSSProperties = {
  fontSize: 11,
  color: "#9ca3af",
  marginTop: 2,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const badgeStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.5,
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid",
  whiteSpace: "nowrap",
};

const statsRowStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  marginBottom: 10,
};

const statStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const statLabelStyle: CSSProperties = {
  fontSize: 10,
  color: "#9ca3af",
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const statValueStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: "#e5e7ff",
};

const footerStyle: CSSProperties = {
  borderTop: "1px solid rgba(148, 163, 184, 0.2)",
  paddingTop: 8,
};

const lastActivityStyle: CSSProperties = {
  fontSize: 11,
  color: "#9ca3af",
};
