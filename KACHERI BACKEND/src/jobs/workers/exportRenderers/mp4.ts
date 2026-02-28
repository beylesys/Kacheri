// KACHERI BACKEND/src/jobs/workers/exportRenderers/mp4.ts
// D8: Video (MP4) export — renders each frame via Puppeteer as PNG,
// then stitches into an MP4 video using ffmpeg with xfade transitions.

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../../../config";
import type { CanvasFrame } from "../../../store/canvasFrames";
import type { RendererOutput } from "./htmlBundle";

const execFileAsync = promisify(execFile);

export interface Mp4Input {
  canvasTitle: string;
  kclVersion: string;
  frames: CanvasFrame[];
  width?: number;
  height?: number;
  fps?: number;
  transitionDurationMs?: number;
}

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_FPS = 30;
const DEFAULT_FRAME_DURATION_MS = 3000;
const DEFAULT_TRANSITION_DURATION_MS = 300;
const RENDER_TIMEOUT_MS = 15_000;
// Skip xfade for very large canvases — concat only for >30 frames
const MAX_XFADE_FRAMES = 30;

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

/* ---------- KCL Asset Reading ---------- */

async function readKclAsset(kclVersion: string, file: string): Promise<string> {
  const filePath = path.join(config.storage.root, "kcl", kclVersion, file);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    console.warn(`[mp4] KCL asset not found: ${filePath}`);
    return "";
  }
}

/* ---------- Frame HTML Builder ---------- */

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

/* ---------- Single Frame PNG Capture ---------- */

async function captureFramePng(
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
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width, height });

    const html = buildFrameHtml(frameCode, kclJs, kclCss);
    await page.setContent(html, { waitUntil: "networkidle0", timeout: RENDER_TIMEOUT_MS });

    await page
      .waitForFunction("window.__KCL_RENDER_COMPLETE === true", { timeout: RENDER_TIMEOUT_MS })
      .catch(() => {
        // Proceed even if signal not received
      });

    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    return Buffer.isBuffer(screenshot) ? screenshot : Buffer.from(screenshot);
  } finally {
    if (browser) await browser.close().catch(() => {});
    releasePuppeteer();
  }
}

/* ---------- ffmpeg Binary Path ---------- */

function getFfmpegPath(): string {
  try {
    // ffmpeg-static exports the path to the ffmpeg binary
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffmpegPath = require("ffmpeg-static") as string;
    return ffmpegPath;
  } catch {
    throw new Error(
      "ffmpeg-static is not installed. Video export requires ffmpeg-static. " +
        "Install with: npm install ffmpeg-static"
    );
  }
}

/* ---------- Transition Mapping ---------- */

function mapTransitionToXfade(transition: string): string | null {
  switch (transition) {
    case "fade":
      return "fade";
    case "slide":
      return "slideleft";
    case "zoom":
      return "zoomin";
    case "none":
    default:
      return null; // hard cut — no xfade
  }
}

/* ---------- Temp Directory Management ---------- */

async function createTempDir(prefix: string): Promise<string> {
  const dir = path.join(os.tmpdir(), prefix);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    console.warn(`[mp4] Failed to cleanup temp dir: ${dir}`);
  }
}

/* ---------- Main Renderer ---------- */

/**
 * Render MP4 video export.
 *
 * Flow:
 * 1. Capture each frame as PNG via Puppeteer
 * 2. Use ffmpeg to stitch PNGs into MP4 with transitions
 * 3. Return the MP4 buffer
 */
export async function renderMp4(input: Mp4Input): Promise<RendererOutput> {
  const {
    canvasTitle,
    kclVersion,
    frames,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    fps = DEFAULT_FPS,
    transitionDurationMs = DEFAULT_TRANSITION_DURATION_MS,
  } = input;

  const ffmpegPath = getFfmpegPath();
  const safeTitle = canvasTitle.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "canvas";
  const tempDir = await createTempDir(`beyle-mp4-${Date.now()}`);

  try {
    // Step 1: Read KCL assets
    const kclJs = await readKclAsset(kclVersion, "kcl.js");
    const kclCss = await readKclAsset(kclVersion, "kcl.css");

    // Step 2: Capture each frame as PNG
    const framePngs: string[] = [];
    for (let i = 0; i < frames.length; i++) {
      const pngBuffer = await captureFramePng(frames[i].code, kclJs, kclCss, width, height);
      const pngPath = path.join(tempDir, `frame-${String(i).padStart(4, "0")}.png`);
      await fs.writeFile(pngPath, pngBuffer);
      framePngs.push(pngPath);
      console.log(`[mp4] Captured frame ${i + 1}/${frames.length}`);
    }

    const outputPath = path.join(tempDir, `${safeTitle}.mp4`);
    const transitionDurationS = transitionDurationMs / 1000;
    const useXfade = frames.length > 1 && frames.length <= MAX_XFADE_FRAMES;

    if (frames.length === 1) {
      // Single frame — just hold for its duration
      const durationS = (frames[0].durationMs || DEFAULT_FRAME_DURATION_MS) / 1000;
      await execFileAsync(ffmpegPath, [
        "-y",
        "-loop", "1",
        "-t", String(durationS),
        "-i", framePngs[0],
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-vf", `scale=${width}:${height}`,
        "-r", String(fps),
        "-crf", "23",
        outputPath,
      ]);
    } else if (useXfade) {
      // Multiple frames with xfade transitions
      await renderWithXfade(
        ffmpegPath,
        framePngs,
        frames,
        outputPath,
        width,
        height,
        fps,
        transitionDurationS,
      );
    } else {
      // Too many frames for xfade — use concat demuxer (no transitions)
      await renderWithConcat(
        ffmpegPath,
        framePngs,
        frames,
        outputPath,
        tempDir,
        width,
        height,
        fps,
      );
    }

    // Step 3: Read output MP4
    const mp4Buffer = await fs.readFile(outputPath);
    console.log(`[mp4] Video export complete: ${mp4Buffer.length} bytes`);

    return { buffer: mp4Buffer, filename: `${safeTitle}.mp4` };
  } finally {
    await cleanupTempDir(tempDir);
  }
}

/* ---------- Render with xfade transitions ---------- */

async function renderWithXfade(
  ffmpegPath: string,
  framePngs: string[],
  frames: CanvasFrame[],
  outputPath: string,
  width: number,
  height: number,
  fps: number,
  transitionDurationS: number,
): Promise<void> {
  // Build ffmpeg args with -loop 1 -t <duration> -i <png> for each frame
  const args: string[] = ["-y"];

  for (let i = 0; i < framePngs.length; i++) {
    const durationS = (frames[i].durationMs || DEFAULT_FRAME_DURATION_MS) / 1000;
    args.push("-loop", "1", "-t", String(durationS), "-i", framePngs[i]);
  }

  // Build xfade filter chain
  const filterParts: string[] = [];
  let prevLabel = "[0]";
  let cumulativeOffset = 0;

  for (let i = 1; i < framePngs.length; i++) {
    const prevDuration = (frames[i - 1].durationMs || DEFAULT_FRAME_DURATION_MS) / 1000;

    // Offset = cumulative duration of all previous segments minus cumulative transitions
    if (i === 1) {
      cumulativeOffset = prevDuration - transitionDurationS;
    } else {
      cumulativeOffset += prevDuration - transitionDurationS;
    }

    // Ensure offset is not negative
    const offset = Math.max(0, cumulativeOffset);
    const transition = mapTransitionToXfade(frames[i].transition);
    const outLabel = i < framePngs.length - 1 ? `[v${i}]` : "[vout]";

    if (transition) {
      filterParts.push(
        `${prevLabel}[${i}]xfade=transition=${transition}:duration=${transitionDurationS}:offset=${offset.toFixed(3)}${outLabel}`
      );
    } else {
      // Hard cut — use xfade with 0 duration (instant)
      filterParts.push(
        `${prevLabel}[${i}]xfade=transition=fade:duration=0.001:offset=${offset.toFixed(3)}${outLabel}`
      );
    }

    prevLabel = outLabel;
  }

  if (filterParts.length > 0) {
    args.push("-filter_complex", filterParts.join(";"));
    args.push("-map", "[vout]");
  }

  args.push(
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-r", String(fps),
    "-crf", "23",
    outputPath,
  );

  await execFileAsync(ffmpegPath, args, { timeout: 300_000 }); // 5 min timeout
}

/* ---------- Render with concat demuxer (no transitions, for large canvases) ---------- */

async function renderWithConcat(
  ffmpegPath: string,
  framePngs: string[],
  frames: CanvasFrame[],
  outputPath: string,
  tempDir: string,
  width: number,
  height: number,
  fps: number,
): Promise<void> {
  // Create concat list file
  const concatLines: string[] = [];
  for (let i = 0; i < framePngs.length; i++) {
    const durationS = (frames[i].durationMs || DEFAULT_FRAME_DURATION_MS) / 1000;
    // Escape single quotes in file paths for ffmpeg concat format
    const safePath = framePngs[i].replace(/'/g, "'\\''");
    concatLines.push(`file '${safePath}'`);
    concatLines.push(`duration ${durationS}`);
  }
  // Repeat last file for ffmpeg concat demuxer (required for last frame duration)
  if (framePngs.length > 0) {
    const lastPath = framePngs[framePngs.length - 1].replace(/'/g, "'\\''");
    concatLines.push(`file '${lastPath}'`);
  }

  const concatFile = path.join(tempDir, "concat.txt");
  await fs.writeFile(concatFile, concatLines.join("\n"), "utf-8");

  await execFileAsync(
    ffmpegPath,
    [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatFile,
      "-vf", `scale=${width}:${height}`,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-r", String(fps),
      "-crf", "23",
      outputPath,
    ],
    { timeout: 300_000 }, // 5 min timeout
  );
}
