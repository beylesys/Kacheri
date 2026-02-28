// KACHERI FRONTEND/src/components/extraction/ExtractionPanel.tsx
// Main sidebar panel for Document Intelligence extraction results.
//
// Shows: summary card, anomaly alerts, extracted fields with confidence,
// loading/error/empty states, and re-extract button.
//
// Follows CommentsPanel / VersionsPanel patterns.
// See: Docs/Roadmap/document-intelligence-work-scope.md — Slice 9

import { memo, useState, useEffect, useCallback } from 'react';
import type { GetExtractionResponse } from '../../types/extraction.ts';
import { extractionApi } from '../../api/extraction.ts';
import ExtractionSummaryCard from './ExtractionSummaryCard.tsx';
import AnomalyAlert from './AnomalyAlert.tsx';
import FieldEditor from './FieldEditor.tsx';
import EditExtractionModal from './EditExtractionModal.tsx';
import ActionsPanel from './ActionsPanel.tsx';
import ExportDropdown from './ExportDropdown.tsx';
import './extraction.css';

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

/** Fields to skip when displaying extraction data (internal metadata). */
const SKIP_FIELDS = new Set(['documentType']);

function ExtractionPanelInner({
  docId,
  open,
  onClose,
  refreshKey = 0,
  embedded = false,
  onNavigateToProofs,
}: Props) {
  const [data, setData] = useState<GetExtractionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reextracting, setReextracting] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [actionsRefreshKey, setActionsRefreshKey] = useState(0);

  const fetchExtraction = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await extractionApi.get(docId);
      setData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load extraction';
      // 404 means no extraction exists yet — not an error state
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
      fetchExtraction();
    }
  }, [open, embedded, fetchExtraction, refreshKey]);

  const handleReextract = useCallback(async () => {
    setReextracting(true);
    setError(null);
    try {
      // For re-extract, we need the document text. The backend extract endpoint
      // requires text. We'll pass reextract flag so the backend can use stored text.
      await extractionApi.extract(docId, { text: '', reextract: true });
      await fetchExtraction();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Re-extraction failed');
    } finally {
      setReextracting(false);
    }
  }, [docId, fetchExtraction]);

  const handleExtractNow = useCallback(async () => {
    setReextracting(true);
    setError(null);
    try {
      await extractionApi.extract(docId, { text: '' });
      await fetchExtraction();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setReextracting(false);
    }
  }, [docId, fetchExtraction]);

  // Build field entries from extraction data
  const fieldEntries: Array<{ key: string; value: unknown; confidence?: number }> = [];
  if (data?.extraction) {
    for (const [key, value] of Object.entries(data.extraction)) {
      if (SKIP_FIELDS.has(key)) continue;
      const confidence = data.fieldConfidences?.[key];
      fieldEntries.push({ key, value, confidence });
    }
  }

  const anomalies = data?.anomalies ?? [];
  const isEmptyDocument = anomalies.some(a => a.code === 'EMPTY_DOCUMENT');

  const panelClasses = [
    'extraction-panel',
    open ? 'open' : '',
    embedded ? 'embedded' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={panelClasses}>
      {/* Header */}
      {!embedded && (
        <div className="extraction-header">
          <span className="extraction-title">Intelligence</span>
          <button className="extraction-close" onClick={onClose} title="Close">
            {'\u2715'}
          </button>
        </div>
      )}

      {/* Content */}
      <div className="extraction-content">
        {/* Loading state — skeleton shimmer */}
        {loading && !reextracting && (
          <div className="extraction-skeleton">
            <div className="extraction-skeleton-line long" />
            <div className="extraction-skeleton-line medium" />
            <div className="extraction-skeleton-line short" />
            <div className="extraction-skeleton-line long" />
            <div className="extraction-skeleton-line medium" />
          </div>
        )}

        {/* Re-extracting progress spinner */}
        {loading && reextracting && (
          <div className="extraction-progress">
            <div className="extraction-progress-spinner" />
            <div className="extraction-progress-step">Analyzing document...</div>
            <div className="extraction-progress-hint">This may take a few seconds</div>
          </div>
        )}

        {/* Error state — categorized messages */}
        {error && (
          <div className="extraction-error">
            {error.includes('timed out') || error.includes('timeout')
              ? 'Extraction timed out. The document may be too large or the AI service is slow.'
              : error.includes('429') || error.includes('rate limit')
                ? 'Rate limited by the AI provider. Please wait a moment before retrying.'
                : error}
            <br />
            <button
              className="extraction-error-retry"
              onClick={fetchExtraction}
            >
              {error.includes('429') || error.includes('rate limit') ? 'Try again later' : 'Retry'}
            </button>
          </div>
        )}

        {/* Empty state (no extraction exists) */}
        {!loading && !error && !data && (
          <div className="extraction-empty">
            <div className="extraction-empty-icon">{'\uD83D\uDD0D'}</div>
            <div className="extraction-empty-text">
              No extraction available for this document.
            </div>
            {reextracting ? (
              <div className="extraction-progress">
                <div className="extraction-progress-spinner" />
                <div className="extraction-progress-step">Analyzing document...</div>
                <div className="extraction-progress-hint">This may take a few seconds</div>
              </div>
            ) : (
              <button
                className="extraction-btn primary"
                onClick={handleExtractNow}
                style={{ width: 'auto', display: 'inline-block' }}
              >
                Extract Now
              </button>
            )}
          </div>
        )}

        {/* Data state */}
        {!loading && data && (
          <>
            {/* Summary Card */}
            <ExtractionSummaryCard data={data} docId={docId} onReextracted={fetchExtraction} />

            {/* Proof Link — Slice 16 */}
            {data.proofId && onNavigateToProofs && (
              <button
                className="extraction-proof-link"
                onClick={onNavigateToProofs}
                title="View the extraction proof record in the Proofs panel"
              >
                View Proof Record
              </button>
            )}

            {/* Empty document — friendly info instead of fields */}
            {isEmptyDocument && (
              <div className="extraction-empty">
                <div className="extraction-empty-icon">{'\uD83D\uDCC4'}</div>
                <div className="extraction-empty-text">
                  This document does not contain enough text for extraction.
                </div>
              </div>
            )}

            {/* Anomalies (skip EMPTY_DOCUMENT since we handled it above) */}
            {anomalies.length > 0 && !isEmptyDocument && (
              <div className="anomaly-section">
                <div className="anomaly-section-title">
                  Anomalies ({anomalies.length})
                </div>
                {anomalies.map((anomaly, i) => (
                  <AnomalyAlert key={`${anomaly.code}-${i}`} anomaly={anomaly} />
                ))}
              </div>
            )}

            {/* Extracted Fields (skip for empty documents) */}
            {fieldEntries.length > 0 && !isEmptyDocument && (
              <div className="fields-section">
                <div className="fields-section-title">
                  Extracted Fields
                  <button
                    className="extraction-btn ghost sm"
                    style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 11, width: 'auto', textTransform: 'none', letterSpacing: 'normal' }}
                    onClick={() => setEditModalOpen(true)}
                    title="Edit all fields"
                  >
                    Edit All
                  </button>
                </div>
                {fieldEntries.map((entry) => (
                  <FieldEditor
                    key={entry.key}
                    fieldPath={entry.key}
                    label={entry.key}
                    value={entry.value}
                    confidence={entry.confidence}
                    docId={docId}
                    wasCorrected={data?.corrections?.some(c => c.fieldPath === entry.key)}
                    onSaved={fetchExtraction}
                    onActionCreated={() => setActionsRefreshKey(k => k + 1)}
                  />
                ))}
              </div>
            )}

            {/* Actions */}
            <ActionsPanel
              docId={docId}
              open={true}
              refreshKey={actionsRefreshKey}
            />
          </>
        )}

        {/* Edit Extraction Modal */}
        {data && (
          <EditExtractionModal
            open={editModalOpen}
            docId={docId}
            data={data}
            corrections={data.corrections ?? []}
            onClose={() => setEditModalOpen(false)}
            onSaved={() => {
              fetchExtraction();
              setEditModalOpen(false);
            }}
          />
        )}
      </div>

      {/* Footer: Export + Re-extract */}
      {data && (
        <div className="extraction-footer" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ExportDropdown
            docId={docId}
            extraction={data.extraction}
            documentType={data.documentType}
          />
          <button
            className="extraction-btn ghost"
            onClick={handleReextract}
            disabled={reextracting}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            {reextracting && (
              <span className="extraction-progress-spinner" style={{ width: 14, height: 14, borderWidth: 2, margin: 0 }} />
            )}
            {reextracting ? 'Re-extracting...' : 'Re-extract'}
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(ExtractionPanelInner);
