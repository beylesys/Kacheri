// frontend/src/components/ImportButton.tsx
import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';

type Props = {
  className?: string;
  label?: string;
  accept?: string; // e.g. ".docx,.pdf,.html,.md"
  disabled?: boolean;
  title?: string;
  style?: React.CSSProperties;
};

// Global, in-memory handoff cache for large imports (survives SPA navigation).
declare global {
  interface Window {
    __kacheriImport?: Record<string, string>;
  }
}

export default function ImportButton({
  className,
  label = 'Import…',
  accept = '.docx,.pdf,.html,.md',
  disabled = false,
  title,
  style,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  const stashHtml = (docId: string, html: string) => {
    // 1) In-memory handoff (no size limit for a single navigation)
    try {
      window.__kacheriImport = window.__kacheriImport || {};
      window.__kacheriImport[docId] = html;
    } catch {
      // non-fatal
    }
    // 2) Best-effort sessionStorage for smaller docs
    try {
      sessionStorage.setItem(`import:${docId}:html`, html);
    } catch {
      // QuotaExceededError → fine, we already cached in memory
      // console.warn('Import payload too large for sessionStorage; using in-memory cache.');
    }
  };

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const form = new FormData();
    form.append('file', file);

    // Infer kind from extension; backend also infers & supports ?kind=...
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const url = `/api/docs/import?kind=${encodeURIComponent(ext)}`;

    try {
      const res = await fetch(url, { method: 'POST', body: form });
      if (!res.ok) {
        let errText = '';
        try { errText = await res.text(); } catch {}
        alert(`Import failed: ${errText || res.statusText}`);
        return;
      }
      const data = await res.json();
      const docId: string | undefined = data?.docId ?? data?.id;
      const html: string = typeof data?.html === 'string' ? data.html : '';

      if (!docId) {
        alert('Import succeeded but no docId returned.');
        return;
      }

      if (html && html.trim().length > 0) {
        stashHtml(docId, html);
      }

      // Navigate to the doc with a flag to trigger the review flow.
      navigate(`/doc/${encodeURIComponent(docId)}?from=import`);
    } catch (err: any) {
      alert(`Import failed: ${err?.message || String(err)}`);
    } finally {
      // reset input so picking the same file again re-fires onChange
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={openPicker}
        disabled={disabled}
        title={title}
        style={disabled ? { ...style, opacity: 0.4, cursor: 'not-allowed' } : style}
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={onChange}
        disabled={disabled}
      />
    </>
  );
}
