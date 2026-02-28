// KACHERI BACKEND/src/jobs/workers/canvasExportWorker.ts
// D2+D3+D4+D8: Canvas export job worker — processes pending canvas export records.
//
// Dispatches to format-specific renderers (htmlBundle, htmlStandalone, png, svg, pdf, pptx, mp4).

import path from "node:path";
import { promises as fs } from "node:fs";
import type { Job } from "../types";
import type { CanvasExportPayload, CanvasExportResult } from "../types";
import { CanvasExportStore } from "../../store/canvasExports";
import type { ExportFormat } from "../../store/canvasExports";
import { CanvasStore } from "../../store/canvases";
import { CanvasFrameStore } from "../../store/canvasFrames";
import { config } from "../../config";
import { ensureDir, sha256Hex } from "../../utils/fs";
import { newProofPacket, writeProofPacket } from "../../utils/proofs";
import { recordProof } from "../../provenanceStore";
import { createAndDeliverNotification } from "../../store/notifications";
import { broadcastToUser } from "../../realtime/globalHub";

// Renderers
import { renderHtmlBundle } from "./exportRenderers/htmlBundle";
import { renderHtmlStandalone } from "./exportRenderers/htmlStandalone";
import { renderPng } from "./exportRenderers/png";
import { renderSvg } from "./exportRenderers/svg";
import { renderPdf } from "./exportRenderers/pdf";
import { renderPptx } from "./exportRenderers/pptx";
import { renderMp4 } from "./exportRenderers/mp4";

/* ---------- Export Directory ---------- */

function exportDir(canvasId: string): string {
  return path.join(config.storage.exports, `canvas-${canvasId}`);
}

/* ---------- Main Job Handler ---------- */

export async function canvasExportJob(
  job: Job<CanvasExportPayload>
): Promise<CanvasExportResult> {
  const { exportId, canvasId, format, workspaceId } = job.payload;

  // Fetch export record
  const exportRecord = await CanvasExportStore.getById(exportId);
  if (!exportRecord) {
    throw new Error(`Export record not found: ${exportId}`);
  }

  // Mark as processing
  await CanvasExportStore.updateStatus(exportId, { status: "processing" });

  try {
    // Fetch canvas and frames
    const canvas = await CanvasStore.getById(canvasId);
    if (!canvas) {
      throw new Error(`Canvas not found: ${canvasId}`);
    }

    const frames = await CanvasFrameStore.getByCanvas(canvasId);
    if (frames.length === 0) {
      throw new Error(`Canvas has no frames: ${canvasId}`);
    }

    const canvasTitle = canvas.title || "Untitled Canvas";
    const kclVersion = canvas.kclVersion || "1.0.0";

    // Dispatch to renderer
    let buffer: Buffer;
    let filename: string;

    switch (format as ExportFormat) {
      case "html_bundle": {
        const result = await renderHtmlBundle({ canvasTitle, kclVersion, frames, compositionMode: canvas.compositionMode });
        buffer = result.buffer;
        filename = result.filename;
        break;
      }
      case "html_standalone": {
        const result = await renderHtmlStandalone({ canvasTitle, kclVersion, frames, compositionMode: canvas.compositionMode });
        buffer = result.buffer;
        filename = result.filename;
        break;
      }
      case "png": {
        const result = await renderPng({ canvasTitle, kclVersion, frames });
        buffer = result.buffer;
        filename = result.filename;
        break;
      }
      case "svg": {
        const result = await renderSvg({ canvasTitle, kclVersion, frames });
        buffer = result.buffer;
        filename = result.filename;
        break;
      }
      case "pdf": {
        const includeNotes = !!(exportRecord.metadata as Record<string, unknown> | null)?.includeNotes;
        const result = await renderPdf({ canvasTitle, kclVersion, frames, includeNotes, compositionMode: canvas.compositionMode });
        buffer = result.buffer;
        filename = result.filename;
        break;
      }
      case "pptx": {
        const result = await renderPptx({ canvasTitle, kclVersion, frames, compositionMode: canvas.compositionMode });
        buffer = result.buffer;
        filename = result.filename;
        break;
      }
      case "mp4": {
        const meta = exportRecord.metadata as Record<string, unknown> | null;
        const result = await renderMp4({
          canvasTitle,
          kclVersion,
          frames,
          width: (meta?.width as number) || undefined,
          height: (meta?.height as number) || undefined,
          fps: (meta?.fps as number) || undefined,
          transitionDurationMs: (meta?.transitionDurationMs as number) || undefined,
        });
        buffer = result.buffer;
        filename = result.filename;
        break;
      }
      default:
        throw new Error(`Export format not yet implemented: ${format}`);
    }

    // Write export file to storage
    const dir = exportDir(canvasId);
    await ensureDir(dir);
    const filePath = path.join(dir, `${exportId}-${filename}`);
    await fs.writeFile(filePath, buffer);

    const fileSize = buffer.length;
    const fileHash = sha256Hex(buffer);

    // Create proof packet
    const packet = newProofPacket(
      "design:export",
      { type: "system" },
      { canvasId, format, frameCount: frames.length, kclVersion },
      { exportId, filePath, fileSize, hash: `sha256:${fileHash}` }
    );
    const proofPath = await writeProofPacket(packet);

    // Record proof in DB
    const proofRow = await recordProof({
      doc_id: "",
      kind: "design:export",
      hash: `sha256:${fileHash}`,
      path: filePath,
      meta: {
        proofFile: proofPath,
        canvasId,
        format,
        exportId,
        workspaceId,
        frameCount: frames.length,
      },
    });

    // Update export record to completed
    await CanvasExportStore.updateStatus(exportId, {
      status: "completed",
      filePath,
      fileSize,
      proofId: proofRow.id,
    });

    console.log(
      `[canvasExport] Export ${exportId} completed: ${format}, ${fileSize} bytes, proof ${proofRow.id}`
    );

    // Notification: export complete (E3)
    const triggeredBy = job.userId;
    if (triggeredBy && workspaceId) {
      try {
        const exportNotification = await createAndDeliverNotification({
          userId: triggeredBy,
          workspaceId,
          type: "export_complete",
          title: "Canvas export complete",
          body: `${format.toUpperCase()} export of "${canvasTitle}" is ready`,
          linkType: "canvas",
          linkId: canvasId,
          actorId: triggeredBy,
        });
        if (exportNotification) {
          broadcastToUser(triggeredBy, {
            type: "notification",
            notificationId: exportNotification.id,
            userId: triggeredBy,
            notificationType: "export_complete",
            title: exportNotification.title,
            ts: Date.now(),
          } as any);
        }
      } catch { /* non-fatal */ }
    }

    return {
      exportId,
      format,
      filePath,
      fileSize,
      proofId: proofRow.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[canvasExport] Export ${exportId} failed:`, message);

    // Update export record to failed
    await CanvasExportStore.updateStatus(exportId, {
      status: "failed",
      errorMessage: message,
    });

    throw err;
  }
}

/* ---------- Worker Registration ---------- */

export function registerCanvasExportWorkers(
  registerHandler: (type: string, handler: (job: Job) => Promise<unknown>) => void
): void {
  registerHandler(
    "canvas:export",
    canvasExportJob as (job: Job) => Promise<unknown>
  );
}
