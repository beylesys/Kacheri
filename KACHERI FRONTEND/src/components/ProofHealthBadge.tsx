// KACHERI FRONTEND/src/components/ProofHealthBadge.tsx
// Phase 5 - P1.1: Per-Document Proof Health Badge
import { useEffect, useState, type CSSProperties } from "react";
import { ProofHealthAPI, type ProofHealthResult, type ProofHealthStatus } from "../api";
import { PROOF_TOOLTIPS } from "../utils/tooltipHelpers";

/* ---------- Status config ---------- */
interface StatusConfig {
  label: string;
  shortLabel: string;
  color: string;
  bg: string;
  border: string;
  dot: string;
}

function getStatusConfig(status: ProofHealthStatus): StatusConfig {
  switch (status) {
    case "healthy":
      return {
        label: "Verified",
        shortLabel: "OK",
        color: "#bbf7d0",
        bg: "rgba(22,163,74,0.18)",
        border: "rgba(34,197,94,0.8)",
        dot: "#22c55e",
      };
    case "stale":
      return {
        label: "Stale",
        shortLabel: "Stale",
        color: "#fef9c3",
        bg: "rgba(251,191,36,0.14)",
        border: "rgba(251,191,36,0.7)",
        dot: "#fbbf24",
      };
    case "unverified":
      return {
        label: "Unverified",
        shortLabel: "?",
        color: "#9ca3c7",
        bg: "rgba(148,163,184,0.14)",
        border: "rgba(148,163,184,0.5)",
        dot: "#94a3b8",
      };
    case "failed":
      return {
        label: "Failed",
        shortLabel: "!",
        color: "#fecaca",
        bg: "rgba(248,113,113,0.14)",
        border: "rgba(248,113,113,0.7)",
        dot: "#f87171",
      };
  }
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

/* ---------- Props ---------- */
export interface ProofHealthBadgeProps {
  docId: string;
  size?: "sm" | "md";
  showTooltip?: boolean;
  /** Optional cached health result to avoid extra fetch */
  health?: ProofHealthResult | null;
  /** Callback when health is loaded */
  onHealthLoaded?: (health: ProofHealthResult) => void;
}

/* ---------- Component ---------- */
export default function ProofHealthBadge({
  docId,
  size = "sm",
  showTooltip = true,
  health: cachedHealth,
  onHealthLoaded,
}: ProofHealthBadgeProps) {
  const [health, setHealth] = useState<ProofHealthResult | null>(cachedHealth ?? null);
  const [loading, setLoading] = useState(!cachedHealth);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cachedHealth) {
      setHealth(cachedHealth);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchHealth() {
      setLoading(true);
      setError(null);
      try {
        const result = await ProofHealthAPI.get(docId);
        if (!cancelled) {
          setHealth(result);
          onHealthLoaded?.(result);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to load health");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchHealth();

    return () => {
      cancelled = true;
    };
  }, [docId, cachedHealth, onHealthLoaded]);

  // Loading state
  if (loading) {
    return (
      <span style={getContainerStyle(size, null)}>
        <span style={loadingDotStyle} />
      </span>
    );
  }

  // Error state - show gray unverified
  if (error || !health) {
    const cfg = getStatusConfig("unverified");
    return (
      <span
        style={getContainerStyle(size, cfg)}
        title={showTooltip ? (error || "Unable to verify") : undefined}
      >
        <span style={{ ...dotStyle, backgroundColor: cfg.dot }} />
        {size === "md" && <span style={labelStyle}>{cfg.label}</span>}
      </span>
    );
  }

  const cfg = getStatusConfig(health.status);
  const tooltip = buildTooltip(health);

  return (
    <span
      style={getContainerStyle(size, cfg)}
      title={showTooltip ? tooltip : undefined}
    >
      <span style={{ ...dotStyle, backgroundColor: cfg.dot }} />
      {size === "md" && <span style={labelStyle}>{cfg.label}</span>}
    </span>
  );
}

/* ---------- Tooltip builder ---------- */
function buildTooltip(health: ProofHealthResult): string {
  const lines: string[] = [];

  // Status explanation from centralized tooltips
  lines.push(PROOF_TOOLTIPS.healthStatus[health.status]);
  lines.push("");

  // Score
  lines.push(`Health Score: ${health.score}%`);
  lines.push("");

  // Exports summary
  const exp = health.exports;
  if (exp.total > 0) {
    lines.push(`Exports: ${exp.pass}/${exp.total} verified`);
    if (exp.fail > 0) lines.push(`  - ${exp.fail} failed`);
    if (exp.miss > 0) lines.push(`  - ${exp.miss} missing`);
  } else {
    lines.push("Exports: None yet");
  }

  // Compose summary
  const comp = health.compose;
  if (comp.total > 0) {
    lines.push(`AI Actions: ${comp.pass}/${comp.total} deterministic`);
    if (comp.drift > 0) lines.push(`  - ${comp.drift} drift`);
    if (comp.miss > 0) lines.push(`  - ${comp.miss} missing`);
  }

  // Last verified
  if (health.lastVerified) {
    lines.push("");
    lines.push(`Last verified: ${formatRelativeTime(health.lastVerified)}`);
  }

  // Learn more hint
  lines.push("");
  lines.push(PROOF_TOOLTIPS.learn.learnMore);

  return lines.join("\n");
}

/* ---------- Styles ---------- */
function getContainerStyle(size: "sm" | "md", cfg: StatusConfig | null): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: size === "sm" ? 0 : 6,
    borderRadius: 999,
    cursor: "default",
  };

  if (size === "sm") {
    return { ...base, padding: 2 };
  }

  // md size with background
  return {
    ...base,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 500,
    background: cfg?.bg ?? "transparent",
    border: `1px solid ${cfg?.border ?? "transparent"}`,
    color: cfg?.color ?? "#9ca3c7",
  };
}

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
  animation: "pulse 1.5s ease-in-out infinite",
};

const labelStyle: CSSProperties = {
  letterSpacing: 0.4,
};
