// KACHERI FRONTEND/src/components/compliance/CompliancePanel.tsx
// Main sidebar panel for Compliance Checker results.
//
// Shows: result summary card, policy violations/warnings, passed checks,
// loading/error/empty states, and "Check Now" button.
//
// Follows ExtractionPanel pattern exactly.
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md — Slice A9

import { memo, useState, useEffect, useCallback } from 'react';
import type { GetLatestCheckResponse, PolicyResult } from '../../types/compliance.ts';
import { complianceApi } from '../../api/compliance.ts';
import ComplianceResultCard from './ComplianceResultCard.tsx';
import PolicyViolation from './PolicyViolation.tsx';
import './compliance.css';

type Props = {
  docId: string;
  open: boolean;
  onClose: () => void;
  refreshKey?: number;
  currentUserId?: string;
  /** When true, renders as embedded content (no fixed positioning). */
  embedded?: boolean;
  /** Navigate to the Proofs panel tab to view proof records. */
  onNavigateToProofs?: () => void;
};

function CompliancePanelInner({
  docId,
  open,
  onClose,
  refreshKey = 0,
  embedded = false,
  onNavigateToProofs,
}: Props) {
  const [data, setData] = useState<GetLatestCheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [passedExpanded, setPassedExpanded] = useState(false);

  const fetchLatestCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await complianceApi.getLatest(docId);
      setData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load compliance check';
      // 404 means no check exists yet — not an error state
      if (msg.includes('404')) {
        setData(null);
        setError(null);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    if (open || embedded) {
      fetchLatestCheck();
    }
  }, [open, embedded, fetchLatestCheck, refreshKey]);

  const handleCheckNow = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      await complianceApi.check(docId, { html: '', triggeredBy: 'manual' });
      await fetchLatestCheck();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Compliance check failed');
    } finally {
      setChecking(false);
    }
  }, [docId, fetchLatestCheck]);

  // Split results into issues and passed
  const results = data?.results ?? [];
  const issues: PolicyResult[] = results.filter(r => r.status !== 'passed');
  const passed: PolicyResult[] = results.filter(r => r.status === 'passed');

  const panelClasses = [
    'compliance-panel',
    open ? 'open' : '',
    embedded ? 'embedded' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={panelClasses}>
      {/* Header */}
      {!embedded && (
        <div className="compliance-header">
          <span className="compliance-title">Compliance</span>
          <button className="compliance-close" onClick={onClose} title="Close">
            {'\u2715'}
          </button>
        </div>
      )}

      {/* Content */}
      <div className="compliance-content">
        {/* Loading state — skeleton shimmer */}
        {loading && !checking && (
          <div className="compliance-skeleton">
            <div className="compliance-skeleton-line long" />
            <div className="compliance-skeleton-line medium" />
            <div className="compliance-skeleton-line short" />
            <div className="compliance-skeleton-line long" />
            <div className="compliance-skeleton-line medium" />
          </div>
        )}

        {/* Checking progress spinner */}
        {checking && (
          <div className="compliance-progress">
            <div className="compliance-progress-spinner" />
            <div className="compliance-progress-step">Running compliance check...</div>
            <div className="compliance-progress-hint">This may take a few seconds</div>
          </div>
        )}

        {/* Error state */}
        {error && !checking && (
          <div className="compliance-error">
            {error.includes('timed out') || error.includes('timeout')
              ? 'Compliance check timed out. The document may be too large or the AI service is slow.'
              : error.includes('429') || error.includes('rate limit')
                ? 'Rate limited. Please wait a moment before retrying.'
                : error}
            <br />
            <button
              className="compliance-error-retry"
              onClick={fetchLatestCheck}
            >
              {error.includes('429') || error.includes('rate limit') ? 'Try again later' : 'Retry'}
            </button>
          </div>
        )}

        {/* Empty state (no check exists) */}
        {!loading && !error && !data && !checking && (
          <div className="compliance-empty">
            <div className="compliance-empty-icon">{'\uD83D\uDEE1'}</div>
            <div className="compliance-empty-text">
              No compliance check yet for this document.
            </div>
            <button
              className="compliance-btn primary"
              onClick={handleCheckNow}
              disabled={checking}
              style={{ width: 'auto', display: 'inline-block' }}
            >
              Check Now
            </button>
          </div>
        )}

        {/* Data state */}
        {!loading && data && !checking && (
          <>
            {/* Summary Card */}
            <ComplianceResultCard data={data} />

            {/* Proof Link */}
            {data.proofId && onNavigateToProofs && (
              <button
                className="compliance-proof-link"
                onClick={onNavigateToProofs}
                title="View the compliance check proof record in the Proofs panel"
              >
                View Proof Record
              </button>
            )}

            {/* Violations & Warnings */}
            {issues.length > 0 && (
              <div className="violations-section">
                <div className="violations-section-title">
                  Issues ({issues.length})
                </div>
                {issues.map((result, i) => (
                  <PolicyViolation key={`${result.policyId}-${i}`} result={result} />
                ))}
              </div>
            )}

            {/* Passed (collapsed by default) */}
            {passed.length > 0 && (
              <div className="passed-section">
                <button
                  className="passed-section-toggle"
                  onClick={() => setPassedExpanded(prev => !prev)}
                >
                  <span className={`passed-section-arrow ${passedExpanded ? 'expanded' : ''}`}>
                    {'\u25B6'}
                  </span>
                  Passed ({passed.length})
                </button>
                {passedExpanded && (
                  <div className="passed-section-list">
                    {passed.map((result, i) => (
                      <div key={`${result.policyId}-${i}`} className="passed-item">
                        <span className="passed-item-icon">{'\u2714'}</span>
                        {result.policyName}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer: Check Now button (when data exists) */}
      {data && !checking && (
        <div className="compliance-footer" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="compliance-btn primary"
            onClick={handleCheckNow}
            disabled={checking}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            {checking && (
              <span className="compliance-progress-spinner" style={{ width: 14, height: 14, borderWidth: 2, margin: 0 }} />
            )}
            {checking ? 'Checking...' : 'Check Now'}
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(CompliancePanelInner);
