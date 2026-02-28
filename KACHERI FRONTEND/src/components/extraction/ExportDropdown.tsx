// KACHERI FRONTEND/src/components/extraction/ExportDropdown.tsx
// Export dropdown for Document Intelligence extraction data.
//
// Provides: JSON export, CSV export, Copy to clipboard.
// Uses extractionApi.exportData() from Slice 8 for file downloads.
//
// See: Docs/Roadmap/document-intelligence-work-scope.md — Slice 12

import { useState, useEffect, useRef, useCallback } from 'react';
import { extractionApi } from '../../api/extraction.ts';
import './extraction.css';

type Props = {
  docId: string;
  extraction: Record<string, unknown>;
  documentType: string;
};

export default function ExportDropdown({ docId, extraction, documentType }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  // Clear feedback after 2 seconds
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 2000);
    return () => clearTimeout(t);
  }, [feedback]);

  const downloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleExportJSON = useCallback(async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const blob = await extractionApi.exportData(docId, 'json');
      const safeName = documentType.replace(/[^a-z0-9_-]/gi, '_');
      downloadBlob(blob, `extraction-${safeName}-${docId.slice(0, 8)}.json`);
      setFeedback('Downloaded JSON');
      setOpen(false);
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  }, [docId, documentType, downloadBlob]);

  const handleExportCSV = useCallback(async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const blob = await extractionApi.exportData(docId, 'csv');
      const safeName = documentType.replace(/[^a-z0-9_-]/gi, '_');
      downloadBlob(blob, `extraction-${safeName}-${docId.slice(0, 8)}.csv`);
      setFeedback('Downloaded CSV');
      setOpen(false);
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  }, [docId, documentType, downloadBlob]);

  const handleCopyClipboard = useCallback(async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const text = JSON.stringify(extraction, null, 2);
      await navigator.clipboard.writeText(text);
      setFeedback('Copied!');
      setOpen(false);
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : 'Copy failed');
    } finally {
      setBusy(false);
    }
  }, [extraction]);

  return (
    <div className="export-dropdown" ref={containerRef}>
      <button
        className="extraction-btn ghost"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        style={{ width: 'auto', padding: '8px 14px' }}
      >
        {busy ? 'Exporting...' : 'Export'}
      </button>

      {open && (
        <div className="export-dropdown-menu">
          <button
            className="export-dropdown-item"
            onClick={handleExportJSON}
            disabled={busy}
          >
            Export JSON
          </button>
          <button
            className="export-dropdown-item"
            onClick={handleExportCSV}
            disabled={busy}
          >
            Export CSV
          </button>
          <button
            className="export-dropdown-item"
            onClick={handleCopyClipboard}
            disabled={busy}
          >
            Copy to Clipboard
          </button>
        </div>
      )}

      {feedback && (
        <div className="export-dropdown-feedback">{feedback}</div>
      )}
    </div>
  );
}
