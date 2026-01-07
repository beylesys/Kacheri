import { useMemo, useState } from "react";
import { DocsAPI } from "../api";

/**
 * Server response shape we rely on. If your API returns more,
 * that's fine — we only read what we need.
 */
type ExportMeta = {
  file?: {
    filename?: string;
    // These are optional conveniences if your backend provides them.
    url?: string;
    downloadUrl?: string;
  };
  [k: string]: unknown;
};

type Props = {
  /** Raw doc id (without `doc-` prefix). */
  docId: string;
  /** Fetch fresh HTML from the editor at click time. */
  getHtml: () => string;
  /** Optional filename hint; falls back to something like `doc-<id>.docx`. */
  filenameHint?: string;
  /** Optional className for layout styling. */
  className?: string;
};

/** Build a best-guess download URL for the saved .docx on the API host. */
function buildDocxDownloadUrl(docId: string, filename: string): string {
  // Prefer an explicit API base if configured; otherwise same-origin.
  // Vite's import.meta.env typing can be finicky, so we cast to any.
  const base = ((import.meta as any)?.env?.VITE_API_BASE as string | undefined) || "";
  const trimmed = base.replace(/\/+$/, "");
  const cleanId = String(docId).replace(/^doc-/, "");
  // This path matches the GET route suggested in the backend:
  //   GET /docs/:id/exports/docx/:file
  return `${trimmed}/docs/${encodeURIComponent(cleanId)}/exports/docx/${encodeURIComponent(filename)}`;
}

/** Trigger a browser download given a URL+filename. */
function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // If the server forces Content-Disposition, download attr may be ignored,
  // but the navigation will still work.
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function ExportDocxButton({ docId, getHtml, filenameHint, className }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [savedFile, setSavedFile] = useState<{ filename: string; url: string } | null>(null);

  const defaultFilename = useMemo(() => {
    const base = (filenameHint && filenameHint.trim()) || `doc-${docId || "untitled"}`;
    return base.endsWith(".docx") ? base : `${base}.docx`;
  }, [filenameHint, docId]);

  async function runExport() {
    setBusy(true);
    setError("");
    setSavedFile(null);
    try {
      const html = getHtml() || "<p></p>";
      const meta = (await DocsAPI.exportDocx(docId, html, defaultFilename)) as ExportMeta;

      const filename =
        meta?.file?.filename?.trim() ||
        defaultFilename;

      // Prefer a backend-provided absolute URL if present; else build one.
      const url =
        (meta?.file?.downloadUrl && meta.file.downloadUrl.trim()) ||
        (meta?.file?.url && meta.file.url.trim()) ||
        buildDocxDownloadUrl(docId, filename);

      // Save (for UI) and auto-download right away.
      setSavedFile({ filename, url });
      // Kick off download; if server doesn't expose the GET route yet, this may 404.
      triggerDownload(url, filename);
    } catch (e: any) {
      setError(e?.message || "DOCX export failed");
    } finally {
      setBusy(false);
    }
  }

  function runDownloadAgain() {
    if (!savedFile) return;
    triggerDownload(savedFile.url, savedFile.filename);
  }

  return (
    <div className={className}>
      <button onClick={runExport} disabled={busy} aria-label="Export document as DOCX">
        {busy ? "Exporting…" : "Export DOCX"}
      </button>

      {savedFile && (
        <>
          <span style={{ marginLeft: 8, fontSize: 12 }}>
            Saved: <strong>{savedFile.filename}</strong>
          </span>
          <button
            onClick={runDownloadAgain}
            style={{ marginLeft: 8 }}
            aria-label="Download the most recent DOCX again"
          >
            Download
          </button>
        </>
      )}

      {error && <div style={{ color: "#b91c1c", marginTop: 6 }}>{error}</div>}
    </div>
  );
}
