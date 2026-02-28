package com.beyle.jaal;

// BEYLE MOBILE/plugins/jaal-browser — Slice S19
//
// Capacitor plugin that manages a native Android WebView overlaid on top of
// the Capacitor WebView. Provides full browser control for JAAL research
// browsing: navigation, content extraction, JavaScript injection, and
// privacy enforcement (cookie blocking, request interception, storage isolation).
//
// The WebView is lazily created on the first navigate() call and added to the
// activity's root FrameLayout above Capacitor's WebView. It starts hidden
// (View.GONE) and is shown/hidden via show()/hide() or automatically on navigate().
//
// All @PluginMethod calls that touch the WebView are dispatched to the UI thread
// via getBridge().executeOnMainThread() — Android WebView MUST be manipulated
// on the UI thread only.

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * JAAL Browser Capacitor Plugin — Slice S19.
 *
 * Exposes a native Android WebView with full privacy control to the
 * JAAL React UI components via the Capacitor JS bridge.
 */
@CapacitorPlugin(name = "JaalBrowser")
public class JaalBrowserPlugin extends Plugin {

    // ---- State ----
    private WebView jaalWebView;
    private JaalWebViewClient jaalClient;
    private PrivacyConfigHolder privacyConfig;
    private boolean isVisible = false;

    // ---- Privacy config holder ----

    /**
     * Holds parsed privacy configuration values.
     * Updated via setPrivacyConfig() from JS.
     * Read by JaalWebViewClient for request interception decisions.
     */
    static class PrivacyConfigHolder {
        boolean blockThirdPartyCookies = true;
        List<String> blockedDomains = new ArrayList<>();
        List<String> readOnlyDomains = new ArrayList<>();
        boolean storageIsolation = false;
        boolean disableJavaScript = false;
        String userAgent = null;
        boolean blockGeolocation = true;

        /**
         * Check if a URL's host matches any entry in blockedDomains.
         * Matching is by exact host or suffix (e.g., "ad.example.com" matches "example.com").
         */
        boolean isDomainBlocked(String url) {
            if (blockedDomains.isEmpty()) return false;
            String host = extractHost(url);
            if (host == null) return false;
            for (String domain : blockedDomains) {
                if (host.equals(domain) || host.endsWith("." + domain)) {
                    return true;
                }
            }
            return false;
        }

        /**
         * Return the matched blocked domain rule for a URL, or null if not blocked.
         */
        String getBlockedDomainMatch(String url) {
            String host = extractHost(url);
            if (host == null) return null;
            for (String domain : blockedDomains) {
                if (host.equals(domain) || host.endsWith("." + domain)) {
                    return domain;
                }
            }
            return null;
        }

        /**
         * Check if a URL's host matches any entry in readOnlyDomains.
         */
        boolean isDomainReadOnly(String url) {
            if (readOnlyDomains.isEmpty()) return false;
            String host = extractHost(url);
            if (host == null) return false;
            for (String domain : readOnlyDomains) {
                if (host.equals(domain) || host.endsWith("." + domain)) {
                    return true;
                }
            }
            return false;
        }

        /**
         * Extract the lowercase host from a URL string.
         */
        private static String extractHost(String url) {
            try {
                URI uri = URI.create(url);
                String host = uri.getHost();
                return host != null ? host.toLowerCase(Locale.ROOT) : null;
            } catch (Exception e) {
                return null;
            }
        }
    }

    // ---- Plugin lifecycle ----

    @Override
    public void load() {
        privacyConfig = new PrivacyConfigHolder();
    }

    @Override
    public void handleOnPause() {
        if (jaalWebView != null) {
            jaalWebView.onPause();
        }
    }

    @Override
    public void handleOnResume() {
        if (jaalWebView != null) {
            jaalWebView.onResume();
        }
    }

    @Override
    public void handleOnDestroy() {
        destroyWebView();
    }

    // ---- Lazy WebView creation ----

    /**
     * Create and configure the native WebView overlay if it doesn't already exist.
     * MUST be called on the UI thread.
     *
     * Layout hierarchy:
     *   android.R.id.content (FrameLayout)
     *     └─ Capacitor's WebView (index 0)
     *     └─ JAAL WebView (index 1, overlaid on top, starts GONE)
     */
    @SuppressLint("SetJavaScriptEnabled")
    private void ensureWebView() {
        if (jaalWebView != null) return;

        jaalWebView = new WebView(getContext());

        // --- WebSettings ---
        WebSettings settings = jaalWebView.getSettings();
        settings.setJavaScriptEnabled(!privacyConfig.disableJavaScript);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccess(false);
        settings.setGeolocationEnabled(!privacyConfig.blockGeolocation);
        settings.setMediaPlaybackRequiresUserGesture(true);

        // Custom User-Agent for fingerprint defense
        if (privacyConfig.userAgent != null && !privacyConfig.userAgent.isEmpty()) {
            settings.setUserAgentString(privacyConfig.userAgent);
        }

        // --- Cookie management ---
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(
            jaalWebView, !privacyConfig.blockThirdPartyCookies
        );

        // --- WebViewClient (request interception + navigation control + events) ---
        jaalClient = new JaalWebViewClient(this, privacyConfig);
        jaalWebView.setWebViewClient(jaalClient);

        // --- WebChromeClient (title tracking for pageLoad events) ---
        jaalWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onReceivedTitle(WebView view, String title) {
                // Title is tracked by the pageLoad event in JaalWebViewClient.onPageFinished
            }
        });

        // --- Layout: fill the overlay area ---
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        );
        jaalWebView.setLayoutParams(params);
        jaalWebView.setVisibility(View.GONE);
        jaalWebView.setBackgroundColor(Color.WHITE);

        // --- Add to the activity's root FrameLayout (above Capacitor WebView) ---
        ViewGroup rootView = (ViewGroup) getActivity()
            .findViewById(android.R.id.content);
        rootView.addView(jaalWebView);
    }

    // ---- @PluginMethod implementations ----

    @PluginMethod
    public void navigate(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        getBridge().executeOnMainThread(new Runnable() {
            @Override
            public void run() {
                ensureWebView();
                jaalWebView.loadUrl(url);
                showOverlay(true);
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void getPageContent(final PluginCall call) {
        getBridge().executeOnMainThread(new Runnable() {
            @Override
            public void run() {
                if (jaalWebView == null) {
                    JSObject result = new JSObject();
                    result.put("html", "");
                    result.put("text", "");
                    result.put("url", "");
                    result.put("title", "");
                    call.resolve(result);
                    return;
                }

                // Extract HTML, text, URL, and title via JavaScript evaluation
                jaalWebView.evaluateJavascript(
                    "(function() { return JSON.stringify({ " +
                    "  html: document.documentElement.outerHTML, " +
                    "  text: document.body ? document.body.innerText : '', " +
                    "  url: window.location.href, " +
                    "  title: document.title " +
                    "}); })()",
                    new android.webkit.ValueCallback<String>() {
                        @Override
                        public void onReceiveValue(String value) {
                            JSObject result = new JSObject();
                            try {
                                String unescaped = unescapeJsString(value);
                                JSObject parsed = new JSObject(unescaped);
                                result.put("html", parsed.optString("html", ""));
                                result.put("text", parsed.optString("text", ""));
                                result.put("url", parsed.optString("url", ""));
                                result.put("title", parsed.optString("title", ""));
                            } catch (Exception e) {
                                // Fallback: return what we can from the WebView directly
                                result.put("html", "");
                                result.put("text", "");
                                result.put("url", jaalWebView.getUrl() != null
                                    ? jaalWebView.getUrl() : "");
                                result.put("title", jaalWebView.getTitle() != null
                                    ? jaalWebView.getTitle() : "");
                            }
                            call.resolve(result);
                        }
                    }
                );
            }
        });
    }

    @PluginMethod
    public void injectScript(final PluginCall call) {
        final String js = call.getString("js");
        if (js == null || js.isEmpty()) {
            call.reject("js is required");
            return;
        }

        getBridge().executeOnMainThread(new Runnable() {
            @Override
            public void run() {
                if (jaalWebView == null) {
                    call.reject("WebView not initialized. Call navigate() first.");
                    return;
                }

                jaalWebView.evaluateJavascript(js,
                    new android.webkit.ValueCallback<String>() {
                        @Override
                        public void onReceiveValue(String value) {
                            JSObject result = new JSObject();
                            result.put("result", value != null ? value : "null");
                            call.resolve(result);
                        }
                    }
                );
            }
        });
    }

    @PluginMethod
    public void setPrivacyConfig(final PluginCall call) {
        PrivacyConfigHolder newConfig = new PrivacyConfigHolder();

        newConfig.blockThirdPartyCookies = call.getBoolean(
            "blockThirdPartyCookies", true
        );
        newConfig.storageIsolation = call.getBoolean(
            "storageIsolation", false
        );
        newConfig.disableJavaScript = call.getBoolean(
            "disableJavaScript", false
        );
        newConfig.blockGeolocation = call.getBoolean(
            "blockGeolocation", true
        );

        String userAgent = call.getString("userAgent");
        newConfig.userAgent = userAgent;

        // Parse blockedDomains array
        try {
            JSONArray blocked = call.getArray("blockedDomains");
            if (blocked != null) {
                newConfig.blockedDomains = new ArrayList<>();
                for (int i = 0; i < blocked.length(); i++) {
                    newConfig.blockedDomains.add(blocked.getString(i));
                }
            }
        } catch (JSONException ignored) {
            // Keep default empty list
        }

        // Parse readOnlyDomains array
        try {
            JSONArray readOnly = call.getArray("readOnlyDomains");
            if (readOnly != null) {
                newConfig.readOnlyDomains = new ArrayList<>();
                for (int i = 0; i < readOnly.length(); i++) {
                    newConfig.readOnlyDomains.add(readOnly.getString(i));
                }
            }
        } catch (JSONException ignored) {
            // Keep default empty list
        }

        this.privacyConfig = newConfig;

        // Apply to existing WebView if already created
        getBridge().executeOnMainThread(new Runnable() {
            @Override
            public void run() {
                if (jaalWebView != null) {
                    applyPrivacyConfig();
                }
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void show(final PluginCall call) {
        final boolean animate = call.getBoolean("animate", true);
        getBridge().executeOnMainThread(new Runnable() {
            @Override
            public void run() {
                if (jaalWebView != null) {
                    showOverlay(animate);
                }
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void hide(final PluginCall call) {
        final boolean animate = call.getBoolean("animate", true);
        getBridge().executeOnMainThread(new Runnable() {
            @Override
            public void run() {
                if (jaalWebView != null) {
                    hideOverlay(animate);
                }
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void destroy(final PluginCall call) {
        getBridge().executeOnMainThread(new Runnable() {
            @Override
            public void run() {
                destroyWebView();
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void getState(final PluginCall call) {
        getBridge().executeOnMainThread(new Runnable() {
            @Override
            public void run() {
                JSObject state = new JSObject();
                state.put("visible", isVisible);
                state.put("url", jaalWebView != null && jaalWebView.getUrl() != null
                    ? jaalWebView.getUrl() : "");
                state.put("loading", jaalClient != null && jaalClient.isLoading());
                call.resolve(state);
            }
        });
    }

    @PluginMethod
    public void goBack(final PluginCall call) {
        getBridge().executeOnMainThread(new Runnable() {
            @Override
            public void run() {
                if (jaalWebView != null && jaalWebView.canGoBack()) {
                    jaalWebView.goBack();
                }
                JSObject result = new JSObject();
                result.put("canGoBack",
                    jaalWebView != null && jaalWebView.canGoBack());
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void goForward(final PluginCall call) {
        getBridge().executeOnMainThread(new Runnable() {
            @Override
            public void run() {
                if (jaalWebView != null && jaalWebView.canGoForward()) {
                    jaalWebView.goForward();
                }
                JSObject result = new JSObject();
                result.put("canGoForward",
                    jaalWebView != null && jaalWebView.canGoForward());
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void reload(final PluginCall call) {
        getBridge().executeOnMainThread(new Runnable() {
            @Override
            public void run() {
                if (jaalWebView != null) {
                    jaalWebView.reload();
                }
                call.resolve();
            }
        });
    }

    // ---- Event emission (called by JaalWebViewClient) ----

    /**
     * Emit 'navigationChange' event to JavaScript listeners.
     */
    void emitNavigationChange(String url, boolean isMainFrame, boolean isUserInitiated) {
        JSObject data = new JSObject();
        data.put("url", url);
        data.put("isMainFrame", isMainFrame);
        data.put("isUserInitiated", isUserInitiated);
        notifyListeners("navigationChange", data);
    }

    /**
     * Emit 'pageLoad' event to JavaScript listeners.
     */
    void emitPageLoad(String url, String title) {
        JSObject data = new JSObject();
        data.put("url", url);
        data.put("title", title != null ? title : "");
        notifyListeners("pageLoad", data);
    }

    /**
     * Emit 'pageError' event to JavaScript listeners.
     */
    void emitPageError(String url, String error, int errorCode) {
        JSObject data = new JSObject();
        data.put("url", url);
        data.put("error", error);
        data.put("errorCode", errorCode);
        notifyListeners("pageError", data);
    }

    /**
     * Emit 'requestBlocked' event to JavaScript listeners.
     */
    void emitRequestBlocked(String url, String matchedDomain) {
        JSObject data = new JSObject();
        data.put("url", url);
        data.put("matchedDomain", matchedDomain);
        notifyListeners("requestBlocked", data);
    }

    // ---- Internal helpers ----

    private void showOverlay(boolean animate) {
        if (jaalWebView == null) return;
        jaalWebView.animate().cancel();
        if (animate) {
            jaalWebView.setAlpha(0f);
            jaalWebView.setVisibility(View.VISIBLE);
            jaalWebView.animate().alpha(1f).setDuration(200).start();
        } else {
            jaalWebView.setVisibility(View.VISIBLE);
        }
        isVisible = true;
    }

    private void hideOverlay(boolean animate) {
        if (jaalWebView == null) return;
        jaalWebView.animate().cancel();
        if (animate) {
            jaalWebView.animate().alpha(0f).setDuration(200)
                .withEndAction(new Runnable() {
                    @Override
                    public void run() {
                        if (jaalWebView != null) {
                            jaalWebView.setVisibility(View.GONE);
                        }
                        isVisible = false;
                    }
                }).start();
        } else {
            jaalWebView.setVisibility(View.GONE);
            isVisible = false;
        }
    }

    /**
     * Fully destroy the WebView and release all resources.
     * Safe to call when already null.
     */
    private void destroyWebView() {
        if (jaalWebView != null) {
            jaalWebView.stopLoading();
            jaalWebView.setWebViewClient(null);
            jaalWebView.setWebChromeClient(null);
            ViewGroup parent = (ViewGroup) jaalWebView.getParent();
            if (parent != null) {
                parent.removeView(jaalWebView);
            }
            jaalWebView.destroy();
            jaalWebView = null;
            jaalClient = null;
            isVisible = false;
        }
    }

    /**
     * Apply the current privacy config to the existing WebView.
     * Called after setPrivacyConfig() when the WebView is already created.
     */
    private void applyPrivacyConfig() {
        if (jaalWebView == null) return;

        WebSettings settings = jaalWebView.getSettings();
        settings.setJavaScriptEnabled(!privacyConfig.disableJavaScript);
        settings.setGeolocationEnabled(!privacyConfig.blockGeolocation);

        CookieManager.getInstance().setAcceptThirdPartyCookies(
            jaalWebView, !privacyConfig.blockThirdPartyCookies
        );

        if (privacyConfig.userAgent != null && !privacyConfig.userAgent.isEmpty()) {
            settings.setUserAgentString(privacyConfig.userAgent);
        }

        // Update the client's config reference for request interception
        if (jaalClient != null) {
            jaalClient.updatePrivacyConfig(privacyConfig);
        }
    }

    /**
     * Unescape a JSON string returned by WebView.evaluateJavascript().
     *
     * Android's evaluateJavascript wraps the result in extra double quotes
     * and escapes internal quotes. This method undoes that wrapping.
     *
     * Example input: "\"{ \\\"html\\\": \\\"<html>...\\\" }\""
     * Example output: "{ \"html\": \"<html>...\" }"
     */
    static String unescapeJsString(String value) {
        if (value == null || "null".equals(value)) return "{}";
        // Remove surrounding quotes if present
        if (value.startsWith("\"") && value.endsWith("\"")) {
            value = value.substring(1, value.length() - 1);
        }
        return value
            .replace("\\\"", "\"")
            .replace("\\\\", "\\")
            .replace("\\n", "\n")
            .replace("\\t", "\t");
    }
}
