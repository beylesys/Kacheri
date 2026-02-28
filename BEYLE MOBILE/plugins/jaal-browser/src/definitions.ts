// BEYLE MOBILE/plugins/jaal-browser/src/definitions.ts
// Slice S19: TypeScript interface for the JAAL Browser Capacitor plugin.
//
// Defines the complete JS ↔ native bridge contract.
// Android implementation: JaalBrowserPlugin.java
// iOS implementation: JaalBrowserPlugin.swift (S20 — future)

import type { PluginListenerHandle } from '@capacitor/core';

/* ---------- Options / Request types ---------- */

/** Options for the navigate() method */
export interface NavigateOptions {
  /** The URL to load in the native WebView */
  url: string;
}

/** Options for the injectScript() method */
export interface InjectScriptOptions {
  /** JavaScript source code to execute in the WebView page context */
  js: string;
}

/** Privacy configuration for the native WebView */
export interface PrivacyConfig {
  /**
   * Block all third-party cookies.
   * @default true
   */
  blockThirdPartyCookies?: boolean;

  /**
   * Block requests matching these domain substrings (tracker/ad blocking).
   * E.g., ["doubleclick.net", "googlesyndication.com", "facebook.com/tr"]
   */
  blockedDomains?: string[];

  /**
   * Read-only domains where page mutation scripts are suppressed.
   * Aligns with JAAL policy read_only_domains_contains.
   */
  readOnlyDomains?: string[];

  /**
   * Enable storage isolation (clear cookies/cache on eTLD+1 boundary crossing).
   * When true, navigating from one domain to another clears session data
   * for the previous domain, preventing cross-site tracking.
   * @default false
   */
  storageIsolation?: boolean;

  /**
   * Disable JavaScript in the WebView for maximum privacy.
   * WARNING: Most modern sites will not function with JS disabled.
   * @default false
   */
  disableJavaScript?: boolean;

  /**
   * Send a custom User-Agent string to reduce fingerprinting.
   * If null/undefined, the default Android WebView UA is used.
   */
  userAgent?: string;

  /**
   * Disable WebView geolocation API.
   * @default true
   */
  blockGeolocation?: boolean;
}

/** Options for show() and hide() */
export interface ShowOptions {
  /**
   * Animate the overlay transition (200ms fade).
   * @default true
   */
  animate?: boolean;
}

/* ---------- Result types ---------- */

/** Result from getPageContent() */
export interface PageContentResult {
  /** The full HTML source of the current page */
  html: string;
  /** The extracted visible text content of the current page */
  text: string;
  /** The current URL (may differ from navigated URL due to redirects) */
  url: string;
  /** The page title from <title> */
  title: string;
}

/** Result from injectScript() */
export interface InjectScriptResult {
  /** The stringified result of the JavaScript evaluation */
  result: string;
}

/** Result from goBack() */
export interface GoBackResult {
  /** Whether the WebView can still go further back */
  canGoBack: boolean;
}

/** Result from goForward() */
export interface GoForwardResult {
  /** Whether the WebView can still go further forward */
  canGoForward: boolean;
}

/** Result from getState() */
export interface BrowserState {
  /** Whether the native WebView overlay is currently visible */
  visible: boolean;
  /** The current URL loaded in the WebView (empty string if none) */
  url: string;
  /** Whether a page is currently loading */
  loading: boolean;
}

/* ---------- Event payloads ---------- */

/** Fired when the WebView navigates to a new URL */
export interface NavigationChangeEvent {
  /** The URL being navigated to */
  url: string;
  /** Whether this is the main frame (always true — subframes not tracked) */
  isMainFrame: boolean;
  /** Whether the navigation was triggered by user interaction */
  isUserInitiated: boolean;
}

/** Fired when a page finishes loading */
export interface PageLoadEvent {
  /** The URL that finished loading */
  url: string;
  /** The page title */
  title: string;
}

/** Fired when a page load fails */
export interface PageErrorEvent {
  /** The URL that failed to load */
  url: string;
  /** Error description */
  error: string;
  /** WebView error code */
  errorCode: number;
}

/** Fired when a request is blocked by privacy config */
export interface RequestBlockedEvent {
  /** The blocked request URL */
  url: string;
  /** The domain rule that matched */
  matchedDomain: string;
}

/* ---------- Plugin interface ---------- */

export interface JaalBrowserPlugin {
  /**
   * Navigate the native WebView to a URL.
   * Creates the WebView overlay if it doesn't exist yet (lazy init).
   * Automatically shows the overlay.
   */
  navigate(options: NavigateOptions): Promise<void>;

  /**
   * Extract the current page's HTML, text, URL, and title.
   * Returns empty strings if no page is loaded or WebView not initialized.
   */
  getPageContent(): Promise<PageContentResult>;

  /**
   * Execute JavaScript in the WebView's page context.
   * Resolves with the stringified result of the script evaluation.
   * Rejects if the WebView is not initialized.
   */
  injectScript(options: InjectScriptOptions): Promise<InjectScriptResult>;

  /**
   * Apply privacy configuration to the native WebView.
   * Can be called before or after navigate(). Settings persist until
   * changed or the plugin is destroyed.
   */
  setPrivacyConfig(config: PrivacyConfig): Promise<void>;

  /**
   * Show the native WebView overlay on top of the Capacitor WebView.
   */
  show(options?: ShowOptions): Promise<void>;

  /**
   * Hide the native WebView overlay (does not destroy it).
   */
  hide(options?: ShowOptions): Promise<void>;

  /**
   * Destroy the native WebView and release all resources.
   * The next navigate() call will lazily re-create it.
   */
  destroy(): Promise<void>;

  /**
   * Get the current state of the browser plugin.
   */
  getState(): Promise<BrowserState>;

  /**
   * Navigate back in WebView history.
   */
  goBack(): Promise<GoBackResult>;

  /**
   * Navigate forward in WebView history.
   */
  goForward(): Promise<GoForwardResult>;

  /**
   * Reload the current page.
   */
  reload(): Promise<void>;

  /* ---------- Event listeners ---------- */

  /** Fired when the WebView navigates to a new URL */
  addListener(
    eventName: 'navigationChange',
    listenerFunc: (event: NavigationChangeEvent) => void,
  ): Promise<PluginListenerHandle>;

  /** Fired when a page finishes loading */
  addListener(
    eventName: 'pageLoad',
    listenerFunc: (event: PageLoadEvent) => void,
  ): Promise<PluginListenerHandle>;

  /** Fired when a page load fails */
  addListener(
    eventName: 'pageError',
    listenerFunc: (event: PageErrorEvent) => void,
  ): Promise<PluginListenerHandle>;

  /** Fired when a request is blocked by the privacy config */
  addListener(
    eventName: 'requestBlocked',
    listenerFunc: (event: RequestBlockedEvent) => void,
  ): Promise<PluginListenerHandle>;

  /** Remove all listeners for this plugin */
  removeAllListeners(): Promise<void>;
}
