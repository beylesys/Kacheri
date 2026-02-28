// KACHERI BACKEND/src/jobs/workers/exportRenderers/htmlBundle.ts
// D2: HTML bundle export — produces a zip containing index.html, per-frame pages, and KCL assets.

import { promises as fs } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { config } from "../../../config";
import type { CanvasFrame } from "../../../store/canvasFrames";

export interface HtmlBundleInput {
  canvasTitle: string;
  kclVersion: string;
  frames: CanvasFrame[];
  /** E4: Composition mode — notebook mode includes narrative blocks in frame pages. */
  compositionMode?: string;
}

export interface RendererOutput {
  buffer: Buffer;
  filename: string;
}

/** Read KCL asset from disk. Returns empty string if not found. */
async function readKclAsset(kclVersion: string, file: string): Promise<string> {
  const filePath = path.join(config.storage.root, "kcl", kclVersion, file);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    console.warn(`[htmlBundle] KCL asset not found: ${filePath}`);
    return "";
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Build HTML page for a single frame */
function buildFramePage(frame: CanvasFrame, frameIndex: number, totalFrames: number, canvasTitle: string, compositionMode?: string): string {
  const title = frame.title || `Frame ${frameIndex + 1}`;

  // E4: Include narrative block above frame in notebook mode
  const narrativeHtml = compositionMode === "notebook"
    ? ((frame.metadata as Record<string, unknown> | null)?.narrativeHtml as string | undefined)
    : undefined;
  const narrativeSection = narrativeHtml
    ? `<div style="max-width:800px;margin:24px auto;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.7;color:#334155;">${narrativeHtml}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — ${escapeHtml(canvasTitle)}</title>
  <link rel="stylesheet" href="../kcl/kcl.css">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: ${compositionMode === "notebook" ? "auto" : "hidden"}; }
    .nav-bar { position: fixed; bottom: 0; left: 0; right: 0; height: 40px; background: #1e293b; display: flex; align-items: center; justify-content: center; gap: 16px; z-index: 9999; }
    .nav-bar a, .nav-bar span { color: #94a3b8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; text-decoration: none; }
    .nav-bar a:hover { color: #e2e8f0; }
    .nav-bar .current { color: #e2e8f0; font-weight: 600; }
  </style>
  <script src="../kcl/kcl.js"></script>
</head>
<body>
${narrativeSection}
${frame.code}
<div class="nav-bar">
  ${frameIndex > 0 ? `<a href="frame-${frameIndex}.html">&larr; Previous</a>` : `<span>&larr; Previous</span>`}
  <span class="current">${frameIndex + 1} / ${totalFrames}</span>
  ${frameIndex < totalFrames - 1 ? `<a href="frame-${frameIndex + 2}.html">Next &rarr;</a>` : `<span>Next &rarr;</span>`}
  <a href="../index.html">Index</a>
</div>
</body>
</html>`;
}

/** Build the index.html navigation page */
function buildIndexPage(frames: CanvasFrame[], canvasTitle: string): string {
  const frameLinks = frames.map((frame, i) => {
    const title = frame.title || `Frame ${i + 1}`;
    return `      <a href="frames/frame-${i + 1}.html" class="frame-card">
        <div class="frame-number">${i + 1}</div>
        <div class="frame-title">${escapeHtml(title)}</div>
      </a>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(canvasTitle)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; padding: 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; }
    h1 { margin: 0 0 24px; font-size: 24px; font-weight: 600; }
    .subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 32px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
    .frame-card { display: flex; align-items: center; gap: 12px; padding: 16px; background: #1e293b; border-radius: 8px; text-decoration: none; color: #e2e8f0; transition: background 0.15s; }
    .frame-card:hover { background: #334155; }
    .frame-number { width: 36px; height: 36px; border-radius: 8px; background: #4f46e5; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; flex-shrink: 0; }
    .frame-title { font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  </style>
</head>
<body>
  <h1>${escapeHtml(canvasTitle)}</h1>
  <div class="subtitle">${frames.length} frame${frames.length !== 1 ? "s" : ""}</div>
  <div class="grid">
${frameLinks}
  </div>
</body>
</html>`;
}

/**
 * Render an HTML bundle export.
 * Produces a zip containing index.html, frames/, and kcl/ directories.
 */
export async function renderHtmlBundle(input: HtmlBundleInput): Promise<RendererOutput> {
  const { canvasTitle, kclVersion, frames } = input;
  const zip = new JSZip();

  // Add KCL assets
  const kclJs = await readKclAsset(kclVersion, "kcl.js");
  const kclCss = await readKclAsset(kclVersion, "kcl.css");
  zip.file("kcl/kcl.js", kclJs);
  zip.file("kcl/kcl.css", kclCss);

  // Add index page
  zip.file("index.html", buildIndexPage(frames, canvasTitle));

  // Add per-frame pages
  for (let i = 0; i < frames.length; i++) {
    const html = buildFramePage(frames[i], i, frames.length, canvasTitle, input.compositionMode);
    zip.file(`frames/frame-${i + 1}.html`, html);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const safeTitle = canvasTitle.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "canvas";
  return { buffer, filename: `${safeTitle}-html-bundle.zip` };
}
