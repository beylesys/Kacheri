/**
 * Deployment Context Detection — Slice S1
 *
 * Detects runtime environment (web / electron / capacitor) and provides
 * a React context, hook, and helpers for topology-aware components.
 *
 * Detection runs once at module load. The value is a frozen singleton —
 * the platform never changes during a session.
 */

import { createElement, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { DeploymentPlatform, DeploymentContextValue } from './types';

/* ------------------------------------------------------------------ */
/*  Detection (runs once at module load)                               */
/* ------------------------------------------------------------------ */

function detectPlatform(): DeploymentPlatform {
  if (typeof window !== 'undefined') {
    // Electron: electronAPI exposed by preload script, or user agent marker
    if (
      (window as Record<string, unknown>).electronAPI ||
      navigator.userAgent.includes('Electron')
    ) {
      return 'electron';
    }
    // Capacitor: native bridge injected by Capacitor runtime
    if ((window as Record<string, unknown>).Capacitor) {
      return 'capacitor';
    }
  }
  return 'web';
}

const _platform: DeploymentPlatform = detectPlatform();

const _value: DeploymentContextValue = Object.freeze({
  platform: _platform,
  isDesktop: _platform === 'electron',
  isMobile: _platform === 'capacitor',
  isWeb: _platform === 'web',
});

/* ------------------------------------------------------------------ */
/*  React Context                                                      */
/* ------------------------------------------------------------------ */

const DeploymentCtx = createContext<DeploymentContextValue>(_value);

/**
 * Context provider that makes deployment information available to all
 * descendant components via useDeploymentContext().
 * Wraps the app in App.tsx.
 */
export function DeploymentProvider({ children }: { children: ReactNode }) {
  return createElement(DeploymentCtx.Provider, { value: _value }, children);
}

/**
 * React hook returning the current deployment context.
 *
 * @example
 * const { platform, isDesktop, isMobile, isWeb } = useDeploymentContext();
 */
export function useDeploymentContext(): DeploymentContextValue {
  return useContext(DeploymentCtx);
}

/* ------------------------------------------------------------------ */
/*  Helpers (usable outside React components)                          */
/* ------------------------------------------------------------------ */

/**
 * True when a native webview is available for JAAL browsing
 * (Electron `<webview>` or Capacitor native WebView plugin).
 */
export function canRunNativeJaal(): boolean {
  return _platform === 'electron' || _platform === 'capacitor';
}

/**
 * Resolves the backend API base URL per topology:
 * - Electron: reads from preload-injected config, falls back to env/default
 * - Capacitor: reads from native config bridge, falls back to env/default
 * - Web: uses VITE_API_BASE / VITE_API_URL / '/api'
 */
export function getBackendUrl(): string {
  if (_platform === 'electron') {
    const w = window as Record<string, unknown>;
    const api = w.electronAPI as Record<string, unknown> | undefined;
    const url = api?.backendUrl as string | undefined;
    if (url) return url;
  }

  if (_platform === 'capacitor') {
    const w = window as Record<string, unknown>;
    const cfg = w.__BEYLE_CONFIG__ as Record<string, unknown> | undefined;
    const url = cfg?.backendUrl as string | undefined;
    if (url) return url;
  }

  // Web fallback (and default for electron/capacitor when no native config)
  const meta = import.meta as any;
  return meta.env?.VITE_API_BASE ?? meta.env?.VITE_API_URL ?? '/api';
}
