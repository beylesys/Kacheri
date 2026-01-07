// PDFViewer.tsx - Renders PDF pages using pdfjs-dist
import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker path - use CDN to avoid bundling issues
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface Props {
  url: string;
  scale?: number;
  className?: string;
  onPageChange?: (page: number, total: number) => void;
}

export default function PDFViewer({ url, scale = 1.2, className, onPageChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      try {
        setLoading(true);
        setError(null);

        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;

        if (cancelled) return;

        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setCurrentPage(1);
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load PDF';
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPdf();
    return () => { cancelled = true; };
  }, [url]);

  // Render current page
  const renderPage = useCallback(async (pageNum: number) => {
    const pdf = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas) return;

    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const context = canvas.getContext('2d');
      if (!context) return;

      await page.render({
        canvasContext: context,
        viewport,
      }).promise;
    } catch (err) {
      console.error('Failed to render page:', err);
    }
  }, [scale]);

  // Render page when current page changes
  useEffect(() => {
    if (pdfDocRef.current && currentPage > 0) {
      renderPage(currentPage);
      onPageChange?.(currentPage, numPages);
    }
  }, [currentPage, numPages, renderPage, onPageChange]);

  // Re-render when PDF loads
  useEffect(() => {
    if (!loading && pdfDocRef.current) {
      renderPage(currentPage);
    }
  }, [loading, currentPage, renderPage]);

  const goToPage = (page: number) => {
    if (page < 1 || page > numPages) return;
    setCurrentPage(page);
  };

  const prevPage = () => goToPage(currentPage - 1);
  const nextPage = () => goToPage(currentPage + 1);

  if (error) {
    return (
      <div className={`pdf-viewer ${className || ''}`} style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%'
      }}>
        <div style={{
          padding: 20,
          color: 'var(--red-500, #ef4444)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          background: 'var(--surface, #f8fafc)'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
              Failed to load PDF
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted, #64748b)' }}>
              {error}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`pdf-viewer ${className || ''}`} style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    }}>
      {/* Controls */}
      <div className="pdf-controls" style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderBottom: '1px solid var(--border, #e5e7eb)',
        background: 'var(--panel, #f9fafb)',
        flexShrink: 0,
      }}>
        <button
          className="button subtle sm"
          onClick={prevPage}
          disabled={currentPage <= 1 || loading}
          style={{ padding: '4px 8px', fontSize: 12 }}
        >
          ← Prev
        </button>
        <span style={{
          fontSize: 12,
          color: 'var(--muted, #64748b)',
          minWidth: 80,
          textAlign: 'center'
        }}>
          {loading ? 'Loading...' : `Page ${currentPage} of ${numPages}`}
        </span>
        <button
          className="button subtle sm"
          onClick={nextPage}
          disabled={currentPage >= numPages || loading}
          style={{ padding: '4px 8px', fontSize: 12 }}
        >
          Next →
        </button>
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: 16,
          background: 'var(--surface, #e5e7eb)',
        }}
      >
        {loading ? (
          <div style={{
            padding: 40,
            color: 'var(--muted, #64748b)',
            fontSize: 14
          }}>
            Loading PDF...
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            style={{
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              background: '#fff',
              maxWidth: '100%',
              height: 'auto',
            }}
          />
        )}
      </div>
    </div>
  );
}
