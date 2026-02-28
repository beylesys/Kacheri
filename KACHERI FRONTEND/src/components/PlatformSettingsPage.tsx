/**
 * Platform Settings Page — Slice S23
 *
 * Settings page at `/settings` for web and mobile users.
 * Sections: Notification preferences (cross-product alerts), Memory Graph
 * visibility, JAAL privacy level (read-only), and theme preference.
 *
 * Desktop users see a redirect card directing them to the native settings
 * window (Tray menu or Cmd/Ctrl+,).
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../workspace';
import { useDeploymentContext } from '../platform/context';
import {
  notificationPreferencesApi,
} from '../api/notificationPreferences';
import type {
  NotificationPreference,
  CrossProductPreferencesInput,
} from '../api/notificationPreferences';
import './platformSettings.css';

// ── LocalStorage keys ──

const LS_MEMORY_GRAPH_VISIBLE = 'beyle:memoryGraphVisible';
const LS_THEME = 'beyle:theme';

// ── Helpers ──

function readLocalBool(key: string, defaultVal: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return defaultVal;
    return v === 'true';
  } catch {
    return defaultVal;
  }
}

function readLocalString(key: string, defaultVal: string): string {
  try {
    return localStorage.getItem(key) ?? defaultVal;
  } catch {
    return defaultVal;
  }
}

// ── Cross-product notification type descriptors ──

const CROSS_PRODUCT_TYPES = [
  {
    key: 'crossProductEntityUpdate' as const,
    name: 'Entity Update Alerts',
    hint: 'Notified when an entity is referenced by a new product.',
  },
  {
    key: 'crossProductEntityConflict' as const,
    name: 'Entity Conflict Alerts',
    hint: 'Notified when an entity appears across 3+ products.',
  },
  {
    key: 'crossProductNewConnection' as const,
    name: 'New Connection Alerts',
    hint: 'Notified when a new relationship bridges entities from different products.',
  },
];

// ── Inline SVG Icons ──

function SettingsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="platform-settings-info-icon">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function BackArrowIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

// ── Toggle Switch Component ──

interface ToggleSwitchProps {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

function ToggleSwitch({ checked, disabled, onChange, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="platform-settings-switch"
      onClick={() => onChange(!checked)}
    />
  );
}

// ── JAAL Privacy Capabilities Per Platform ──

interface PrivacyCapability {
  label: string;
  level: 'full' | 'partial' | 'none';
}

function getWebPrivacyCapabilities(): PrivacyCapability[] {
  return [
    { label: 'Browsing method: Backend-proxied', level: 'none' },
    { label: 'Cookie blocking: Not applicable (proxied)', level: 'none' },
    { label: 'Request interception: Not applicable (proxied)', level: 'none' },
    { label: 'Fingerprint defense: Not applicable (proxied)', level: 'none' },
    { label: 'Proof generation: Cloud (backend)', level: 'partial' },
  ];
}

function getMobilePrivacyCapabilities(): PrivacyCapability[] {
  return [
    { label: 'Browsing method: Native WebView', level: 'full' },
    { label: 'Cookie blocking: Platform-level', level: 'full' },
    { label: 'Request interception: Platform-dependent', level: 'partial' },
    { label: 'Fingerprint defense: Platform-dependent', level: 'partial' },
    { label: 'Proof generation: Cloud (backend)', level: 'partial' },
  ];
}

// ── Helper: match a preference record to cross-product state ──

function matchCrossProductPref(
  pref: NotificationPreference,
  state: Record<string, boolean>
): void {
  // The backend stores cross-product prefs with channel='in_app' and
  // notificationType like 'cross_product:entity_update'.
  // The notificationType field in the preference may not match our union type
  // (which only has standard types), so we check the raw string.
  const nt = pref.notificationType as string;
  if (pref.channel !== 'in_app') return;

  if (nt === 'cross_product:entity_update') {
    state.crossProductEntityUpdate = pref.enabled;
  } else if (nt === 'cross_product:entity_conflict') {
    state.crossProductEntityConflict = pref.enabled;
  } else if (nt === 'cross_product:new_connection') {
    state.crossProductNewConnection = pref.enabled;
  }
}

// ── Page header + back link (shared by all views) ──

function SettingsHeader() {
  return (
    <header className="platform-settings-header">
      <h1 className="platform-settings-title">Settings</h1>
      <Link to="/" className="platform-settings-back">
        <BackArrowIcon /> Home
      </Link>
    </header>
  );
}

// ── Main Component ──

export default function PlatformSettingsPage() {
  const { isDesktop, isMobile } = useDeploymentContext();
  const { workspaceId } = useWorkspace();

  // ── Cross-product notification state ──
  const [crossProductPrefs, setCrossProductPrefs] = useState({
    crossProductEntityUpdate: true,
    crossProductEntityConflict: true,
    crossProductNewConnection: false,
  });
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifSaving, setNotifSaving] = useState(false);

  // ── Local settings state ──
  const [memoryGraphVisible, setMemoryGraphVisible] = useState(
    () => readLocalBool(LS_MEMORY_GRAPH_VISIBLE, true)
  );
  const [theme, setTheme] = useState(
    () => readLocalString(LS_THEME, 'system')
  );

  // ── Status feedback ──
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Load cross-product notification preferences ──
  useEffect(() => {
    // Skip loading on desktop (redirect view) or when no workspace
    if (isDesktop || !workspaceId) {
      setNotifLoading(false);
      return;
    }

    let cancelled = false;

    notificationPreferencesApi.list(workspaceId).then((res) => {
      if (cancelled) return;

      const prefs: Record<string, boolean> = {
        crossProductEntityUpdate: true,
        crossProductEntityConflict: true,
        crossProductNewConnection: false,
      };

      for (const pref of res.preferences) {
        matchCrossProductPref(pref, prefs);
      }

      setCrossProductPrefs({
        crossProductEntityUpdate: prefs.crossProductEntityUpdate,
        crossProductEntityConflict: prefs.crossProductEntityConflict,
        crossProductNewConnection: prefs.crossProductNewConnection,
      });
      setNotifLoading(false);
    }).catch(() => {
      if (!cancelled) setNotifLoading(false);
    });

    return () => { cancelled = true; };
  }, [workspaceId, isDesktop]);

  // ── Save cross-product notification preferences ──
  const saveCrossProductPrefs = useCallback(
    async (updated: CrossProductPreferencesInput) => {
      if (!workspaceId || notifSaving) return;
      setNotifSaving(true);
      setStatusMsg(null);

      try {
        await notificationPreferencesApi.updateCrossProduct(workspaceId, updated);
        setStatusMsg({ type: 'success', text: 'Notification preferences saved.' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save preferences.';
        setStatusMsg({ type: 'error', text: msg });
      } finally {
        setNotifSaving(false);
        setTimeout(() => setStatusMsg(null), 3000);
      }
    },
    [workspaceId, notifSaving]
  );

  // ── Toggle a cross-product notification preference ──
  const handleNotifToggle = useCallback(
    (key: keyof typeof crossProductPrefs, value: boolean) => {
      setCrossProductPrefs((prev) => ({ ...prev, [key]: value }));
      saveCrossProductPrefs({ [key]: value });
    },
    [saveCrossProductPrefs]
  );

  // ── Memory Graph toggle ──
  const handleMemoryGraphToggle = useCallback((visible: boolean) => {
    setMemoryGraphVisible(visible);
    try {
      localStorage.setItem(LS_MEMORY_GRAPH_VISIBLE, String(visible));
    } catch {
      // localStorage unavailable
    }
  }, []);

  // ── Theme change ──
  const handleThemeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setTheme(val);
    try {
      localStorage.setItem(LS_THEME, val);
    } catch {
      // localStorage unavailable
    }
  }, []);

  // ── Desktop: show redirect card ──
  if (isDesktop) {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    return (
      <div className="platform-settings-page" id="main-content">
        <div className="platform-settings-inner">
          <SettingsHeader />
          <div className="platform-settings-desktop-redirect">
            <div className="platform-settings-desktop-card">
              <div className="platform-settings-desktop-icon">
                <SettingsIcon />
              </div>
              <h2 className="platform-settings-desktop-title">
                Desktop Settings
              </h2>
              <p className="platform-settings-desktop-text">
                Settings are available from the system tray menu or by pressing{' '}
                <kbd className="platform-settings-desktop-kbd">
                  {isMac ? '\u2318' : 'Ctrl'}
                </kbd>
                <kbd className="platform-settings-desktop-kbd">,</kbd>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── No workspace selected ──
  if (!workspaceId) {
    return (
      <div className="platform-settings-page" id="main-content">
        <div className="platform-settings-inner">
          <SettingsHeader />
          <div className="platform-settings-loading">
            Select a workspace to configure settings.
          </div>
        </div>
      </div>
    );
  }

  // ── JAAL privacy capabilities per platform ──
  const privacyCapabilities = isMobile
    ? getMobilePrivacyCapabilities()
    : getWebPrivacyCapabilities();

  const platformLabel = isMobile ? 'Mobile (Native WebView)' : 'Web (Cloud-Proxied)';

  return (
    <div className="platform-settings-page" id="main-content">
      <div className="platform-settings-inner">
        <SettingsHeader />

        {/* Section 1: Cross-Product Notification Preferences */}
        <section className="platform-settings-section" aria-labelledby="notif-title">
          <h2 className="platform-settings-section-title" id="notif-title">
            Notifications
          </h2>
          <p className="platform-settings-section-desc">
            Control cross-product alerts for entities and relationships across
            Docs, Design Studio, JAAL, and other products.
          </p>

          {notifLoading ? (
            <div style={{ color: '#9ca3af', fontSize: 13, padding: '8px 0' }}>
              Loading preferences...
            </div>
          ) : (
            CROSS_PRODUCT_TYPES.map((cp) => (
              <div className="platform-settings-toggle-row" key={cp.key}>
                <div className="platform-settings-toggle-label">
                  <span className="platform-settings-toggle-name">{cp.name}</span>
                  <span className="platform-settings-toggle-hint">{cp.hint}</span>
                </div>
                <ToggleSwitch
                  checked={crossProductPrefs[cp.key]}
                  disabled={notifSaving}
                  onChange={(val) => handleNotifToggle(cp.key, val)}
                  label={cp.name}
                />
              </div>
            ))
          )}
        </section>

        {/* Section 2: Memory Graph Visibility */}
        <section className="platform-settings-section" aria-labelledby="memgraph-title">
          <h2 className="platform-settings-section-title" id="memgraph-title">
            Memory Graph
          </h2>
          <div className="platform-settings-toggle-row">
            <div className="platform-settings-toggle-label">
              <span className="platform-settings-toggle-name">Show on homepage</span>
              <span className="platform-settings-toggle-hint">
                Display the Memory Graph intelligence widget on the homepage dashboard.
              </span>
            </div>
            <ToggleSwitch
              checked={memoryGraphVisible}
              onChange={handleMemoryGraphToggle}
              label="Memory Graph visibility"
            />
          </div>
        </section>

        {/* Section 3: JAAL Privacy Level (Read-Only) */}
        <section className="platform-settings-section" aria-labelledby="jaal-title">
          <h2 className="platform-settings-section-title" id="jaal-title">
            JAAL Privacy Level
          </h2>
          <div className="platform-settings-info-card">
            <InfoIcon />
            <div className="platform-settings-info-text">
              <span className="platform-settings-info-title">
                {platformLabel}
              </span>
              <span className="platform-settings-info-detail">
                {isMobile
                  ? 'JAAL uses platform-native WebView for browsing with device-level privacy controls. Proofs are generated server-side.'
                  : 'JAAL uses backend-proxied browsing. The server handles all web requests on your behalf. Proofs are generated server-side.'}
              </span>
            </div>
          </div>
          <ul className="platform-settings-capability-list">
            {privacyCapabilities.map((cap) => (
              <li className="platform-settings-capability-item" key={cap.label}>
                <span className={`platform-settings-capability-dot ${cap.level}`} />
                {cap.label}
              </li>
            ))}
          </ul>
        </section>

        {/* Section 4: Theme Preference */}
        <section className="platform-settings-section" aria-labelledby="theme-title">
          <h2 className="platform-settings-section-title" id="theme-title">
            Appearance
          </h2>
          <div className="platform-settings-toggle-row">
            <div className="platform-settings-toggle-label">
              <span className="platform-settings-toggle-name">Theme</span>
              <span className="platform-settings-toggle-hint">
                Choose your preferred color theme. Theme application is a future enhancement.
              </span>
            </div>
            <select
              className="platform-settings-select"
              value={theme}
              onChange={handleThemeChange}
              aria-label="Theme preference"
            >
              <option value="system">System</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
        </section>

        {/* Status Feedback */}
        {statusMsg && (
          <div className={`platform-settings-status ${statusMsg.type}`}>
            {statusMsg.text}
          </div>
        )}
      </div>
    </div>
  );
}
