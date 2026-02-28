'use strict';

/**
 * BEYLE Platform — JAAL Desktop Window Integration (Slice S10)
 *
 * Manages the JAAL research browser window within the Platform shell.
 * Loads JAAL's index.html + preload.js from the sibling BEYLE JAAL directory,
 * registers all 43 JAAL IPC handlers (from S6 modules), wires privacy/egress
 * hooks, and manages the JAAL window lifecycle.
 *
 * Architecture:
 * - Requires S6 modules directly from BEYLE JAAL (no file copying)
 * - JAAL storage at {userData}/jaal/ (isolated from Platform data)
 * - Privacy hooks on session.defaultSession (matches standalone JAAL)
 * - JAAL BrowserWindow uses persist:jaal partition (UI session isolation)
 * - Lazy init on first openJaalWindow() call
 * - Re-click focuses existing window; close does not quit Platform
 */

const { app, BrowserWindow, ipcMain, session, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

/* ================================================================== */
/*  Section 1: JAAL Directory & Lazy Module Resolution                 */
/* ================================================================== */

/**
 * Path to the BEYLE JAAL directory (sibling to BEYLE PLATFORM).
 * All S6 modules and JAAL assets are loaded from here.
 * Node.js module resolution handles relative requires within these
 * modules correctly (resolved relative to the file's actual location).
 */
const JAAL_DIR = path.resolve(__dirname, '..', '..', 'BEYLE JAAL');

/**
 * JAAL modules are loaded LAZILY (inside initJaal) so that Platform
 * can start even if BEYLE JAAL directory is not present. If JAAL is
 * missing, openJaalWindow() returns a graceful error instead of
 * crashing the entire Platform on startup.
 */

/* --- S6 IPC handler modules (populated by loadJaalModules) --- */
let shared = null;
let proofManager = null;
let policyEngine = null;
let sessionManager = null;
let llmBridge = null;
let networkManager = null;
let syncConnector = null;
let ipcHandlers = null;

/* --- JAAL support libraries (populated by loadJaalModules) --- */
let kacheriSync = null;
let sessionIndexLib = null;
let globalWatch = null;
let userscripts = null;

/* --- JAAL policy engine (populated by loadJaalModules) --- */
let policy = null;

/* --- Optional: Playwright Firefox Gecko engine --- */
let firefox = null;

/**
 * Load all JAAL modules from the BEYLE JAAL directory.
 * Called once during initJaal(). Throws if required modules are missing.
 */
function loadJaalModules() {
  // S6 IPC handler modules
  shared = require(path.join(JAAL_DIR, 'main', 'sharedContext'));
  proofManager = require(path.join(JAAL_DIR, 'main', 'proofManager'));
  policyEngine = require(path.join(JAAL_DIR, 'main', 'policyEngine'));
  sessionManager = require(path.join(JAAL_DIR, 'main', 'sessionManager'));
  llmBridge = require(path.join(JAAL_DIR, 'main', 'llmBridge'));
  networkManager = require(path.join(JAAL_DIR, 'main', 'networkManager'));
  syncConnector = require(path.join(JAAL_DIR, 'main', 'syncConnector'));
  ipcHandlers = require(path.join(JAAL_DIR, 'main', 'ipcHandlers'));

  // JAAL support libraries
  kacheriSync = require(path.join(JAAL_DIR, 'lib', 'kacheriSync'));
  sessionIndexLib = require(path.join(JAAL_DIR, 'lib', 'sessionIndex'));
  globalWatch = require(path.join(JAAL_DIR, 'lib', 'globalWatch'));
  userscripts = require(path.join(JAAL_DIR, 'lib', 'userscripts'));

  // Policy engine (optional — degrades gracefully)
  try {
    policy = require(path.join(JAAL_DIR, 'policy', 'policy'));
  } catch (err) {
    console.warn('[JAAL] Could not load policy module:', err.message);
  }

  // Gecko engine (optional — degrades gracefully)
  try {
    ({ firefox } = require('playwright-firefox'));
  } catch {
    // Gecko adapter is optional; JAAL functions without it.
  }
}

/* ================================================================== */
/*  Section 2: Module State                                            */
/* ================================================================== */

/** The JAAL BrowserWindow instance (null when not open). */
let jaalWindow = null;

/** The JAAL appContext (created on first init). */
let jaalAppContext = null;

/** Whether JAAL IPC handlers have been registered (once-only guard). */
let handlersRegistered = false;

/** Whether privacy/egress hooks have been wired (once-only guard). */
let privacyWired = false;

/** Whether the JAAL subsystem has been initialized. */
let initialized = false;

/** Whether kacheriSync has been loaded and initialized (may happen before full init). */
let kacheriSyncReady = false;

/** Whether webview security handlers have been registered. */
let webviewSecurityWired = false;

/** Guard against concurrent initialization from rapid clicks. */
let initInProgress = false;

/* ================================================================== */
/*  Section 3: JAAL appContext Builder                                 */
/* ================================================================== */

/**
 * Build the JAAL appContext with Platform-specific storage paths.
 *
 * The appContext is the shared mutable state object passed to all 43
 * JAAL IPC handlers. It contains:
 * - File paths (proofs, profiles, sessions)
 * - Privacy/egress tracking state
 * - Session/network state
 * - Library references (policy, globalWatch, kacheriSync, etc.)
 *
 * Storage isolation: JAAL data lives at {userData}/jaal/ so it does
 * not conflict with Platform or Kacheri Docs data.
 *
 * @param {string} userDataPath — Electron app.getPath('userData')
 * @returns {object} — JAAL appContext
 */
function buildJaalAppContext(userDataPath) {
  const jaalDataDir = path.join(userDataPath, 'jaal');
  const proofsDir = path.join(jaalDataDir, 'proofs');

  return {
    // --- Paths ---
    BASE_DIR: jaalDataDir,
    PROOFS_DIR: proofsDir,
    PROFILES_PATH: path.join(jaalDataDir, 'profiles.json'),
    __dirname: JAAL_DIR, // Points to BEYLE JAAL for policy path resolution

    // --- Egress tracking state ---
    egressEvents: [],
    egressByRequestId: new Map(),

    // --- Privacy state (used by wirePrivacyAndEgress + policyEngine handlers) ---
    walledGardenBlockedIds: new Set(),
    walledGardenReceiptCache: new Set(),
    walledGardenReceiptSiteKey: null,
    cnameCache: new Map(),
    cnameInflight: new Map(),
    cnameByRequestId: new Map(),
    cnameReceiptCache: new Set(),
    cnameReceiptSiteKey: null,
    bounceChains: new Map(),
    bounceReceiptCache: new Set(),
    bounceReceiptSiteKey: null,
    ipRelayReceiptCache: new Set(),
    ipRelayReceiptSiteKey: null,

    // --- CNAME defense constants (referenced by sharedContext.js) ---
    CNAME_TIMEOUT_MS: 5000,
    CNAME_MAX_CHAIN: 10,
    CNAME_CACHE_TTL_MS: 300000, // 5 minutes
    CNAME_ERROR_TTL_MS: 60000,  // 1 minute

    // --- Session/UI state ---
    currentUiMode: 'Classic',
    currentSession: null,
    profilesCache: null,

    // --- Network state ---
    currentProxyMode: (process.env.NETWORK_MODE || 'system').toLowerCase(),
    currentProxyUrl: String(process.env.FIXED_PROXY_URL || '').trim(),

    // --- Storage silo state ---
    lastStorageSiteKey: null,
    lastStorageOrigin: null,

    // --- Gecko state (optional) ---
    geckoBrowserPromise: null,
    firefox,

    // --- Electron session reference (for privacy hooks in sharedContext) ---
    electronSession: session.defaultSession,

    // --- Library references (injected into handlers via appContext) ---
    policy: policy || {
      evaluate: () => ({ ok: false, allowed: false, readOnly: false, reasons: [] }),
      getPrivacyConfig: () => ({ config: {}, bundleId: null, version: null }),
    },
    globalWatch,
    kacheriSync,
    sessionIndexLib,
    userscripts,
  };
}

/* ================================================================== */
/*  Section 4: Privacy & Egress Hooks                                  */
/* ================================================================== */

/**
 * Wire privacy and egress tracking hooks on an Electron session.
 *
 * Ported from BEYLE JAAL/main.js wirePrivacyAndEgress() (lines 97-607).
 * Provides full JAAL privacy features:
 * - Per-site storage silo (clear storage on site change)
 * - Link decoration stripping (fbclid, utm_*, etc.)
 * - Walled garden mode (block third-party subresources)
 * - CNAME defense (detect CNAME cloaking)
 * - IP relay receipts (proxy mode tracking)
 * - Bounce redirect defense (clear intermediate hop storage)
 * - Third-party cookie blocking (request + response side)
 * - Egress logging with Global Watch sync
 *
 * @param {Electron.Session} ses — The Electron session to hook
 * @param {object} ctx — The JAAL appContext
 */
function wirePrivacyAndEgress(ses, ctx) {
  // --- Handler 1: onBeforeRequest ---
  // Storage silo, URL decoration stripping, walled garden, CNAME defense,
  // IP relay receipts, egress logging.
  ses.webRequest.onBeforeRequest(async (details, callback) => {
    // Per-site storage silo: when main frame navigates to a new site,
    // clear storage so state does not leak across sites.
    if (details.resourceType === 'mainFrame') {
      const siteKey = shared.deriveSiteKey(details.url);
      if (siteKey && siteKey !== ctx.lastStorageSiteKey) {
        ctx.lastStorageSiteKey = siteKey;
        if (siteKey !== ctx.walledGardenReceiptSiteKey) {
          ctx.walledGardenReceiptCache = new Set();
          ctx.walledGardenReceiptSiteKey = siteKey;
        }
        if (siteKey !== ctx.cnameReceiptSiteKey) {
          ctx.cnameReceiptCache = new Set();
          ctx.cnameReceiptSiteKey = siteKey;
        }
        if (siteKey !== ctx.bounceReceiptSiteKey) {
          ctx.bounceReceiptCache = new Set();
          ctx.bounceReceiptSiteKey = siteKey;
        }
        if (siteKey !== ctx.ipRelayReceiptSiteKey) {
          ctx.ipRelayReceiptCache = new Set();
          ctx.ipRelayReceiptSiteKey = siteKey;
        }
        let origin = null;
        try {
          origin = new URL(details.url).origin;
        } catch {
          origin = null;
        }
        // Best-effort: clear storage only for the previous origin.
        if (ctx.lastStorageOrigin && ctx.lastStorageOrigin !== origin) {
          ses.clearStorageData({ origin: ctx.lastStorageOrigin }).catch(() => {});
        }
        ctx.lastStorageOrigin = origin;
      }

      // IP relay receipt tracking when in fixed_servers proxy mode
      if (siteKey && ctx.currentProxyMode === 'fixed_servers') {
        try {
          const privacyConfig = ctx.policy.getPrivacyConfig().config;
          const relayCfg = shared.resolveIpRelayConfig(privacyConfig, siteKey);
          const cacheKey =
            `active|${siteKey}|${relayCfg.source}|${relayCfg.overrideMatch || 'none'}|` +
            (relayCfg.enabled ? '1' : '0');
          if (shared.cacheIpRelayReceipt(ctx, cacheKey)) {
            shared.recordPrivacyReceipt(ctx, {
              url: details.url,
              feature: 'ipRelay',
              decision: relayCfg.enabled ? 'active' : 'override',
              mode: shared.inferReceiptMode(ctx),
              reason: relayCfg.enabled
                ? `IP relay active for ${siteKey}`
                : `IP relay active but disabled by policy for ${siteKey}`,
              override: {
                source: relayCfg.source,
                overrideMatch: relayCfg.overrideMatch || null,
              },
              details: {
                proxyMode: ctx.currentProxyMode,
                proxyConfigured: !!ctx.currentProxyUrl,
              },
            });
          }
        } catch {
          // Best-effort
        }
      }

      // Bounce chain tracking for main frame navigations
      if (shared.isHttpUrl(details.url)) {
        const existing = ctx.bounceChains.get(details.id);
        if (existing) {
          existing.lastUrl = details.url;
        } else {
          ctx.bounceChains.set(details.id, {
            id: details.id,
            startedAt: Date.now(),
            initialUrl: details.url,
            initialHost: shared.deriveSiteKey(details.url),
            lastUrl: details.url,
            redirects: [],
          });
        }
      }
    }

    // Link-decoration stripping for navigations (main frame + subframes)
    if (
      details.resourceType === 'mainFrame' ||
      details.resourceType === 'subFrame'
    ) {
      const { changed, url } = shared.stripDecorations(details.url);
      if (changed) return callback({ redirectURL: url });
    }

    // Walled Garden Mode + CNAME Defense: block third-party subresources
    // unless allowlisted by policy.
    if (
      details.resourceType !== 'mainFrame' &&
      shared.isHttpUrl(details.url) &&
      ctx.lastStorageSiteKey
    ) {
      const requestHost = shared.deriveSiteKey(details.url);
      const topHost = ctx.lastStorageSiteKey;
      const isSameHost = requestHost && topHost && requestHost === topHost;
      let cnameThirdParty = false;
      let cnameTarget = null;
      let cnameChain = null;

      if (requestHost && topHost) {
        try {
          const privacyConfig = ctx.policy.getPrivacyConfig().config;
          const cnameCfg = shared.resolveCnameDefenseConfig(privacyConfig, topHost);

          if (cnameCfg.enabled && isSameHost) {
            const cnameInfo = await shared.getCnameInfo(ctx, requestHost);
            cnameTarget = cnameInfo.target;
            cnameChain = cnameInfo.chain;
            const isThirdPartyTarget =
              cnameTarget && !shared.isSameHostOrSubdomain(cnameTarget, topHost);
            if (isThirdPartyTarget) {
              cnameThirdParty = true;
              ctx.cnameByRequestId.set(details.id, {
                isThirdParty: true,
                target: cnameTarget,
                chain: cnameChain,
                requestHost,
                topHost,
              });

              const cacheKey = `cname|${topHost}|${requestHost}|${cnameTarget}`;
              if (shared.cacheCnameReceipt(ctx, cacheKey)) {
                const mode = shared.inferReceiptMode(ctx);
                shared.recordPrivacyReceipt(ctx, {
                  url: details.url,
                  feature: 'cnameDefense',
                  decision: 'treatThirdParty',
                  mode,
                  reason: `CNAME ${requestHost} -> ${cnameTarget} treated as third-party for ${topHost}`,
                  override: {
                    source: cnameCfg.source,
                    overrideMatch: cnameCfg.overrideMatch || null,
                  },
                  details: {
                    topLevelHost: topHost,
                    requestHost,
                    cnameTarget,
                    cnameChain,
                    resourceType: details.resourceType,
                    source: cnameCfg.source,
                    overrideMatch: cnameCfg.overrideMatch || null,
                  },
                });
              }
            }
          }

          const effectiveThirdParty =
            requestHost && topHost && (!isSameHost || cnameThirdParty);

          if (effectiveThirdParty) {
            const walled = shared.resolveWalledGardenConfig(privacyConfig, topHost);
            if (walled.enabled) {
              const allowlistHost =
                cnameThirdParty && cnameTarget ? cnameTarget : requestHost;
              const allowlistMatch = shared.findHostMatch(
                allowlistHost,
                walled.allowlist
              );
              const mode = shared.inferReceiptMode(ctx);
              if (allowlistMatch) {
                const cacheKey = `allow|${topHost}|${allowlistHost}|${allowlistMatch}`;
                if (shared.cacheWalledGardenReceipt(ctx, cacheKey)) {
                  shared.recordPrivacyReceipt(ctx, {
                    url: details.url,
                    feature: 'walledGarden',
                    decision: 'allow',
                    mode,
                    reason: `Allowlist exception for ${allowlistHost}`,
                    override: {
                      allowlistMatch,
                      source: walled.source,
                      overrideMatch: walled.overrideMatch || null,
                    },
                    details: {
                      topLevelHost: topHost,
                      requestHost,
                      effectiveThirdPartyHost: allowlistHost,
                      resourceType: details.resourceType,
                      allowlistMatch,
                      allowlistSource: walled.source,
                      overrideMatch: walled.overrideMatch || null,
                      cnameTarget: cnameTarget || null,
                      cnameChain: cnameChain || null,
                    },
                  });
                }
              } else {
                const cacheKey = `block|${topHost}|${allowlistHost}`;
                if (shared.cacheWalledGardenReceipt(ctx, cacheKey)) {
                  shared.recordPrivacyReceipt(ctx, {
                    url: details.url,
                    feature: 'walledGarden',
                    decision: 'block',
                    mode,
                    reason: `Third-party blocked by walled garden (${topHost})`,
                    override: {
                      source: walled.source,
                      overrideMatch: walled.overrideMatch || null,
                    },
                    details: {
                      topLevelHost: topHost,
                      requestHost,
                      effectiveThirdPartyHost: allowlistHost,
                      resourceType: details.resourceType,
                      allowlistSource: walled.source,
                      overrideMatch: walled.overrideMatch || null,
                      cnameTarget: cnameTarget || null,
                      cnameChain: cnameChain || null,
                    },
                  });
                }
                ctx.cnameByRequestId.delete(details.id);
                ctx.walledGardenBlockedIds.add(details.id);
                return callback({ cancel: true });
              }
            }
          }
        } catch (_) {
          // Best-effort: if config read fails, do not block.
        }
      }
    }

    // Egress logging — record every request for Global Watch
    const ts = Date.now();
    ctx.egressByRequestId.set(details.id, {
      id: details.id,
      ts,
      method: details.method,
      url: details.url,
      resourceType: details.resourceType,
      statusCode: null,
      bytes: null,
    });
    callback({ cancel: false });
  });

  // --- Handler 2: onBeforeRedirect ---
  // Track redirect chains for bounce defense.
  ses.webRequest.onBeforeRedirect((details) => {
    if (details.resourceType !== 'mainFrame') return;
    if (!shared.isHttpUrl(details.url)) return;
    const chain = ctx.bounceChains.get(details.id) || {
      id: details.id,
      startedAt: Date.now(),
      initialUrl: details.url,
      initialHost: shared.deriveSiteKey(details.url),
      lastUrl: details.url,
      redirects: [],
    };
    const fromUrl = details.url;
    const toUrl = details.redirectURL;
    if (shared.isHttpUrl(toUrl)) {
      chain.redirects.push({
        fromUrl,
        toUrl,
        fromHost: shared.deriveSiteKey(fromUrl),
        toHost: shared.deriveSiteKey(toUrl),
        statusCode: details.statusCode || null,
        ts: Date.now(),
      });
      chain.lastUrl = toUrl;
    }
    ctx.bounceChains.set(details.id, chain);
  });

  // --- Handler 3: onCompleted ---
  // Bounce defense execution, egress event finalization, Global Watch sync.
  ses.webRequest.onCompleted((details) => {
    if (ctx.walledGardenBlockedIds.has(details.id)) {
      ctx.walledGardenBlockedIds.delete(details.id);
      ctx.cnameByRequestId.delete(details.id);
      return;
    }
    ctx.cnameByRequestId.delete(details.id);

    // Bounce defense: clear storage for intermediate redirect hops
    if (details.resourceType === 'mainFrame') {
      const chain = ctx.bounceChains.get(details.id);
      ctx.bounceChains.delete(details.id);
      if (chain && shared.isHttpUrl(details.url)) {
        try {
          const finalUrl = details.url;
          const finalHost = shared.deriveSiteKey(finalUrl);
          if (finalHost) {
            const privacyConfig = ctx.policy.getPrivacyConfig().config;
            const bounceCfg = shared.resolveBounceDefenseConfig(privacyConfig, finalHost);
            const hostToUrl = new Map();
            const addHost = (host, url) => {
              if (!host || !url) return;
              if (shared.isSameHostOrSubdomain(host, finalHost)) return;
              if (!hostToUrl.has(host)) hostToUrl.set(host, url);
            };

            addHost(chain.initialHost, chain.initialUrl);
            for (const red of chain.redirects || []) {
              addHost(red.fromHost, red.fromUrl);
            }

            const bounceList = Array.from(hostToUrl.entries()).map(
              ([host, url]) => ({ host, url })
            );

            if (bounceList.length) {
              const redirectChain = (chain.redirects || []).map((r) => ({
                from: r.fromHost || null,
                to: r.toHost || null,
                status: r.statusCode || null,
              }));

              if (!bounceCfg.enabled) {
                if (bounceCfg.source === 'siteOverride') {
                  for (const bounce of bounceList) {
                    const key = `override|${finalHost}|${bounce.host}`;
                    if (!shared.cacheBounceReceipt(ctx, key)) continue;
                    shared.recordPrivacyReceipt(ctx, {
                      url: bounce.url,
                      feature: 'bounceDefense',
                      decision: 'override',
                      mode: shared.inferReceiptMode(ctx),
                      reason: `Bounce defense disabled by policy override for ${finalHost}`,
                      override: {
                        source: bounceCfg.source,
                        overrideMatch: bounceCfg.overrideMatch || null,
                      },
                      details: {
                        topLevelHost: finalHost,
                        bounceHost: bounce.host,
                        bounceUrl: bounce.url,
                        redirectChain,
                        source: bounceCfg.source,
                        overrideMatch: bounceCfg.overrideMatch || null,
                      },
                    });
                  }
                }
              } else {
                for (const bounce of bounceList) {
                  let decorationsStripped = false;
                  let cleanedUrl = null;
                  try {
                    const cleaned = shared.stripDecorations(bounce.url);
                    decorationsStripped = !!cleaned.changed;
                    cleanedUrl = cleaned.url || null;
                  } catch {
                    decorationsStripped = false;
                    cleanedUrl = null;
                  }

                  const key = `clear|${finalHost}|${bounce.host}`;
                  if (!shared.cacheBounceReceipt(ctx, key)) continue;
                  try {
                    const origin = new URL(bounce.url).origin;
                    ses.clearStorageData({ origin }).catch(() => {});
                  } catch {
                    // ignore invalid URL
                  }
                  shared.recordPrivacyReceipt(ctx, {
                    url: bounce.url,
                    feature: 'bounceDefense',
                    decision: 'clearStorage',
                    mode: shared.inferReceiptMode(ctx),
                    reason: `Bounce hop cleared for ${bounce.host} on redirect to ${finalHost}`,
                    override: {
                      source: bounceCfg.source,
                      overrideMatch: bounceCfg.overrideMatch || null,
                    },
                    details: {
                      topLevelHost: finalHost,
                      bounceHost: bounce.host,
                      bounceUrl: bounce.url,
                      redirectChain,
                      decorationsStripped,
                      cleanedUrl,
                      source: bounceCfg.source,
                      overrideMatch: bounceCfg.overrideMatch || null,
                    },
                  });
                }
              }
            }
          }
        } catch (_) {
          // Best-effort: bounce defense should not block navigation.
        }
      }
    }

    // Egress event finalization
    const rec = ctx.egressByRequestId.get(details.id);
    if (rec) {
      rec.statusCode = details.statusCode || null;
      const contentLength = shared.getHeader(details.responseHeaders, 'content-length');
      const bytes = contentLength ? parseInt(contentLength, 10) : null;
      rec.bytes = Number.isFinite(bytes) ? bytes : null;
      ctx.egressEvents.push(rec);
      ctx.egressByRequestId.delete(details.id);
      // Auto-sync to Global Watch
      ctx.globalWatch.recordEgressBatch([rec]);
      if (ctx.egressEvents.length > 5000) {
        ctx.egressEvents = ctx.egressEvents.slice(-2000);
      }
    }
  });

  // --- Handler 4: onErrorOccurred ---
  // Log failed requests to egress events.
  ses.webRequest.onErrorOccurred((details) => {
    if (ctx.walledGardenBlockedIds.has(details.id)) {
      ctx.walledGardenBlockedIds.delete(details.id);
      ctx.cnameByRequestId.delete(details.id);
      return;
    }
    ctx.cnameByRequestId.delete(details.id);
    if (details.resourceType === 'mainFrame') {
      ctx.bounceChains.delete(details.id);
    }
    const rec =
      ctx.egressByRequestId.get(details.id) || {
        id: details.id,
        ts: Date.now(),
        method: details.method,
        url: details.url,
        resourceType: details.resourceType,
      };
    rec.statusCode = null;
    rec.bytes = null;
    rec.error = details.error;
    ctx.egressEvents.push(rec);
    ctx.egressByRequestId.delete(details.id);
    // Auto-sync to Global Watch
    ctx.globalWatch.recordEgressBatch([rec]);
    if (ctx.egressEvents.length > 5000) {
      ctx.egressEvents = ctx.egressEvents.slice(-2000);
    }
  });

  // --- Handler 5: onBeforeSendHeaders ---
  // Third-party cookie blocking (request side): strip Cookie headers
  // from subresource requests whose host doesn't match the top-level site.
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = details.requestHeaders || {};
    const isMainFrame = details.resourceType === 'mainFrame';

    const urlHost = shared.deriveSiteKey(details.url);
    const isSameSiteAsTop =
      ctx.lastStorageSiteKey && urlHost && urlHost === ctx.lastStorageSiteKey;
    const cnameInfo = ctx.cnameByRequestId.get(details.id);
    const isCnameThirdParty = !!(cnameInfo && cnameInfo.isThirdParty);

    const shouldStripCookies =
      !isMainFrame && (!isSameSiteAsTop || isCnameThirdParty);

    if (!shouldStripCookies) {
      return callback({ cancel: false, requestHeaders });
    }

    const newHeaders = {};
    for (const [name, value] of Object.entries(requestHeaders)) {
      const lower = name.toLowerCase();
      if (lower === 'cookie' || lower === 'cookie2') {
        continue; // Drop third-party Cookie headers
      }
      newHeaders[name] = value;
    }

    callback({ cancel: false, requestHeaders: newHeaders });
  });

  // --- Handler 6: onHeadersReceived ---
  // Third-party cookie blocking (response side): strip Set-Cookie headers
  // from responses that don't match the top-level site host.
  ses.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders || {};
    const isMainFrame = details.resourceType === 'mainFrame';

    const urlHost = shared.deriveSiteKey(details.url);
    const isSameSiteAsTop =
      ctx.lastStorageSiteKey && urlHost && urlHost === ctx.lastStorageSiteKey;
    const cnameInfo = ctx.cnameByRequestId.get(details.id);
    const isCnameThirdParty = !!(cnameInfo && cnameInfo.isThirdParty);

    const shouldStripCookies =
      !isMainFrame && (!isSameSiteAsTop || isCnameThirdParty);

    if (!shouldStripCookies) {
      return callback({ cancel: false, responseHeaders });
    }

    const newHeaders = {};
    for (const [name, value] of Object.entries(responseHeaders)) {
      const lower = name.toLowerCase();
      if (lower === 'set-cookie' || lower === 'set-cookie2') {
        continue; // Drop third-party Set-Cookie headers
      }
      newHeaders[name] = value;
    }

    callback({ cancel: false, responseHeaders: newHeaders });
  });
}

/* ================================================================== */
/*  Section 5: IPC Handler Registration                                */
/* ================================================================== */

/**
 * Register all 43 JAAL IPC handlers via the S6 modules.
 * Only runs once — subsequent calls are no-ops.
 *
 * Handler channel inventory (43 total):
 *   proofManager:    proofs:save, proofs:openFolder (2)
 *   policyEngine:    policy:evaluate, privacy:getConfig, privacy:setMode,
 *                    privacy:saveReceipt, privacy:getReceipts (5)
 *   sessionManager:  session:start, session:append, session:end,
 *                    session:getHistory, session:loadTrust, profiles:get,
 *                    profiles:setActive, profiles:setEngine (8)
 *   llmBridge:       cfg:get, llm:invoke, page:fetchText,
 *                    gecko:capturePage (4)
 *   networkManager:  egress:getSince, network:getProfile,
 *                    network:setProxyMode, network:resolveProxy,
 *                    network:diagnose (5)
 *   syncConnector:   jaal:sync:config, jaal:sync:push,
 *                    jaal:sync:status (3)
 *   ipcHandlers:     watch:reset, watch:getSummary, watch:detectAnomalies,
 *                    watch:getAnomalies, watch:getEgressSummary,
 *                    watch:recordEgressBatch, userscript:get,
 *                    mirror:exportLatestSession, mirror:openReport,
 *                    org:exportLatestSession, bundles:list,
 *                    bundles:openFolder, siem:export, admin:getActorInfo,
 *                    admin:getRbacConfig, admin:getProviderConfig (16)
 */
function registerJaalHandlers() {
  if (handlersRegistered) return;

  proofManager.register(ipcMain, jaalAppContext);
  policyEngine.register(ipcMain, jaalAppContext);
  sessionManager.register(ipcMain, jaalAppContext);
  llmBridge.register(ipcMain, jaalAppContext);
  networkManager.register(ipcMain, jaalAppContext);
  syncConnector.register(ipcMain, jaalAppContext);
  ipcHandlers.register(ipcMain, jaalAppContext);

  handlersRegistered = true;
  console.log('[JAAL] 43 IPC handlers registered');
}

/* ================================================================== */
/*  Section 6: Webview Security                                        */
/* ================================================================== */

/**
 * Register webview security handlers.
 * Blocks webview popups — opens safe URLs externally instead.
 * Matches standalone JAAL behavior (BEYLE JAAL/main.js line 651-666).
 */
function wireWebviewSecurity() {
  if (webviewSecurityWired) return;

  app.on('web-contents-created', (_evt, contents) => {
    if (contents.getType && contents.getType() === 'webview') {
      contents.setWindowOpenHandler(({ url }) => {
        try {
          const u = new URL(url);
          if (u.protocol === 'http:' || u.protocol === 'https:') {
            shell.openExternal(url);
          }
        } catch {
          // ignore invalid URLs
        }
        return { action: 'deny' };
      });
    }
  });

  webviewSecurityWired = true;
}

/* ================================================================== */
/*  Section 7: JAAL Initialization                                     */
/* ================================================================== */

/**
 * Initialize the JAAL subsystem. Called lazily on first openJaalWindow().
 * Follows the same initialization sequence as standalone JAAL:
 *   1. Build appContext
 *   2. Ensure directories
 *   3. Init kacheriSync (uses safeStorage for PAT encryption)
 *   4. Apply proxy settings from environment
 *   5. Wire privacy/egress hooks
 *   6. Register IPC handlers
 *   7. Wire webview security
 *
 * @param {string} userDataPath — Electron app.getPath('userData')
 */
async function initJaal(userDataPath) {
  if (initialized) return;

  // 0. Load JAAL modules (lazy — first time only)
  // Throws if BEYLE JAAL directory or its node_modules are missing.
  loadJaalModules();

  // 1. Build appContext
  jaalAppContext = buildJaalAppContext(userDataPath);

  // 2. Ensure directories
  shared.ensureProofsDir(jaalAppContext);
  const jaalDataDir = path.join(userDataPath, 'jaal');
  try {
    fs.mkdirSync(jaalDataDir, { recursive: true });
  } catch {
    // Directory may already exist
  }

  // 3. Init kacheriSync (safe after app.whenReady; safeStorage available)
  try {
    kacheriSync.init(safeStorage);
    kacheriSyncReady = true;
  } catch (err) {
    console.warn('[JAAL] kacheriSync init failed:', err.message);
  }

  // 4. Apply proxy settings from environment
  try {
    await shared.applyProxyFromEnv(jaalAppContext);
  } catch (err) {
    console.warn('[JAAL] Proxy config failed:', err.message);
  }

  // 5. Wire privacy/egress hooks on defaultSession
  // (JAAL's webview uses defaultSession; harmless for Platform main window)
  wirePrivacyAndEgress(session.defaultSession, jaalAppContext);
  privacyWired = true;

  // 6. Register IPC handlers
  registerJaalHandlers();

  // 7. Wire webview security
  wireWebviewSecurity();

  initialized = true;
  console.log('[JAAL] Subsystem initialized');
}

/* ================================================================== */
/*  Section 8: JAAL Window Management                                  */
/* ================================================================== */

/**
 * Open or focus the JAAL desktop window.
 *
 * First call triggers lazy initialization (IPC handlers, privacy, sync).
 * Subsequent calls focus the existing window if already open.
 *
 * Window configuration:
 * - Loads BEYLE JAAL/index.html with BEYLE JAAL/preload.js
 * - webviewTag: true (required for JAAL's embedded research browser)
 * - partition: persist:jaal (UI session isolation from Kacheri Docs)
 * - Closing JAAL window does not quit Platform
 * - Re-click focuses existing JAAL window
 *
 * @param {string} userDataPath — Electron app.getPath('userData')
 * @returns {{ ok: boolean, action: string, error?: string }}
 */
async function openJaalWindow(userDataPath) {
  // Re-click: focus existing window
  if (jaalWindow && !jaalWindow.isDestroyed()) {
    if (jaalWindow.isMinimized()) jaalWindow.restore();
    jaalWindow.show();
    jaalWindow.focus();
    return { ok: true, action: 'focused' };
  }

  // Guard against concurrent init from rapid clicks
  if (initInProgress) {
    return { ok: false, error: 'JAAL is starting, please wait.' };
  }

  // Lazy init on first open
  initInProgress = true;
  try {
    await initJaal(userDataPath);
  } catch (err) {
    initInProgress = false;
    console.error('[JAAL] Init failed:', err.message);
    return { ok: false, error: 'JAAL initialization failed: ' + err.message };
  }
  initInProgress = false;

  // Create the JAAL BrowserWindow
  jaalWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    title: 'BEYLE \u2014 JAAL Research',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(JAAL_DIR, 'preload.js'),
      webviewTag: true,
      devTools: true,
      partition: 'persist:jaal',
    },
  });

  // S11: removeMenu() removed — buildAppMenu() in main.js sets application-level
  // menu with product shortcuts that applies to all windows including JAAL.

  // Load JAAL's index.html
  jaalWindow.loadFile(path.join(JAAL_DIR, 'index.html'));

  // Closing JAAL window does not quit Platform — just nulls the reference
  jaalWindow.on('closed', () => {
    jaalWindow = null;
  });

  console.log('[JAAL] Window opened');
  return { ok: true, action: 'opened' };
}

/* ================================================================== */
/*  Section 9: Cleanup                                                 */
/* ================================================================== */

/**
 * Destroy the JAAL window and clean up resources.
 * Called during Platform app quit (before-quit event).
 */
function destroy() {
  if (jaalWindow && !jaalWindow.isDestroyed()) {
    jaalWindow.destroy();
    jaalWindow = null;
  }
  // Clean up Gecko browser if running
  if (jaalAppContext && jaalAppContext.geckoBrowserPromise) {
    jaalAppContext.geckoBrowserPromise
      .then((browser) => browser.close())
      .catch(() => {});
  }
}

/* ================================================================== */
/*  Section 9b: kacheriSync Accessor for Settings (Slice S22)          */
/* ================================================================== */

/**
 * Get a reference to the kacheriSync module, loading and initializing it
 * if necessary. This allows the Desktop Settings UI to read/write JAAL
 * sync configuration without opening a JAAL window first.
 *
 * kacheriSync uses process.cwd()-relative paths for its config files
 * (kacheri-sync.json, kacheri-sync.pat). When loaded from the Platform
 * main process, process.cwd() resolves to the Platform directory, so
 * config files end up in BEYLE PLATFORM/ (not BEYLE JAAL/). This is
 * acceptable — Platform is the canonical installation context.
 * The module is a singleton, so if initJaal() has already loaded it,
 * we return the existing reference.
 *
 * @returns {Object|null} kacheriSync module, or null if BEYLE JAAL is
 *   not available (e.g., JAAL directory missing).
 */
function getKacheriSync() {
  // Already loaded and initialized — return immediately
  if (kacheriSync && kacheriSyncReady) {
    return kacheriSync;
  }

  // If kacheriSync was loaded (by loadJaalModules) but not yet initialized
  if (kacheriSync && !kacheriSyncReady) {
    try {
      kacheriSync.init(safeStorage);
      kacheriSyncReady = true;
    } catch (err) {
      console.warn('[JAAL] kacheriSync init failed (settings):', err.message);
    }
    return kacheriSync;
  }

  // Not loaded at all — load only kacheriSync (not the full JAAL subsystem)
  try {
    kacheriSync = require(path.join(JAAL_DIR, 'lib', 'kacheriSync'));
    kacheriSync.init(safeStorage);
    kacheriSyncReady = true;
    return kacheriSync;
  } catch (err) {
    console.warn('[JAAL] Could not load kacheriSync for settings:', err.message);
    return null;
  }
}

/* ================================================================== */
/*  Section 10: Module Exports                                         */
/* ================================================================== */

module.exports = {
  openJaalWindow,
  destroy,
  getKacheriSync,
};
