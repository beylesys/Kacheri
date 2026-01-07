// KACHERI FRONTEND/src/AIDashboard.tsx
import { useEffect, useMemo, useState, type CSSProperties, type PropsWithChildren } from "react";
import { useNavigate } from "react-router-dom";
import ProviderModelPicker, { type ProviderModelSeed } from "./components/ProviderModelPicker";
import ReportHistoryTable from "./components/ReportHistoryTable";
import ReportDetailModal from "./components/ReportDetailModal";
import HotspotCard from "./components/HotspotCard";
import {
  AIWatchAPI,
  AiAPI,
  DocsAPI,
  ProviderAnalyticsAPI,
  HotspotsAPI,
  type ProviderName,
  type VerificationReportMeta,
  type ProviderAnalyticsResult,
  type HotspotsResult,
} from "./api";

/* ---------- Normalized types we keep in state ---------- */
type Summary = {
  total: number;
  byAction: Record<string, number>; // always a map after normalization
  avgElapsedMs: number;
  last24h: number;
  verificationRate: number; // 0..1
};

type WatchEvent = {
  id: number | string;
  ts: number;
  docId: string;
  path?: string | null;
  action: string;
  elapsedMs: number;
  preview: string;
  inputSize: number;
};

type ExportSummary = {
  total: number;
  pass: number;
  fail: number;
  miss: number;
  totalByKind: { docx: number; pdf: number };
  byKind: {
    docx: { pass: number; fail: number; miss: number; total: number };
    pdf: { pass: number; fail: number; miss: number; total: number };
  };
};

type ComposeSummary = {
  total: number;
  pass: number;
  drift: number;
  miss: number;
  rerun: boolean;
};

/* ---------- Small helpers ---------- */
function fmtMs(n: number) {
  if (!Number.isFinite(n)) return "-";
  if (n < 1000) return `${n.toFixed(0)} ms`;
  const s = n / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem.toFixed(0)}s`;
}
function fmtTs(t: number) {
  try {
    return new Date(t).toLocaleString();
  } catch {
    return String(t);
  }
}

/** API may return byAction as an array or a map; normalize to a map. */
function normalizeByAction(byAction: unknown): Record<string, number> {
  if (Array.isArray(byAction)) {
    const rec: Record<string, number> = {};
    for (const row of byAction as any[]) {
      const a = row?.action;
      const c = row?.count;
      if (typeof a === "string" && Number.isFinite(c)) rec[a] = Number(c);
    }
    return rec;
  }
  if (byAction && typeof byAction === "object") {
    // already a map
    return byAction as Record<string, number>;
  }
  return {};
}

/* ---------- AI insight prompt ---------- */
function makeInsightPrompt(data: {
  summary: Summary | null;
  exportsSum: ExportSummary | null;
  composeSum: ComposeSummary | null;
  events: WatchEvent[];
}) {
  const trimmed = {
    summary: data.summary,
    exports: data.exportsSum,
    compose: data.composeSum,
    recentEvents: data.events.slice(0, 20),
  };
  return [
    "You are an observability analyst. Turn the telemetry into crisp, actionable insights.",
    "Return 6–10 bullets covering: trends, anomalies, verification issues, risks, and concrete next actions.",
    "Use numbers from the data where possible. Avoid fluff. Plain text only.",
    "",
    "Telemetry JSON:",
    JSON.stringify(trimmed, null, 2),
  ].join("\n");
}

/* ---------- Component ---------- */
export default function AIDashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<WatchEvent[]>([]);
  const [exportsSum, setExportsSum] = useState<ExportSummary | null>(null);
  const [composeSum, setComposeSum] = useState<ComposeSummary | null>(null);

  // Phase 5 - P2: Provider Analytics and Hotspots
  const [providerData, setProviderData] = useState<ProviderAnalyticsResult | null>(null);
  const [hotspotsData, setHotspotsData] = useState<HotspotsResult | null>(null);
  const [hotspotsPeriod, setHotspotsPeriod] = useState<"24h" | "7d" | "30d">("24h");

  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // --- AI Insight controls/state ---
  const [pms, setPms] = useState<ProviderModelSeed>(() => ({
    provider: (localStorage.getItem("aiProvider") as any) || "openai",
    model:
      localStorage.getItem("aiModel") ||
      ((localStorage.getItem("aiProvider") || "openai") === "anthropic"
        ? "claude-sonnet-4-5-20250929"
        : "gpt-4o-mini"),
    seed: localStorage.getItem("aiSeed") || "",
  }));
  const [aiBusy, setAiBusy] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [summaryDocId, setSummaryDocId] = useState<string | null>(
    () => localStorage.getItem("aiWatchSummaryDocId")
  );

  // Verification report history state (Phase 5 - P0.3)
  const [selectedReport, setSelectedReport] = useState<VerificationReportMeta | null>(null);

  async function ensureSummaryDoc(): Promise<string> {
    if (summaryDocId) return summaryDocId;
    const doc = await DocsAPI.create("AI Watch – Summaries");
    localStorage.setItem("aiWatchSummaryDocId", doc.id);
    setSummaryDocId(doc.id);
    return doc.id;
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [sApi, ev, ex, cs, providers, hotspots] = await Promise.all([
        AIWatchAPI.summary(), // normalize below
        AIWatchAPI.events({ limit: 100 }).then((x) => x.events),
        AIWatchAPI.exportsSummary(),
        AIWatchAPI.composeSummary({ limit: 50 }), // baseline
        ProviderAnalyticsAPI.get().catch(() => null), // P2.3
        HotspotsAPI.get({ period: hotspotsPeriod, limit: 10 }).catch(() => null), // P2.2
      ]);

      const sNorm: Summary = {
        total: Number(sApi?.total ?? 0),
        byAction: normalizeByAction(sApi?.byAction),
        avgElapsedMs: Number(sApi?.avgElapsedMs ?? 0),
        last24h: Number(sApi?.last24h ?? 0),
        verificationRate: Number(sApi?.verificationRate ?? 0),
      };

      setSummary(sNorm);
      setEvents(ev);
      setExportsSum(ex);
      setComposeSum(cs);
      setProviderData(providers);
      setHotspotsData(hotspots);
      setLastUpdated(Date.now());
    } catch (err: any) {
      setError(err?.message || "Failed to load AI Watch data");
    } finally {
      setLoading(false);
    }
  }

  // Reload hotspots when period changes
  async function loadHotspots(period: "24h" | "7d" | "30d") {
    try {
      const hotspots = await HotspotsAPI.get({ period, limit: 10 });
      setHotspotsData(hotspots);
    } catch {
      // Ignore errors, keep existing data
    }
  }

  async function rerunCompose() {
    setVerifying(true);
    try {
      const cs = await AIWatchAPI.composeSummary({ limit: 50, rerun: true });
      setComposeSum(cs);
      setLastUpdated(Date.now());
    } catch (err: any) {
      setError(err?.message || "Determinism check failed");
    } finally {
      setVerifying(false);
    }
  }

  async function reverifyAll() {
    setVerifying(true);
    try {
      await AIWatchAPI.reverify({ limit: 50 });
      const [ex, cs] = await Promise.all([
        AIWatchAPI.exportsSummary(),
        AIWatchAPI.composeSummary({ limit: 50, rerun: true }),
      ]);
      setExportsSum(ex);
      setComposeSum(cs);
      setLastUpdated(Date.now());
    } catch (err: any) {
      setError(err?.message || "Re-verify failed");
    } finally {
      setVerifying(false);
    }
  }

  async function generateInsight() {
    if (aiBusy) return;
    setAiBusy(true);
    setAiErr(null);
    setAiText("");

    try {
      const docId = await ensureSummaryDoc();
      const prompt = makeInsightPrompt({ summary, exportsSum, composeSum, events });

      const resp = await AiAPI.compose(docId, {
        prompt,
        systemPrompt:
          "You are an engineering observability analyst. Produce a compact, sharply reasoned summary (6–10 bullets). Plain text.",
        provider: pms.provider as ProviderName,
        model: pms.model,
        seed: pms.seed || undefined,
        maxTokens: 700,
      });

      setAiText(resp.proposalText || "");
    } catch (err: any) {
      setAiErr(err?.message || "AI insight failed");
    } finally {
      setAiBusy(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  const actionRows = useMemo(() => {
    const entries = summary ? Object.entries(summary.byAction || {}) : [];
    entries.sort((a, b) => (b[1] as number) - (a[1] as number));
    return entries;
  }, [summary]);

  const determinismRate = useMemo(() => {
    if (!composeSum || !composeSum.rerun) return null;
    const denom = composeSum.pass + composeSum.drift;
    return denom > 0 ? Math.round((composeSum.pass / denom) * 100) : 0;
  }, [composeSum]);

  const verificationPct =
    summary != null
      ? Math.round((summary.verificationRate || 0) * 100)
      : null;

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        {/* Header row */}
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>GLOBAL AI WATCH</div>
            <h1 style={titleStyle}>Kacheri AI Telemetry</h1>
            <p style={subtitleStyle}>
              Oversight for every AI‑assisted action in Kacheri Docs. Numbers here are grounded in
              proofs and provenance, not vibes.
            </p>
          </div>
          <div style={headerRightStyle}>
            <span style={livePillStyle}>● Live metrics connected</span>
            <div style={{ fontSize: 11, color: "#9ca3c7", marginTop: 6 }}>
              LAST UPDATED
              <div style={{ fontSize: 12, fontWeight: 600, color: "#e5e7ff" }}>
                {lastUpdated ? fmtTs(lastUpdated) : "—"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => navigate("/help/proofs")}
                style={helpButtonStyle}
                title="Learn about Proofs"
              >
                ? Guide
              </button>
              <button
                type="button"
                onClick={() => {
                  // Clear onboarding state so it shows again
                  try {
                    localStorage.removeItem("kacheri:proofOnboardingCompleted");
                    localStorage.removeItem("kacheri:proofOnboardingDismissed");
                    localStorage.removeItem("kacheri:proofOnboardingVersion");
                    alert("Onboarding reset! Visit any document to see the onboarding wizard.");
                  } catch {
                    alert("Failed to reset onboarding state.");
                  }
                }}
                style={helpButtonStyle}
                title="Show the proof system onboarding wizard again"
              >
                Onboarding
              </button>
              <button
                type="button"
                onClick={load}
                disabled={loading || verifying}
                style={refreshButtonStyle(loading || verifying)}
              >
                {loading ? "Refreshing…" : "Refresh now"}
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div style={errorBannerStyle}>
            Error loading telemetry: <span>{error}</span>
          </div>
        )}

        {/* Top metric tiles */}
        <section style={{ marginTop: 12 }}>
          <div style={topGridStyle}>
            <MetricTile
              label="AI ACTIONS (TOTAL)"
              value={summary ? summary.total.toLocaleString() : "–"}
              caption="All tracked AI invocations since workspace inception."
            />
            <MetricTile
              label="AI ACTIONS (24h)"
              value={summary ? summary.last24h.toLocaleString() : "–"}
              caption="Recent volume in the last 24 hours."
            />
            <MetricTile
              label="AVERAGE LATENCY"
              value={summary ? fmtMs(summary.avgElapsedMs) : "–"}
              caption="End‑to‑end job elapsed time."
            />
            <MetricTile
              label="PAYLOAD VERIFICATION"
              value={verificationPct != null ? `${verificationPct}%` : "–"}
              caption="Exports & payloads that passed verification."
              tone="success"
            />
          </div>
        </section>

        {/* Middle row: Export verification + AI Insight */}
        <section style={{ marginTop: 22, display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: 16, alignItems: "flex-start" }}>
          {/* Export verification */}
          <div style={panelCardStyle}>
            <PanelHeader
              title="Export Verification"
              subtitle="DOCX/PDF exports backed by proof packets and hash checks."
            />
            <div style={fourUpGridStyle}>
              <MiniMetric
                label="EXPORTS (TOTAL)"
                value={exportsSum ? exportsSum.total.toLocaleString() : "–"}
                caption="All tracked exports."
              />
              <MiniMetric
                label="PASS"
                value={exportsSum ? exportsSum.pass.toLocaleString() : "–"}
                caption="Verified exports."
                tone="success"
              />
              <MiniMetric
                label="FAIL"
                value={exportsSum ? exportsSum.fail.toLocaleString() : "–"}
                caption="Hash mismatch or replay failure."
                tone="danger"
              />
              <MiniMetric
                label="MISS"
                value={exportsSum ? exportsSum.miss.toLocaleString() : "–"}
                caption="Missing proofs / legacy artifacts."
              />
            </div>

            <div style={tableShellStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <Th>Kind</Th>
                    <Th align="right">Total</Th>
                    <Th align="right">PASS</Th>
                    <Th align="right">FAIL</Th>
                    <Th align="right">MISS</Th>
                  </tr>
                </thead>
                <tbody>
                  {["docx", "pdf"].map((k) => {
                    const row = exportsSum?.byKind?.[k as "docx" | "pdf"];
                    return (
                      <tr key={k}>
                        <Td mono>{k}</Td>
                        <Td align="right">
                          {row ? row.total.toLocaleString() : "–"}
                        </Td>
                        <Td align="right">
                          {row ? row.pass.toLocaleString() : "–"}
                        </Td>
                        <Td align="right">
                          {row ? row.fail.toLocaleString() : "–"}
                        </Td>
                        <Td align="right">
                          {row ? row.miss.toLocaleString() : "–"}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* AI Insight */}
          <div style={panelCardStyle}>
            <PanelHeader
              title="AI Insight"
              subtitle="Let the AI engine summarize its own telemetry — still proofed and recorded."
            />
            {/* Provider/model/seed + button; button is on its own lane on narrow widths */}
            <div
              style={{
                marginTop: 10,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <ProviderModelPicker value={pms} onChange={setPms} compact />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={generateInsight}
                  disabled={aiBusy || loading}
                  style={primaryCtaStyle(aiBusy || loading)}
                >
                  {aiBusy ? "Generating…" : "Generate AI summary"}
                </button>
              </div>
            </div>

            {aiErr && (
              <div style={{ color: "#fecaca", fontSize: 12, marginTop: 8 }}>
                Error: {aiErr}
              </div>
            )}
            {aiText && (
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  borderRadius: 10,
                  background:
                    "linear-gradient(145deg, rgba(15,23,42,0.9), rgba(30,64,175,0.65))",
                  border: "1px solid rgba(148,163,184,0.6)",
                  fontSize: 13,
                  color: "#e5e7ff",
                  whiteSpace: "pre-wrap",
                  maxHeight: 260,
                  overflowY: "auto",
                }}
              >
                {aiText}
              </div>
            )}
          </div>
        </section>

        {/* Compose Determinism */}
        <section style={{ marginTop: 22 }}>
          <div style={panelCardStyle}>
            <PanelHeader
              title="Compose Determinism"
              subtitle="Replay checks that re‑run compose calls and compare outputs."
            />
            <div style={fourUpGridStyle}>
              <MiniMetric
                label="TOTAL CHECKED"
                value={composeSum ? String(composeSum.total) : "–"}
              />
              <MiniMetric
                label="PASS (MATCH)"
                value={composeSum ? String(composeSum.pass) : "–"}
                tone="success"
              />
              <MiniMetric
                label="DRIFT (MISMATCH)"
                value={composeSum ? String(composeSum.drift) : "–"}
                tone="warning"
              />
              <MiniMetric
                label="MISS (BAD PAYLOAD)"
                value={composeSum ? String(composeSum.miss) : "–"}
              />
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <MiniMetric
                label="DETERMINISM"
                value={
                  determinismRate !== null ? `${determinismRate}%` : "–"
                }
              />
              <button
                type="button"
                onClick={rerunCompose}
                disabled={verifying}
                style={secondaryButtonStyle(verifying)}
              >
                {verifying ? "Checking…" : "Re‑run determinism"}
              </button>
              <button
                type="button"
                onClick={reverifyAll}
                disabled={verifying}
                style={dangerButtonStyle(verifying)}
              >
                {verifying ? "Re‑verifying…" : "Re‑verify all payloads"}
              </button>
            </div>
          </div>
        </section>

        {/* Verification History (Phase 5 - P0.3) */}
        <section style={{ marginTop: 22 }}>
          <ReportHistoryTable
            limit={5}
            onSelectReport={setSelectedReport}
            showViewAll={false}
          />
        </section>

        {/* Report Detail Modal */}
        {selectedReport && (
          <ReportDetailModal
            report={selectedReport}
            onClose={() => setSelectedReport(null)}
          />
        )}

        {/* Provider Analytics + Usage Hotspots (Phase 5 - P2) */}
        <section
          style={{
            marginTop: 22,
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
            gap: 16,
            alignItems: "flex-start",
          }}
        >
          {/* Provider Analytics */}
          <div style={panelCardStyle}>
            <PanelHeader
              title="Provider Analytics"
              subtitle="AI provider and model usage statistics with latency metrics."
            />
            {providerData && (
              <>
                <div style={fourUpGridStyle}>
                  <MiniMetric
                    label="TOTAL CALLS"
                    value={providerData.summary.totalCalls.toLocaleString()}
                    caption="All AI provider calls."
                  />
                  <MiniMetric
                    label="AVG LATENCY"
                    value={fmtMs(providerData.summary.avgLatencyMs)}
                    caption="Average response time."
                  />
                  <MiniMetric
                    label="PROVIDERS"
                    value={String(providerData.summary.uniqueProviders)}
                    caption="Unique providers used."
                  />
                  <MiniMetric
                    label="MODELS"
                    value={String(providerData.summary.uniqueModels)}
                    caption="Unique models used."
                  />
                </div>
                <div style={tableShellStyle}>
                  <table style={{ ...tableStyle, minWidth: 500 }}>
                    <thead>
                      <tr>
                        <Th>Provider</Th>
                        <Th>Model</Th>
                        <Th align="right">Calls</Th>
                        <Th align="right">Avg</Th>
                        <Th align="right">P95</Th>
                        <Th>Last Used</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {providerData.providers.slice(0, 8).map((p, i) => (
                        <tr key={`${p.provider}-${p.model}-${i}`}>
                          <Td mono>{p.provider}</Td>
                          <Td mono style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {p.model}
                          </Td>
                          <Td align="right">{p.totalCalls.toLocaleString()}</Td>
                          <Td align="right">{fmtMs(p.avgLatencyMs)}</Td>
                          <Td align="right">{fmtMs(p.p95LatencyMs)}</Td>
                          <Td style={{ fontSize: 11, color: "#9ca3c7" }}>
                            {new Date(p.lastUsed).toLocaleDateString()}
                          </Td>
                        </tr>
                      ))}
                      {providerData.providers.length === 0 && (
                        <tr>
                          <Td colSpan={6} style={{ color: "#9ca3c7" }}>
                            No provider data yet.
                          </Td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {!providerData && (
              <div style={{ color: "#9ca3c7", fontSize: 13, marginTop: 10 }}>
                Loading provider analytics...
              </div>
            )}
          </div>

          {/* Usage Hotspots */}
          <div style={panelCardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <PanelHeader
                title="Usage Hotspots"
                subtitle="Documents with high AI activity."
              />
              <div style={{ display: "flex", gap: 4 }}>
                {(["24h", "7d", "30d"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setHotspotsPeriod(p);
                      loadHotspots(p);
                    }}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: "1px solid",
                      borderColor: hotspotsPeriod === p ? "rgba(99, 102, 241, 0.8)" : "rgba(148, 163, 184, 0.5)",
                      background: hotspotsPeriod === p ? "rgba(99, 102, 241, 0.2)" : "transparent",
                      color: hotspotsPeriod === p ? "#a5b4fc" : "#9ca3c7",
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {hotspotsData && hotspotsData.hotspots.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 10,
                  marginTop: 10,
                }}
              >
                {hotspotsData.hotspots.slice(0, 6).map((h) => (
                  <HotspotCard
                    key={h.docId}
                    hotspot={h}
                    onNavigate={(docId) => navigate(`/docs/${docId}`)}
                  />
                ))}
              </div>
            )}
            {hotspotsData && hotspotsData.hotspots.length === 0 && (
              <div style={{ color: "#9ca3c7", fontSize: 13, marginTop: 10 }}>
                No hotspots detected in the {hotspotsPeriod} period.
              </div>
            )}
            {!hotspotsData && (
              <div style={{ color: "#9ca3c7", fontSize: 13, marginTop: 10 }}>
                Loading hotspot data...
              </div>
            )}
          </div>
        </section>

        {/* Bottom row: Recent events + actions by type */}
        <section
          style={{
            marginTop: 24,
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 0.9fr)",
            gap: 18,
            alignItems: "flex-start",
          }}
        >
          {/* Recent events */}
          <div style={panelCardStyle}>
            <PanelHeader
              title="Recent AI Events"
              subtitle="Every compose, rewrite, and export broadcast from the workspace socket."
            />
            <div style={tableShellStyle}>
              <table style={{ ...tableStyle, minWidth: 860 }}>
                <thead>
                  <tr>
                    <Th>ID</Th>
                    <Th>When</Th>
                    <Th>Doc</Th>
                    <Th>Action</Th>
                    <Th align="right">Elapsed</Th>
                    <Th align="right">Input size</Th>
                    <Th>Preview</Th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id}>
                      <Td mono>{ev.id}</Td>
                      <Td>{fmtTs(ev.ts)}</Td>
                      <Td mono>{ev.docId}</Td>
                      <Td mono>{ev.action}</Td>
                      <Td align="right">{fmtMs(ev.elapsedMs)}</Td>
                      <Td align="right">
                        {Number.isFinite(ev.inputSize as any)
                          ? (ev.inputSize as number).toLocaleString()
                          : String(ev.inputSize ?? 0)}
                      </Td>
                      <Td
                        style={{
                          maxWidth: 360,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {ev.preview || ""}
                      </Td>
                    </tr>
                  ))}
                  {events.length === 0 && (
                    <tr>
                      <Td colSpan={7} style={{ color: "#9ca3c7" }}>
                        No events yet.
                      </Td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions by type */}
          <div style={panelCardStyle}>
            <PanelHeader
              title="AI Actions by Type"
              subtitle="How the AI engine is actually being used across this workspace."
            />
            <div style={tableShellStyle}>
              <table style={{ ...tableStyle, minWidth: 260 }}>
                <thead>
                  <tr>
                    <Th>Action</Th>
                    <Th align="right">Count</Th>
                  </tr>
                </thead>
                <tbody>
                  {actionRows.map(([k, v]) => (
                    <tr key={k}>
                      <Td mono>{k}</Td>
                      <Td align="right">{(v as number).toLocaleString()}</Td>
                    </tr>
                  ))}
                  {actionRows.length === 0 && (
                    <tr>
                      <Td colSpan={2} style={{ color: "#9ca3c7" }}>
                        No actions yet.
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

/* ---------- tiny UI helpers ---------- */

function MetricTile(props: {
  label: string;
  value: string;
  caption: string;
  tone?: "default" | "success";
}) {
  const border =
    props.tone === "success"
      ? "rgba(74, 222, 128, 0.45)"
      : "rgba(129, 140, 248, 0.45)";
  const glow =
    props.tone === "success"
      ? "0 18px 40px rgba(22, 163, 74, 0.55)"
      : "0 18px 40px rgba(30, 64, 175, 0.55)";
  return (
    <div
      style={{
        borderRadius: 22,
        padding: "14px 18px",
        background:
          "radial-gradient(circle at top left, rgba(37,99,235,0.22), rgba(15,23,42,0.95))",
        border: `1px solid ${border}`,
        boxShadow: glow,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: "#9ca3c7", marginBottom: 6 }}>
        {props.label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "#f9fafb" }}>
        {props.value}
      </div>
      <div style={{ fontSize: 11, color: "#9ca3c7", marginTop: 4 }}>
        {props.caption}
      </div>
    </div>
  );
}

function MiniMetric(props: {
  label: string;
  value: string;
  caption?: string;
  tone?: "default" | "success" | "danger" | "warning";
}) {
  const base: CSSProperties = {
    borderRadius: 18,
    padding: "8px 12px",
    minWidth: 120,
    background:
      "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,64,175,0.75))",
    border: "1px solid rgba(148,163,184,0.6)",
  };
  let borderColor = "rgba(148,163,184,0.6)";
  let textColor = "#e5e7ff";
  if (props.tone === "success") {
    borderColor = "rgba(34,197,94,0.9)";
    textColor = "#bbf7d0";
  } else if (props.tone === "danger") {
    borderColor = "rgba(248,113,113,0.9)";
    textColor = "#fecaca";
  } else if (props.tone === "warning") {
    borderColor = "rgba(251,191,36,0.9)";
    textColor = "#fef9c3";
  }
  return (
    <div style={{ ...base, borderColor }}>
      <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "#9ca3c7", marginBottom: 4 }}>
        {props.label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: textColor }}>
        {props.value}
      </div>
      {props.caption && (
        <div style={{ fontSize: 11, color: "#9ca3c7", marginTop: 2 }}>
          {props.caption}
        </div>
      )}
    </div>
  );
}

function PanelHeader(props: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", color: "#e5e7ff" }}>
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

/* ---------- layout styles ---------- */

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  padding: "24px 18px 32px",
  background:
    "radial-gradient(circle at top left, #020617 0, #020617 40%, #020617 100%)",
  color: "#e5e7ff",
};

const shellStyle: CSSProperties = {
  maxWidth: 1200,
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
  fontSize: 30,
  fontWeight: 800,
  letterSpacing: 0.4,
  margin: "4px 0 4px",
};

const subtitleStyle: CSSProperties = {
  fontSize: 13,
  color: "#cbd5f5",
  maxWidth: 520,
};

const headerRightStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 6,
};

const livePillStyle: CSSProperties = {
  fontSize: 11,
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(22,163,74,0.18)",
  color: "#bbf7d0",
  border: "1px solid rgba(34,197,94,0.8)",
};

const errorBannerStyle: CSSProperties = {
  marginTop: 16,
  padding: "8px 10px",
  borderRadius: 12,
  background: "rgba(248,113,113,0.14)",
  border: "1px solid rgba(248,113,113,0.7)",
  fontSize: 12,
};

const topGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const fourUpGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
  marginTop: 10,
};

const panelCardStyle: CSSProperties = {
  padding: 16,
  borderRadius: 22,
  background:
    "radial-gradient(circle at top left, rgba(15,23,42,0.98), rgba(15,23,42,0.98))",
  border: "1px solid rgba(148,163,184,0.55)",
  boxShadow: "0 20px 60px rgba(15,23,42,0.9)",
};

const tableShellStyle: CSSProperties = {
  marginTop: 10,
  borderRadius: 14,
  border: "1px solid rgba(30,64,175,0.7)",
  overflow: "auto",
  background:
    "linear-gradient(135deg, rgba(15,23,42,0.98), rgba(15,23,42,0.95))",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const refreshButtonStyle = (disabled: boolean): CSSProperties => ({
  padding: "8px 14px",
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.9)",
  background: disabled
    ? "rgba(15,23,42,0.7)"
    : "linear-gradient(145deg, #111827, #1f2937)",
  color: "#e5e7ff",
  fontSize: 12,
  cursor: disabled ? "default" : "pointer",
});

const helpButtonStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 999,
  border: "1px solid rgba(99, 102, 241, 0.8)",
  background: "linear-gradient(145deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2))",
  color: "#a5b4fc",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};

const primaryCtaStyle = (disabled: boolean): CSSProperties => ({
  padding: "8px 16px",
  borderRadius: 999,
  border: "none",
  background: disabled
    ? "rgba(129,140,248,0.55)"
    : "linear-gradient(90deg,#6366f1,#a855f7)",
  color: "#f9fafb",
  fontSize: 13,
  fontWeight: 600,
  cursor: disabled ? "default" : "pointer",
  boxShadow: "0 14px 40px rgba(79,70,229,0.6)",
});

const secondaryButtonStyle = (disabled: boolean): CSSProperties => ({
  padding: "7px 14px",
  borderRadius: 999,
  border: "1px solid rgba(59,130,246,0.8)",
  background: disabled
    ? "rgba(15,23,42,0.7)"
    : "linear-gradient(135deg, rgba(15,23,42,0.98), rgba(37,99,235,0.65))",
  color: "#dbeafe",
  fontSize: 12,
  fontWeight: 500,
  cursor: disabled ? "default" : "pointer",
});

const dangerButtonStyle = (disabled: boolean): CSSProperties => ({
  padding: "7px 14px",
  borderRadius: 999,
  border: "1px solid rgba(248,113,113,0.9)",
  background: disabled
    ? "rgba(15,23,42,0.7)"
    : "linear-gradient(135deg, rgba(127,29,29,0.95), rgba(185,28,28,0.9))",
  color: "#fee2e2",
  fontSize: 12,
  fontWeight: 500,
  cursor: disabled ? "default" : "pointer",
});
