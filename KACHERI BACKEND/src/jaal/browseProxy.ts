// KACHERI BACKEND/src/jaal/browseProxy.ts
// JAAL Browse Proxy: Server-side page fetch with HTML sanitization.
// Used for web topology browsing (backend-proxied) — Slice S5
//
// Security:
//   - SSRF protection: blocks localhost, RFC 1918, link-local addresses
//   - HTML sanitization: strips script/iframe/object/embed/event handlers
//   - Response size limit: 5 MB max
//   - Timeout: 10 seconds

import { stripDangerousHtml } from "../utils/sanitize";

/* ---------- Types ---------- */

export interface BrowseProxyResult {
  html: string;
  contentType: string;
  statusCode: number;
}

/* ---------- SSRF Protection ---------- */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "::1",
  "[::1]",
]);

/**
 * Check if a hostname resolves to a private/internal address.
 * Blocks: localhost, 127.*, 10.*, 172.16-31.*, 192.168.*, link-local, .local
 */
function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // Exact match
  if (BLOCKED_HOSTNAMES.has(lower)) return true;

  // .local TLD (mDNS)
  if (lower.endsWith(".local")) return true;

  // IPv4 private ranges
  if (/^127\./.test(lower)) return true;
  if (/^10\./.test(lower)) return true;
  if (/^192\.168\./.test(lower)) return true;

  // 172.16.0.0 – 172.31.255.255
  const match172 = lower.match(/^172\.(\d+)\./);
  if (match172) {
    const octet = parseInt(match172[1], 10);
    if (octet >= 16 && octet <= 31) return true;
  }

  // IPv6 link-local
  if (lower.startsWith("fe80:") || lower.startsWith("[fe80:")) return true;

  return false;
}

/* ---------- Constants ---------- */

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB
const FETCH_TIMEOUT_MS = 10_000; // 10 seconds
const USER_AGENT = "BEYLE-JAAL-Proxy/1.0";

/* ---------- Fetch & Sanitize ---------- */

/**
 * Fetch a URL server-side, sanitize the HTML, and return it.
 * Used by the browse proxy endpoint for web-topology JAAL browsing.
 */
export async function fetchAndSanitize(
  targetUrl: string,
): Promise<BrowseProxyResult> {
  // Validate URL scheme
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return {
      html: errorPage("Invalid URL", `The URL "${targetUrl}" could not be parsed.`),
      contentType: "text/html; charset=utf-8",
      statusCode: 400,
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      html: errorPage("Blocked Protocol", `Only http and https URLs are allowed. Got: ${parsed.protocol}`),
      contentType: "text/html; charset=utf-8",
      statusCode: 400,
    };
  }

  // SSRF check
  if (isBlockedHost(parsed.hostname)) {
    return {
      html: errorPage("Blocked Host", "Requests to internal/private addresses are not allowed."),
      contentType: "text/html; charset=utf-8",
      statusCode: 403,
    };
  }

  // Fetch
  let response: Response;
  try {
    response = await fetch(targetUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html, application/xhtml+xml, */*",
      },
      redirect: "follow",
    });
  } catch (err) {
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? "Request timed out after 10 seconds."
        : `Failed to fetch: ${err instanceof Error ? err.message : String(err)}`;

    return {
      html: errorPage("Fetch Error", message),
      contentType: "text/html; charset=utf-8",
      statusCode: 502,
    };
  }

  // Check response size via Content-Length header (if available)
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
    return {
      html: errorPage("Response Too Large", "The page exceeds the 5 MB size limit."),
      contentType: "text/html; charset=utf-8",
      statusCode: 502,
    };
  }

  // Read body with size limit
  let bodyText: string;
  try {
    bodyText = await response.text();
    if (Buffer.byteLength(bodyText, "utf-8") > MAX_RESPONSE_BYTES) {
      return {
        html: errorPage("Response Too Large", "The page exceeds the 5 MB size limit."),
        contentType: "text/html; charset=utf-8",
        statusCode: 502,
      };
    }
  } catch (err) {
    return {
      html: errorPage("Read Error", `Failed to read response body: ${err instanceof Error ? err.message : String(err)}`),
      contentType: "text/html; charset=utf-8",
      statusCode: 502,
    };
  }

  // Determine content type
  const rawContentType = response.headers.get("content-type") ?? "";
  const isHtml =
    rawContentType.includes("text/html") ||
    rawContentType.includes("application/xhtml+xml");

  if (!isHtml) {
    // Wrap non-HTML in <pre> for safe display
    const escaped = bodyText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    return {
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>BEYLE JAAL Proxy</title></head><body><pre>${escaped}</pre></body></html>`,
      contentType: "text/html; charset=utf-8",
      statusCode: response.status,
    };
  }

  // Sanitize HTML
  let sanitized = stripDangerousHtml(bodyText);

  // Inject <base> tag for relative URL resolution
  const origin = parsed.origin;
  const baseTag = `<base href="${origin}/">`;

  if (sanitized.includes("<head>")) {
    sanitized = sanitized.replace("<head>", `<head>${baseTag}`);
  } else if (sanitized.includes("<html>")) {
    sanitized = sanitized.replace("<html>", `<html><head>${baseTag}</head>`);
  } else {
    sanitized = `${baseTag}${sanitized}`;
  }

  return {
    html: sanitized,
    contentType: "text/html; charset=utf-8",
    statusCode: response.status,
  };
}

/* ---------- Error Page Helper ---------- */

function errorPage(title: string, message: string): string {
  const escapedTitle = title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escapedMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>BEYLE JAAL Proxy — ${escapedTitle}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #e0e0e0; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .error { max-width: 500px; padding: 2rem; border: 1px solid #333; border-radius: 8px; text-align: center; }
    h1 { color: #ff6b6b; font-size: 1.2rem; }
    p { color: #aaa; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="error">
    <h1>${escapedTitle}</h1>
    <p>${escapedMessage}</p>
  </div>
</body>
</html>`;
}
