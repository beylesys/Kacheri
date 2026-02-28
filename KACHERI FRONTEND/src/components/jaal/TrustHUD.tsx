// KACHERI FRONTEND/src/components/jaal/TrustHUD.tsx
// Trust confidence indicator — Slice S4 (Phase B)
//
// Renders in two modes:
//   compact=true  → small badge in navbar (colored dot + score)
//   compact=false → full panel with gauge, metrics, providers, egress, anomalies

import { useMemo } from 'react';
import type { TrustSummary } from '../../api/jaal';

/* ---------- Helpers ---------- */

type TrustColor = 'green' | 'amber' | 'red';

function computeTrustScore(summary: TrustSummary | null): number {
  if (!summary) return 0;
  const { allow, deny } = summary.totals;
  const total = allow + deny;
  if (total === 0) return 100;

  // Base score from allow/deny ratio
  let score = Math.round((allow / total) * 100);

  // Penalty for anomalies
  const redCount = summary.anomalies.filter((a) => a.severity === 'red').length;
  const amberCount = summary.anomalies.filter((a) => a.severity === 'amber').length;
  score -= redCount * 20;
  score -= amberCount * 5;

  return Math.max(0, Math.min(100, score));
}

function getTrustColor(score: number, anomalies: TrustSummary['anomalies']): TrustColor {
  const hasRed = anomalies.some((a) => a.severity === 'red');
  if (hasRed || score < 50) return 'red';
  const hasAmber = anomalies.some((a) => a.severity === 'amber');
  if (hasAmber || score < 80) return 'amber';
  return 'green';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/* ---------- SVG Gauge Constants ---------- */

const GAUGE_SIZE = 96;
const GAUGE_STROKE = 8;
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

/* ---------- Component ---------- */

interface TrustHUDProps {
  trustSummary: TrustSummary | null;
  onRefresh?: () => void;
  compact?: boolean;
}

export function TrustHUD({ trustSummary, onRefresh, compact }: TrustHUDProps) {
  const score = useMemo(
    () => computeTrustScore(trustSummary),
    [trustSummary],
  );

  const color = useMemo(
    () => getTrustColor(score, trustSummary?.anomalies ?? []),
    [score, trustSummary?.anomalies],
  );

  /* ---- Compact mode ---- */
  if (compact) {
    return (
      <div
        className="trust-hud-compact"
        title={`Trust Score: ${score}`}
        role="status"
        aria-label={`Trust score ${score} out of 100, status ${color}`}
      >
        <span className={`trust-badge ${color}`} aria-hidden="true" />
        <span className="trust-score">{score}</span>
      </div>
    );
  }

  /* ---- Full panel mode ---- */
  if (!trustSummary) {
    return (
      <div className="trust-hud-full">
        <div className="trust-empty">No trust data available yet.</div>
      </div>
    );
  }

  const { totals, providers, egress, anomalies } = trustSummary;
  const providerTotal = providers.local + providers.openai + providers.anthropic + providers.other;
  const uniqueDomains = Object.keys(egress.byDomain).length;

  // Gauge offset: full = circumference, 0% = 0 offset
  const gaugeOffset = GAUGE_CIRCUMFERENCE * (1 - score / 100);

  return (
    <div className="trust-hud-full" role="region" aria-label="Trust dashboard">
      {/* Gauge */}
      <div className="trust-hud-section">
        <div className="trust-gauge-container">
          <svg
            className="trust-gauge-svg"
            viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}
            aria-hidden="true"
          >
            <circle
              className="trust-gauge-track"
              cx={GAUGE_SIZE / 2}
              cy={GAUGE_SIZE / 2}
              r={GAUGE_RADIUS}
            />
            <circle
              className={`trust-gauge-fill ${color}`}
              cx={GAUGE_SIZE / 2}
              cy={GAUGE_SIZE / 2}
              r={GAUGE_RADIUS}
              strokeDasharray={GAUGE_CIRCUMFERENCE}
              strokeDashoffset={gaugeOffset}
              transform={`rotate(-90 ${GAUGE_SIZE / 2} ${GAUGE_SIZE / 2})`}
            />
            <text
              className="trust-gauge-value"
              x={GAUGE_SIZE / 2}
              y={GAUGE_SIZE / 2}
            >
              {score}
            </text>
          </svg>
        </div>
      </div>

      {/* Decision Metrics */}
      <div className="trust-hud-section">
        <div className="trust-hud-section-title">Decisions</div>
        <div className="trust-metrics">
          <div className="trust-metric">
            <span className="trust-metric-value allow">{totals.allow}</span>
            <span className="trust-metric-label">Allow</span>
          </div>
          <div className="trust-metric">
            <span className="trust-metric-value deny">{totals.deny}</span>
            <span className="trust-metric-label">Deny</span>
          </div>
          <div className="trust-metric">
            <span className="trust-metric-value total">{totals.actions}</span>
            <span className="trust-metric-label">Total</span>
          </div>
        </div>
      </div>

      {/* Provider Breakdown */}
      {providerTotal > 0 && (
        <div className="trust-hud-section">
          <div className="trust-hud-section-title">Providers</div>
          <div className="trust-provider-bars">
            {providers.local > 0 && (
              <div
                className="trust-provider-bar local"
                style={{ width: `${(providers.local / providerTotal) * 100}%` }}
              />
            )}
            {providers.openai > 0 && (
              <div
                className="trust-provider-bar openai"
                style={{ width: `${(providers.openai / providerTotal) * 100}%` }}
              />
            )}
            {providers.anthropic > 0 && (
              <div
                className="trust-provider-bar anthropic"
                style={{ width: `${(providers.anthropic / providerTotal) * 100}%` }}
              />
            )}
            {providers.other > 0 && (
              <div
                className="trust-provider-bar other"
                style={{ width: `${(providers.other / providerTotal) * 100}%` }}
              />
            )}
          </div>
          <div className="trust-provider-legend">
            {providers.local > 0 && (
              <span className="trust-provider-legend-item">
                <span className="trust-provider-legend-dot" style={{ background: '#3b82f6' }} />
                Local ({providers.local})
              </span>
            )}
            {providers.openai > 0 && (
              <span className="trust-provider-legend-item">
                <span className="trust-provider-legend-dot" style={{ background: '#22c55e' }} />
                OpenAI ({providers.openai})
              </span>
            )}
            {providers.anthropic > 0 && (
              <span className="trust-provider-legend-item">
                <span className="trust-provider-legend-dot" style={{ background: '#f59e0b' }} />
                Anthropic ({providers.anthropic})
              </span>
            )}
            {providers.other > 0 && (
              <span className="trust-provider-legend-item">
                <span className="trust-provider-legend-dot" style={{ background: '#9aa4b2' }} />
                Other ({providers.other})
              </span>
            )}
          </div>
        </div>
      )}

      {/* Egress Summary */}
      <div className="trust-hud-section">
        <div className="trust-hud-section-title">Egress</div>
        <div className="trust-egress-stat">
          <span className="trust-egress-label">Events</span>
          <span className="trust-egress-value">{egress.totalEvents}</span>
        </div>
        <div className="trust-egress-stat">
          <span className="trust-egress-label">Data Sent</span>
          <span className="trust-egress-value">{formatBytes(egress.totalBytes)}</span>
        </div>
        <div className="trust-egress-stat">
          <span className="trust-egress-label">Unique Domains</span>
          <span className="trust-egress-value">{uniqueDomains}</span>
        </div>
      </div>

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <div className="trust-hud-section">
          <div className="trust-hud-section-title">
            Anomalies ({anomalies.length})
          </div>
          {anomalies.map((anomaly, i) => (
            <div className="trust-anomaly" key={`${anomaly.code}-${i}`}>
              <span className={`trust-anomaly-badge ${anomaly.severity}`}>
                {anomaly.severity}
              </span>
              <div className="trust-anomaly-content">
                <span className="trust-anomaly-title">{anomaly.title}</span>
                <span className="trust-anomaly-details">{anomaly.details}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Refresh */}
      {onRefresh && (
        <button
          className="jaal-action-btn"
          onClick={onRefresh}
          type="button"
          aria-label="Refresh trust data"
        >
          Refresh
        </button>
      )}
    </div>
  );
}
