// KACHERI FRONTEND/src/components/extraction/DocumentTypeSelector.tsx
// Dropdown to override the AI-detected document type and trigger re-extraction.
//
// Shows: select dropdown with all document types, confidence badge, loading state.
// On type change: re-extracts with forceDocType via extractionApi.
//
// See: Docs/Roadmap/document-intelligence-work-scope.md — Slice 14

import { useState, useCallback } from 'react';
import type { DocumentType } from '../../types/extraction.ts';
import { extractionApi } from '../../api/extraction.ts';
import ConfidenceBadge from './ConfidenceBadge.tsx';

type Props = {
  docId: string;
  currentType: DocumentType;
  confidence: number;
  onReextracted: () => void;
};

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  contract: 'Contract',
  invoice: 'Invoice',
  proposal: 'Proposal',
  meeting_notes: 'Meeting Notes',
  report: 'Report',
  other: 'General',
};

const DOC_TYPES: DocumentType[] = [
  'contract',
  'invoice',
  'proposal',
  'meeting_notes',
  'report',
  'other',
];

export default function DocumentTypeSelector({
  docId,
  currentType,
  confidence,
  onReextracted,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newType = e.target.value as DocumentType;
      if (newType === currentType) return;

      setLoading(true);
      setError(null);
      try {
        await extractionApi.extract(docId, {
          text: '',
          forceDocType: newType,
          reextract: true,
        });
        onReextracted();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Re-extraction failed');
      } finally {
        setLoading(false);
      }
    },
    [docId, currentType, onReextracted]
  );

  return (
    <div className="doc-type-selector">
      <select
        className="doc-type-select"
        value={currentType}
        onChange={handleChange}
        disabled={loading}
        title="Override document type"
      >
        {DOC_TYPES.map((t) => (
          <option key={t} value={t}>
            {DOC_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      <ConfidenceBadge confidence={confidence} />
      {loading && <span className="doc-type-loading">Re-extracting...</span>}
      {error && <span className="doc-type-error" title={error}>!</span>}
    </div>
  );
}
