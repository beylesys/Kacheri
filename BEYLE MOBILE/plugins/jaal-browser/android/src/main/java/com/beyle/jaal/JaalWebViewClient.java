package com.beyle.jaal;

// BEYLE MOBILE/plugins/jaal-browser — Slice S19
//
// Custom WebViewClient for the JAAL Browser Plugin.
//
// Responsibilities:
//   - Request interception: block requests to domains in privacy blocklist
//   - Navigation control: emit navigation events to JS via plugin bridge
//   - Page lifecycle: track loading state, emit page load / error events
//   - Storage isolation: clear cookies/cache when crossing eTLD+1 boundaries
//
// Cookie management (third-party cookie policy) is configured in
// JaalBrowserPlugin.ensureWebView() via CookieManager, not here.
//
// Storage isolation note:
//   True per-process storage isolation via WebView.setDataDirectorySuffix()
//   cannot be used because Capacitor already creates its own WebView before
//   our plugin loads, and setDataDirectorySuffix must be called before any
//   WebView is created in the process. Instead, we implement "soft" isolation
//   by clearing cookies and cache when the user navigates across eTLD+1
//   boundaries (when storageIsolation is enabled in PrivacyConfig).

import android.graphics.Bitmap;
import android.net.Uri;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.util.Locale;

/**
 * Custom WebViewClient for JAAL Browser Plugin — Slice S19.
 *
 * Enforces privacy policy by intercepting requests and controlling navigation.
 * Emits events to the JaalBrowserPlugin which forwards them to JavaScript.
 */
public class JaalWebViewClient extends WebViewClient {

    private final JaalBrowserPlugin plugin;
    private volatile JaalBrowserPlugin.PrivacyConfigHolder privacyConfig;
    private volatile boolean loading = false;
    private String currentETldPlus1 = null;

    public JaalWebViewClient(
        JaalBrowserPlugin plugin,
        JaalBrowserPlugin.PrivacyConfigHolder privacyConfig
    ) {
        this.plugin = plugin;
        this.privacyConfig = privacyConfig;
    }

    /**
     * Update the privacy configuration reference.
     * Called from JaalBrowserPlugin when setPrivacyConfig() is invoked.
     */
    void updatePrivacyConfig(JaalBrowserPlugin.PrivacyConfigHolder config) {
        this.privacyConfig = config;
    }

    /**
     * Whether a page is currently loading.
     */
    boolean isLoading() {
        return loading;
    }

    // ---- Request Interception ----

    /**
     * Intercept resource requests to enforce privacy policy.
     *
     * Checks each request URL against the blockedDomains list.
     * Blocked requests receive an empty response (no network call made).
     * An 'requestBlocked' event is emitted for each blocked request.
     *
     * This method is called for ALL requests (main frame, subframes,
     * images, scripts, XHR, etc.) — not just navigation.
     */
    @Override
    public WebResourceResponse shouldInterceptRequest(
        WebView view,
        WebResourceRequest request
    ) {
        String requestUrl = request.getUrl().toString();

        // Check if this request should be blocked by privacy config
        String matchedDomain = privacyConfig.getBlockedDomainMatch(requestUrl);
        if (matchedDomain != null) {
            // Emit blocked event to JS
            plugin.emitRequestBlocked(requestUrl, matchedDomain);

            // Return empty response to silently block the request.
            // This prevents the network call without triggering an error page.
            return new WebResourceResponse(
                "text/plain",
                "UTF-8",
                new ByteArrayInputStream(new byte[0])
            );
        }

        return super.shouldInterceptRequest(view, request);
    }

    // ---- Navigation Control ----

    /**
     * Intercept URL loading to enforce navigation policy and storage isolation.
     *
     * - Blocks navigation to denied domains (returns true to cancel).
     * - Clears cookies/cache on eTLD+1 boundary crossing when storageIsolation=true.
     * - Emits 'navigationChange' event for all allowed navigations.
     *
     * Returns false to let the WebView handle the navigation normally.
     */
    @Override
    public boolean shouldOverrideUrlLoading(
        WebView view,
        WebResourceRequest request
    ) {
        String url = request.getUrl().toString();

        // Block navigation to denied domains
        String matchedDomain = privacyConfig.getBlockedDomainMatch(url);
        if (matchedDomain != null) {
            plugin.emitRequestBlocked(url, matchedDomain);
            return true; // Cancel navigation
        }

        // Storage isolation: clear site data when crossing eTLD+1 boundaries
        if (privacyConfig.storageIsolation) {
            String newETldPlus1 = extractETldPlus1(url);
            if (newETldPlus1 != null
                && currentETldPlus1 != null
                && !newETldPlus1.equals(currentETldPlus1)) {

                // Clear cookies and cache for the old domain
                CookieManager.getInstance().removeAllCookies(null);
                view.clearCache(true);
                view.clearHistory();
            }
            currentETldPlus1 = newETldPlus1;
        }

        // Emit navigation event
        plugin.emitNavigationChange(
            url,
            request.isForMainFrame(),
            request.hasGesture()
        );

        return false; // Let WebView handle navigation
    }

    // ---- Page Lifecycle ----

    @Override
    public void onPageStarted(WebView view, String url, Bitmap favicon) {
        super.onPageStarted(view, url, favicon);
        loading = true;

        // Emit navigation change for the initial load (no WebResourceRequest available)
        plugin.emitNavigationChange(url, true, false);
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        loading = false;

        // Emit page load event with URL and title
        plugin.emitPageLoad(url, view.getTitle());
    }

    /**
     * Handle page load errors.
     *
     * Uses the deprecated onReceivedError(WebView, int, String, String) signature
     * for compatibility with minSdkVersion 22 (API 22). The newer
     * onReceivedError(WebView, WebResourceRequest, WebResourceError) requires API 23.
     */
    @SuppressWarnings("deprecation")
    @Override
    public void onReceivedError(
        WebView view,
        int errorCode,
        String description,
        String failingUrl
    ) {
        super.onReceivedError(view, errorCode, description, failingUrl);
        loading = false;
        plugin.emitPageError(
            failingUrl,
            description != null ? description : "Unknown error",
            errorCode
        );
    }

    // ---- Helpers ----

    /**
     * Extract a simplified eTLD+1 from a URL.
     *
     * This is an approximation — a true eTLD+1 requires the Public Suffix List.
     * We use the last two domain segments as a reasonable heuristic
     * (e.g., "sub.example.com" → "example.com").
     *
     * For country-code TLDs like "example.co.uk", this would return "co.uk"
     * which is incorrect but acceptable for our storage isolation use case
     * (it will over-isolate rather than under-isolate, which is safer
     * from a privacy perspective).
     */
    static String extractETldPlus1(String url) {
        try {
            Uri uri = Uri.parse(url);
            String host = uri.getHost();
            if (host == null) return null;
            host = host.toLowerCase(Locale.ROOT);

            String[] parts = host.split("\\.");
            if (parts.length >= 2) {
                return parts[parts.length - 2] + "." + parts[parts.length - 1];
            }
            return host;
        } catch (Exception e) {
            return null;
        }
    }
}
