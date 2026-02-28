// KACHERI BACKEND/src/jobs/workers/exportRenderers/htmlStandalone.ts
// D2: Standalone HTML export — single self-contained HTML file with all resources inlined.

import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../../../config";
import type { CanvasFrame } from "../../../store/canvasFrames";
import type { RendererOutput } from "./htmlBundle";

export interface HtmlStandaloneInput {
  canvasTitle: string;
  kclVersion: string;
  frames: CanvasFrame[];
  /** E4: Composition mode — notebook mode renders as continuous scroll with narrative. */
  compositionMode?: string;
}

/** Read KCL asset from disk. Returns empty string if not found. */
async function readKclAsset(kclVersion: string, file: string): Promise<string> {
  const filePath = path.join(config.storage.root, "kcl", kclVersion, file);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    console.warn(`[htmlStandalone] KCL asset not found: ${filePath}`);
    return "";
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Render a standalone HTML export.
 * Single .html file with inlined KCL JS/CSS, all frames, and slide-show navigation.
 */
/**
 * Build a continuous-scroll notebook HTML (E4).
 * Narrative blocks appear between frames in a single scrollable page.
 */
function buildNotebookHtml(
  frames: CanvasFrame[],
  kclJs: string,
  kclCss: string,
  canvasTitle: string,
): string {
  const sections = frames.map((frame, i) => {
    const narrativeHtml = (frame.metadata as Record<string, unknown> | null)?.narrativeHtml as string | undefined;
    const narrative = narrativeHtml
      ? `<div class="notebook-narrative">${narrativeHtml}</div>`
      : "";
    const title = frame.title || `Frame ${i + 1}`;
    return `${narrative}
    <div class="notebook-frame-label">${escapeHtml(title)}</div>
    <section class="notebook-frame">${frame.code}</section>`;
  }).join('\n    <hr class="notebook-divider">\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(canvasTitle)}</title>
  <style>
${kclCss}
  </style>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #f8fafc; }
    .notebook-container { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }
    .notebook-title { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 28px; font-weight: 700; color: #0f172a; margin: 0 0 32px; }
    .notebook-narrative { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; line-height: 1.8; color: #334155; padding: 16px 0; }
    .notebook-narrative h2 { font-size: 22px; margin: 0 0 12px; color: #0f172a; }
    .notebook-narrative h3 { font-size: 18px; margin: 0 0 8px; color: #334155; }
    .notebook-narrative p { margin: 0 0 12px; }
    .notebook-narrative ul, .notebook-narrative ol { margin: 0 0 12px; padding-left: 24px; }
    .notebook-narrative blockquote { margin: 0 0 12px; padding-left: 16px; border-left: 3px solid #94a3b8; color: #475569; }
    .notebook-frame-label { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 600; color: #64748b; padding: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    .notebook-frame { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 8px; }
    .notebook-divider { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
  </style>
  <script>
${kclJs}
  </script>
</head>
<body>
  <div class="notebook-container">
    <h1 class="notebook-title">${escapeHtml(canvasTitle)}</h1>
${sections}
  </div>
</body>
</html>`;
}

export async function renderHtmlStandalone(input: HtmlStandaloneInput): Promise<RendererOutput> {
  const { canvasTitle, kclVersion, frames } = input;

  const kclJs = await readKclAsset(kclVersion, "kcl.js");
  const kclCss = await readKclAsset(kclVersion, "kcl.css");

  // E4: Notebook mode renders as continuous scroll with narrative blocks
  if (input.compositionMode === "notebook") {
    const html = buildNotebookHtml(frames, kclJs, kclCss, canvasTitle);
    const buffer = Buffer.from(html, "utf-8");
    const safeTitle = canvasTitle.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "canvas";
    return { buffer, filename: `${safeTitle}-notebook.html` };
  }

  // Build frame sections — each frame in a hidden div, toggled by JS navigation
  const frameSections = frames.map((frame, i) => {
    return `    <section class="frame" id="frame-${i}" ${i === 0 ? "" : 'style="display:none;"'}>${frame.code}</section>`;
  }).join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(canvasTitle)}</title>
  <style>
${kclCss}
  </style>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #0f172a; }
    .frame { width: 100%; height: calc(100% - 48px); overflow: auto; }
    .nav-bar {
      position: fixed; bottom: 0; left: 0; right: 0; height: 48px;
      background: #1e293b; display: flex; align-items: center; justify-content: center; gap: 16px;
      z-index: 9999; user-select: none;
    }
    .nav-bar button {
      background: #334155; color: #e2e8f0; border: none; border-radius: 6px;
      padding: 6px 16px; font-size: 13px; cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .nav-bar button:hover:not(:disabled) { background: #475569; }
    .nav-bar button:disabled { opacity: 0.4; cursor: default; }
    .nav-bar .counter {
      color: #94a3b8; font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .nav-bar .title {
      color: #e2e8f0; font-size: 14px; font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
  </style>
  <script>
${kclJs}
  </script>
</head>
<body>
${frameSections}
  <div class="nav-bar">
    <span class="title">${escapeHtml(canvasTitle)}</span>
    <button id="btn-prev" onclick="navigate(-1)">&larr; Previous</button>
    <span class="counter" id="counter">1 / ${frames.length}</span>
    <button id="btn-next" onclick="navigate(1)">Next &rarr;</button>
  </div>
  <script>
    (function() {
      var current = 0;
      var total = ${frames.length};
      function show(idx) {
        for (var i = 0; i < total; i++) {
          var el = document.getElementById('frame-' + i);
          if (el) el.style.display = i === idx ? '' : 'none';
        }
        document.getElementById('counter').textContent = (idx + 1) + ' / ' + total;
        document.getElementById('btn-prev').disabled = idx === 0;
        document.getElementById('btn-next').disabled = idx === total - 1;
      }
      window.navigate = function(delta) {
        var next = current + delta;
        if (next >= 0 && next < total) { current = next; show(current); }
      };
      document.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); window.navigate(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); window.navigate(-1); }
      });
      show(0);
    })();
  </script>
</body>
</html>`;

  const buffer = Buffer.from(html, "utf-8");
  const safeTitle = canvasTitle.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "canvas";
  return { buffer, filename: `${safeTitle}-standalone.html` };
}
