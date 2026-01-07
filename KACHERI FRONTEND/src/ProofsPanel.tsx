// KACHERI FRONTEND/src/ProofsPanel.tsx
// Phase 5 - P1.3: Enhanced Export Verification Badges
import { useEffect, useState } from "react";
import { EvidenceAPI, ProofHealthAPI } from "./api";
import { PROOF_TOOLTIPS } from "./utils/tooltipHelpers";

type VerificationStatus = 'pass' | 'fail' | 'miss' | 'pending' | 'checking';

type ExportRow = {
  id?: string | number;
  ts: number | string;
  kind?: string;               // 'pdf' | 'docx' | legacy/null
  sha256?: string | null;
  pdfHash?: string | null;     // legacy
  verified?: boolean;
  verificationStatus?: VerificationStatus;
  verifiedAt?: string | null;
  fileName?: string;
  size?: number;
  proof?: any;
};

type ProvRow = {
  id?: string | number;
  ts: number | string;
  actor?: string;
  action: string;
  preview?: string;
  inputSize?: number;
  details?: any;
  [k: string]: any;
};

const FILTERS = ["", "create", "rename", "delete", "export:pdf", "export:docx", "ai:action", "ai:translate", "tts:read_aloud", "stt:dictate"];

// Format action labels with icons for better readability
const formatAction = (action: string): string => {
  const actionMap: Record<string, string> = {
    "tts:read_aloud": "Read Aloud",
    "stt:dictate": "Dictation",
    "ai:action": "AI Action",
    "ai:compose": "AI Compose",
    "ai:translate": "Translation",
    "export:pdf": "Export PDF",
    "export:docx": "Export DOCX",
    "import:apply": "Import Applied",
    "create": "Created",
    "rename": "Renamed",
    "delete": "Deleted",
  };
  return actionMap[action] || action;
};

// Verification status badge styling (Phase 5 - P1.3)
// Enhanced with centralized tooltips (Phase 5 - P3.2)
function getVerificationBadge(status: VerificationStatus, verified?: boolean, kind?: "pdf" | "docx"): {
  label: string;
  className: string;
  tooltip: string;
} {
  // Map legacy verified boolean to status if no explicit status
  if (status === undefined || status === null) {
    status = verified ? 'pass' : 'pending';
  }

  // Build tooltip with proof type explanation + status
  const kindExplanation = kind ? PROOF_TOOLTIPS.proofTypes[kind] : PROOF_TOOLTIPS.proofTypes.export;

  switch (status) {
    case 'pass':
      return {
        label: 'Verified',
        className: 'badge green',
        tooltip: `${kindExplanation}\n\nStatus: PASS\n${PROOF_TOOLTIPS.verificationBadges.pass}`
      };
    case 'fail':
      return {
        label: 'Failed',
        className: 'badge red',
        tooltip: `${kindExplanation}\n\nStatus: FAIL\n${PROOF_TOOLTIPS.verificationBadges.fail}`
      };
    case 'miss':
      return {
        label: 'Missing',
        className: 'badge',
        tooltip: `${kindExplanation}\n\nStatus: MISSING\n${PROOF_TOOLTIPS.verificationBadges.miss}`
      };
    case 'checking':
      return {
        label: 'Checking...',
        className: 'badge',
        tooltip: `${kindExplanation}\n\nVerifying export hash...`
      };
    case 'pending':
    default:
      return {
        label: 'Unverified',
        className: 'badge red',
        tooltip: `${kindExplanation}\n\nStatus: PENDING\n${PROOF_TOOLTIPS.verificationBadges.pending}`
      };
  }
}

function formatRelativeTime(ts: string | number | null | undefined): string {
  if (!ts) return '';
  try {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return '';
  }
}

type Props = {
  docId: string;
  /** When provided, the parent controls visibility. */
  open?: boolean;
  /** Called when the user clicks "×". Parent should set open=false. */
  onClose?: () => void;
  /** Changing this forces a reload (used by workspace proof_added). */
  refreshKey?: number;
};

export default function ProofsPanel({ docId, open, onClose, refreshKey = 0 }: Props) {
  // Allow both controlled and uncontrolled usage
  const [internalOpen, setInternalOpen] = useState<boolean>(() => {
    return localStorage.getItem("kacheri:proofsOpen") === "1";
  });

  // Keep internal state aligned when parent toggles
  useEffect(() => {
    if (typeof open === "boolean") setInternalOpen(open);
  }, [open]);

  // Persist preference (so reload keeps last state)
  useEffect(() => {
    localStorage.setItem("kacheri:proofsOpen", internalOpen ? "1" : "0");
  }, [internalOpen]);

  // Key change: child can open itself even if parent passed open=false
  const isOpen = (typeof open === "boolean" ? open : internalOpen) || internalOpen;

  const close = () => {
    if (typeof onClose === "function") onClose();
    setInternalOpen(false);
  };
  const openNow = () => setInternalOpen(true);

  // ---------- Data ----------
  const [exportsList, setExports] = useState<ExportRow[]>([]);
  const [prov, setProv] = useState<ProvRow[]>([]);
  const [actionFilter, setActionFilter] = useState<string>("");
  const [before, setBefore] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [refreshingExports, setRefreshingExports] = useState(false);
  const [verifyingExport, setVerifyingExport] = useState<string | number | null>(null);

  const toNumberTs = (ts: number | string) => (typeof ts === "number" ? ts : Date.parse(ts));
  const fmtTime = (ts: number | string) => new Date(ts).toLocaleString();
  const hash16 = (e: ExportRow) => (e.sha256?.slice?.(0, 16) ?? e.pdfHash?.slice?.(0, 16) ?? "—");

  const inferKind = (e: ExportRow): "pdf" | "docx" | undefined => {
    const k = (e.kind || "").toLowerCase();
    if (k === "pdf" || k === "docx") return k as "pdf" | "docx";
    const name = (e.fileName || "").toLowerCase();
    if (name.endsWith(".pdf")) return "pdf";
    if (name.endsWith(".docx")) return "docx";
    return undefined;
  };

  const downloadHref = (e: ExportRow): string | undefined => {
    const name = e.fileName;
    if (!name) return undefined;
    const k = inferKind(e);
    const enc = encodeURIComponent(name);
    if (k === "pdf")  return `/api/docs/${docId}/exports/pdf/${enc}`;
    if (k === "docx") return `/api/docs/${docId}/exports/docx/${enc}`;
    return undefined;
  };

  const loadExports = async () => {
    setRefreshingExports(true);
    try {
      const rows = await EvidenceAPI.listExports(docId);
      setExports(rows || []);
    } finally {
      setRefreshingExports(false);
    }
  };

  // Verify a single export (Phase 5 - P1.3)
  const verifyExport = async (exportRow: ExportRow) => {
    const id = exportRow.id;
    if (!id) return;

    setVerifyingExport(id);
    // Mark as checking in the UI
    setExports(prev => prev.map(e =>
      e.id === id ? { ...e, verificationStatus: 'checking' as VerificationStatus } : e
    ));

    try {
      const result = await ProofHealthAPI.verifyExport(docId, id);
      setExports(prev => prev.map(e =>
        e.id === id ? {
          ...e,
          verified: result.verified,
          verificationStatus: result.verified ? 'pass' : 'fail' as VerificationStatus,
          verifiedAt: new Date().toISOString()
        } : e
      ));
    } catch (err: any) {
      // On error, mark as failed
      setExports(prev => prev.map(e =>
        e.id === id ? { ...e, verificationStatus: 'fail' as VerificationStatus } : e
      ));
    } finally {
      setVerifyingExport(null);
    }
  };

  const loadProv = async (reset = false) => {
    setLoading(true);
    try {
      const rows: ProvRow[] = await EvidenceAPI.listProvenance(docId, {
        action: actionFilter || undefined,
        limit: 25,
        before: reset ? undefined : before,
      });

      if (reset) {
        setProv(rows);
        const last = rows[rows.length - 1];
        setBefore(rows.length ? toNumberTs(last.ts) : undefined);
      } else {
        setProv((p) => [...p, ...rows]);
        if (rows.length) {
          const last = rows[rows.length - 1];
          setBefore(toNumberTs(last.ts));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Load on doc change / initial mount
  useEffect(() => { loadExports(); }, [docId]);
  useEffect(() => { loadProv(true); }, [docId, actionFilter]);

  // **Workspace-driven refresh** (proof_added → parent bumps refreshKey)
  useEffect(() => {
    if (!refreshKey) return;
    // Re-query both lists to surface the new artifact/event quickly.
    loadExports();
    loadProv(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // ---------- Drawer styles ----------
  const drawerStyle: React.CSSProperties = {
    position: "fixed",
    top: 72,                // below sticky toolbar
    right: 0,
    bottom: 16,
    width: 440,
    maxHeight: "calc(100vh - 88px)",
    padding: 14,
    overflow: "auto",
    borderRadius: 12,
    display: "block",       // always mounted; avoid flicker
    zIndex: 2000,           // stay over editor and overlays
    background: "var(--panel)",
    border: "1px solid var(--border)",
    boxShadow: "var(--shadow-md)",
    transform: isOpen ? "translateX(0)" : "translateX(calc(100% + 16px))",
    opacity: isOpen ? 1 : 0.92,
    transition: "transform .20s ease-out, opacity .20s ease-out",
  };

  const tabStyle: React.CSSProperties = {
    position: "fixed",
    top: "40%",
    right: 0,
    zIndex: 2001,
    writingMode: "vertical-rl",
    transform: "rotate(180deg)",
    background: "var(--brand-600)",
    color: "#fff",
    border: "none",
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    padding: "8px 6px",
    cursor: "pointer",
    boxShadow: "0 6px 16px rgba(0,0,0,.3)",
  };

  const exportsCount = exportsList.length;
  const provCount = prov.length;

  return (
    <>
      {!isOpen && (
        <button
          aria-label="Open Proofs & Activity"
          style={tabStyle}
          onClick={openNow}
          title="Open Proofs & Activity"
        >
          Proofs
        </button>
      )}

      <div
        id="proofs-panel"
        className="surface"
        role="complementary"
        aria-label="Proofs & Activity"
        aria-expanded={isOpen}
        style={drawerStyle}
      >
        {/* Header */}
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <div className="h2" title={PROOF_TOOLTIPS.features.proofHealth}>Proofs & Activity</div>
            <div className="muted" style={{ fontSize: 12 }}>Verifiable exports and action timeline</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button
              className="button sm subtle"
              onClick={() => loadExports()}
              disabled={refreshingExports}
              title="Refresh exports"
            >
              {refreshingExports ? "Refreshing…" : "Refresh"}
            </button>
            <button className="button sm ghost" title="Close" onClick={close}>×</button>
          </div>
        </div>

        {/* Filters */}
        <div className="row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          <span className="muted" style={{ fontSize: 12, marginRight: 4 }}>Filter:</span>
          {FILTERS.map((a) => {
            const isActive = a === actionFilter;
            return (
              <button
                key={a || "all"}
                className={`button sm ${isActive ? "primary" : "subtle"}`}
                aria-pressed={isActive}
                onClick={() => setActionFilter(a)}
                title={a || "all"}
              >
                {a || "all"}
              </button>
            );
          })}
        </div>

        {/* Exports */}
        <div style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <div className="h2">Exports</div>
            <span className="badge">{exportsCount}</span>
          </div>

          {exportsCount === 0 ? (
            <div className="empty">No exports yet.</div>
          ) : (
            <div className="stack">
              {exportsList.map((e) => {
                const href = downloadHref(e);
                const kind = inferKind(e);
                const vBadge = getVerificationBadge(
                  e.verificationStatus as VerificationStatus,
                  e.verified,
                  kind
                );
                const isVerifying = verifyingExport === e.id;
                const verifiedTime = e.verifiedAt ? formatRelativeTime(e.verifiedAt) : null;

                return (
                  <div
                    key={String(e.id ?? `ts:${e.ts}:${e.fileName ?? ""}`)}
                    className="card"
                    style={{ padding: 10, display: "grid", gap: 6 }}
                  >
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 600 }}>
                        {e.fileName ? e.fileName : (kind ? kind.toUpperCase() : "Export")}
                      </div>
                      <span className="muted" style={{ fontSize: 12 }}>{fmtTime(e.ts)}</span>
                    </div>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span className="badge">hash {hash16(e)}…</span>
                      {e.size ? <span className="badge">{(e.size / 1024).toFixed(1)} KB</span> : null}
                      {/* Enhanced verification badge - Phase 5 P1.3 */}
                      <span
                        className={vBadge.className}
                        title={vBadge.tooltip}
                        style={{ cursor: 'help' }}
                      >
                        {vBadge.label}
                      </span>
                      {verifiedTime && (
                        <span className="muted" style={{ fontSize: 11 }}>
                          {verifiedTime}
                        </span>
                      )}
                    </div>
                    <div className="row" style={{ gap: 8, marginTop: 2 }}>
                      {/* Verify Now button - Phase 5 P1.3 */}
                      {e.id && (
                        <button
                          className="button sm subtle"
                          onClick={() => verifyExport(e)}
                          disabled={isVerifying}
                          title={PROOF_TOOLTIPS.features.verifyNow}
                          style={{ fontSize: 11 }}
                        >
                          {isVerifying ? "Verifying…" : "Verify Now"}
                        </button>
                      )}
                      <div className="spacer" />
                      {href ? (
                        <a
                          href={href}
                          className="button sm subtle"
                          download
                          title={`Download ${kind?.toUpperCase() || "file"}`}
                        >
                          Download
                        </a>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>no file link</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <div className="h2">Timeline</div>
            <span className="badge">{provCount}</span>
          </div>

          {provCount === 0 ? (
            <div className="empty">No events yet.</div>
          ) : (
            <div className="stack">
              {prov.map((p) => {
                const details = p.details ?? p;
                return (
                  <div
                    key={String(p.id ?? `ts:${p.ts}:${p.action}`)}
                    style={{ borderBottom: "1px solid var(--border)", paddingBottom: 8 }}
                  >
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <div>
                        <b>{formatAction(p.action)}</b>{" "}
                        {p.actor ? <small className="muted">by {p.actor}</small> : null}
                      </div>
                      <small className="muted">{fmtTime(p.ts)}</small>
                    </div>
                    {p.preview ? (
                      <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                        {p.preview}
                      </div>
                    ) : null}
                    <details style={{ marginTop: 6 }}>
                      <summary className="muted" style={{ cursor: "pointer" }}>Details</summary>
                      <pre
                        style={{
                          background: "var(--surface)",
                          padding: 8,
                          borderRadius: 8,
                          whiteSpace: "pre-wrap",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {JSON.stringify(details, null, 2)}
                      </pre>
                    </details>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
            <button className="button sm subtle" disabled={loading} onClick={() => loadProv(false)}>
              {loading ? "Loading…" : "Load older"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
