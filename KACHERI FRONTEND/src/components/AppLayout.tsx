// src/components/AppLayout.tsx
// Layout wrapper that provides shared UI elements across protected pages.
//
// S21: Added mobile bottom navigation bar (Home, Docs, Files, Studio, JAAL)
// and @capacitor/app deep link handler for beyle:// URL scheme routing.

import { useEffect } from 'react';
import { useAuth } from '../auth/useAuth';
import { useWorkspace } from '../workspace';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { ChatWidget } from './chat/ChatWidget';
import { isProductEnabled } from '../modules/registry';
import { useDeploymentContext } from '../platform/context';
import './homePage.css';

interface AppLayoutProps {
  children: React.ReactNode;
}

// ── Inline SVG Icons for Bottom Nav (stroke-based, 24x24 viewBox) ──

function NavHomeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function NavDocsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
    </svg>
  );
}

function NavFilesIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function NavStudioIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function NavJaalIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

// ── Mobile Bottom Navigation ──
// Rendered inside AppLayout so it has access to auth + routing context.
// Visibility is controlled by CSS (visible only at ≤767px).

interface MobileBottomNavProps {
  isAuthenticated: boolean;
}

function MobileBottomNav({ isAuthenticated }: MobileBottomNavProps) {
  const navigate = useNavigate();
  const location = useLocation();

  if (!isAuthenticated) return null;

  const docsEnabled = isProductEnabled('docs');
  const studioEnabled = isProductEnabled('design-studio');
  const jaalEnabled = isProductEnabled('jaal');

  // Active state helpers
  const isHome = location.pathname === '/';
  const isDocs = location.pathname.startsWith('/docs') || location.pathname.startsWith('/doc/');
  const isFiles = location.pathname === '/files' && !location.pathname.startsWith('/workspaces');
  // Studio: any canvas route — /workspaces/:id/studio/:cid
  const isStudio = location.pathname.includes('/studio/');
  const isJaal = location.pathname.startsWith('/jaal');

  return (
    <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
      <button
        className={`mobile-nav-item${isHome ? ' active' : ''}`}
        onClick={() => navigate('/')}
        type="button"
        aria-label="Home"
        aria-current={isHome ? 'page' : undefined}
      >
        <NavHomeIcon />
        <span className="mobile-nav-label">Home</span>
      </button>

      {docsEnabled && (
        <button
          className={`mobile-nav-item${isDocs ? ' active' : ''}`}
          onClick={() => navigate('/docs')}
          type="button"
          aria-label="Docs"
          aria-current={isDocs ? 'page' : undefined}
        >
          <NavDocsIcon />
          <span className="mobile-nav-label">Docs</span>
        </button>
      )}

      <button
        className={`mobile-nav-item${isFiles ? ' active' : ''}`}
        onClick={() => navigate('/files')}
        type="button"
        aria-label="Files"
        aria-current={isFiles ? 'page' : undefined}
      >
        <NavFilesIcon />
        <span className="mobile-nav-label">Files</span>
      </button>

      {studioEnabled && (
        <button
          className={`mobile-nav-item${isStudio ? ' active' : ''}`}
          onClick={() => navigate('/files')}
          type="button"
          aria-label="Studio"
          aria-current={isStudio ? 'page' : undefined}
        >
          <NavStudioIcon />
          <span className="mobile-nav-label">Studio</span>
        </button>
      )}

      {jaalEnabled && (
        <button
          className={`mobile-nav-item${isJaal ? ' active' : ''}`}
          onClick={() => navigate('/jaal')}
          type="button"
          aria-label="JAAL"
          aria-current={isJaal ? 'page' : undefined}
        >
          <NavJaalIcon />
          <span className="mobile-nav-label">JAAL</span>
        </button>
      )}
    </nav>
  );
}

/**
 * AppLayout wraps protected page content and renders shared UI like the ChatWidget.
 * Only renders ChatWidget when user is authenticated and has a workspace selected.
 *
 * Slice S2: adds a persistent home navigation link on non-homepage routes.
 * Slice S21: adds mobile bottom nav + beyle:// deep link routing via @capacitor/app.
 */
export function AppLayout({ children }: AppLayoutProps) {
  const { isAuthenticated, user } = useAuth();
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const { isMobile } = useDeploymentContext();

  // Determine if we should show the chat widget
  const showChat = isAuthenticated && workspaceId && !workspaceLoading;

  // Show home link on all authenticated pages except the homepage itself
  // Hidden on mobile via CSS (bottom nav provides equivalent navigation)
  const isHomePage = location.pathname === '/';
  const showHomeLink = isAuthenticated && !isHomePage;

  // S21: Deep link handler for beyle:// URL scheme (Capacitor mobile only)
  // beyle://docs/<id>  → /doc/<id>
  // beyle://<path>     → /<path>  (generic fallback for future schemes)
  useEffect(() => {
    if (!isMobile) return;

    let listenerHandle: { remove: () => void } | null = null;

    // Dynamic import keeps @capacitor/app out of the initial web bundle
    import('@capacitor/app').then(({ App }) => {
      App.addListener('appUrlOpen', ({ url }) => {
        try {
          const parsed = new URL(url);
          if (parsed.protocol === 'beyle:') {
            const host = parsed.hostname; // e.g. 'docs', 'jaal'
            const path = parsed.pathname; // e.g. '/abc-123'
            // beyle://docs/abc-123 → /doc/abc-123
            // beyle://jaal         → /jaal
            const route = host === 'docs'
              ? `/doc${path}`
              : `/${host}${path}`;
            navigate(route);
          }
        } catch {
          // Ignore malformed or unrecognised deep link URLs
        }
      }).then((handle) => {
        listenerHandle = handle;
      });
    });

    return () => {
      listenerHandle?.remove();
    };
  }, [isMobile, navigate]);

  return (
    <>
      <a href="#main-content" className="skip-to-content">Skip to content</a>
      {showHomeLink && (
        <Link
          to="/"
          className="app-home-link"
          title="Back to Home"
          aria-label="Back to Home"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </Link>
      )}
      {children}
      {showChat && (
        <ChatWidget
          workspaceId={workspaceId}
          currentUserId={user?.id ?? 'anonymous'}
        />
      )}
      {/* S21: Mobile bottom navigation bar — hidden above 767px via CSS */}
      <MobileBottomNav isAuthenticated={!!isAuthenticated} />
    </>
  );
}
