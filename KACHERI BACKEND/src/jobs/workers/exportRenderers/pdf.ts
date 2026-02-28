// KACHERI BACKEND/src/jobs/workers/exportRenderers/pdf.ts
// D3: PDF export — renders each canvas frame as a page in a multi-page PDF via Puppeteer.

import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../../../config";
import type { CanvasFrame } from "../../../store/canvasFrames";
import type { RendererOutput } from "./htmlBundle";

export interface PdfInput {
  canvasTitle: string;
  kclVersion: string;
  frames: CanvasFrame[];
  includeNotes?: boolean;
  /** E4: Composition mode — notebook mode includes narrative blocks between frames. */
  compositionMode?: string;
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
    waitQueue.push(() => {
      activeInstances++;
      resolve();
    });
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
    console.warn(`[pdf] KCL asset not found: ${filePath}`);
    return "";
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build a single HTML document containing all frames separated by CSS page breaks.
 * Puppeteer's page.pdf() will output one page per frame.
 */
function buildMultiFrameHtml(
  frames: CanvasFrame[],
  kclJs: string,
  kclCss: string,
  includeNotes: boolean,
  width: number,
  height: number,
  compositionMode?: string,
): string {
  const frameSections = frames
    .map((frame, i) => {
      // E4: Narrative block before frame (notebook mode only)
      const narrativeHtml = compositionMode === "notebook"
        ? ((frame.metadata as Record<string, unknown> | null)?.narrativeHtml as string | undefined)
        : undefined;
      const narrativeSection = narrativeHtml
        ? `<section class="narrative-page" style="page-break-after: always;">
  <div class="narrative-content">${narrativeHtml}</div>
</section>`
        : "";

      const notesHtml =
        includeNotes && frame.speakerNotes
          ? `<div class="speaker-notes"><strong>Speaker Notes:</strong> ${escapeHtml(frame.speakerNotes)}</div>`
          : "";
      const pageBreak = i < frames.length - 1 ? ' style="page-break-after: always;"' : "";
      return `${narrativeSection}
<section class="frame-page"${pageBreak}>
  <div class="frame-content" style="width:${width}px;height:${height}px;overflow:hidden;">
${frame.code}
  </div>
${notesHtml}
</section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${width}, initial-scale=1.0">
  <style>
${kclCss}
  </style>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    .frame-page { width: ${width}px; height: ${height}px; position: relative; overflow: hidden; }
    .frame-content { width: ${width}px; height: ${height}px; overflow: hidden; }
    .speaker-notes {
      position: absolute; bottom: 0; left: 0; right: 0;
      padding: 8px 16px; background: rgba(255,255,255,0.95);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 10px; color: #334155; line-height: 1.4;
      border-top: 1px solid #e2e8f0;
    }
    .narrative-page {
      width: ${width}px; min-height: 200px; padding: 64px 120px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 16px; line-height: 1.8; color: #1e293b;
    }
    .narrative-content h2 { font-size: 22px; margin: 0 0 12px; color: #0f172a; }
    .narrative-content h3 { font-size: 18px; margin: 0 0 8px; color: #334155; }
    .narrative-content p { margin: 0 0 12px; }
    .narrative-content ul, .narrative-content ol { margin: 0 0 12px; padding-left: 24px; }
    .narrative-content blockquote { margin: 0 0 12px; padding-left: 16px; border-left: 3px solid #94a3b8; color: #475569; }
    @media print {
      .frame-page { page-break-after: always; }
      .frame-page:last-child { page-break-after: avoid; }
      .narrative-page { page-break-after: always; }
    }
  </style>
  <script>${kclJs}</script>
</head>
<body>
${frameSections}
<script>
  window.addEventListener('load', function() {
    window.__KCL_RENDER_COMPLETE = true;
  });
</script>
</body>
</html>`;
}

/**
 * Render PDF export.
 * Produces a multi-page PDF with one page per frame, rendered via Puppeteer.
 */
export async function renderPdf(input: PdfInput): Promise<RendererOutput> {
  const {
    canvasTitle,
    kclVersion,
    frames,
    includeNotes = false,
  } = input;

  const kclJs = await readKclAsset(kclVersion, "kcl.js");
  const kclCss = await readKclAsset(kclVersion, "kcl.css");
  const safeTitle =
    canvasTitle.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "canvas";

  const width = DEFAULT_WIDTH;
  const height = DEFAULT_HEIGHT;

  const html = buildMultiFrameHtml(frames, kclJs, kclCss, includeNotes, width, height, input.compositionMode);

  const { default: puppeteer } = await import("puppeteer");

  await acquirePuppeteer();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width, height });

    await page.setContent(html, {
      waitUntil: "networkidle0",
      timeout: RENDER_TIMEOUT_MS,
    });

    // Wait for KCL render complete signal
    await page
      .waitForFunction("window.__KCL_RENDER_COMPLETE === true", {
        timeout: RENDER_TIMEOUT_MS,
      })
      .catch(() => {
        // Proceed even if signal not received
      });

    // Generate PDF — landscape orientation, page size matching aspect ratio
    // 16:9 aspect at 1920x1080 maps to landscape with custom dimensions
    const pdfWidthInches = 13.33; // ~338.6mm — matches 16:9 presentation
    const pdfHeightInches = 7.5; // ~190.5mm

    const pdfBuffer = await page.pdf({
      width: `${pdfWidthInches}in`,
      height: `${pdfHeightInches}in`,
      printBackground: true,
      landscape: false, // We set explicit width/height so orientation is implicit
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    const buffer = Buffer.isBuffer(pdfBuffer)
      ? pdfBuffer
      : Buffer.from(pdfBuffer);

    return { buffer, filename: `${safeTitle}.pdf` };
  } finally {
    if (browser) await browser.close().catch(() => {});
    releasePuppeteer();
  }
}
