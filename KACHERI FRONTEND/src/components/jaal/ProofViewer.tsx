// KACHERI FRONTEND/src/components/jaal/ProofViewer.tsx
// JAAL proof listing and detail viewer — Slice S4 (Phase B)
//
// Lists proofs with kind/session filters. Clicking a proof shows detail
// (full hash, payload JSON, session link, timestamp).

import { useState, useEffect, useCallback } from 'react';
import { jaalApi } from '../../api/jaal';
import type { JaalProof } from '../../api/jaal';

/* ---------- Helpers ---------- */

function formatProofTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncateHash(hash: string, len: number = 16): string {
  if (hash.length <= len) return hash;
  return `${hash.slice(0, len)}...`;
}

const KIND_LABELS: Record<string, string> = {
  summarize: 'Summarize',
  extract_links: 'Extract Links',
  compare: 'Compare',
  capture: 'Capture',
  research: 'Research',
  policy_decision: 'Policy',
};

const ALL_KINDS = ['', 'summarize', 'extract_links', 'compare', 'capture', 'research', 'policy_decision'];

/* ---------- Skeleton ---------- */

function ProofSkeleton() {
  return (
    <div className="jaal-skeleton">
      {[1, 2, 3].map((i) => (
        <div className="jaal-skeleton-row" key={i}>
          <div className="jaal-skeleton-bar" style={{ width: 60, height: 14 }} />
          <div className="jaal-skeleton-bar" style={{ width: '50%', height: 12 }} />
          <div className="jaal-skeleton-bar" style={{ width: 50, height: 12 }} />
        </div>
      ))}
    </div>
  );
}

/* ---------- Component ---------- */

interface ProofViewerProps {
  sessionId?: string;
  workspaceId: string | null;
}

export function ProofViewer({ sessionId, workspaceId }: ProofViewerProps) {
  const [proofs, setProofs] = useState<JaalProof[]>([]);
  const [selectedProof, setSelectedProof] = useState<JaalProof | null>(null);
  const [kindFilter, setKindFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ---- Fetch proofs ---- */

  const loadProofs = useCallback(async () => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await jaalApi.listProofs({
        sessionId: sessionId || undefined,
        kind: kindFilter || undefined,
        limit: 100,
      });
      setProofs(list);
    } catch (err) {
      // S5 not implemented — proofs will be empty
      setProofs([]);
      if (err instanceof Error && !err.message.includes('404')) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId, sessionId, kindFilter]);

  useEffect(() => {
    loadProofs();
  }, [loadProofs]);

  /* ---- Select proof ---- */

  const selectProof = useCallback(
    async (proof: JaalProof) => {
      if (selectedProof?.id === proof.id) {
        setSelectedProof(null);
        return;
      }
      try {
        const detail = await jaalApi.getProof(proof.id);
        setSelectedProof(detail);
      } catch {
        // Fall back to list-level data
        setSelectedProof(proof);
      }
    },
    [selectedProof?.id],
  );

  if (!workspaceId) {
    return (
      <div className="proof-viewer">
        <div className="jaal-empty">Select a workspace to view proofs.</div>
      </div>
    );
  }

  return (
    <div className="proof-viewer" role="region" aria-label="Proof viewer">
      {/* Filter Bar */}
      <div className="proof-filter-bar">
        <select
          className="proof-filter-select"
          value={kindFilter}
          onChange={(e) => {
            setKindFilter(e.target.value);
            setSelectedProof(null);
          }}
          aria-label="Filter by proof kind"
        >
          <option value="">All kinds</option>
          {ALL_KINDS.filter((k) => k !== '').map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k] ?? k}
            </option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {loading && <ProofSkeleton />}

      {/* Error */}
      {error && <div className="jaal-error" role="alert">{error}</div>}

      {/* Proof List */}
      {!loading && proofs.length === 0 && !error && (
        <div className="jaal-empty">No proofs found.</div>
      )}

      {!loading && proofs.length > 0 && (
        <div className="proof-list" role="list">
          {proofs.map((proof) => (
            <div
              key={proof.id}
              className={`proof-list-item${
                selectedProof?.id === proof.id ? ' selected' : ''
              }`}
              onClick={() => selectProof(proof)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectProof(proof);
                }
              }}
              tabIndex={0}
              role="listitem"
              aria-selected={selectedProof?.id === proof.id}
              aria-label={`${KIND_LABELS[proof.kind] ?? proof.kind} proof, ${formatProofTime(proof.createdAt)}`}
            >
              <span
                className="proof-kind-badge"
                data-kind={proof.kind}
              >
                {KIND_LABELS[proof.kind] ?? proof.kind}
              </span>
              <span className="proof-hash" title={proof.hash}>
                {truncateHash(proof.hash)}
              </span>
              <span className="proof-time">
                {formatProofTime(proof.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Proof Detail */}
      {selectedProof && (
        <div className="proof-detail">
          <div className="proof-detail-row">
            <span className="proof-detail-label">ID</span>
            <span className="proof-detail-value">{selectedProof.id}</span>
          </div>
          <div className="proof-detail-row">
            <span className="proof-detail-label">Kind</span>
            <span className="proof-detail-value">
              {KIND_LABELS[selectedProof.kind] ?? selectedProof.kind}
            </span>
          </div>
          <div className="proof-detail-row">
            <span className="proof-detail-label">Hash (SHA-256)</span>
            <span className="proof-detail-value">{selectedProof.hash}</span>
          </div>
          <div className="proof-detail-row">
            <span className="proof-detail-label">Created</span>
            <span className="proof-detail-value">
              {new Date(selectedProof.createdAt).toLocaleString()}
            </span>
          </div>
          {selectedProof.sessionId && (
            <div className="proof-detail-row">
              <span className="proof-detail-label">Session</span>
              <span className="proof-detail-value">{selectedProof.sessionId}</span>
            </div>
          )}
          <div className="proof-detail-row">
            <span className="proof-detail-label">Payload</span>
            <pre className="proof-detail-payload">
              {JSON.stringify(selectedProof.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
