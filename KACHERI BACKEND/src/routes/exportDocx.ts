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
import { checkDocAccess } from '../workspace/middleware';
import { ComplianceChecksStore } from '../store/complianceChecks';
import { db } from '../db';
import { wordFieldSwitch, type PageNumberFormat } from '../utils/pageNumberFormat';
import JSZip from 'jszip';
import { getStorage } from '../storage';

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
 * Parse column width ratios from a colon-separated string (e.g. "2:1" → [66.7, 33.3]).
 * Returns null if invalid or missing.
 */
function parseColumnWidths(widths: string | null, colCount: number): number[] | null {
  if (!widths) return null;
  const parts = widths.split(':').map((p) => parseFloat(p.trim()));
  if (parts.length < 2 || parts.some((n) => isNaN(n) || n <= 0)) return null;
  const total = parts.reduce((a, b) => a + b, 0);
  return parts.map((p) => Math.round((p / total) * 1000) / 10);
}

/**
 * Convert a kacheri-columns block to an HTML table for DOCX export.
 *
 * CSS column-count creates flowing newspaper-style columns that html-to-docx
 * cannot render. We convert to an HTML table with N cells, distributing child
 * block elements across cells sequentially. This gives a reasonable visual
 * approximation in Word, though content distribution will differ from the
 * CSS column-count flow in the editor.
 */
function convertColumnsToTable(block: string): string {
  // Extract attributes from the opening tag
  const colCountMatch = block.match(/data-columns="(\d+)"/);
  const widthsMatch = block.match(/data-column-widths="([^"]+)"/);
  const gapMatch = block.match(/data-column-gap="([^"]+)"/);

  const colCount = colCountMatch ? parseInt(colCountMatch[1], 10) : 2;
  const widthsStr = widthsMatch ? widthsMatch[1] : null;
  const gap = gapMatch ? gapMatch[1] : 'medium';

  // Extract inner content (everything between opening and closing div tags)
  const innerMatch = block.match(/<div[^>]*>([\s\S]*)<\/div>\s*$/i);
  if (!innerMatch) return block;
  const innerHtml = innerMatch[1].trim();

  // Split inner HTML into top-level block elements
  const children: string[] = [];
  let depth = 0;
  let current = '';
  // Simple tag-based splitter: accumulate until we close back to depth 0
  const tagRe = /<\/?([a-z][a-z0-9]*)\b[^>]*\/?>/gi;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  // Track positions of top-level tag boundaries
  const tokens = innerHtml;
  tagRe.lastIndex = 0;
  while ((m = tagRe.exec(tokens)) !== null) {
    const isClosing = m[0][1] === '/';
    const isSelfClosing = m[0].endsWith('/>');
    if (!isClosing && !isSelfClosing) {
      if (depth === 0) {
        // Flush any text before this tag
        const textBefore = tokens.slice(lastIndex, m.index).trim();
        if (textBefore) children.push(`<p>${textBefore}</p>`);
        lastIndex = m.index;
      }
      depth++;
    } else if (isClosing) {
      depth--;
      if (depth === 0) {
        children.push(tokens.slice(lastIndex, tagRe.lastIndex).trim());
        lastIndex = tagRe.lastIndex;
      }
    } else if (isSelfClosing && depth === 0) {
      const textBefore = tokens.slice(lastIndex, m.index).trim();
      if (textBefore) children.push(`<p>${textBefore}</p>`);
      children.push(m[0]);
      lastIndex = tagRe.lastIndex;
    }
  }
  // Any trailing text
  const trailing = tokens.slice(lastIndex).trim();
  if (trailing) children.push(`<p>${trailing}</p>`);

  // If no children parsed, fall back to unwrap
  if (children.length === 0) return innerHtml;

  // Distribute children across columns (round-robin)
  const cols: string[][] = Array.from({ length: colCount }, () => []);
  for (let i = 0; i < children.length; i++) {
    cols[i % colCount].push(children[i]);
  }

  // Compute cell widths
  const widths = parseColumnWidths(widthsStr, colCount);
  const gapPx = gap === 'narrow' ? 8 : gap === 'wide' ? 24 : 16;

  // Build table HTML
  let tableHtml = `<table style="width:100%; border-collapse:collapse; table-layout:fixed;"><tr>`;
  for (let c = 0; c < colCount; c++) {
    const w = widths ? `${widths[c]}%` : `${Math.round(100 / colCount)}%`;
    const padStyle = c < colCount - 1 ? `padding-right:${gapPx}px;` : '';
    tableHtml += `<td style="width:${w}; vertical-align:top; ${padStyle}">${cols[c].join('')}</td>`;
  }
  tableHtml += `</tr></table>`;
  return tableHtml;
}

/**
 * Preprocess HTML to convert Kacheri-specific elements into Word-compatible format.
 *
 * - Page breaks: Convert to Word-style page break paragraphs
 * - Section breaks: Remove or convert to page breaks
 * - Column sections: Convert to HTML tables for multi-column DOCX layout
 */
function preprocessHtmlForDocx(html: string, sectionResetPageNumbers = false): string {
  let result = html;

  // Convert page breaks to Word-compatible format
  // Match: <div class="kacheri-page-break" data-type="page-break"></div>
  result = result.replace(
    /<div[^>]*class="[^"]*kacheri-page-break[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    '<p style="page-break-after: always;">&nbsp;</p>'
  );

  if (sectionResetPageNumbers) {
    // When section-based page number reset is enabled, replace section breaks
    // with unique marker text. postProcessDocxSectionBreaks() (Slice A4) will
    // find these markers in the DOCX XML and replace them with proper Word
    // section breaks (<w:sectPr>) that restart page numbering.
    result = result.replace(
      /<div[^>]*class="[^"]*kacheri-section-break[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
      '<p>KACHERI_SECT_BRK</p>'
    );
  } else {
    // Remove section breaks (visual-only markers, no Word equivalent needed)
    result = result.replace(
      /<div[^>]*class="[^"]*kacheri-section-break[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
      ''
    );
  }

  // Convert column sections to HTML tables for multi-column DOCX layout.
  // html-to-docx doesn't support CSS column-count, so we distribute child
  // elements across table cells for a visual approximation.
  const colRe = /<div[^>]*class="[^"]*kacheri-columns[^"]*"[^>]*>[\s\S]*?<\/div>/gi;
  // Process last-to-first to preserve string indices
  const colMatches: { start: number; end: number; match: string }[] = [];
  let cm: RegExpExecArray | null;
  colRe.lastIndex = 0;
  while ((cm = colRe.exec(result)) !== null) {
    // The regex [\s\S]*? is non-greedy — we need to find the balanced closing </div>
    const fullBlock = extractBalancedDiv(result, cm.index);
    if (fullBlock) {
      colMatches.push({ start: cm.index, end: cm.index + fullBlock.length, match: fullBlock });
      // Advance past this block to avoid re-matching nested divs
      colRe.lastIndex = cm.index + fullBlock.length;
    }
  }
  // Replace last-to-first for index stability
  for (let i = colMatches.length - 1; i >= 0; i--) {
    const { start, end, match } = colMatches[i];
    const replacement = convertColumnsToTable(match);
    result = result.slice(0, start) + replacement + result.slice(end);
  }

  return result;
}

/**
 * Extract a balanced <div ...>...</div> block starting at `startIdx` in `html`.
 * Returns the full block string or null if unbalanced.
 */
function extractBalancedDiv(html: string, startIdx: number): string | null {
  let depth = 0;
  // Find all div open/close tags after startIdx and track depth
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = startIdx;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    if (m[0].startsWith('</div')) {
      depth--;
      if (depth === 0) {
        return html.slice(startIdx, m.index + m[0].length);
      }
    } else {
      depth++;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Legal numbering & alternative style preprocessing for DOCX export
// ---------------------------------------------------------------------------
// Page number format conversion utilities (toLowerAlpha, toUpperAlpha,
// toLowerRoman, toUpperRoman, formatPageNumber, wordFieldSwitch) are in
// ../utils/pageNumberFormat.ts — used by Slice A3+ for format-aware exports.
// ---------------------------------------------------------------------------

/**
 * Preprocess list numbering for DOCX export.
 *
 * html-to-docx does not understand CSS counters (legal-numbering) or
 * non-standard list-style-type values set via class.  This function:
 *
 * 1. For `numbering-{alpha,roman}-*` classes → converts to inline
 *    `list-style-type` that html-to-docx *may* pick up, plus injects
 *    visible text fallback.
 * 2. For `legal-numbering` class → walks the nested OL/LI tree,
 *    computes hierarchical numbers (1.2.3), and injects them as visible
 *    text so the DOCX renders correctly.
 */
function preprocessLegalNumbering(html: string): string {
  let result = html;

  // --- Alternative styles: inject inline list-style-type ---
  const altStyleMap: Record<string, string> = {
    'numbering-alpha-lower': 'lower-alpha',
    'numbering-alpha-upper': 'upper-alpha',
    'numbering-roman-lower': 'lower-roman',
    'numbering-roman-upper': 'upper-roman',
  };

  for (const [cls, cssType] of Object.entries(altStyleMap)) {
    // Replace class="numbering-xxx" with style="list-style-type: ..."
    const classRe = new RegExp(
      `(<ol[^>]*?)\\bclass="[^"]*?\\b${cls}\\b[^"]*?"`,
      'gi',
    );
    result = result.replace(classRe, `$1style="list-style-type: ${cssType}"`);
  }

  // --- Legal numbering: inject visible number text ---
  result = injectLegalNumbers(result);

  return result;
}

/**
 * Walk legal-numbering OL/LI blocks and prepend hierarchical numbers
 * as visible <span> text to each <li>.
 *
 * This uses a simple state-machine approach over the HTML string, which
 * is consistent with how preprocessHtmlForDocx() handles page breaks
 * and columns.  The HTML comes from TipTap so it is well-structured.
 */
function injectLegalNumbers(html: string): string {
  // Find each top-level <ol with legal-numbering class
  const legalRe = /<ol[^>]*class="[^"]*legal-numbering[^"]*"[^>]*>/gi;

  // Collect all match positions
  const matches: { index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = legalRe.exec(html)) !== null) {
    matches.push({ index: m.index });
  }

  if (matches.length === 0) return html;

  // Process each legal-numbering block from last to first (to preserve indices)
  let result = html;
  for (let mi = matches.length - 1; mi >= 0; mi--) {
    const startIdx = matches[mi].index;
    const blockEnd = findClosingTag(result, startIdx, 'ol');
    if (blockEnd === -1) continue;

    const block = result.substring(startIdx, blockEnd);
    const processed = processLegalBlock(block);

    result = result.substring(0, startIdx) + processed + result.substring(blockEnd);
  }

  return result;
}

/**
 * Find the index just past the closing tag for an element starting at `start`.
 * Handles nesting of the same tag.
 */
function findClosingTag(html: string, start: number, tag: string): number {
  const openRe = new RegExp(`<${tag}[\\s>]`, 'gi');
  const closeRe = new RegExp(`</${tag}>`, 'gi');
  let depth = 0;
  let i = start;

  // Skip past the opening tag
  const firstClose = html.indexOf('>', i);
  if (firstClose === -1) return -1;
  depth = 1;
  i = firstClose + 1;

  while (i < html.length && depth > 0) {
    openRe.lastIndex = i;
    closeRe.lastIndex = i;

    const openMatch = openRe.exec(html);
    const closeMatch = closeRe.exec(html);

    if (!closeMatch) return -1; // malformed

    if (openMatch && openMatch.index < closeMatch.index) {
      depth++;
      i = openMatch.index + openMatch[0].length;
    } else {
      depth--;
      if (depth === 0) {
        return closeMatch.index + closeMatch[0].length;
      }
      i = closeMatch.index + closeMatch[0].length;
    }
  }

  return -1;
}

/**
 * Process a single legal-numbering OL block.
 * Walks nested OL/LI, tracks counter stack, injects number text.
 */
function processLegalBlock(block: string): string {
  const counters: number[] = [0]; // stack of counters per nesting level
  let result = '';
  let i = 0;

  // Remove legal-numbering class and add list-style:none so numbers don't double
  const headerEnd = block.indexOf('>');
  let header = block.substring(0, headerEnd + 1);
  header = header.replace(/class="[^"]*legal-numbering[^"]*"/, 'style="list-style-type: none; padding-left: 0"');
  result += header;
  i = headerEnd + 1;

  // Simple token-based walk
  while (i < block.length) {
    // Look for next tag
    const tagStart = block.indexOf('<', i);
    if (tagStart === -1) {
      result += block.substring(i);
      break;
    }

    // Copy text before this tag
    result += block.substring(i, tagStart);

    // Determine tag type
    const tagEnd = block.indexOf('>', tagStart);
    if (tagEnd === -1) {
      result += block.substring(tagStart);
      break;
    }

    const tag = block.substring(tagStart, tagEnd + 1);
    const tagLower = tag.toLowerCase();

    if (tagLower.startsWith('<ol')) {
      // Nested OL: push a new counter level, strip any legal-numbering class
      counters.push(0);
      const cleaned = tag.replace(
        /class="[^"]*"/,
        'style="list-style-type: none; padding-left: 1.5em"',
      );
      result += cleaned;
    } else if (tagLower === '</ol>') {
      counters.pop();
      result += tag;
    } else if (tagLower.startsWith('<li')) {
      // Increment current level counter
      counters[counters.length - 1]++;
      // Build hierarchical number string
      const numStr = counters.join('.');
      // Inject the tag, then the number prefix
      result += tag;
      result += `<span style="font-weight:500; margin-right:0.4em">${numStr}</span>`;
    } else {
      result += tag;
    }

    i = tagEnd + 1;
  }

  return result;
}

// ---------------------------------------------------------------------------
// DOCX XML post-processing for page number format and startAt (Slice A3)
// ---------------------------------------------------------------------------

/** Map our PageNumberFormat names to Word's w:fmt attribute values. */
const WORD_NUM_FMT: Record<PageNumberFormat, string> = {
  decimal: 'decimal',
  lowerRoman: 'lowerRoman',
  upperRoman: 'upperRoman',
  lowerAlpha: 'lowerLetter',
  upperAlpha: 'upperLetter',
};

/**
 * Post-process a DOCX buffer to apply page number format switches and startAt.
 *
 * html-to-docx converts {PAGE} tokens to <w:fldSimple w:instr=" PAGE ">
 * but does not support format switches (e.g., \* Roman) or pgNumType.
 * We unzip the DOCX, patch the XML, and rezip.
 */
async function postProcessDocxPageNumbers(
  docxBuffer: Buffer,
  format: PageNumberFormat,
  startAt?: number,
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(docxBuffer);

  const fmtSwitch = wordFieldSwitch(format);

  // --- Patch header/footer XML files: add format switch to PAGE field codes ---
  if (fmtSwitch) {
    const hfFiles = zip.file(/^word\/(header|footer)\d*\.xml$/);
    for (const entry of hfFiles) {
      let xml = await entry.async('string');
      // Match w:instr attributes containing PAGE (with varying whitespace)
      // e.g., w:instr=" PAGE " → w:instr=" PAGE \* Roman "
      xml = xml.replace(
        /w:instr="(\s*PAGE\s*)"/gi,
        `w:instr="$1${fmtSwitch} "`,
      );
      zip.file(entry.name, xml);
    }
  }

  // --- Patch document.xml: add <w:pgNumType> to <w:sectPr> ---
  const needsPgNumType = fmtSwitch || (startAt != null && startAt >= 1);
  if (needsPgNumType) {
    const docEntry = zip.file('word/document.xml');
    if (docEntry) {
      let docXml = await docEntry.async('string');

      // Build pgNumType attributes
      const attrs: string[] = [];
      if (fmtSwitch) {
        attrs.push(`w:fmt="${WORD_NUM_FMT[format]}"`);
      }
      if (startAt != null && startAt >= 1) {
        attrs.push(`w:start="${startAt}"`);
      }
      const pgNumTypeTag = `<w:pgNumType ${attrs.join(' ')}/>`;

      // Replace existing <w:pgNumType.../> if present, otherwise insert before </w:sectPr>
      if (/<w:pgNumType\b/.test(docXml)) {
        docXml = docXml.replace(
          /<w:pgNumType[^/]*\/>/g,
          pgNumTypeTag,
        );
      } else {
        // Insert before the first </w:sectPr> (document-level section properties)
        docXml = docXml.replace(
          /<\/w:sectPr>/,
          `${pgNumTypeTag}</w:sectPr>`,
        );
      }

      zip.file('word/document.xml', docXml);
    }
  }

  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}

/**
 * Post-process a DOCX buffer to convert KACHERI_SECT_BRK marker paragraphs
 * into proper Word section breaks with page numbering restart (Slice A4).
 *
 * Each marker becomes a <w:sectPr> inside <w:pPr>, which tells Word
 * "the section ending at this paragraph has these properties".
 * The first section uses the user's startAt; subsequent sections restart at 1.
 */
async function postProcessDocxSectionBreaks(
  docxBuffer: Buffer,
  format: PageNumberFormat,
  startAt?: number,
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(docxBuffer);

  const docEntry = zip.file('word/document.xml');
  if (!docEntry) return docxBuffer;
  let docXml = await docEntry.async('string');

  // Check if any markers exist
  if (!docXml.includes('KACHERI_SECT_BRK')) return docxBuffer;

  // --- Extract document-level <w:sectPr> properties to copy into inline sections ---
  const docSectPrMatch = docXml.match(/<w:sectPr\b[^>]*>([\s\S]*?)<\/w:sectPr>\s*<\/w:body>/);
  if (!docSectPrMatch) return docxBuffer;
  const docSectPrInner = docSectPrMatch[1];

  // Extract key properties from document-level section
  const pgSz = docSectPrInner.match(/<w:pgSz[^/]*\/>/)?.[0] ?? '';
  const pgMar = docSectPrInner.match(/<w:pgMar[^/]*\/>/)?.[0] ?? '';
  const headerRefs = [...docSectPrInner.matchAll(/<w:headerReference[^/]*\/>/g)].map(m => m[0]);
  const footerRefs = [...docSectPrInner.matchAll(/<w:footerReference[^/]*\/>/g)].map(m => m[0]);

  // Build pgNumType attributes for section restarts
  const fmtAttr = format !== 'decimal' ? ` w:fmt="${WORD_NUM_FMT[format]}"` : '';

  // --- Replace each marker paragraph with a section-break paragraph ---
  // Match <w:p> elements containing the marker text
  const markerRe = /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?KACHERI_SECT_BRK(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g;
  let matchIdx = 0;
  docXml = docXml.replace(markerRe, () => {
    // Section 1 (first break, idx=0) uses user's startAt; subsequent sections restart at 1
    const sectionStart = matchIdx === 0 && startAt != null && startAt >= 1
      ? startAt
      : 1;
    matchIdx++;

    const sectPrContent = [
      '<w:type w:val="nextPage"/>',
      pgSz,
      pgMar,
      ...headerRefs,
      ...footerRefs,
      `<w:pgNumType w:start="${sectionStart}"${fmtAttr}/>`,
    ].filter(Boolean).join('');

    return `<w:p><w:pPr><w:sectPr>${sectPrContent}</w:sectPr></w:pPr></w:p>`;
  });

  // --- Update document-level <w:sectPr> to restart at 1 (last section) ---
  // Replace or insert pgNumType in the document-level sectPr
  const lastSectPgNum = `<w:pgNumType w:start="1"${fmtAttr}/>`;
  if (/<w:pgNumType\b/.test(docSectPrMatch[0])) {
    // Replace existing pgNumType in document-level sectPr (set by A3)
    docXml = docXml.replace(
      /(<w:sectPr\b[^>]*>[\s\S]*?)<w:pgNumType[^/]*\/>([\s\S]*?<\/w:sectPr>\s*<\/w:body>)/,
      `$1${lastSectPgNum}$2`,
    );
  } else {
    // Insert pgNumType before </w:sectPr></w:body>
    docXml = docXml.replace(
      /(<\/w:sectPr>\s*<\/w:body>)/,
      `${lastSectPgNum}$1`,
    );
  }

  zip.file('word/document.xml', docXml);
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
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
      if (!checkDocAccess(db, req, reply, docId, 'viewer')) return;
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

      // Get layout settings early so section-reset flag is available for preprocessing
      const layout = (await getDocLayout(docId)) ?? DEFAULT_LAYOUT_SETTINGS;
      const sectionResetPageNumbers = layout.footer?.sectionResetPageNumbers ?? false;

      // Preprocess HTML to convert Kacheri-specific elements (page breaks,
      // section breaks, columns) into Word-compatible format.
      const preprocessedHtml = preprocessHtmlForDocx(html, sectionResetPageNumbers);

      // Convert legal numbering and alternative list styles into
      // DOCX-compatible inline text (CSS counters don't survive html-to-docx).
      const numberingProcessed = preprocessLegalNumbering(preprocessedHtml);

      // Wrap in a minimal HTML shell with table/list styles.
      const htmlForDocx = wrapHtmlForDocx(numberingProcessed);

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
          let footerAlign = 'center'; // default alignment

          if (layout.footer.showPageNumbers) {
            const pos = layout.footer.pageNumberPosition ?? 'footer-center';
            const fmt = layout.footer.pageNumberFormat ?? 'decimal';
            const startAt = layout.footer.pageNumberStartAt;

            // Build page number text with format label
            const fmtLabels: Record<string, string> = {
              decimal: 'Page {PAGE} of {NUMPAGES}',
              lowerRoman: 'Page {PAGE}',
              upperRoman: 'Page {PAGE}',
              lowerAlpha: 'Page {PAGE}',
              upperAlpha: 'Page {PAGE}',
            };
            const pageNumText = fmtLabels[fmt] ?? fmtLabels.decimal;

            // Determine alignment from position
            const alignMap: Record<string, string> = {
              'header-left': 'left',
              'header-center': 'center',
              'header-right': 'right',
              'footer-left': 'left',
              'footer-center': 'center',
              'footer-right': 'right',
            };
            const align = alignMap[pos] ?? 'center';
            const inHeader = pos.startsWith('header-');

            // Build the page number HTML snippet
            const pageNumHtml = `<div style="text-align: ${align}; font-size: 10pt;">${pageNumText}</div>`;

            if (inHeader) {
              // Page numbers go in the header region
              docxOptions.header = true;
              if (headerHtml) {
                // Append page number to existing header content
                headerHtml += pageNumHtml;
              } else {
                headerHtml = pageNumHtml;
              }
            } else {
              // Page numbers go in the footer region (default)
              footerAlign = align;
              footerContent += footerContent ? ' — ' : '';
              footerContent += pageNumText;
            }

            // Pass start-at override via html-to-docx options (best-effort)
            if (startAt != null && startAt >= 1) {
              docxOptions.pageNumberStart = startAt;
            }

            // Store page number format preference in options (best-effort —
            // html-to-docx may not support numFmt, but we pass it for
            // potential future library support)
            if (fmt !== 'decimal') {
              docxOptions.pageNumberFormatType = fmt;
            }
          }

          if (footerContent) {
            // html-to-docx uses the third parameter for footer in some versions
            docxOptions.footerHTMLString = `<div style="text-align: ${footerAlign}; font-size: 10pt;">${footerContent}</div>`;
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

        // Post-process DOCX XML for page number format and startAt (Slice A3).
        // html-to-docx renders {PAGE} as decimal-only <w:fldSimple>; we patch
        // the XML to inject Word field format switches and <w:pgNumType>.
        const pgFmt = (layout.footer?.pageNumberFormat ?? 'decimal') as PageNumberFormat;
        const pgStartAt = layout.footer?.pageNumberStartAt;
        if (
          layout.footer?.showPageNumbers &&
          (pgFmt !== 'decimal' || (pgStartAt != null && pgStartAt >= 1))
        ) {
          try {
            buffer = await postProcessDocxPageNumbers(buffer, pgFmt, pgStartAt);
          } catch (ppErr: any) {
            // Graceful fallback: page numbers render as decimal (acceptable degradation)
            try {
              (fastify.log as any)?.warn?.(
                { err: ppErr },
                'exportDocx: DOCX page-number post-processing failed, using default format',
              );
            } catch { /* ignore logging errors */ }
          }
        }

        // Post-process DOCX for section breaks with numbering restart (Slice A4).
        // Finds KACHERI_SECT_BRK marker paragraphs (injected by preprocessHtmlForDocx)
        // and replaces them with proper Word <w:sectPr> elements.
        if (sectionResetPageNumbers) {
          try {
            buffer = await postProcessDocxSectionBreaks(buffer, pgFmt, pgStartAt);
          } catch (ppErr: any) {
            // Graceful fallback: markers render as literal text (no numbering restart)
            try {
              (fastify.log as any)?.warn?.(
                { err: ppErr },
                'exportDocx: DOCX section-break post-processing failed',
              );
            } catch { /* ignore logging errors */ }
          }
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

      // 3) Persist DOCX to storage client + stable exports directory (dual-write).
      const workspaceId = (req.headers['x-workspace-id'] as string | undefined)?.toString().trim();
      const wsPrefix = workspaceId || '_global';

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
      const exportStorageKey = `${wsPrefix}/exports/doc-${docId}/${filename}`;

      // Write to storage client
      await getStorage().write(
        exportStorageKey,
        buffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      // Dual-write to filesystem (response body uses `full` path)
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
          storageKey: exportStorageKey,
          storageProvider: getStorage().type,
        },
      });

      // 7) Pre-export compliance warning (Slice A7)
      // Check latest compliance result and include warning if violations exist.
      // Non-blocking: export always completes regardless of compliance status.
      let complianceWarning: Record<string, unknown> | undefined;
      if (workspaceId) {
        try {
          const latestCheck = await ComplianceChecksStore.getLatest(docId);
          if (latestCheck) {
            if (latestCheck.violations > 0 || latestCheck.warnings > 0) {
              complianceWarning = {
                status: latestCheck.status,
                violations: latestCheck.violations,
                warnings: latestCheck.warnings,
                lastCheckedAt: latestCheck.completedAt ?? latestCheck.createdAt,
              };
            }
          } else {
            complianceWarning = { status: 'unchecked' };
          }
        } catch {
          // Non-fatal: compliance check lookup failure should not block export
        }
      }

      // 8) Response shape extends the existing implementation.
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
        ...(complianceWarning ? { complianceWarning } : {}),
      });
    }
  );
};

export default exportDocxRoutes;
