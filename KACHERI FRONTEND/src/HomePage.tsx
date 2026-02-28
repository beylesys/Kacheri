/**
 * Universal Homepage — Slices S2 + S3 + S21
 *
 * Renders 4 product cards (Kacheri Docs, File Manager, Design Studio, BEYLE JAAL)
 * in a responsive grid: 4-across on desktop, 2x2 on tablet, 1-column on mobile.
 * Each card respects isProductEnabled() and adapts JAAL behavior to the
 * current deployment context (web/electron/capacitor).
 *
 * S21 additions:
 * - Pull-to-refresh on activity feed (touch gesture handler)
 * - JAAL card click wired (navigate('/jaal') for web/mobile, electronAPI for desktop)
 * - jaalAvailable = jaalEnabled (JAAL routes exist in all topologies post-S4/S10/S13)
 *
 * This is the default route (`/`). FileManagerPage remains at `/files`.
 */

import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProductCard } from './components/ProductCard';
import { ActivityFeed } from './components/ActivityFeed';
import { MemoryGraphWidget } from './components/MemoryGraphWidget';
import { WorkspaceSwitcher, useWorkspace } from './workspace';
import { isProductEnabled, useProductConfig } from './modules/registry';
import { useDeploymentContext } from './platform/context';
import './components/homePage.css';

// ── Inline SVG Icons (feather-style, 24x24 viewBox, stroke-based) ──

function DocsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function FileManagerIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function DesignStudioIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function JaalIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

// Spinner icon for pull-to-refresh
function RefreshIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

// ── JAAL capability badge per platform ──

function getJaalCapabilityBadge(platform: string): string {
  switch (platform) {
    case 'electron': return 'Full privacy browsing';
    case 'capacitor': return 'Native browsing';
    default: return 'Cloud browsing';
  }
}

// ── Pull-to-Refresh constants ──

const PULL_THRESHOLD = 80;
const PULL_MAX = 120;

// ── Component ──

export default function HomePage() {
  const navigate = useNavigate();
  const { platform, isDesktop } = useDeploymentContext();
  const { workspaceId } = useWorkspace();

  // Subscribe to registry changes so we re-render when fetchProductConfig() updates
  useProductConfig();

  const docsEnabled = isProductEnabled('docs');
  const studioEnabled = isProductEnabled('design-studio');
  const jaalEnabled = isProductEnabled('jaal');

  // S21: JAAL routes exist in all topologies (S4 → web, S10 → desktop, S19/S20 → mobile)
  const jaalAvailable = jaalEnabled;

  // ── S21: Pull-to-refresh state ──
  const [pullY, setPullY] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const startYRef = useRef(-1);
  const isPullingRef = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // Only initiate pull when already at the top of the page
    if (window.scrollY === 0) {
      startYRef.current = e.touches[0].clientY;
    } else {
      startYRef.current = -1;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (startYRef.current < 0) return;
    const deltaY = e.touches[0].clientY - startYRef.current;
    if (deltaY > 0) {
      setPullY(Math.min(deltaY, PULL_MAX));
      isPullingRef.current = deltaY >= PULL_THRESHOLD;
      setIsPulling(isPullingRef.current);
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (isPullingRef.current) {
      // Force ActivityFeed remount to re-fetch data
      setRefreshKey((k) => k + 1);
    }
    setPullY(0);
    setIsPulling(false);
    isPullingRef.current = false;
    startYRef.current = -1;
  }, []);

  // ── S21: JAAL card click handler ──
  const handleJaalClick = useCallback(() => {
    if (!jaalAvailable) return;
    if (isDesktop) {
      // Desktop: open the native JAAL Electron window via preload bridge (S10)
      (window as Record<string, unknown> & { electronAPI?: { openJaal?: () => void } })
        .electronAPI?.openJaal?.();
    } else {
      navigate('/jaal');
    }
  }, [jaalAvailable, isDesktop, navigate]);

  // Pull-to-refresh indicator height (proportional to pull distance)
  const indicatorHeight = pullY > 0 ? Math.round(pullY * 0.4) : 0;

  return (
    <div
      className="home-page"
      id="main-content"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* S21: Pull-to-refresh indicator — visible when dragging down */}
      {indicatorHeight > 0 && (
        <div
          className={`pull-refresh-indicator${isPulling ? ' is-pulling' : ''}`}
          style={{ height: `${indicatorHeight}px` }}
          aria-hidden="true"
        >
          <span className="pull-refresh-spinner">
            <RefreshIcon />
          </span>
        </div>
      )}

      <div className="home-page-inner">
        {/* Header */}
        <header className="home-page-header">
          <div>
            <h1 className="home-page-title">BEYLE</h1>
            <p className="home-page-subtitle">
              Legal document intelligence platform. Create, manage, design,
              and research — all in one place.
            </p>
          </div>
          <div className="home-page-actions">
            <WorkspaceSwitcher />
          </div>
        </header>

        {/* Product Grid — 4-across desktop, 2x2 tablet, 1-col mobile (S21) */}
        <div className="product-grid">
          {/* Kacheri Docs — gated by product registry */}
          <ProductCard
            productId="docs"
            name="Kacheri Docs"
            description="AI-powered legal document editor with real-time collaboration, proofs, and compliance checking."
            icon={<DocsIcon />}
            enabled={docsEnabled}
            available={true}
            onClick={() => navigate('/docs')}
            accentColor="rgba(79, 70, 229, 0.35)"
          />

          {/* File Manager — always available (core infrastructure) */}
          <ProductCard
            productId="file-manager"
            name="File Manager"
            description="Organize documents and canvases into folders. Import, export, and manage your workspace."
            icon={<FileManagerIcon />}
            enabled={true}
            available={true}
            onClick={() => navigate('/files')}
            accentColor="rgba(59, 130, 246, 0.3)"
          />

          {/* Design Studio — gated by product registry */}
          <ProductCard
            productId="design-studio"
            name="Design Studio"
            description="Create presentations, documents, and visual content with AI-assisted design and KCL components."
            icon={<DesignStudioIcon />}
            enabled={studioEnabled}
            available={true}
            onClick={() => navigate('/files')}
            accentColor="rgba(147, 51, 234, 0.3)"
          />

          {/* BEYLE JAAL — gated by product registry, platform-aware (S21: wired) */}
          <ProductCard
            productId="jaal"
            name="BEYLE JAAL"
            description="Privacy-first research browser with cryptographic proofs, AI guidance, and session management."
            icon={<JaalIcon />}
            enabled={jaalEnabled}
            available={jaalAvailable}
            onClick={handleJaalClick}
            capabilityBadge={jaalEnabled ? getJaalCapabilityBadge(platform) : undefined}
            accentColor="rgba(16, 185, 129, 0.3)"
          />
        </div>

        {/* Activity Feed — cross-product recent activity (Slice S3)
            key={refreshKey} forces remount on pull-to-refresh, triggering re-fetch */}
        <ActivityFeed key={refreshKey} workspaceId={workspaceId} />

        {/* Memory Graph Widget — cross-product intelligence summary (Slice S15) */}
        <MemoryGraphWidget workspaceId={workspaceId} />
      </div>
    </div>
  );
}
