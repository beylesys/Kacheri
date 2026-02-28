// KACHERI BACKEND/src/jobs/workers/exportRenderers/svg.ts
// D2: SVG export — wraps frame HTML/CSS in <foreignObject> within an SVG container.

import { promises as fs } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { config } from "../../../config";
import type { CanvasFrame } from "../../../store/canvasFrames";
import type { RendererOutput } from "./htmlBundle";

export interface SvgInput {
  canvasTitle: string;
  kclVersion: string;
  frames: CanvasFrame[];
  width?: number;
  height?: number;
}

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

/** Read KCL CSS from disk for inlining. */
async function readKclCss(kclVersion: string): Promise<string> {
  const filePath = path.join(config.storage.root, "kcl", kclVersion, "kcl.css");
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    console.warn(`[svg] KCL CSS not found: ${filePath}`);
    return "";
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build an SVG string wrapping frame HTML in <foreignObject>.
 * CSS is inlined so the SVG is self-contained.
 */
function buildFrameSvg(frameCode: string, kclCss: string, width: number, height: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden;margin:0;padding:0;">
      <style>
        *, *::before, *::after { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
${kclCss}
      </style>
${frameCode}
    </div>
  </foreignObject>
</svg>`;
}

/**
 * Render SVG export.
 * Single frame: returns an .svg file.
 * Multiple frames: returns a zip of .svg files.
 */
export async function renderSvg(input: SvgInput): Promise<RendererOutput> {
  const { canvasTitle, kclVersion, frames, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = input;

  const kclCss = await readKclCss(kclVersion);
  const safeTitle = canvasTitle.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "canvas";

  if (frames.length === 1) {
    const svgContent = buildFrameSvg(frames[0].code, kclCss, width, height);
    const buffer = Buffer.from(svgContent, "utf-8");
    return { buffer, filename: `${safeTitle}-frame-1.svg` };
  }

  // Multiple frames → zip of SVGs
  const zip = new JSZip();
  for (let i = 0; i < frames.length; i++) {
    const svgContent = buildFrameSvg(frames[i].code, kclCss, width, height);
    const frameName = frames[i].title?.replace(/[^a-zA-Z0-9_-]/g, "_") || `frame-${i + 1}`;
    zip.file(`${frameName}.svg`, svgContent);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer, filename: `${safeTitle}-svg-export.zip` };
}
