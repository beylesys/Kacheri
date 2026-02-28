// KACHERI FRONTEND/src/components/CanvasEmbedView.tsx
// React NodeView for canvas frame embedding in Docs.
//
// Renders a sandboxed iframe showing the Design Studio frame content.
// When Design Studio is disabled, shows a placeholder message.
// Fetches frame data from GET /embed/frames/:fid/render on mount.
//
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Slice P9

import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { isProductEnabled } from "../modules/registry";

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "/api";

interface FrameRenderData {
  code: string;
  kclVersion: string;
  canvasId: string;
  canvasTitle: string;
  frameId: string;
  frameTitle: string | null;
}

/**
 * Build a self-contained HTML document for the iframe srcdoc.
 * Same pattern as useFrameRenderer.ts and PresenterView.tsx.
 */
function buildSrcdoc(code: string, kclVersion: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const cb = Date.now();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${origin}/kcl/${kclVersion}/kcl.css?_cb=${cb}">
<style>
html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#fff}
</style>
</head>
<body>
${code}
<script src="${origin}/kcl/${kclVersion}/kcl.js?_cb=${cb}"><\/script>
<script>
window.onerror=function(m,s,l){parent.postMessage({type:'kcl:error',message:String(m),source:s,line:l},'*')};
window.addEventListener('unhandledrejection',function(e){parent.postMessage({type:'kcl:error',message:String(e.reason)},'*')});
window.addEventListener('load',function(){parent.postMessage({type:'kcl:render-complete'},'*')});
<\/script>
</body>
</html>`;
}

export default function CanvasEmbedView({ node, selected }: NodeViewProps) {
  const { canvasId, frameId, aspectRatio } = node.attrs;

  const studioEnabled = isProductEnabled("design-studio");

  const [data, setData] = useState<FrameRenderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iframeLoading, setIframeLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const fetchFrame = useCallback(() => {
    if (!studioEnabled || !frameId) return;

    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const headers: Record<string, string> = { Accept: "application/json" };
    try {
      const token = localStorage?.getItem("accessToken");
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch {
      // no-op
    }

    fetch(`${API_BASE}/embed/frames/${frameId}/render`, {
      signal: controller.signal,
      headers,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Frame unavailable (${res.status})`);
        return res.json() as Promise<FrameRenderData>;
      })
      .then((d) => {
        setData(d);
        setLoading(false);
        setIframeLoading(true);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message || "Failed to load frame");
        setLoading(false);
      });

    return () => controller.abort();
  }, [studioEnabled, frameId]);

  useEffect(() => {
    const cleanup = fetchFrame();
    return cleanup;
  }, [fetchFrame]);

  // Listen for postMessage from iframe
  useEffect(() => {
    if (!data) return;

    function handleMessage(e: MessageEvent) {
      if (!e.data || typeof e.data.type !== "string") return;
      if (!e.data.type.startsWith("kcl:")) return;

      if (e.data.type === "kcl:render-complete") {
        setIframeLoading(false);
      } else if (e.data.type === "kcl:error") {
        setIframeLoading(false);
      }
    }

    window.addEventListener("message", handleMessage);

    // Fallback: clear loading after 10s
    const timer = setTimeout(() => setIframeLoading(false), 10000);

    return () => {
      window.removeEventListener("message", handleMessage);
      clearTimeout(timer);
    };
  }, [data]);

  const srcdoc = useMemo(() => {
    if (!data) return "";
    return buildSrcdoc(data.code, data.kclVersion);
  }, [data]);

  // --- Placeholder when Design Studio is disabled ---
  if (!studioEnabled) {
    return (
      <NodeViewWrapper className="kacheri-canvas-embed-wrapper">
        <div
          className="canvas-embed-placeholder"
          style={{
            padding: "24px",
            textAlign: "center",
            background: "#f1f5f9",
            border: "1px dashed #cbd5e1",
            borderRadius: "8px",
            color: "#64748b",
            fontSize: "14px",
          }}
        >
          Design Studio content — enable Design Studio to view
        </div>
      </NodeViewWrapper>
    );
  }

  // --- Loading state ---
  if (loading) {
    return (
      <NodeViewWrapper className="kacheri-canvas-embed-wrapper">
        <div
          className="canvas-embed-loading"
          style={{
            padding: "32px",
            textAlign: "center",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            color: "#64748b",
          }}
        >
          <div style={{ marginBottom: "8px" }}>Loading canvas frame...</div>
          <div
            style={{
              width: "24px",
              height: "24px",
              border: "3px solid #e2e8f0",
              borderTopColor: "#6366f1",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto",
            }}
          />
        </div>
      </NodeViewWrapper>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <NodeViewWrapper className="kacheri-canvas-embed-wrapper">
        <div
          className="canvas-embed-error"
          style={{
            padding: "24px",
            textAlign: "center",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            color: "#dc2626",
            fontSize: "14px",
          }}
        >
          <div style={{ marginBottom: "8px", fontWeight: 600 }}>
            Frame unavailable
          </div>
          <div style={{ color: "#991b1b", fontSize: "13px", marginBottom: "12px" }}>
            {error}
          </div>
          <button
            type="button"
            onClick={fetchFrame}
            style={{
              padding: "6px 16px",
              border: "1px solid #fca5a5",
              borderRadius: "6px",
              background: "#fff",
              color: "#dc2626",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Retry
          </button>
        </div>
      </NodeViewWrapper>
    );
  }

  // --- Rendered frame ---
  const titleText = data?.canvasTitle
    ? `${data.canvasTitle}${data.frameTitle ? ` — ${data.frameTitle}` : ""}`
    : "Canvas Frame";

  return (
    <NodeViewWrapper
      className={`kacheri-canvas-embed-wrapper${selected ? " selected" : ""}`}
    >
      <div
        className="canvas-embed-container"
        style={{
          position: "relative",
          border: selected ? "2px solid #6366f1" : "1px solid #e2e8f0",
          borderRadius: "8px",
          overflow: "hidden",
          background: "#fff",
          boxShadow: selected
            ? "0 0 0 3px rgba(99, 102, 241, 0.15)"
            : "0 1px 3px rgba(0,0,0,0.08)",
          transition: "border-color 0.15s, box-shadow 0.15s",
        }}
      >
        {/* Header bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 12px",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            fontSize: "12px",
            color: "#64748b",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#6366f1",
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 500 }}>{titleText}</span>
          <span style={{ marginLeft: "auto", opacity: 0.6 }}>Canvas Embed</span>
        </div>

        {/* Iframe container */}
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: aspectRatio || "16/9",
            maxHeight: "500px",
            overflow: "hidden",
          }}
        >
          {iframeLoading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(248, 250, 252, 0.9)",
                zIndex: 1,
              }}
              aria-live="polite"
            >
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  border: "2px solid #e2e8f0",
                  borderTopColor: "#6366f1",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
            </div>
          )}
          <iframe
            ref={iframeRef}
            srcDoc={srcdoc}
            sandbox="allow-scripts"
            title={`Embedded frame: ${titleText}`}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              display: "block",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>
    </NodeViewWrapper>
  );
}
