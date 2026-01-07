import type { FastifyPluginAsync } from 'fastify';
import path from 'node:path';
import { createHash, type BinaryLike } from 'node:crypto';

import {
  stableDocxDir,
  newProofPacket,
  writeProofPacket,
  recordProvenanceIfProvided,
  type ProvenanceRecorder,
} from '../utils/proofs';
import { ensureDir, writeFileAtomic } from '../utils/fs';
import { recordProof } from '../provenanceStore';
import { getDocLayout, DEFAULT_LAYOUT_SETTINGS } from '../store/docs';

interface ExportBody {
  html?: string;
  filenameHint?: string;
}

/** Safe filename characters for user-provided hints. */
const FILENAME_SAFE_RE = /^[a-zA-Z0-9._-]+$/;

function sha256Hex(data: BinaryLike) {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Very small helper: treat whatever the docs service gives us as a body fragment
 * and wrap it in a minimal HTML shell with some table/list styles.
 *
 * This keeps the *content* exactly the same while giving html-to-docx a
 * better-structured DOM to work with, so tables/lists don’t collapse into
 * “a dump of words” as easily in the exported DOCX.
 */
function wrapHtmlForDocx(raw: string): string {
  const html = String(raw ?? '');

  // Minimal CSS focused on structural fidelity, not branding.
  const styleBlock = `
<style>
  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
  }
  table {
    border-collapse: collapse;
    border-spacing: 0;
  }
  th, td {
    border: 1px solid #999;
    padding: 4px 6px;
    vertical-align: top;
  }
  thead th {
    background: #f2f2f2;
  }
  ul, ol {
    margin: 0 0 0 1.5em;
    padding: 0;
  }
  p {
    margin: 0 0 8px 0;
  }
</style>`.trim();

  // If caller already gave us a full HTML document, just inject styles.
  if (/<html[\s>]/i.test(html)) {
    if (/<head[\s>]/i.test(html)) {
      return html.replace(/<head([^>]*)>/i, `<head$1>\n${styleBlock}\n`);
    }
    // No <head>, but <html> present → add one.
    return html.replace(
      /<html([^>]*)>/i,
      `<html$1><head>\n${styleBlock}\n</head>`
    );
  }

  // Most of the time we get a body fragment from the editor; wrap it.
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    styleBlock,
    '</head>',
    '<body>',
    html,
    '</body>',
    '</html>',
  ].join('\n');
}

/**
 * Preprocess HTML to convert Kacheri-specific elements into Word-compatible format.
 *
 * - Page breaks: Convert to Word-style page break paragraphs
 * - Section breaks: Remove (visual-only in pilot)
 * - Column sections: Unwrap (html-to-docx doesn't support CSS columns)
 */
function preprocessHtmlForDocx(html: string): string {
  let result = html;

  // Convert page breaks to Word-compatible format
  // Match: <div class="kacheri-page-break" data-type="page-break"></div>
  result = result.replace(
    /<div[^>]*class="[^"]*kacheri-page-break[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    '<p style="page-break-after: always;">&nbsp;</p>'
  );

  // Remove section breaks (visual-only markers, no Word equivalent needed for pilot)
  result = result.replace(
    /<div[^>]*class="[^"]*kacheri-section-break[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    ''
  );

  // Unwrap column sections (html-to-docx doesn't support CSS columns)
  // Keep the content, remove the wrapper
  result = result.replace(
    /<div[^>]*class="[^"]*kacheri-columns[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    '$1'
  );

  return result;
}

async function resolveHtmlForDoc(
  fastify: any,
  docId: string,
  body: ExportBody
): Promise<string> {
  // Explicit HTML from caller wins (used by frontend export button).
  if (body?.html && typeof body.html === 'string') {
    return body.html;
  }

  // Otherwise ask the docs service for canonical HTML for this doc.
  const svc = (fastify as any).docs;
  if (svc?.getHtml) {
    const html: string = await svc.getHtml(docId);
    if (html) return html;
  }

  throw new Error('No HTML provided and no doc HTML resolver available');
}

export const exportDocxRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string }; Body: ExportBody }>(
    '/docs/:id/export/docx',
    async (req, reply) => {
      const { id: docId } = req.params;
      const body = req.body ?? {};

      // 1) Resolve HTML for this doc (direct body or docs service).
      let html: string;
      try {
        html = await resolveHtmlForDoc(fastify, docId, body);
      } catch (e: any) {
        return reply
          .code(400)
          .send({ error: e?.message ?? 'Unable to resolve HTML' });
      }

      // Preprocess HTML to convert Kacheri-specific elements (page breaks,
      // section breaks, columns) into Word-compatible format.
      const preprocessedHtml = preprocessHtmlForDocx(html);

      // Wrap in a minimal HTML shell with table/list styles.
      const htmlForDocx = wrapHtmlForDocx(preprocessedHtml);

      // Get layout settings for this document
      const layout = getDocLayout(docId) ?? DEFAULT_LAYOUT_SETTINGS;

      // Page size dimensions in twips (1 inch = 1440 twips, 1mm = 56.7 twips)
      const MM_TO_TWIPS = 56.7;
      const pageSizes: Record<string, { width: number; height: number }> = {
        a4: { width: 210, height: 297 },
        letter: { width: 216, height: 279 },
        legal: { width: 216, height: 356 },
      };
      const size = pageSizes[layout.pageSize] || pageSizes.a4;
      const isLandscape = layout.orientation === 'landscape';

      // 2) Convert HTML → DOCX using html-to-docx (dynamic import keeps ESM happy).
      let buffer: Buffer;
      try {
        const mod: any = await import('html-to-docx');
        const htmlToDocx =
          (mod && (mod.default || mod)) as (h: string, headerHtml?: string | null, options?: any) => Promise<Buffer>;

        if (typeof htmlToDocx !== 'function') {
          throw new Error('html-to-docx module did not export a function');
        }

        // Build options for html-to-docx
        const docxOptions: Record<string, any> = {
          orientation: layout.orientation,
          pageSize: {
            width: Math.round((isLandscape ? size.height : size.width) * MM_TO_TWIPS),
            height: Math.round((isLandscape ? size.width : size.height) * MM_TO_TWIPS),
          },
          margins: {
            top: Math.round(layout.margins.top * MM_TO_TWIPS),
            bottom: Math.round(layout.margins.bottom * MM_TO_TWIPS),
            left: Math.round(layout.margins.left * MM_TO_TWIPS),
            right: Math.round(layout.margins.right * MM_TO_TWIPS),
          },
        };

        // Build header HTML if enabled
        let headerHtml: string | null = null;
        if (layout.header?.enabled && layout.header.content) {
          headerHtml = `<div style="text-align: center; font-size: 10pt;">${layout.header.content}</div>`;
          docxOptions.header = true;
        }

        // Build footer HTML if enabled
        // Note: html-to-docx doesn't have great footer support, but we can try
        if (layout.footer?.enabled) {
          docxOptions.footer = true;
          // Build footer content with page numbers if requested
          let footerContent = layout.footer.content || '';
          if (layout.footer.showPageNumbers) {
            // Add page number placeholder (html-to-docx may or may not support this)
            footerContent += footerContent ? ' — ' : '';
            footerContent += 'Page {PAGE} of {NUMPAGES}';
          }
          if (footerContent) {
            // html-to-docx uses the third parameter for footer in some versions
            docxOptions.footerHTMLString = `<div style="text-align: center; font-size: 10pt;">${footerContent}</div>`;
          }
        }

        // Note: html-to-docx may have different API depending on version
        // Try with options first, fallback to simple call
        try {
          buffer = await htmlToDocx(htmlForDocx, headerHtml, docxOptions);
        } catch {
          // Fallback: some versions may not support all options
          buffer = await htmlToDocx(htmlForDocx);
        }
      } catch (err: any) {
        try {
          (fastify.log as any)?.error?.(
            { err },
            'exportDocx: html-to-docx conversion failed'
          );
        } catch {
          /* ignore logging errors */
        }

        return reply.code(500).send({
          error: 'DOCX export failed',
          detail: String(err?.message || err),
        });
      }

      // 3) Persist DOCX to the stable exports directory.
      const dir = stableDocxDir(docId);
      await ensureDir(dir);

      const ts = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d+Z$/, 'Z');

      const base =
        body.filenameHint && FILENAME_SAFE_RE.test(body.filenameHint)
          ? body.filenameHint
          : `doc-${docId}-${ts}`;

      const filename = `${base}.docx`;
      const full = path.join(dir, filename);

      await writeFileAtomic(full, buffer);

      // 4) Proof packet (file + originating HTML) → on-disk JSON.
      const htmlHash = 'sha256:' + sha256Hex(Buffer.from(htmlForDocx));
      const fileHash = 'sha256:' + sha256Hex(buffer);

      const packet = newProofPacket(
        'export:docx',
        { type: 'system' },
        {
          docId,
          filename,
          bytes: buffer.length,
          htmlHash,
        },
        { exportPath: full },
        docId
      );

      const proofPath = await writeProofPacket(packet);

      // 5) Bridge to provenance if the recorder is present on the Fastify instance.
      const provenanceRecorder = (fastify as any)
        .provenance?.record as ProvenanceRecorder | undefined;

      await recordProvenanceIfProvided(provenanceRecorder, packet);

      // 6) Normalize into proofs table so /docs/:id/exports lists DOCX alongside PDF.
      await recordProof({
        doc_id: docId,
        kind: 'docx',
        hash: fileHash,
        path: full,
        meta: {
          proofFile: proofPath,
          filename,
          bytes: buffer.length,
          input: { htmlHash },
        },
      });

      // 7) Response shape kept identical to the existing implementation.
      return reply.code(200).send({
        docId,
        ok: true,
        file: {
          filename,
          bytes: buffer.length,
          path: full,
          hash: fileHash,
        },
        proof: {
          id: packet.id,
          path: proofPath,
          timestamp: packet.timestamp,
        },
      });
    }
  );
};

export default exportDocxRoutes;
