// KACHERI FRONTEND/src/components/ComposeDeterminismIndicator.tsx
// Phase 5 - P1.4: Compose Determinism Indicator
import { useEffect, useState, type CSSProperties } from "react";
import { ComposeDeterminismAPI, type ComposeDeterminismResult } from "../api";

/* ---------- Props ---------- */
export interface ComposeDeterminismIndicatorProps {
  docId: string;
  /** Compact mode shows just the rate badge */
  compact?: boolean;
}

/* ---------- Component ---------- */
export default function ComposeDeterminismIndicator({
  docId,
  compact = false,
}: ComposeDeterminismIndicatorProps) {
  const [data, setData] = useState<ComposeDeterminismResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const result = await ComposeDeterminismAPI.get(docId);
        if (!cancelled) {
          setData(result);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to load");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [docId]);

  // Loading state
  if (loading) {
    return (
      <span style={containerStyle} title="Loading determinism data...">
        <span style={loadingDotStyle} />
      </span>
    );
  }

  // Error or no data
  if (error || !data) {
    return null;
  }

  // No compose actions
  if (data.total === 0) {
    return null;
  }

  const ratePercent = Math.round(data.rate * 100);
  const hasIssues = data.drift > 0;
  const cfg = getDeterminismConfig(data.rate, data.drift);

  const tooltip = buildTooltip(data);

  if (compact) {
    return (
      <span
        style={{ ...badgeStyle, ...cfg.style }}
        title={tooltip}
      >
        {ratePercent}%
      </span>
    );
  }

  return (
    <span style={containerStyle} title={tooltip}>
      <span style={{ ...dotStyle, backgroundColor: cfg.dotColor }} />
      <span style={labelStyle}>
        Compose: <span style={{ fontWeight: 600 }}>{ratePercent}%</span>
        {hasIssues && (
          <span style={driftLabelStyle}> ({data.drift} drift)</span>
        )}
      </span>
    </span>
  );
}

/* ---------- Config helpers ---------- */
function getDeterminismConfig(rate: number, drift: number): {
  dotColor: string;
  style: CSSProperties;
} {
  if (drift > 0) {
    // Has drift issues
    return {
      dotColor: "#f87171",
      style: {
        background: "rgba(248,113,113,0.14)",
        border: "1px solid rgba(248,113,113,0.7)",
        color: "#fecaca",
      },
    };
  }
  if (rate >= 0.95) {
    // Excellent
    return {
      dotColor: "#22c55e",
      style: {
        background: "rgba(22,163,74,0.18)",
        border: "1px solid rgba(34,197,94,0.8)",
        color: "#bbf7d0",
      },
    };
  }
  if (rate >= 0.7) {
    // Good
    return {
      dotColor: "#fbbf24",
      style: {
        background: "rgba(251,191,36,0.14)",
        border: "1px solid rgba(251,191,36,0.7)",
        color: "#fef9c3",
      },
    };
  }
  // Low rate
  return {
    dotColor: "#94a3b8",
    style: {
      background: "rgba(148,163,184,0.14)",
      border: "1px solid rgba(148,163,184,0.5)",
      color: "#9ca3c7",
    },
  };
}

function buildTooltip(data: ComposeDeterminismResult): string {
  const lines: string[] = [];
  lines.push(`Compose Determinism: ${Math.round(data.rate * 100)}%`);
  lines.push(`Total compose actions: ${data.total}`);
  lines.push(`Checked: ${data.checked}`);
  if (data.pass > 0) lines.push(`Pass: ${data.pass}`);
  if (data.drift > 0) lines.push(`Drift detected: ${data.drift}`);
  if (data.lastChecked) {
    lines.push(`Last checked: ${formatRelativeTime(data.lastChecked)}`);
  }
  return lines.join("\n");
}

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return "never";
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) return "just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return isoDate;
  }
}

/* ---------- Styles ---------- */
const containerStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  cursor: "default",
};

const dotStyle: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  flexShrink: 0,
};

const loadingDotStyle: CSSProperties = {
  ...dotStyle,
  backgroundColor: "#9ca3c7",
  opacity: 0.5,
};

const labelStyle: CSSProperties = {
  color: "#9ca3c7",
};

const driftLabelStyle: CSSProperties = {
  color: "#f87171",
  fontSize: 10,
};

const badgeStyle: CSSProperties = {
  display: "inline-block",
  padding: "3px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  cursor: "help",
};
