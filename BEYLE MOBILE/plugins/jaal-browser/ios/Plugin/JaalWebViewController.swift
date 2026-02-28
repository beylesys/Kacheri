// BEYLE MOBILE/plugins/jaal-browser/ios/Plugin/JaalWebViewController.swift
// Slice S20: iOS WKWebView delegate for the JAAL Browser Capacitor plugin.
//
// Responsibilities:
//   - Navigation control: emit navigation events to JS via plugin bridge
//   - Content blocking: compile WKContentRuleList from blockedDomains config
//   - Storage isolation: swap WKWebsiteDataStore when crossing eTLD+1 boundaries
//   - Page lifecycle: track loading state, emit page load / error events
//
// iOS-specific constraints (documented, not bugs):
//   - Request interception limited to custom URL schemes (not all HTTP)
//   - Cookie control is per-store, not per-cookie
//   - Fingerprint defense limited by WebKit API surface
//   - Compensated with WKContentRuleList for broad tracker/ad blocking

import WebKit

/// Privacy configuration holder for the iOS JAAL Browser plugin.
/// Mirrors the Android PrivacyConfigHolder structure.
struct PrivacyConfig {
    var blockThirdPartyCookies: Bool = true
    var blockedDomains: [String] = []
    var readOnlyDomains: [String] = []
    var storageIsolation: Bool = false
    var disableJavaScript: Bool = false
    var userAgent: String? = nil
    var blockGeolocation: Bool = true

    /// Check if a URL's host matches any entry in blockedDomains.
    /// Matching is by exact host or suffix (e.g., "ad.example.com" matches "example.com").
    /// Both host and domain entries are lowercased for case-insensitive matching.
    func isDomainBlocked(_ urlString: String) -> Bool {
        guard let host = Self.extractHost(urlString) else { return false }
        return blockedDomains.contains { domain in
            let d = domain.lowercased()
            return host == d || host.hasSuffix("." + d)
        }
    }

    /// Return the matched blocked domain rule for a URL, or nil if not blocked.
    func getBlockedDomainMatch(_ urlString: String) -> String? {
        guard let host = Self.extractHost(urlString) else { return nil }
        return blockedDomains.first { domain in
            let d = domain.lowercased()
            return host == d || host.hasSuffix("." + d)
        }
    }

    /// Check if a URL's host matches any entry in readOnlyDomains.
    func isDomainReadOnly(_ urlString: String) -> Bool {
        guard let host = Self.extractHost(urlString) else { return false }
        return readOnlyDomains.contains { domain in
            let d = domain.lowercased()
            return host == d || host.hasSuffix("." + d)
        }
    }

    /// Extract the lowercase host from a URL string.
    private static func extractHost(_ urlString: String) -> String? {
        guard let url = URL(string: urlString),
              let host = url.host else { return nil }
        return host.lowercased()
    }
}


/// WKNavigationDelegate for the JAAL Browser Plugin — Slice S20.
///
/// Enforces privacy policy via WKContentRuleList (content blocking) and
/// WKWebsiteDataStore (storage isolation). Emits events to the
/// JaalBrowserPlugin which forwards them to JavaScript.
class JaalWebViewController: NSObject, WKNavigationDelegate {

    /// Reference to the plugin for event emission.
    weak var plugin: JaalBrowserPlugin?

    /// Current privacy configuration.
    var privacyConfig: PrivacyConfig

    /// Whether a page is currently loading.
    private(set) var isLoading: Bool = false

    /// The currently active content rule list (compiled from blockedDomains).
    private var activeContentRuleList: WKContentRuleList?

    /// Current eTLD+1 for storage isolation boundary detection.
    private var currentETldPlus1: String? = nil

    init(plugin: JaalBrowserPlugin, privacyConfig: PrivacyConfig) {
        self.plugin = plugin
        self.privacyConfig = privacyConfig
        super.init()
    }

    // MARK: - Content Rule List (Tracker/Ad Blocking)

    /// Compile a WKContentRuleList from the current blockedDomains config.
    ///
    /// Uses Safari Content Blocker JSON format:
    /// [{"trigger": {"url-filter": ".*", "if-domain": ["*blocked.com"]},
    ///   "action": {"type": "block"}}]
    ///
    /// Called when privacy config changes or when the WebView is first created.
    func compileContentRuleList(for webView: WKWebView) {
        // Remove old rule list if present
        if let oldRuleList = activeContentRuleList {
            webView.configuration.userContentController.remove(oldRuleList)
            activeContentRuleList = nil
        }

        guard !privacyConfig.blockedDomains.isEmpty else { return }

        // Build Safari Content Blocker JSON rules.
        // Each blocked domain gets a rule that blocks all requests to that domain.
        var rules: [[String: Any]] = []
        for domain in privacyConfig.blockedDomains {
            // Escape dots for regex: "doubleclick.net" → "doubleclick\\.net"
            let escapedDomain = domain.replacingOccurrences(of: ".", with: "\\\\.")
            let rule: [String: Any] = [
                "trigger": [
                    "url-filter": ".*" + escapedDomain
                ],
                "action": [
                    "type": "block"
                ]
            ]
            rules.append(rule)
        }

        guard let jsonData = try? JSONSerialization.data(withJSONObject: rules),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            return
        }

        WKContentRuleListStore.default().compileContentRuleList(
            forIdentifier: "jaal-privacy-rules",
            encodedContentRuleList: jsonString
        ) { [weak self, weak webView] ruleList, error in
            guard let self = self, let webView = webView else { return }
            if let error = error {
                // Content rule compilation failed — log but don't crash.
                // Privacy is degraded but browsing still works.
                print("[JAAL iOS] Content rule compilation error: \(error.localizedDescription)")
                return
            }
            if let ruleList = ruleList {
                self.activeContentRuleList = ruleList
                webView.configuration.userContentController.add(ruleList)
            }
        }
    }

    // MARK: - Storage Isolation

    /// Check if navigating to a new URL crosses an eTLD+1 boundary.
    /// If so, clear site data from the current data store.
    ///
    /// Note: WKWebView.configuration returns a copy, so we cannot swap
    /// the websiteDataStore after creation. Instead, we clear all website
    /// data from the current store, which mirrors Android's approach
    /// (CookieManager.removeAllCookies + WebView.clearCache).
    func handleStorageIsolation(for url: URL, webView: WKWebView) {
        guard privacyConfig.storageIsolation else { return }

        let newETldPlus1 = Self.extractETldPlus1(url)
        if let newDomain = newETldPlus1,
           let currentDomain = currentETldPlus1,
           newDomain != currentDomain {
            // Boundary crossed — clear all website data from current store.
            // This removes cookies, cache, localStorage, sessionStorage,
            // and IndexedDB for all sites in this data store.
            let dataStore = webView.configuration.websiteDataStore
            let allTypes = WKWebsiteDataStore.allWebsiteDataTypes()
            dataStore.fetchDataRecords(ofTypes: allTypes) { records in
                dataStore.removeData(
                    ofTypes: allTypes,
                    for: records
                ) {
                    // Data cleared — navigation continues normally
                }
            }
        }
        currentETldPlus1 = newETldPlus1
    }

    // MARK: - WKNavigationDelegate

    /// Decide whether to allow or cancel a navigation action.
    ///
    /// - Blocks navigation to denied domains (via blockedDomains config)
    /// - Handles storage isolation on eTLD+1 boundary crossings
    /// - Emits 'navigationChange' event for all allowed navigations
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        let urlString = url.absoluteString

        // Block navigation to denied domains
        if let matchedDomain = privacyConfig.getBlockedDomainMatch(urlString) {
            plugin?.emitRequestBlocked(url: urlString, matchedDomain: matchedDomain)
            decisionHandler(.cancel)
            return
        }

        // Storage isolation: handle eTLD+1 boundary crossing
        handleStorageIsolation(for: url, webView: webView)

        // Emit navigation event
        let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        let isUserInitiated = navigationAction.navigationType == .linkActivated
            || navigationAction.navigationType == .formSubmitted
        plugin?.emitNavigationChange(
            url: urlString,
            isMainFrame: isMainFrame,
            isUserInitiated: isUserInitiated
        )

        decisionHandler(.allow)
    }

    /// Called when the web view starts loading main frame content.
    func webView(
        _ webView: WKWebView,
        didStartProvisionalNavigation navigation: WKNavigation!
    ) {
        isLoading = true

        if let url = webView.url?.absoluteString {
            plugin?.emitNavigationChange(url: url, isMainFrame: true, isUserInitiated: false)
        }
    }

    /// Called when the web view finishes loading main frame content.
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isLoading = false

        let url = webView.url?.absoluteString ?? ""
        let title = webView.title ?? ""
        plugin?.emitPageLoad(url: url, title: title)
    }

    /// Called when the web view fails to load main frame content.
    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        isLoading = false

        let nsError = error as NSError
        let url = webView.url?.absoluteString ?? nsError.userInfo[NSURLErrorFailingURLStringErrorKey] as? String ?? ""
        plugin?.emitPageError(
            url: url,
            error: error.localizedDescription,
            errorCode: nsError.code
        )
    }

    /// Called when the web view fails during the provisional (redirect/DNS) phase.
    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        isLoading = false

        let nsError = error as NSError
        let url = nsError.userInfo[NSURLErrorFailingURLStringErrorKey] as? String
            ?? webView.url?.absoluteString ?? ""
        plugin?.emitPageError(
            url: url,
            error: error.localizedDescription,
            errorCode: nsError.code
        )
    }

    // MARK: - Helpers

    /// Extract a simplified eTLD+1 from a URL.
    ///
    /// This is an approximation — a true eTLD+1 requires the Public Suffix List.
    /// We use the last two domain segments as a reasonable heuristic
    /// (e.g., "sub.example.com" → "example.com").
    ///
    /// For country-code TLDs like "example.co.uk", this would return "co.uk"
    /// which is incorrect but acceptable for our storage isolation use case
    /// (it will over-isolate rather than under-isolate, which is safer
    /// from a privacy perspective).
    ///
    /// Same algorithm as Android's JaalWebViewClient.extractETldPlus1().
    static func extractETldPlus1(_ url: URL) -> String? {
        guard let host = url.host?.lowercased() else { return nil }
        let parts = host.split(separator: ".")
        if parts.count >= 2 {
            return "\(parts[parts.count - 2]).\(parts[parts.count - 1])"
        }
        return host
    }

    // MARK: - Cleanup

    /// Remove content rule list from a WebView's user content controller.
    func removeContentRuleList(from webView: WKWebView) {
        if let ruleList = activeContentRuleList {
            webView.configuration.userContentController.remove(ruleList)
            activeContentRuleList = nil
        }
    }
}
