// KACHERI BACKEND/src/jobs/workers/exportRenderers/pptx.ts
// D4: PPTX export — maps KCL components to PowerPoint primitives via pptxgenjs.
// Complex/unmapped elements fall back to Puppeteer PNG capture embedded as a full-slide image.

import { promises as fs } from "node:fs";
import path from "node:path";
import PptxGenJS from "pptxgenjs";
import { config } from "../../../config";
import type { CanvasFrame } from "../../../store/canvasFrames";
import type { RendererOutput } from "./htmlBundle";

export interface PptxInput {
  canvasTitle: string;
  kclVersion: string;
  frames: CanvasFrame[];
  /** E4: Composition mode — notebook mode inserts text-only slides for narrative. */
  compositionMode?: string;
}

/* ---------- Slide Dimensions (inches) ---------- */

// Default 16:9 widescreen (matches pptxgenjs LAYOUT_WIDE)
const SLIDE_W = 13.33;
const SLIDE_H = 7.5;
const RENDER_TIMEOUT_MS = 15_000;

/* ---------- Puppeteer Fallback ---------- */

/**
 * Render a frame to a base64 PNG using Puppeteer.
 * Used as fallback for complex/unmapped KCL components.
 */
async function renderFrameToPngBase64(
  frameCode: string,
  kclJs: string,
  kclCss: string,
  width: number,
  height: number,
): Promise<string> {
  const { default: puppeteer } = await import("puppeteer");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>${kclCss}</style>
  <style>*, *::before, *::after { box-sizing: border-box; } html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }</style>
  <script>${kclJs}</script>
</head>
<body>
${frameCode}
<script>window.addEventListener('load', function() { window.__KCL_RENDER_COMPLETE = true; });</script>
</body>
</html>`;

    await page.setContent(html, { waitUntil: "networkidle0", timeout: RENDER_TIMEOUT_MS });
    await page.waitForFunction("window.__KCL_RENDER_COMPLETE === true", { timeout: RENDER_TIMEOUT_MS }).catch(() => {});

    const screenshot = await page.screenshot({ type: "png", fullPage: false, encoding: "base64" });
    return typeof screenshot === "string" ? screenshot : Buffer.from(screenshot).toString("base64");
  } finally {
    await browser.close().catch(() => {});
  }
}

/* ---------- KCL Parsing Helpers ---------- */

/** Extract all top-level KCL component tags from frame HTML. */
function extractKclComponents(html: string): Array<{ tag: string; attrs: Record<string, string>; innerHTML: string }> {
  const components: Array<{ tag: string; attrs: Record<string, string>; innerHTML: string }> = [];
  // Match <kcl-xxx ...>...</kcl-xxx> — non-greedy, handles multiline
  const tagRegex = /<(kcl-[\w-]+)([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const attrStr = match[2];
    const innerHTML = match[3].trim();
    const attrs: Record<string, string> = {};
    const attrRegex = /([\w-]+)=["']([^"']*)["']/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2];
    }
    components.push({ tag, attrs, innerHTML });
  }
  return components;
}

/** Extract JSON data from <script type="application/json" data-for="..."> blocks. */
function extractDataBlocks(html: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const scriptRegex = /<script\s+type=["']application\/json["']\s+data-for=["']([^"']+)["']>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      data[match[1]] = JSON.parse(match[2]);
    } catch {
      // Skip invalid JSON
    }
  }
  return data;
}

/** Strip HTML tags and decode entities for plain text extraction. */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|li|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Parse basic HTML formatting into pptxgenjs TextProps array. */
function htmlToTextRuns(html: string): PptxGenJS.TextProps[] {
  const runs: PptxGenJS.TextProps[] = [];
  // Split on formatting tags, preserving structure
  const parts = html.split(/(<\/?(?:b|strong|i|em|u|code)[^>]*>)/gi);
  let bold = false;
  let italic = false;
  let underline = false;
  let monospace = false;

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "<b>" || lower === "<strong>") { bold = true; continue; }
    if (lower === "</b>" || lower === "</strong>") { bold = false; continue; }
    if (lower === "<i>" || lower === "<em>") { italic = true; continue; }
    if (lower === "</i>" || lower === "</em>") { italic = false; continue; }
    if (lower === "<u>") { underline = true; continue; }
    if (lower === "</u>") { underline = false; continue; }
    if (lower === "<code>") { monospace = true; continue; }
    if (lower === "</code>") { monospace = false; continue; }

    // It's a text chunk
    const text = stripHtml(part);
    if (!text) continue;

    runs.push({
      text,
      options: {
        bold: bold || undefined,
        italic: italic || undefined,
        underline: underline ? { style: "sng" } : undefined,
        fontFace: monospace ? "Courier New" : undefined,
      },
    });
  }

  if (runs.length === 0) {
    runs.push({ text: stripHtml(html) });
  }
  return runs;
}

/* ---------- Per-Component PPTX Mapping ---------- */

/**
 * Map a single KCL component to pptxgenjs slide operations.
 * Returns true if successfully mapped, false if fallback needed.
 */
function mapComponentToSlide(
  slide: PptxGenJS.Slide,
  comp: { tag: string; attrs: Record<string, string>; innerHTML: string },
  _dataBlocks: Record<string, unknown>,
  _yOffset: number,
): boolean {
  switch (comp.tag) {
    case "kcl-text": {
      const text = htmlToTextRuns(comp.innerHTML);
      const fontSize = comp.attrs.size ? parseInt(comp.attrs.size, 10) : 18;
      slide.addText(text, {
        x: 0.5,
        y: _yOffset,
        w: SLIDE_W - 1,
        h: 1,
        fontSize,
        color: "333333",
        valign: "top",
        wrap: true,
      });
      return true;
    }

    case "kcl-image": {
      const src = comp.attrs.src;
      if (!src) return false;
      // Base64 data URLs can be used directly
      if (src.startsWith("data:")) {
        slide.addImage({
          data: src,
          x: 0.5,
          y: _yOffset,
          w: SLIDE_W - 1,
          h: 5,
          sizing: { type: "contain", w: SLIDE_W - 1, h: 5 },
        });
        return true;
      }
      // External URLs — embed as link placeholder text
      slide.addText(`[Image: ${comp.attrs.alt || src}]`, {
        x: 0.5,
        y: _yOffset,
        w: SLIDE_W - 1,
        h: 1,
        fontSize: 14,
        color: "666666",
        italic: true,
      });
      return true;
    }

    case "kcl-list": {
      const items = comp.innerHTML
        .split(/<li[^>]*>/gi)
        .map((item) => stripHtml(item))
        .filter(Boolean);
      if (items.length === 0) return false;
      const textRuns: PptxGenJS.TextProps[] = items.map((item) => ({
        text: item,
        options: { bullet: true, breakLine: true },
      }));
      slide.addText(textRuns, {
        x: 0.5,
        y: _yOffset,
        w: SLIDE_W - 1,
        h: Math.min(items.length * 0.5, SLIDE_H - _yOffset - 0.5),
        fontSize: 16,
        color: "333333",
        valign: "top",
      });
      return true;
    }

    case "kcl-quote": {
      const text = stripHtml(comp.innerHTML);
      const attribution = comp.attrs.cite || "";
      slide.addText(
        [
          { text: `\u201C${text}\u201D`, options: { italic: true, fontSize: 20 } },
          ...(attribution
            ? [{ text: `\n\u2014 ${attribution}`, options: { fontSize: 14, color: "666666", breakLine: true } }]
            : []),
        ],
        {
          x: 1,
          y: _yOffset,
          w: SLIDE_W - 2,
          h: 2,
          color: "333333",
          valign: "middle",
        },
      );
      return true;
    }

    case "kcl-metric": {
      const value = comp.attrs.value || stripHtml(comp.innerHTML);
      const label = comp.attrs.label || "";
      slide.addText(
        [
          { text: value, options: { fontSize: 48, bold: true, color: "4F46E5" } },
          ...(label
            ? [{ text: `\n${label}`, options: { fontSize: 16, color: "666666", breakLine: true } }]
            : []),
        ],
        {
          x: 0.5,
          y: _yOffset,
          w: SLIDE_W - 1,
          h: 2,
          align: "center",
          valign: "middle",
        },
      );
      return true;
    }

    case "kcl-code": {
      const code = stripHtml(comp.innerHTML);
      slide.addText(code, {
        x: 0.5,
        y: _yOffset,
        w: SLIDE_W - 1,
        h: Math.min(code.split("\n").length * 0.3 + 0.5, SLIDE_H - _yOffset - 0.5),
        fontFace: "Courier New",
        fontSize: 12,
        color: "E2E8F0",
        fill: { color: "1E293B" },
        valign: "top",
        wrap: true,
      });
      return true;
    }

    case "kcl-source": {
      const docTitle = comp.attrs.title || stripHtml(comp.innerHTML) || "Source Document";
      const href = comp.attrs.href || "";
      slide.addText(
        [
          {
            text: `[${docTitle}]`,
            options: {
              color: "4F46E5",
              underline: { style: "sng" },
              hyperlink: href ? { url: href } : undefined,
            },
          },
        ],
        {
          x: 0.5,
          y: _yOffset,
          w: SLIDE_W - 1,
          h: 0.4,
          fontSize: 12,
        },
      );
      return true;
    }

    case "kcl-table": {
      const id = comp.attrs.id;
      const dataBlock = id ? _dataBlocks[id] : null;
      if (!dataBlock || !Array.isArray(dataBlock)) return false;

      const tableData = dataBlock as Array<Record<string, string>>;
      if (tableData.length === 0) return false;

      const headers = Object.keys(tableData[0]);
      const headerRow: PptxGenJS.TableRow = headers.map((h) => ({
        text: h,
        options: { bold: true, fill: { color: "4F46E5" }, color: "FFFFFF", fontSize: 12 },
      }));
      const dataRows: PptxGenJS.TableRow[] = tableData.map((row) =>
        headers.map((h) => ({
          text: String(row[h] ?? ""),
          options: { fontSize: 11, color: "333333" },
        })),
      );

      slide.addTable([headerRow, ...dataRows], {
        x: 0.5,
        y: _yOffset,
        w: SLIDE_W - 1,
        fontSize: 11,
        border: { type: "solid", pt: 0.5, color: "CBD5E1" },
        colW: headers.map(() => (SLIDE_W - 1) / headers.length),
        autoPage: true,
      });
      return true;
    }

    case "kcl-chart": {
      const id = comp.attrs.id;
      const chartType = comp.attrs.type || "bar";
      const dataBlock = id ? _dataBlocks[id] : null;
      if (!dataBlock) return false;

      const chartData = dataBlock as { labels?: string[]; series?: Array<{ name?: string; values?: number[] }> };
      if (!chartData.labels || !chartData.series) return false;

      // Map KCL chart types to pptxgenjs chart types
      type PptxChartType = "bar" | "line" | "pie" | "doughnut" | "area" | "scatter";
      const typeMap: Record<string, PptxChartType> = {
        bar: "bar",
        line: "line",
        pie: "pie",
        donut: "doughnut",
        doughnut: "doughnut",
        area: "area",
        scatter: "scatter",
      };
      const pptxType = typeMap[chartType] || "bar";

      const seriesData = chartData.series.map((s) => ({
        name: s.name || "Series",
        labels: chartData.labels!,
        values: s.values || [],
      }));

      slide.addChart(pptxType as PptxGenJS.CHART_NAME, seriesData, {
        x: 0.5,
        y: _yOffset,
        w: SLIDE_W - 1,
        h: Math.min(5, SLIDE_H - _yOffset - 0.5),
        showLegend: seriesData.length > 1,
        showTitle: false,
      });
      return true;
    }

    case "kcl-slide": {
      // kcl-slide sets background — handled at slide level
      const bg = comp.attrs.background || comp.attrs.bg;
      if (bg) {
        // Hex color (strip # if present)
        const color = bg.replace(/^#/, "");
        if (/^[0-9a-fA-F]{6}$/.test(color)) {
          slide.background = { color };
        }
      }
      return true;
    }

    // Components where native PPTX mapping is low fidelity — use PNG fallback
    case "kcl-layout":
    case "kcl-animate":
    case "kcl-timeline":
    case "kcl-compare":
    case "kcl-embed":
    case "kcl-icon":
      return false;

    default:
      return false;
  }
}

/* ---------- Read KCL Asset ---------- */

async function readKclAsset(kclVersion: string, file: string): Promise<string> {
  const filePath = path.join(config.storage.root, "kcl", kclVersion, file);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    console.warn(`[pptx] KCL asset not found: ${filePath}`);
    return "";
  }
}

/* ---------- Main Export Function ---------- */

/**
 * Render PPTX export.
 * Maps KCL components to native PPTX elements where possible.
 * Falls back to full-slide PNG for complex/unmapped elements.
 */
export async function renderPptx(input: PptxInput): Promise<RendererOutput> {
  const { canvasTitle, kclVersion, frames } = input;

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33" x 7.5" (16:9)
  pptx.title = canvasTitle;
  pptx.author = "Beyle Kacheri";
  pptx.company = "Beyle";

  // Read KCL assets (needed for Puppeteer fallback)
  const kclJs = await readKclAsset(kclVersion, "kcl.js");
  const kclCss = await readKclAsset(kclVersion, "kcl.css");

  for (const frame of frames) {
    // E4: In notebook mode, insert a text-only slide for narrative content before the frame
    if (input.compositionMode === "notebook") {
      const narrativeHtml = (frame.metadata as Record<string, unknown> | null)?.narrativeHtml as string | undefined;
      if (narrativeHtml) {
        const narrativeSlide = pptx.addSlide();
        narrativeSlide.background = { color: "FFFFFF" };
        const plainText = stripHtml(narrativeHtml).trim();
        if (plainText) {
          narrativeSlide.addText(plainText, {
            x: 1, y: 0.8, w: SLIDE_W - 2, h: SLIDE_H - 1.6,
            fontSize: 16, color: "334155", valign: "top", wrap: true,
            fontFace: "Segoe UI",
            lineSpacingMultiple: 1.5,
          });
        }
      }
    }

    const slide = pptx.addSlide();

    // Parse KCL components from frame HTML
    const components = extractKclComponents(frame.code);
    const dataBlocks = extractDataBlocks(frame.code);

    // Try to map each component natively
    let useFallback = false;
    let yOffset = 0.5;

    if (components.length === 0) {
      // No KCL components found — use PNG fallback for entire frame
      useFallback = true;
    } else {
      for (const comp of components) {
        const mapped = mapComponentToSlide(slide, comp, dataBlocks, yOffset);
        if (!mapped) {
          // If any component can't be mapped, fall back to full-slide PNG
          useFallback = true;
          break;
        }
        // Rough vertical offset advancement per component type
        yOffset += comp.tag === "kcl-metric" ? 2.5 : comp.tag === "kcl-chart" ? 5.5 : 1.5;
      }
    }

    // Fallback: render entire frame as PNG and embed as full-slide image
    if (useFallback) {
      try {
        const pngBase64 = await renderFrameToPngBase64(
          frame.code,
          kclJs,
          kclCss,
          Math.round(SLIDE_W * 96), // 96 DPI
          Math.round(SLIDE_H * 96),
        );

        // Clear any partially mapped elements by creating a fresh slide
        // pptxgenjs doesn't support clearing, so we add the image on top at full size
        slide.addImage({
          data: `image/png;base64,${pngBase64}`,
          x: 0,
          y: 0,
          w: SLIDE_W,
          h: SLIDE_H,
        });
      } catch (err) {
        console.warn(`[pptx] Puppeteer fallback failed for frame ${frame.id}:`, err);
        slide.addText("Export rendering failed for this frame", {
          x: 0.5,
          y: SLIDE_H / 2 - 0.5,
          w: SLIDE_W - 1,
          h: 1,
          fontSize: 24,
          color: "999999",
          align: "center",
          valign: "middle",
        });
      }
    }

    // Add speaker notes
    if (frame.speakerNotes) {
      slide.addNotes(stripHtml(frame.speakerNotes));
    }
  }

  // Generate PPTX buffer
  const output = await pptx.write({ outputType: "nodebuffer" });
  const buffer = Buffer.isBuffer(output) ? output : Buffer.from(output as ArrayBuffer);

  const safeTitle =
    canvasTitle.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "canvas";
  return { buffer, filename: `${safeTitle}.pptx` };
}
