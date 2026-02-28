// KACHERI BACKEND/src/jobs/workers/exportRenderers/png.ts
// D2: PNG export — renders each frame via Puppeteer at target resolution.

import { promises as fs } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { config } from "../../../config";
import type { CanvasFrame } from "../../../store/canvasFrames";
import type { RendererOutput } from "./htmlBundle";

export interface PngInput {
  canvasTitle: string;
  kclVersion: string;
  frames: CanvasFrame[];
  width?: number;
  height?: number;
}

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const RENDER_TIMEOUT_MS = 15_000;

/* ---------- Puppeteer Concurrency Limiter ---------- */

let activeInstances = 0;
const MAX_CONCURRENT = 2;
const waitQueue: Array<() => void> = [];

async function acquirePuppeteer(): Promise<void> {
  if (activeInstances < MAX_CONCURRENT) {
    activeInstances++;
    return;
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(() => { activeInstances++; resolve(); });
  });
}

function releasePuppeteer(): void {
  activeInstances--;
  const next = waitQueue.shift();
  if (next) next();
}

/** Read KCL asset from disk. */
async function readKclAsset(kclVersion: string, file: string): Promise<string> {
  const filePath = path.join(config.storage.root, "kcl", kclVersion, file);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    console.warn(`[png] KCL asset not found: ${filePath}`);
    return "";
  }
}

/** Build a self-contained HTML string for Puppeteer rendering. */
function buildFrameHtml(frameCode: string, kclJs: string, kclCss: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
${kclCss}
  </style>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
  </style>
  <script>${kclJs}</script>
</head>
<body>
${frameCode}
<script>
  window.addEventListener('load', function() {
    window.__KCL_RENDER_COMPLETE = true;
  });
</script>
</body>
</html>`;
}

/** Render a single frame to a PNG buffer via Puppeteer. */
async function renderFramePng(
  frameCode: string,
  kclJs: string,
  kclCss: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const { default: puppeteer } = await import("puppeteer");

  await acquirePuppeteer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setViewport({ width, height });

    const html = buildFrameHtml(frameCode, kclJs, kclCss);
    await page.setContent(html, { waitUntil: "networkidle0", timeout: RENDER_TIMEOUT_MS });

    // Wait for KCL render complete signal
    await page.waitForFunction("window.__KCL_RENDER_COMPLETE === true", { timeout: RENDER_TIMEOUT_MS }).catch(() => {
      // Proceed even if signal not received — frame may not use KCL custom elements
    });

    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    return Buffer.isBuffer(screenshot) ? screenshot : Buffer.from(screenshot);
  } finally {
    if (browser) await browser.close().catch(() => {});
    releasePuppeteer();
  }
}

/**
 * Render PNG export.
 * If single frame: returns a PNG file.
 * If multiple frames: returns a zip of PNGs.
 */
export async function renderPng(input: PngInput): Promise<RendererOutput> {
  const { canvasTitle, kclVersion, frames, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = input;

  const kclJs = await readKclAsset(kclVersion, "kcl.js");
  const kclCss = await readKclAsset(kclVersion, "kcl.css");
  const safeTitle = canvasTitle.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "canvas";

  if (frames.length === 1) {
    const buffer = await renderFramePng(frames[0].code, kclJs, kclCss, width, height);
    return { buffer, filename: `${safeTitle}-frame-1.png` };
  }

  // Multiple frames → zip
  const zip = new JSZip();
  for (let i = 0; i < frames.length; i++) {
    const pngBuffer = await renderFramePng(frames[i].code, kclJs, kclCss, width, height);
    const frameName = frames[i].title?.replace(/[^a-zA-Z0-9_-]/g, "_") || `frame-${i + 1}`;
    zip.file(`${frameName}.png`, pngBuffer);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer, filename: `${safeTitle}-png-export.zip` };
}
