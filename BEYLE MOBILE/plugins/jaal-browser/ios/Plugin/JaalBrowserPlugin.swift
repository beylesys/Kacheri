// BEYLE MOBILE/plugins/jaal-browser/ios/Plugin/JaalBrowserPlugin.swift
// Slice S20: iOS Capacitor plugin for the JAAL Research Browser.
//
// Manages a native WKWebView overlaid on top of the Capacitor WebView.
// Provides full browser control for JAAL research browsing: navigation,
// content extraction, JavaScript injection, and privacy enforcement
// (content blocking via WKContentRuleList, storage isolation via
// WKWebsiteDataStore, geolocation blocking).
//
// The WKWebView is lazily created on the first navigate() call and added
// as a subview of the view controller's view above Capacitor's WebView.
// It starts hidden and is shown/hidden via show()/hide() or automatically
// on navigate().
//
// All @objc methods that touch the WebView are dispatched to the main
// thread — WKWebView MUST be manipulated on the main thread only.
//
// iOS-specific constraints (documented in work scope, not bugs):
//   - Request interception limited to custom URL schemes (Apple mandate)
//   - Cookie control is per-store, not per-cookie
//   - Fingerprint defense limited by WebKit API surface (~80% vs desktop)
//   - Compensated with WKContentRuleList for broad tracker/ad blocking

import Foundation
import WebKit
import Capacitor

/// JAAL Browser Capacitor Plugin — Slice S20.
///
/// Exposes a native iOS WKWebView with privacy control to the
/// JAAL React UI components via the Capacitor JS bridge.
@objc(JaalBrowserPlugin)
public class JaalBrowserPlugin: CAPPlugin, CAPBridgedPlugin {

    // MARK: - CAPBridgedPlugin conformance

    public let identifier = "JaalBrowserPlugin"
    public let jsName = "JaalBrowser"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "navigate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPageContent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "injectScript", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPrivacyConfig", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "destroy", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "goBack", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "goForward", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reload", returnType: CAPPluginReturnPromise)
    ]

    // MARK: - State

    private var jaalWebView: WKWebView?
    private var jaalDelegate: JaalWebViewController?
    private var privacyConfig = PrivacyConfig()
    private var isVisible: Bool = false

    // MARK: - Plugin lifecycle

    override public func load() {
        privacyConfig = PrivacyConfig()
    }

    // MARK: - Lazy WKWebView creation

    /// Create and configure the native WKWebView overlay if it doesn't already exist.
    /// MUST be called on the main thread.
    ///
    /// Layout hierarchy:
    ///   viewController.view
    ///     └─ Capacitor's WKWebView (index 0)
    ///     └─ JAAL WKWebView (added on top, starts hidden)
    private func ensureWebView() {
        guard jaalWebView == nil else { return }

        // --- WKWebViewConfiguration ---
        let config = WKWebViewConfiguration()

        // Privacy: use non-persistent data store when storage isolation is enabled,
        // otherwise use default store (persists cookies/cache across sessions).
        if privacyConfig.storageIsolation {
            config.websiteDataStore = WKWebsiteDataStore.nonPersistent()
        }

        // Preferences — JavaScript enabled/disabled
        // WKPreferences.javaScriptEnabled was deprecated in iOS 14.
        // Use WKWebpagePreferences.allowsContentJavaScript on iOS 14+.
        if #available(iOS 14.0, *) {
            config.defaultWebpagePreferences.allowsContentJavaScript = !privacyConfig.disableJavaScript
        } else {
            config.preferences.javaScriptEnabled = !privacyConfig.disableJavaScript
        }

        config.preferences.javaScriptCanOpenWindowsAutomatically = false

        // --- Create WKWebView ---
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.isHidden = true
        webView.backgroundColor = .white
        webView.scrollView.backgroundColor = .white

        // Accessibility
        webView.accessibilityLabel = "JAAL Research Browser"

        // Custom User-Agent for fingerprint defense
        if let ua = privacyConfig.userAgent, !ua.isEmpty {
            webView.customUserAgent = ua
        }

        // --- Navigation delegate ---
        jaalDelegate = JaalWebViewController(plugin: self, privacyConfig: privacyConfig)
        webView.navigationDelegate = jaalDelegate

        // --- Compile content blocking rules ---
        jaalDelegate?.compileContentRuleList(for: webView)

        // --- Add as subview above Capacitor's WebView ---
        guard let parentView = bridge?.viewController?.view else {
            return
        }
        parentView.addSubview(webView)

        // Full-screen constraints (respects safe area on notched devices)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: parentView.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: parentView.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: parentView.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: parentView.bottomAnchor)
        ])

        jaalWebView = webView
    }

    // MARK: - @objc Plugin Methods

    @objc func navigate(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), !urlString.isEmpty else {
            call.reject("url is required")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.ensureWebView()

            guard let webView = self.jaalWebView,
                  let url = URL(string: urlString) else {
                call.reject("Invalid URL: \(urlString)")
                return
            }

            webView.load(URLRequest(url: url))
            self.showOverlay(animate: true)
            call.resolve()
        }
    }

    @objc func getPageContent(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self,
                  let webView = self.jaalWebView else {
                call.resolve([
                    "html": "",
                    "text": "",
                    "url": "",
                    "title": ""
                ])
                return
            }

            // Extract HTML, text, URL, and title via JavaScript evaluation
            let js = """
            (function() {
                return JSON.stringify({
                    html: document.documentElement.outerHTML,
                    text: document.body ? document.body.innerText : '',
                    url: window.location.href,
                    title: document.title
                });
            })()
            """

            webView.evaluateJavaScript(js) { result, error in
                if let error = error {
                    // Fallback: return what we can from the WebView directly
                    call.resolve([
                        "html": "",
                        "text": "",
                        "url": webView.url?.absoluteString ?? "",
                        "title": webView.title ?? ""
                    ])
                    return
                }

                guard let jsonString = result as? String,
                      let data = jsonString.data(using: .utf8),
                      let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    // Parse failed — return fallback
                    call.resolve([
                        "html": "",
                        "text": "",
                        "url": webView.url?.absoluteString ?? "",
                        "title": webView.title ?? ""
                    ])
                    return
                }

                call.resolve([
                    "html": parsed["html"] as? String ?? "",
                    "text": parsed["text"] as? String ?? "",
                    "url": parsed["url"] as? String ?? "",
                    "title": parsed["title"] as? String ?? ""
                ])
            }
        }
    }

    @objc func injectScript(_ call: CAPPluginCall) {
        guard let js = call.getString("js"), !js.isEmpty else {
            call.reject("js is required")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self,
                  let webView = self.jaalWebView else {
                call.reject("WebView not initialized. Call navigate() first.")
                return
            }

            webView.evaluateJavaScript(js) { result, error in
                if let error = error {
                    call.reject("Script execution failed: \(error.localizedDescription)")
                    return
                }

                let resultString: String
                if let result = result {
                    if let str = result as? String {
                        resultString = str
                    } else if let data = try? JSONSerialization.data(
                        withJSONObject: result
                    ) {
                        resultString = String(data: data, encoding: .utf8) ?? "null"
                    } else {
                        resultString = "\(result)"
                    }
                } else {
                    resultString = "null"
                }

                call.resolve(["result": resultString])
            }
        }
    }

    @objc func setPrivacyConfig(_ call: CAPPluginCall) {
        var newConfig = PrivacyConfig()

        newConfig.blockThirdPartyCookies = call.getBool("blockThirdPartyCookies") ?? true
        newConfig.storageIsolation = call.getBool("storageIsolation") ?? false
        newConfig.disableJavaScript = call.getBool("disableJavaScript") ?? false
        newConfig.blockGeolocation = call.getBool("blockGeolocation") ?? true
        newConfig.userAgent = call.getString("userAgent")

        // Parse blockedDomains array
        if let blocked = call.getArray("blockedDomains") as? [String] {
            newConfig.blockedDomains = blocked
        }

        // Parse readOnlyDomains array
        if let readOnly = call.getArray("readOnlyDomains") as? [String] {
            newConfig.readOnlyDomains = readOnly
        }

        self.privacyConfig = newConfig

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if self.jaalWebView != nil {
                self.applyPrivacyConfig()
            }
            call.resolve()
        }
    }

    @objc func show(_ call: CAPPluginCall) {
        let animate = call.getBool("animate") ?? true
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if self.jaalWebView != nil {
                self.showOverlay(animate: animate)
            }
            call.resolve()
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        let animate = call.getBool("animate") ?? true
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if self.jaalWebView != nil {
                self.hideOverlay(animate: animate)
            }
            call.resolve()
        }
    }

    @objc func destroy(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.destroyWebView()
            call.resolve()
        }
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            call.resolve([
                "visible": self.isVisible,
                "url": self.jaalWebView?.url?.absoluteString ?? "",
                "loading": self.jaalDelegate?.isLoading ?? false
            ])
        }
    }

    @objc func goBack(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if let webView = self.jaalWebView, webView.canGoBack {
                webView.goBack()
            }
            call.resolve([
                "canGoBack": self.jaalWebView?.canGoBack ?? false
            ])
        }
    }

    @objc func goForward(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if let webView = self.jaalWebView, webView.canGoForward {
                webView.goForward()
            }
            call.resolve([
                "canGoForward": self.jaalWebView?.canGoForward ?? false
            ])
        }
    }

    @objc func reload(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.jaalWebView?.reload()
            call.resolve()
        }
    }

    // MARK: - Event emission (called by JaalWebViewController)

    /// Emit 'navigationChange' event to JavaScript listeners.
    func emitNavigationChange(url: String, isMainFrame: Bool, isUserInitiated: Bool) {
        notifyListeners("navigationChange", data: [
            "url": url,
            "isMainFrame": isMainFrame,
            "isUserInitiated": isUserInitiated
        ])
    }

    /// Emit 'pageLoad' event to JavaScript listeners.
    func emitPageLoad(url: String, title: String) {
        notifyListeners("pageLoad", data: [
            "url": url,
            "title": title
        ])
    }

    /// Emit 'pageError' event to JavaScript listeners.
    func emitPageError(url: String, error: String, errorCode: Int) {
        notifyListeners("pageError", data: [
            "url": url,
            "error": error,
            "errorCode": errorCode
        ])
    }

    /// Emit 'requestBlocked' event to JavaScript listeners.
    func emitRequestBlocked(url: String, matchedDomain: String) {
        notifyListeners("requestBlocked", data: [
            "url": url,
            "matchedDomain": matchedDomain
        ])
    }

    // MARK: - Internal helpers

    private func showOverlay(animate: Bool) {
        guard let webView = jaalWebView else { return }

        if animate {
            webView.alpha = 0
            webView.isHidden = false
            UIView.animate(withDuration: 0.2) {
                webView.alpha = 1
            }
        } else {
            webView.isHidden = false
            webView.alpha = 1
        }
        isVisible = true
    }

    private func hideOverlay(animate: Bool) {
        guard let webView = jaalWebView else { return }

        if animate {
            UIView.animate(withDuration: 0.2, animations: {
                webView.alpha = 0
            }, completion: { [weak self] _ in
                webView.isHidden = true
                self?.isVisible = false
            })
        } else {
            webView.isHidden = true
            webView.alpha = 0
            isVisible = false
        }
    }

    /// Fully destroy the WKWebView and release all resources.
    /// Safe to call when already nil.
    private func destroyWebView() {
        guard let webView = jaalWebView else { return }

        webView.stopLoading()
        webView.navigationDelegate = nil

        // Remove content rule list before removing from view
        jaalDelegate?.removeContentRuleList(from: webView)

        webView.removeFromSuperview()
        jaalWebView = nil
        jaalDelegate = nil
        isVisible = false
    }

    /// Apply the current privacy config to the existing WebView.
    /// Called after setPrivacyConfig() when the WebView is already created.
    ///
    /// Note: WKWebView.configuration returns a copy — some properties
    /// (websiteDataStore, JS enabled) cannot be changed after creation.
    /// For those, we must destroy and recreate the WebView.
    private func applyPrivacyConfig() {
        guard let webView = jaalWebView else { return }

        // Check if we need to recreate the WebView (data store change).
        // WKWebView.configuration.websiteDataStore cannot be reassigned
        // after creation — it's set at WKWebViewConfiguration init time.
        let currentStoreIsNonPersistent = !webView.configuration.websiteDataStore.isPersistent
        let needsNonPersistent = privacyConfig.storageIsolation
        if currentStoreIsNonPersistent != needsNonPersistent {
            // Must recreate WebView with new configuration.
            let currentUrl = webView.url
            destroyWebView()
            ensureWebView()
            // Reload the previous URL if any
            if let url = currentUrl, let newWebView = jaalWebView {
                newWebView.load(URLRequest(url: url))
                showOverlay(animate: false)
            }
            return
        }

        // Update custom User-Agent (directly settable on live WebView)
        if let ua = privacyConfig.userAgent, !ua.isEmpty {
            webView.customUserAgent = ua
        }

        // Update navigation delegate's config reference
        jaalDelegate?.privacyConfig = privacyConfig

        // Recompile content blocking rules with new blockedDomains
        jaalDelegate?.compileContentRuleList(for: webView)
    }
}
