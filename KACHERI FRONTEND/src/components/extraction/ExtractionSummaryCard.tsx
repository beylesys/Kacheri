// KACHERI FRONTEND/src/components/extraction/ExtractionSummaryCard.tsx
// Summary card showing document type, confidence, timestamp, and anomaly counts.
//
// See: Docs/Roadmap/document-intelligence-work-scope.md — Slice 9, 14

import type { GetExtractionResponse } from '../../types/extraction.ts';
import ConfidenceBadge from './ConfidenceBadge.tsx';
import DocumentTypeSelector from './DocumentTypeSelector.tsx';

type Props = {
  data: GetExtractionResponse;
  docId?: string;
  onReextracted?: () => void;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  contract: 'Contract',
  invoice: 'Invoice',
  proposal: 'Proposal',
  meeting_notes: 'Meeting Notes',
  report: 'Report',
  other: 'General',
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function ExtractionSummaryCard({ data, docId, onReextracted }: Props) {
  const anomalies = data.anomalies ?? [];
  const warningCount = anomalies.filter((a) => a.severity === 'warning').length;
  const errorCount = anomalies.filter((a) => a.severity === 'error').length;
  const infoCount = anomalies.filter((a) => a.severity === 'info').length;

  const fieldCount = data.extraction
    ? Object.keys(data.extraction).filter((k) => k !== 'documentType').length
    : 0;

  return (
    <div className="summary-card">
      <div className="summary-card-row">
        {docId && onReextracted ? (
          <DocumentTypeSelector
            docId={docId}
            currentType={data.documentType}
            confidence={data.confidence}
            onReextracted={onReextracted}
          />
        ) : (
          <>
            <span className="summary-doc-type">
              {DOC_TYPE_LABELS[data.documentType] ?? data.documentType}
            </span>
            <ConfidenceBadge confidence={data.confidence} />
          </>
        )}
      </div>
      <div className="summary-card-row">
        <span className="summary-timestamp">
          {formatTimestamp(data.extractedAt)}
        </span>
      </div>
      <div className="summary-stats">
        <span className="summary-stat">
          <span className="summary-stat-value">{fieldCount}</span> fields
        </span>
        {errorCount > 0 && (
          <span className="summary-stat" style={{ color: '#fecaca' }}>
            <span className="summary-stat-value">{errorCount}</span> errors
          </span>
        )}
        {warningCount > 0 && (
          <span className="summary-stat" style={{ color: '#fde047' }}>
            <span className="summary-stat-value">{warningCount}</span> warnings
          </span>
        )}
        {infoCount > 0 && (
          <span className="summary-stat">
            <span className="summary-stat-value">{infoCount}</span> info
          </span>
        )}
      </div>
    </div>
  );
}
