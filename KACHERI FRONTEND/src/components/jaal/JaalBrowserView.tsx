// KACHERI FRONTEND/src/components/jaal/JaalBrowserView.tsx
// Main JAAL page component — Slice S4 (Phase B) + S21 (Phase F)
//
// Route target for /jaal and /jaal/session/:sid.
// Composes: GuidePanel, TrustHUD, ResearchSessionControls, ProofViewer,
// MemoryContextPanel into a browser-like layout.
//
// Browser rendering per platform:
//   - electron: <webview> placeholder (S8 will wire native Electron webview)
//   - capacitor: JaalBrowser native plugin (S19 Android / S20 iOS) — wired in S21
//   - web: <iframe> pointing to backend browse proxy (S5 dependency)

import { useState, useCallback, useEffect, useRef, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useDeploymentContext } from '../../platform/context';
import { useWorkspace } from '../../workspace/WorkspaceContext';
import { GuidePanel } from './GuidePanel';
import { TrustHUD } from './TrustHUD';
import { ResearchSessionControls } from './ResearchSessionControls';
import { ProofViewer } from './ProofViewer';
import { MemoryContextPanel } from './MemoryContextPanel';
import { jaalApi } from '../../api/jaal';
import type { TrustSummary, JaalSession } from '../../api/jaal';
import './jaal.css';

// Type-only import — the actual module is loaded dynamically on mobile only.
// This avoids bundling jaal-browser JS into the web/desktop builds at module parse
// time (though Vite code-splits it regardless via dynamic import below).
import type { JaalBrowserPlugin } from 'jaal-browser';

/* ---------- Types ---------- */

type SidebarTab = 'guide' | 'research' | 'proofs' | 'context';

/* ---------- Browser Viewport ---------- */

interface BrowserViewportProps {
  url: string;
  isDesktop: boolean;
  isMobile: boolean;
  onNavigate: (raw: string) => void;
}

function BrowserViewport({ url, isDesktop, isMobile, onNavigate }: BrowserViewportProps) {
  if (isDesktop) {
    // Electron webview — placeholder until S8 (Desktop Shell)
    return (
      <div className="jaal-browser-placeholder">
        <svg
          className="jaal-browser-placeholder-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
        <div className="jaal-browser-placeholder-title">Desktop Browser</div>
        <div className="jaal-browser-placeholder-text">
          The native Electron webview will be available when the Desktop Shell is implemented (S8).
          Full privacy browsing with cookie blocking, request interception, and storage silos.
        </div>
        {url && (
          <div className="jaal-browser-placeholder-text" style={{ opacity: 0.6 }}>
            Target: {url}
          </div>
        )}
      </div>
    );
  }

  if (isMobile) {
    // S21: JaalBrowser native plugin (S19 Android / S20 iOS).
    // The native WebView is an OS-level overlay above the Capacitor WebView —
    // it becomes visible as soon as JaalBrowser.navigate() is called from the
    // navigateToUrl handler. This React placeholder shows as the background
    // when no URL has been loaded yet, or after the browser is hidden.
    return (
      <div className="jaal-browser-placeholder">
        <svg
          className="jaal-browser-placeholder-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <rect x="5" y="2" width="14" height="20" rx="2" />
          <path d="M12 18h.01" />
        </svg>
        <div className="jaal-browser-placeholder-title">
          {url ? 'Browsing…' : 'JAAL Mobile Browser'}
        </div>
        <div className="jaal-browser-placeholder-text">
          {url
            ? 'Native browser is active. Use the address bar above to navigate.'
            : 'Enter a URL above to browse. JAAL uses native WebView with privacy controls.'}
        </div>
        {url && (
          <div className="jaal-browser-placeholder-text" style={{ opacity: 0.6 }}>
            {url}
          </div>
        )}
      </div>
    );
  }

  // Web: home screen with centered search/prompt bar
  if (!url) {
    return <JaalHomeSearch onNavigate={onNavigate} />;
  }

  return (
    <iframe
      className="jaal-browser-iframe"
      src={jaalApi.browseProxyUrl(url)}
      title="JAAL browsing view"
      sandbox="allow-same-origin"
      referrerPolicy="no-referrer"
    />
  );
}

/* ---------- Home Search / AI Prompt Bar ---------- */

function JaalHomeSearch({ onNavigate }: { onNavigate: (raw: string) => void }) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = query.trim();
    if (!value) return;
    onNavigate(value);
  };

  return (
    <div className="jaal-home">
      <div className="jaal-home-brand">
        <svg
          className="jaal-home-logo"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
        </svg>
        <span className="jaal-home-title">JAAL</span>
      </div>
      <p className="jaal-home-subtitle">Search the web or ask a question</p>
      <form className="jaal-home-form" onSubmit={handleSubmit}>
        <input
          className="jaal-home-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or enter a URL…"
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
        <button className="jaal-home-submit" type="submit" aria-label="Go">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </form>
      <div className="jaal-home-hints">
        <span>Try: <kbd>google.com</kbd></span>
        <span><kbd>what is contract law</kbd></span>
        <span><kbd>https://example.com</kbd></span>
      </div>
    </div>
  );
}

/* ---------- Main Component ---------- */

export default function JaalBrowserView() {
  const { sid } = useParams<{ sid?: string }>();
  const { isDesktop, isMobile } = useDeploymentContext();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;

  // Page state
  const [currentUrl, setCurrentUrl] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [pageContent] = useState(''); // Populated by browser events (S8/web-proxy)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Sidebar tab — auto-select research if session ID in URL
  const [activeTab, setActiveTab] = useState<SidebarTab>(sid ? 'research' : 'guide');

  // Trust state
  const [trustSummary, setTrustSummary] = useState<TrustSummary | null>(null);

  // Session state (from ResearchSessionControls)
  const [activeSession, setActiveSession] = useState<JaalSession | null>(null);

  // S21: Reference to the JaalBrowser native plugin (Capacitor only)
  const jaalBrowserRef = useRef<JaalBrowserPlugin | null>(null);

  /* ---- S21: Acquire JaalBrowser plugin on mobile ---- */

  useEffect(() => {
    if (!isMobile) return;

    // Dynamic import: loads jaal-browser and caches the plugin reference.
    // On web/desktop this branch never executes.
    let cancelled = false;
    import('jaal-browser').then(({ JaalBrowser }) => {
      if (!cancelled) {
        jaalBrowserRef.current = JaalBrowser;
      }
    });

    return () => {
      cancelled = true;
      // Destroy the native WebView when the JAAL route is unmounted
      jaalBrowserRef.current?.destroy().catch(() => {});
      jaalBrowserRef.current = null;
    };
  }, [isMobile]);

  /* ---- S21: Listen to native browser events on mobile ---- */

  const refreshTrust = useCallback(async () => {
    // Trust data will come from backend when S5 is implemented.
    setTrustSummary(null);
  }, []);

  useEffect(() => {
    if (!isMobile) return;

    const handles: Array<{ remove: () => void }> = [];

    import('jaal-browser').then(({ JaalBrowser }) => {
      // Sync URL bar with native browser navigation (back/forward/link taps)
      JaalBrowser.addListener('navigationChange', (ev) => {
        setCurrentUrl(ev.url);
        setUrlInput(ev.url);
      }).then((h) => handles.push(h));

      // Refresh trust overlay on each page load
      JaalBrowser.addListener('pageLoad', () => {
        refreshTrust();
      }).then((h) => handles.push(h));
    });

    return () => {
      handles.forEach((h) => h.remove());
    };
  }, [isMobile, refreshTrust]);

  /* ---- URL Navigation ---- */

  const navigateFromRaw = useCallback((raw: string) => {
    const value = raw.trim();
    if (!value) return;

    // Normalize input: URL, bare domain, or search query
    // Matches original JAAL normalizeUrl() from renderer.js
    let url: string;
    if (/^https?:\/\//i.test(value)) {
      url = value; // Full URL — use as-is
    } else if (/^\w+\.\w+/.test(value)) {
      url = `https://${value}`; // Bare domain (e.g. "google.com") — prepend https://
    } else {
      url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(value)}`; // Search query (HTML-only, no JS needed)
    }

    setCurrentUrl(url);
    setUrlInput(url);

    // S21: On mobile, delegate to the native JaalBrowser plugin (S19/S20)
    if (isMobile && jaalBrowserRef.current) {
      jaalBrowserRef.current.navigate({ url }).catch((error: unknown) => {
        console.error('[JAAL] Failed to navigate to URL:', url, error);
      });
    }
  }, [isMobile]);

  const navigateToUrl = useCallback(() => {
    navigateFromRaw(urlInput);
  }, [urlInput, navigateFromRaw]);

  const handleUrlKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        navigateToUrl();
      }
    },
    [navigateToUrl],
  );

  /* ---- Sidebar tab content ---- */

  const tabs: Array<{ id: SidebarTab; label: string }> = [
    { id: 'guide', label: 'Guide' },
    { id: 'research', label: 'Research' },
    { id: 'proofs', label: 'Proofs' },
    { id: 'context', label: 'Context' },
  ];

  return (
    <div className="jaal-page">
      {/* Navigation Bar */}
      <nav className="jaal-navbar" aria-label="JAAL navigation">
        <button
          className="jaal-nav-btn"
          disabled
          type="button"
          title="Back"
          aria-label="Navigate back"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          className="jaal-nav-btn"
          disabled
          type="button"
          title="Forward"
          aria-label="Navigate forward"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
        <button
          className="jaal-nav-btn"
          onClick={navigateToUrl}
          type="button"
          title="Reload"
          aria-label="Reload page"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
        </button>

        <input
          className="jaal-url-input"
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={handleUrlKeyDown}
          placeholder="Enter URL to browse..."
          aria-label="URL address bar"
          spellCheck={false}
          autoComplete="off"
        />

        {/* S21: On mobile, Trust HUD is styled as a fixed floating overlay via jaal.css */}
        <TrustHUD trustSummary={trustSummary} compact />

        <button
          className="jaal-nav-btn"
          onClick={() => setSidebarCollapsed((prev) => !prev)}
          type="button"
          title={sidebarCollapsed ? 'Show panel' : 'Hide panel'}
          aria-label={sidebarCollapsed ? 'Show panel' : 'Hide panel'}
          aria-expanded={!sidebarCollapsed}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M15 3v18" />
          </svg>
        </button>
      </nav>

      {/* Body: Browser + Sidebar
          On mobile (S21): sidebar becomes a fixed bottom sheet via jaal.css */}
      <div className="jaal-body">
        {/* Browser Viewport */}
        <div className="jaal-browser">
          <BrowserViewport
            url={currentUrl}
            isDesktop={isDesktop}
            isMobile={isMobile}
            onNavigate={navigateFromRaw}
          />
        </div>

        {/* Sidebar / Bottom Sheet (mobile) */}
        <aside
          className={`jaal-sidebar${sidebarCollapsed ? ' collapsed' : ''}`}
          aria-label="JAAL panels"
        >
          <div className="jaal-sidebar-tabs" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`jaal-sidebar-tab${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`jaal-panel-${tab.id}`}
                id={`jaal-tab-${tab.id}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="jaal-sidebar-content">
            {activeTab === 'guide' && (
              <div role="tabpanel" id="jaal-panel-guide" aria-labelledby="jaal-tab-guide">
                <GuidePanel
                  currentUrl={currentUrl}
                  pageContent={pageContent}
                />
              </div>
            )}

            {activeTab === 'research' && (
              <div role="tabpanel" id="jaal-panel-research" aria-labelledby="jaal-tab-research">
                <ResearchSessionControls
                  workspaceId={workspaceId}
                  onSessionChange={setActiveSession}
                />
              </div>
            )}

            {activeTab === 'proofs' && (
              <div role="tabpanel" id="jaal-panel-proofs" aria-labelledby="jaal-tab-proofs">
                <ProofViewer
                  sessionId={sid ?? activeSession?.id}
                  workspaceId={workspaceId}
                />
              </div>
            )}

            {activeTab === 'context' && (
              <div role="tabpanel" id="jaal-panel-context" aria-labelledby="jaal-tab-context">
                <MemoryContextPanel
                  currentUrl={currentUrl || null}
                  workspaceId={workspaceId}
                />
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Status Bar */}
      <div className="jaal-statusbar">
        <div className="jaal-statusbar-item">
          <span
            className={`jaal-statusbar-dot ${activeSession ? 'active' : 'inactive'}`}
            aria-hidden="true"
          />
          {activeSession
            ? `Session: ${activeSession.id.slice(0, 12)}...`
            : 'No session'}
        </div>
        {currentUrl && (
          <div className="jaal-statusbar-item">
            {currentUrl}
          </div>
        )}
      </div>
    </div>
  );
}
