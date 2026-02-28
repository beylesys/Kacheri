// backend/src/routes/importDoc.ts
import fp from 'fastify-plugin';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { promises as fs, createReadStream } from 'fs';
import type { FastifyInstance } from 'fastify';
import { db, repoPath } from '../db';
import { writeProofPacket, recordProvenance } from '../provenance';
import { recordProof } from '../provenanceStore';
import { checkDocAccess } from '../workspace/middleware';
import { createDoc } from '../store/docs';
import { logAuditEvent } from '../store/audit';
// Slice 5: Document Intelligence auto-extraction
import { extractDocument } from '../ai/extractors';
import { ExtractionsStore } from '../store/extractions';
// Slice 10: Auto-index integration hook
import { EntityHarvester } from '../knowledge/entityHarvester';
import { FtsSync } from '../knowledge/ftsSync';

/* ----------------------------- tiny utils ----------------------------- */
const sha256 = (buf: Buffer | string) => createHash('sha256').update(buf).digest('hex');
const ensureDir = async (p: string) => fs.mkdir(p, { recursive: true });
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function safeRequire(name: string): any | null { try { return require(name); } catch { return null; } }
function xmlDecode(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// NEW: visible-text guard (ignores tags/whitespace)
function hasVisibleText(html: string): boolean {
  if (!html) return false;
  const txt = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return txt.length > 0;
}

// FIX: don’t emit "<p></p>" for empty input
function textToHtml(text: string) {
  const t = (text ?? '').replace(/\r/g, '');
  const plain = t.trim();
  if (!plain) return '';
  return plain
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p.replace(/\n/g, ' ').trim())}</p>`)
    .join('\n');
}

function rtfToText(rtf: string) {
  return rtf
    .replace(/\\'([0-9a-fA-F]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function nonEmpty(s?: string | null) { return !!(s && s.trim().length > 0); }

// Slice 5: Convert HTML to plain text for extraction
function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------------- third‑party (lazy CJS to keep ts-node-dev happy) ---------------- */
const Mammoth = safeRequire('mammoth');                 // DOCX → HTML

// Robust loader for pdf-parse (CJS/ESM default)
function loadPdfParse(): ((b: Buffer) => Promise<{ text?: string; numpages?: number }>) | null {
  const mod = safeRequire('pdf-parse');
  if (!mod) return null;
  const fn = (mod.default ?? mod);
  return typeof fn === 'function' ? fn : null;
}
const pdfParse = loadPdfParse();

const JSZipMod = safeRequire('jszip');
const JSZip = JSZipMod ? (JSZipMod.default || JSZipMod) : null;

const pdfjsLib = safeRequire('pdfjs-dist/legacy/build/pdf.js'); // PDF render for OCR
if (pdfjsLib) {
  try { pdfjsLib.GlobalWorkerOptions.workerSrc = require('pdfjs-dist/legacy/build/pdf.worker.js'); } catch {}
}

// Canvas: prefer node-canvas; fall back to @napi-rs/canvas if present
const CanvasAny = safeRequire('canvas') || safeRequire('@napi-rs/canvas');
type CanvasFactory = (w: number, h: number) => any;
let createCanvas: CanvasFactory | null = null;
if (CanvasAny) {
  if (typeof CanvasAny.createCanvas === 'function') {
    createCanvas = (w: number, h: number) => CanvasAny.createCanvas(w, h);
  } else if (CanvasAny.Canvas) {
    createCanvas = (w: number, h: number) => new CanvasAny.Canvas(w, h);
  }
}

// OCR engine
const Tesseract = safeRequire('tesseract.js');

/* ------------------------------ OCR helpers ------------------------------ */
const MAX_OCR_PAGES = Number(process.env.KACHERI_OCR_MAX_PAGES || 8);
const OCR_SCALE = Number(process.env.KACHERI_OCR_SCALE || 2);

async function ocrPdfToText(pdfBytes: Buffer, pagesLimit = MAX_OCR_PAGES, scale = OCR_SCALE) {
  if (!pdfjsLib || !createCanvas || !Tesseract) return { text: '', meta: { ocr: 'unavailable' } };
  const loading = pdfjsLib.getDocument({ data: pdfBytes });
  const pdf = await loading.promise;
  const total = pdf.numPages;
  const upto = Math.min(total, pagesLimit);

  const blocks: string[] = [];
  for (let i = 1; i <= upto; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas!(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    let png: Buffer;
    try { png = canvas.toBuffer('image/png'); } catch { png = canvas.toBuffer?.() as Buffer; }
    const res = await Tesseract.recognize(png, 'eng', { logger: () => {} });
    blocks.push(String(res?.data?.text || '').trim());
  }
  return { text: blocks.join('\n\n').trim(), meta: { ocr: 'tesseract+pdfjs', pagesUsed: upto, totalPages: total } };
}

async function ocrImageToText(imageBytes: Buffer) {
  if (!Tesseract) return { text: '', meta: { ocr: 'unavailable' } };
  const res = await Tesseract.recognize(imageBytes, 'eng', { logger: () => {} });
  return { text: String(res?.data?.text || '').trim(), meta: { ocr: 'tesseract:image' } };
}

/* ---------------- DOCX / PPTX / XLSX fallbacks (XML readers) ---------------- */
type ZipFileEntry = { async: (type: string) => Promise<string>; name?: string };

/**
 * Extract text color from w:rPr (run properties) XML
 * Returns CSS color string or null
 */
function extractTextColor(rPrXml: string): string | null {
  // Check for w:color element (text color)
  const colorMatch = rPrXml.match(/<w:color\s+w:val="([^"]+)"/);
  if (colorMatch && colorMatch[1] && colorMatch[1] !== 'auto') {
    const color = colorMatch[1];
    // Word uses 6-digit hex without #
    if (/^[0-9A-Fa-f]{6}$/.test(color)) {
      return `#${color}`;
    }
  }
  return null;
}

/**
 * Extract highlight/background color from w:rPr XML
 * Returns CSS color string or null
 */
function extractHighlightColor(rPrXml: string): string | null {
  // Check for w:highlight element
  const highlightMatch = rPrXml.match(/<w:highlight\s+w:val="([^"]+)"/);
  if (highlightMatch && highlightMatch[1]) {
    // Word highlight colors map
    const highlightColors: Record<string, string> = {
      yellow: '#FFFF00',
      green: '#00FF00',
      cyan: '#00FFFF',
      magenta: '#FF00FF',
      blue: '#0000FF',
      red: '#FF0000',
      darkBlue: '#000080',
      darkCyan: '#008080',
      darkGreen: '#008000',
      darkMagenta: '#800080',
      darkRed: '#800000',
      darkYellow: '#808000',
      darkGray: '#808080',
      lightGray: '#C0C0C0',
      black: '#000000',
    };
    return highlightColors[highlightMatch[1]] || null;
  }
  // Check for w:shd (shading) element
  const shdMatch = rPrXml.match(/<w:shd\s+[^>]*w:fill="([^"]+)"/);
  if (shdMatch && shdMatch[1] && shdMatch[1] !== 'auto') {
    const fill = shdMatch[1];
    if (/^[0-9A-Fa-f]{6}$/.test(fill)) {
      return `#${fill}`;
    }
  }
  return null;
}

/**
 * Extract font size from w:rPr XML (returns CSS font-size or null)
 */
function extractFontSize(rPrXml: string): string | null {
  // w:sz is in half-points (24 = 12pt)
  const szMatch = rPrXml.match(/<w:sz\s+w:val="(\d+)"/);
  if (szMatch && szMatch[1]) {
    const halfPts = parseInt(szMatch[1], 10);
    const pts = halfPts / 2;
    // Only include if significantly different from default (11-12pt)
    if (pts < 10 || pts > 13) {
      return `${pts}pt`;
    }
  }
  return null;
}

/**
 * Check if run properties indicate bold
 */
function isBold(rPrXml: string): boolean {
  return /<w:b(?:\s|\/|>)/.test(rPrXml) && !/<w:b\s+w:val="(?:0|false)"/.test(rPrXml);
}

/**
 * Check if run properties indicate italic
 */
function isItalic(rPrXml: string): boolean {
  return /<w:i(?:\s|\/|>)/.test(rPrXml) && !/<w:i\s+w:val="(?:0|false)"/.test(rPrXml);
}

/**
 * Check if run properties indicate underline
 */
function isUnderline(rPrXml: string): boolean {
  return /<w:u\s+w:val="(?!none)/.test(rPrXml);
}

/**
 * Check if run properties indicate strikethrough
 */
function isStrikethrough(rPrXml: string): boolean {
  return /<w:strike(?:\s|\/|>)/.test(rPrXml) && !/<w:strike\s+w:val="(?:0|false)"/.test(rPrXml);
}

async function docxFallbackToHtml(buf: Buffer): Promise<string> {
  if (!JSZip) return '';
  const zip = await JSZip.loadAsync(buf);

  const docEntry = zip.file('word/document.xml') as ZipFileEntry | null | undefined;
  const doc = docEntry ? await docEntry.async('string') : undefined;
  if (!doc) return '';

  const paras: string[] = [];
  const pRe = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
  let pm: RegExpExecArray | null;

  while ((pm = pRe.exec(doc))) {
    const pXml = pm[1];

    // Check for paragraph style (headings)
    const pStyleMatch = pXml.match(/<w:pStyle\s+w:val="([^"]+)"/);
    const pStyle = pStyleMatch ? pStyleMatch[1] : '';

    // Process runs (w:r) within the paragraph to preserve formatting
    const runs: string[] = [];
    const rRe = /<w:r[^>]*>([\s\S]*?)<\/w:r>/g;
    let rm: RegExpExecArray | null;

    while ((rm = rRe.exec(pXml))) {
      const rXml = rm[1];

      // Extract run properties
      const rPrMatch = rXml.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
      const rPr = rPrMatch ? rPrMatch[1] : '';

      // Extract text from w:t elements
      const tRe = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
      let tm: RegExpExecArray | null;
      let runText = '';
      while ((tm = tRe.exec(rXml))) {
        runText += xmlDecode(tm[1]);
      }

      // Handle line breaks
      if (/<w:br\s*\/>/.test(rXml)) {
        runText += '<br>';
      }

      if (!runText) continue;

      // Build styled span if formatting exists
      const styles: string[] = [];
      const tags: { open: string; close: string }[] = [];

      // Text color
      const textColor = extractTextColor(rPr);
      if (textColor) styles.push(`color:${textColor}`);

      // Highlight/background color
      const bgColor = extractHighlightColor(rPr);
      if (bgColor) styles.push(`background-color:${bgColor}`);

      // Font size
      const fontSize = extractFontSize(rPr);
      if (fontSize) styles.push(`font-size:${fontSize}`);

      // Bold
      if (isBold(rPr)) tags.push({ open: '<strong>', close: '</strong>' });

      // Italic
      if (isItalic(rPr)) tags.push({ open: '<em>', close: '</em>' });

      // Underline
      if (isUnderline(rPr)) tags.push({ open: '<u>', close: '</u>' });

      // Strikethrough
      if (isStrikethrough(rPr)) tags.push({ open: '<s>', close: '</s>' });

      // Build the formatted text
      let formattedText = esc(runText).replace(/<br>/g, '<br>'); // Preserve br tags

      // Apply inline styles via span
      if (styles.length > 0) {
        formattedText = `<span style="${styles.join(';')}">${formattedText}</span>`;
      }

      // Apply semantic tags (bold, italic, etc.)
      for (const tag of tags) {
        formattedText = `${tag.open}${formattedText}${tag.close}`;
      }

      runs.push(formattedText);
    }

    const paraContent = runs.join('').trim();
    if (!paraContent) continue;

    // Determine HTML tag based on paragraph style
    let tag = 'p';
    if (/^Heading1$/i.test(pStyle) || /^Title$/i.test(pStyle)) tag = 'h1';
    else if (/^Heading2$/i.test(pStyle)) tag = 'h2';
    else if (/^Heading3$/i.test(pStyle)) tag = 'h3';
    else if (/^Heading4$/i.test(pStyle)) tag = 'h4';
    else if (/^Heading5$/i.test(pStyle)) tag = 'h5';
    else if (/^Heading6$/i.test(pStyle)) tag = 'h6';

    paras.push(`<${tag}>${paraContent}</${tag}>`);
  }

  const wordFolder: any = zip.folder('word');
  const headerEntries = (wordFolder?.file(/header[0-9]*\.xml/g) ?? []) as ZipFileEntry[];
  const footerEntries = (wordFolder?.file(/footer[0-9]*\.xml/g) ?? []) as ZipFileEntry[];

  const headerFiles: string[] = await Promise.all(headerEntries.map((f: ZipFileEntry) => f.async('string')));
  const footerFiles: string[] = await Promise.all(footerEntries.map((f: ZipFileEntry) => f.async('string')));

  const extra = [...headerFiles, ...footerFiles].map((xml: string) => {
    const tRe = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    let tm: RegExpExecArray | null, text = '';
    while ((tm = tRe.exec(xml))) text += xmlDecode(tm[1]);
    text = text.replace(/\s+/g, ' ').trim();
    return text ? `<p>${esc(text)}</p>` : '';
  }).filter((s: string) => Boolean(s));

  return [...extra, ...paras].join('\n');
}

async function pptxToHtml(buf: Buffer): Promise<string> {
  if (!JSZip) return '';
  const zip = await JSZip.loadAsync(buf);
  const slideEntries = (zip.folder('ppt/slides')?.file(/slide\d+\.xml$/g) || []) as ZipFileEntry[];
  const slides: string[] = [];
  let idx = 1;
  for (const s of slideEntries.sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
    const xml = await (s as ZipFileEntry).async('string');
    const out: string[] = [];
    const tRe = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
    let m: RegExpExecArray | null;
    while ((m = tRe.exec(xml))) {
      const t = xmlDecode(m[1]).replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
    }
    slides.push(`<h2>Slide ${idx++}</h2>${out.length ? `<p>${esc(out.join(' '))}</p>` : ''}`);
  }
  return slides.join('\n');
}

async function xlsxToHtml(buf: Buffer): Promise<string> {
  if (!JSZip) return '';
  const zip = await JSZip.loadAsync(buf);
  const sstEntry = zip.file('xl/sharedStrings.xml') as ZipFileEntry | null | undefined;
  const sst = sstEntry ? await sstEntry.async('string') : undefined;

  if (!sst) {
    const sheetEntry = zip.file('xl/worksheets/sheet1.xml') as ZipFileEntry | null | undefined;
    const sheet = sheetEntry ? await sheetEntry.async('string') : undefined;
    if (!sheet) return '';
    const vRe = /<v>([\s\S]*?)<\/v>/g;
    let m: RegExpExecArray | null; const out: string[] = [];
    while ((m = vRe.exec(sheet))) {
      const v = xmlDecode(m[1]).trim();
      if (v) out.push(v);
    }
    return out.length ? `<p>${esc(out.join(' '))}</p>` : '';
  }

  const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null; const strings: string[] = [];
  while ((m = tRe.exec(sst))) {
    const v = xmlDecode(m[1]).replace(/\s+/g, ' ').trim();
    if (v) strings.push(v);
  }
  return strings.length ? strings.map((s) => `<p>${esc(s)}</p>`).join('\n') : '';
}

/* ------------------------------- kind detection ------------------------------- */
function detectKind(filename: string, explicit?: string): string {
  if (explicit) return explicit.toLowerCase();
  const ext = (path.extname(filename).slice(1) || '').toLowerCase();
  if (!ext) return 'bin';
  const map: Record<string, string> = {
    docx: 'docx', doc: 'doc', odt: 'odt',
    pdf: 'pdf',
    html: 'html', htm: 'html',
    md: 'md', markdown: 'md',
    txt: 'txt',
    rtf: 'rtf',
    pptx: 'pptx', ppt: 'ppt', odp: 'odp',
    xlsx: 'xlsx', xls: 'xls', ods: 'ods',
    jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', bmp: 'image', tif: 'image', tiff: 'image', webp: 'image',
  };
  return map[ext] || ext;
}

/* --------------------------- LibreOffice bridge (optional) --------------------------- */
function findSofficeCandidates(): string[] {
  const env = process.env.LIBREOFFICE_PATH;
  const candidates: string[] = [];
  if (env) candidates.push(env);
  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
    );
  } else {
    candidates.push('/usr/bin/soffice', '/usr/local/bin/soffice', '/snap/bin/libreoffice');
  }
  return candidates;
}

async function pathExists(p: string) { try { await fs.access(p); return true; } catch { return false; } }

async function findSoffice(): Promise<string | null> {
  for (const c of findSofficeCandidates()) if (await pathExists(c)) return c;
  return new Promise((resolve) => {
    const exe = process.platform === 'win32' ? 'soffice.exe' : 'soffice';
    const proc = spawn(process.platform === 'win32' ? 'where' : 'which', [exe]);
    let out = ''; proc.stdout.on('data', (d) => (out += String(d)));
    proc.on('close', (code) => resolve(code === 0 ? out.trim().split(/\r?\n/)[0] : null));
  });
}

async function sofficeConvertTemp(
  sofficePath: string,
  inputName: string,
  inputBytes: Buffer,
  to: 'txt' | 'pdf'
): Promise<{ ok: boolean; outPath?: string; outBytes?: Buffer; log?: string }> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kacheri-imp-'));
  const inPath = path.join(tmp, inputName);
  await fs.writeFile(inPath, inputBytes);

  const outdir = tmp;
  const filter = to === 'txt' ? 'txt:Text (encoded)' : 'pdf:writer_pdf_Export';

  const args = ['--headless', '--norestore', '--nolockcheck', '--nodefault', '--invisible',
    '--convert-to', filter, '--outdir', outdir, inPath];

  const log: string[] = [];
  await new Promise<void>((resolve) => {
    const p = spawn(sofficePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (d) => log.push(String(d)));
    p.stderr.on('data', (d) => log.push(String(d)));
    p.on('close', () => resolve());
  });

  const outExt = to === 'txt' ? '.txt' : '.pdf';
  const base = path.basename(inputName, path.extname(inputName));
  const files = await fs.readdir(outdir);
  const candidate = files.find((f) => f.startsWith(base) && f.toLowerCase().endsWith(outExt));
  if (!candidate) return { ok: false, log: log.join('') };

  const outPath = path.join(outdir, candidate);
  const outBytes = await fs.readFile(outPath);
  return { ok: true, outPath, outBytes, log: log.join('') };
}

/* ------------------------------- helpers: PDF text with graceful fallback ------------------------------- */
async function getPdfText(pdfBytes: Buffer, opts: { forceOcr?: boolean } = {}) {
  let text = '';
  const meta: Record<string, any> = {};
  if (pdfParse && !opts.forceOcr) {
    try {
      const parsed = await pdfParse(pdfBytes);
      text = String(parsed?.text || '').trim();
      meta.tool = 'pdf-parse';
      if (parsed?.numpages != null) meta.pages = parsed.numpages;
    } catch (e: any) {
      meta.pdfParseError = String(e?.message || e);
    }
  }
  if (!nonEmpty(text)) {
    const ocr = await ocrPdfToText(pdfBytes);
    if (nonEmpty(ocr.text)) {
      text = ocr.text;
      Object.assign(meta, ocr.meta);
      meta.tool = meta.tool ? `${meta.tool}+ocr` : 'ocr';
    }
  }
  return { text, meta };
}

/* ------------------------------- Enhanced PDF extraction with font metadata ------------------------------- */
interface TextBlock {
  text: string;
  fontSize: number;
  fontFamily: string;
  isBold: boolean;
  y: number;
  x: number;
  pageNum: number;
}

async function extractPdfTextWithMetadata(pdfBytes: Buffer): Promise<{
  blocks: TextBlock[];
  text: string;
  meta: Record<string, any>;
}> {
  if (!pdfjsLib) {
    // Fallback to simple extraction
    const { text, meta } = await getPdfText(pdfBytes);
    return { blocks: [], text, meta: { ...meta, structured: false } };
  }

  try {
    const loading = pdfjsLib.getDocument({ data: pdfBytes });
    const pdf = await loading.promise;
    const blocks: TextBlock[] = [];
    const textParts: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      for (const item of textContent.items as any[]) {
        if (!item.str?.trim()) continue;

        const text = item.str;
        // transform is [scaleX, skewX, skewY, scaleY, translateX, translateY]
        const fontSize = Math.abs(item.transform?.[0] || item.height || 12);
        const fontFamily = item.fontName || '';
        const isBold = /bold/i.test(fontFamily);
        const x = item.transform?.[4] ?? 0;
        const y = item.transform?.[5] ?? 0;

        blocks.push({
          text,
          fontSize,
          fontFamily,
          isBold,
          x,
          y,
          pageNum: i,
        });

        textParts.push(text);
      }
    }

    return {
      blocks,
      text: textParts.join(' '),
      meta: { tool: 'pdfjs-structured', pages: pdf.numPages, blockCount: blocks.length, structured: true },
    };
  } catch (e: any) {
    // Fallback on error
    const { text, meta } = await getPdfText(pdfBytes);
    return { blocks: [], text, meta: { ...meta, structured: false, structureError: e?.message } };
  }
}

/* ------------------------------- Enhanced textToHtml with heading detection ------------------------------- */
function textToHtmlWithStructure(blocks: TextBlock[]): string {
  if (!blocks.length) return '';

  // Group blocks by page and sort by y position (top to bottom)
  const sorted = [...blocks].sort((a, b) => {
    if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum;
    // Higher y value = higher on page in PDF coordinate system
    return b.y - a.y;
  });

  // Calculate average font size (excluding outliers)
  const fontSizes = sorted.map(b => b.fontSize).filter(s => s > 0);
  if (fontSizes.length === 0) return '';

  fontSizes.sort((a, b) => a - b);
  const median = fontSizes[Math.floor(fontSizes.length / 2)];
  const avgFontSize = fontSizes.reduce((a, b) => a + b, 0) / fontSizes.length;
  const baseFontSize = Math.min(median, avgFontSize);

  // Threshold for headings
  const h1Threshold = baseFontSize * 1.5;
  const h2Threshold = baseFontSize * 1.3;
  const h3Threshold = baseFontSize * 1.15;

  const html: string[] = [];
  let currentPara: string[] = [];
  let lastY = -1;
  let lastPage = -1;

  const flushPara = () => {
    if (currentPara.length) {
      const text = currentPara.join(' ').trim();
      if (text) html.push(`<p>${esc(text)}</p>`);
      currentPara = [];
    }
  };

  for (const block of sorted) {
    const text = block.text.trim();
    if (!text) continue;

    // Detect new paragraph by large y-gap or page change
    const yGap = lastY >= 0 ? Math.abs(block.y - lastY) : 0;
    const newPage = lastPage >= 0 && block.pageNum !== lastPage;
    const newParagraph = newPage || yGap > block.fontSize * 1.8;

    if (newParagraph) {
      flushPara();
    }

    // Determine if this is a heading
    const isH1 = block.fontSize >= h1Threshold || (block.isBold && block.fontSize >= h2Threshold);
    const isH2 = !isH1 && (block.fontSize >= h2Threshold || (block.isBold && block.fontSize >= h3Threshold));
    const isH3 = !isH1 && !isH2 && (block.fontSize >= h3Threshold || block.isBold);
    const isHeading = isH1 || isH2 || isH3;

    if (isHeading) {
      flushPara();
      const tag = isH1 ? 'h1' : isH2 ? 'h2' : 'h3';
      html.push(`<${tag}>${esc(text)}</${tag}>`);
    } else {
      currentPara.push(text);
    }

    lastY = block.y;
    lastPage = block.pageNum;
  }

  flushPara();
  return html.join('\n');
}

/* --------------------------------------------------------------------------------
   NEVER‑BLANK importer (refactored + visible‑text guard for PDFs)
--------------------------------------------------------------------------------- */
export default fp(async function importDocPlugin(app: FastifyInstance) {
  await app.register(require('@fastify/multipart'), { limits: { fileSize: 80 * 1024 * 1024 } }); // 80 MB

  /**
   * POST /docs/import
   * Form: file=<binary>
   * Query: kind?=docx|pdf|html|md|txt|rtf|pptx|ppt|xlsx|xls|odt|odp|ods|image ,  ocr?=1
   */
  app.post('/docs/import', async (req: any, reply: any) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'No file uploaded (field "file")' });

    const q = (req.query || {}) as { kind?: string; ocr?: string };
    const filename: string = file.filename || 'upload.bin';
    const kind0 = detectKind(filename, q.kind);
    const forceOcr = q.ocr === '1' || q.ocr === 'true';

    const buf: Buffer = await file.toBuffer();
    const sourceHash = sha256(buf);
    const bytes = buf.byteLength;

    // 1) Create doc shell — direct store call (Slice 7: fixes Vuln #10, no more app.inject bypass)
    const title = filename.replace(/\.[^.]+$/, '');
    const importWorkspace = (req.workspaceId as string | undefined)
      || (req.headers?.['x-workspace-id'] as string | undefined)?.toString().trim()
      || undefined;
    const importUserId = (req.user as any)?.id as string | undefined;
    const doc = await createDoc(title, importWorkspace, importUserId);
    const docId: string = doc.id;

    // Record provenance + audit (mirrors POST /docs handler in server.ts)
    recordProvenance({ docId, action: 'create', actor: 'human', actorId: importUserId ?? null, workspaceId: importWorkspace ?? null, details: { title, source: 'import' } });
    if (importWorkspace) {
      logAuditEvent({ workspaceId: importWorkspace, actorId: importUserId ?? 'system', action: 'doc:create', targetType: 'doc', targetId: docId, details: { title, source: 'import' } });
    }

    // Paths now (used by placeholder even if conversion fails)
    const upDir = repoPath('storage', 'uploads', `doc-${docId}`);
    await ensureDir(upDir);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = (path.extname(filename).slice(1) || 'bin');
    const sourcePath = path.join(upDir, `${ts}_source.${ext}`);
    const convPath = path.join(upDir, `${ts}_converted.html`);
    await fs.writeFile(sourcePath, buf);

    // 2) Convert → HTML (layered fallbacks)
    let html = '';
    let meta: Record<string, any> = {};
    let kind = kind0;
    let convertError: any = null;

    try {
      if (kind0 === 'docx') {
        // Try enhanced XML fallback FIRST to preserve colors/formatting
        // Mammoth strips most formatting; our XML parser preserves it
        if (JSZip) {
          try {
            const xmlHtml = await docxFallbackToHtml(buf);
            if (hasVisibleText(xmlHtml)) {
              html = xmlHtml;
              meta = { tool: 'docx-xml-enhanced' };
            }
          } catch (e: any) {
            meta = { tool: 'docx-xml-enhanced', error: String(e?.message || e) };
          }
        }
        // Fallback to Mammoth if XML extraction failed
        if (!hasVisibleText(html) && Mammoth) {
          try {
            // Enhanced Mammoth options to preserve more formatting
            const mammothOptions = {
              buffer: buf,
              // Style mapping to preserve visual formatting
              styleMap: [
                // Preserve bold/italic/underline
                "b => b",
                "i => i",
                "u => u",
                "strike => s",
                // Map Word heading styles
                "p[style-name='Heading 1'] => h1:fresh",
                "p[style-name='Heading 2'] => h2:fresh",
                "p[style-name='Heading 3'] => h3:fresh",
                "p[style-name='Heading 4'] => h4:fresh",
                "p[style-name='Title'] => h1.doc-title:fresh",
                "p[style-name='Subtitle'] => p.doc-subtitle:fresh",
                // Preserve list styles
                "p[style-name='List Paragraph'] => p.list-paragraph:fresh",
              ],
              // Transform document to preserve inline styles
              transformDocument: (element: any) => element,
            };
            const { value, messages } = await Mammoth.convertToHtml(mammothOptions);
            html = value || '';
            meta = { tool: 'mammoth', warnings: (messages || []).length };
          } catch (e: any) { meta = { tool: 'mammoth', error: String(e?.message || e) }; }
        }
        if (!hasVisibleText(html)) {
          const soffice = await findSoffice();
          if (soffice) {
            const toTxt = await sofficeConvertTemp(soffice, path.basename(filename), buf, 'txt');
            if (toTxt.ok && toTxt.outBytes) {
              const text = toTxt.outBytes.toString('utf8').trim();
              const h = textToHtml(text);
              if (hasVisibleText(h)) { html = h; meta = { tool: 'soffice:txt' }; }
            }
            if (!hasVisibleText(html)) {
              const toPdf = await sofficeConvertTemp(soffice, path.basename(filename), buf, 'pdf');
              if (toPdf.ok && toPdf.outBytes) {
                const { text, meta: m } = await getPdfText(toPdf.outBytes, { forceOcr });
                const h = textToHtml(text);
                if (hasVisibleText(h)) {
                  html = h;
                  meta = { ...(meta || {}), ...(m || {}), tool: m.tool || 'soffice→pdf' };
                  if ((m as any).ocr) kind = 'docx:ocr';
                }
              }
            }
          } else {
            meta = { ...meta, fallback: 'no-soffice-installed' };
          }
        }
      } else if (kind0 === 'pdf') {
        // Try enhanced extraction with font metadata first
        if (!forceOcr && pdfjsLib) {
          const { blocks, text, meta: m } = await extractPdfTextWithMetadata(buf);
          if (blocks.length > 0) {
            // Use structured extraction with heading detection
            const h = textToHtmlWithStructure(blocks);
            if (hasVisibleText(h)) {
              html = h;
              meta = { ...(meta || {}), ...(m || {}) };
            }
          }
          // Fallback to simple text if structured failed
          if (!hasVisibleText(html) && text) {
            const h = textToHtml(text);
            if (hasVisibleText(h)) {
              html = h;
              meta = { ...(meta || {}), ...(m || {}), structuredFallback: true };
            }
          }
        }
        // Fallback to original getPdfText (includes OCR)
        if (!hasVisibleText(html)) {
          const { text, meta: m } = await getPdfText(buf, { forceOcr });
          const h = textToHtml(text);
          if (hasVisibleText(h)) {
            html = h;
            meta = { ...(meta || {}), ...(m || {}) };
            if ((m as any).ocr) kind = 'pdf:ocr';
          } else {
            html = ''; // ensure placeholder path
            meta = { ...(meta || {}), ...(m || {}) };
          }
        }
      } else if (kind0 === 'image') {
        const { text, meta: m } = await ocrImageToText(buf);
        const h = textToHtml(text);
        if (hasVisibleText(h)) { html = h; meta = m; kind = 'image:ocr'; }
      } else if (kind0 === 'html') {
        html = buf.toString('utf8'); meta = { tool: 'direct:html' };
      } else if (kind0 === 'md') {
        const h = textToHtml(buf.toString('utf8')); if (hasVisibleText(h)) { html = h; meta = { tool: 'direct:markdown' }; }
      } else if (kind0 === 'txt') {
        const h = textToHtml(buf.toString('utf8')); if (hasVisibleText(h)) { html = h; meta = { tool: 'direct:txt' }; }
      } else if (kind0 === 'rtf') {
        const text = rtfToText(buf.toString('utf8')); const h = textToHtml(text);
        if (hasVisibleText(h)) { html = h; meta = { tool: 'rtf→text' }; }
      } else if (kind0 === 'pptx') {
        try { html = await pptxToHtml(buf); meta = { tool: 'pptx-xml' }; }
        catch (e: any) { meta = { tool: 'pptx-xml', error: String(e?.message || e) }; }
        if (!hasVisibleText(html)) {
          const soffice = await findSoffice();
          if (soffice) {
            const toTxt = await sofficeConvertTemp(soffice, path.basename(filename), buf, 'txt');
            if (toTxt.ok && toTxt.outBytes) {
              const t = toTxt.outBytes.toString('utf8').trim();
              const h = textToHtml(t);
              if (hasVisibleText(h)) { html = h; meta = { tool: 'soffice:pptx→txt' }; }
            }
            if (!hasVisibleText(html)) {
              const toPdf = await sofficeConvertTemp(soffice, path.basename(filename), buf, 'pdf');
              if (toPdf.ok && toPdf.outBytes) {
                const { text, meta: m } = await ocrPdfToText(toPdf.outBytes);
                const h = textToHtml(text);
                if (hasVisibleText(h)) { html = h; meta = { ...(meta || {}), ...(m || {}), tool: 'soffice:pptx→pdf→ocr' }; kind = 'pptx:ocr'; }
              }
            }
          }
        }
      } else if (kind0 === 'xlsx') {
        try { html = await xlsxToHtml(buf); meta = { tool: 'xlsx-xml' }; }
        catch (e: any) { meta = { tool: 'xlsx-xml', error: String(e?.message || e) }; }
        if (!hasVisibleText(html)) {
          const soffice = await findSoffice();
          if (soffice) {
            const toTxt = await sofficeConvertTemp(soffice, path.basename(filename), buf, 'txt');
            if (toTxt.ok && toTxt.outBytes) {
              const t = toTxt.outBytes.toString('utf8').trim();
              const h = textToHtml(t);
              if (hasVisibleText(h)) { html = h; meta = { tool: 'soffice:xlsx→txt' }; }
            }
          }
        }
      } else if (kind0 === 'doc' || kind0 === 'odt' || kind0 === 'ppt' || kind0 === 'xls' || kind0 === 'odp' || kind0 === 'ods') {
        const soffice = await findSoffice();
        if (soffice) {
          const toTxt = await sofficeConvertTemp(soffice, path.basename(filename), buf, 'txt');
          if (toTxt.ok && toTxt.outBytes) {
            const t = toTxt.outBytes.toString('utf8').trim();
            const h = textToHtml(t);
            if (hasVisibleText(h)) { html = h; meta = { tool: 'soffice:txt' }; }
          }
          if (!hasVisibleText(html)) {
            const toPdf = await sofficeConvertTemp(soffice, path.basename(filename), buf, 'pdf');
            if (toPdf.ok && toPdf.outBytes) {
              const { text, meta: m } = await getPdfText(toPdf.outBytes, { forceOcr });
              const h = textToHtml(text);
              if (hasVisibleText(h)) {
                html = h;
                meta = { ...(meta || {}), ...(m || {}), tool: m.tool || 'soffice→pdf' };
                if ((m as any).ocr) kind = `${kind0}:ocr`;
              }
            }
          }
        } else {
          meta = { tool: 'none', fallback: 'no-soffice-installed' };
        }
      } else {
        const soffice = await findSoffice();
        if (soffice) {
          const toTxt = await sofficeConvertTemp(soffice, path.basename(filename), buf, 'txt');
          if (toTxt.ok && toTxt.outBytes) {
            const t = toTxt.outBytes.toString('utf8').trim();
            const h = textToHtml(t);
            if (hasVisibleText(h)) { html = h; meta = { tool: 'soffice:unknown→txt' }; }
          }
          if (!hasVisibleText(html)) {
            const toPdf = await sofficeConvertTemp(soffice, path.basename(filename), buf, 'pdf');
            if (toPdf.ok && toPdf.outBytes) {
              const { text, meta: m } = await ocrPdfToText(toPdf.outBytes);
              const h = textToHtml(text);
              if (hasVisibleText(h)) { html = h; meta = { ...(meta || {}), ...(m || {}), tool: 'soffice:unknown→pdf→ocr' }; kind = 'unknown:ocr'; }
            }
          }
        }
        if (!hasVisibleText(html)) {
          const asText = buf.toString('utf8');
          const h = textToHtml(asText);
          if (hasVisibleText(h)) { html = h; meta = { tool: 'bytes→text' }; }
        }
      }
    } catch (e: any) {
      convertError = e;
      try { (app.log as any)?.error?.({ err: e }, 'import: conversion failed'); } catch {}
    }

    // 3) Persist artifacts + NEVER‑BLANK guarantee
    // If there is no visible text, synthesize a readable placeholder.
    if (!hasVisibleText(html)) {
      const placeholder =
        `<div style="padding:12px;border:1px dashed #bbb;border-radius:8px;background:#fafafa">
           <p><strong>Imported attachment</strong> (no text layer could be extracted automatically).</p>
           <p><code>${esc(path.relative(process.cwd(), sourcePath))}</code></p>
           <p>Kind: ${esc(kind0)} • Size: ${bytes} bytes • SHA256: ${sha256(buf).slice(0, 16)}…</p>
           ${convertError ? `<p style="color:#a33">Note: ${esc(String(convertError?.message || convertError))}</p>` : ''}
           <p>You can keep this as a reference, copy text manually, or re‑import after installing OCR/LibreOffice.</p>
         </div>`;
      html = placeholder;
      meta = { ...(meta || {}), guarantee: 'placeholder' };
    }

    await fs.writeFile(convPath, html, 'utf8');

    // 4) Proofs
    const htmlHash = sha256(Buffer.from(html));
    const packet = {
      type: `import:${kind}`,
      ts: new Date().toISOString(),
      inputs: { filename, bytes, sourceHash },
      outputs: { htmlHash, convPath: path.relative(process.cwd(), convPath) },
      meta,
    };
    await writeProofPacket({ docId, relatedProvenanceId: null, type: `import:${kind}`, filePath: null, payload: packet });
    await recordProof({
      doc_id: docId,
      kind: `import:${kind}`,
      hash: htmlHash,
      path: path.relative(process.cwd(), convPath),
      meta: { filename, sourcePath: path.relative(process.cwd(), sourcePath), tool: (meta as any)?.tool, notes: meta },
    });

    // 4.5) Auto-trigger Document Intelligence extraction (Slice 5)
    let extractionSummary: {
      extractionId?: string;
      documentType?: string;
      confidence?: number;
      anomalyCount?: number;
      error?: string;
    } | undefined;

    // Only attempt extraction if we have meaningful text (not placeholder)
    if (hasVisibleText(html) && !(meta as any)?.guarantee) {
      const plainText = htmlToPlainText(html);

      if (plainText.length > 50) {
        try {
          const result = await extractDocument({
            text: plainText,
            // Use default provider/model from config
          });

          // Store extraction
          const extraction = await ExtractionsStore.create({
            docId,
            documentType: result.documentType,
            typeConfidence: result.typeConfidence,
            extraction: result.extraction,
            fieldConfidences: result.fieldConfidences,
            anomalies: result.anomalies,
            proofId: undefined,
            createdBy: 'system:import',
          });

          extractionSummary = {
            extractionId: extraction.id,
            documentType: result.documentType,
            confidence: result.typeConfidence,
            anomalyCount: result.anomalies?.length || 0,
          };
        } catch (e: any) {
          // Extraction failure should NOT fail the import
          extractionSummary = {
            error: `Extraction failed: ${e?.message || 'Unknown error'}`,
          };
          try { (app.log as any)?.warn?.({ err: e }, 'import: auto-extraction failed'); } catch {}
        }
      }
    }

    // 4.6) Slice 10: Auto-index — harvest entities + sync FTS after import
    if (importWorkspace) {
      try {
        // Sync document content to FTS5 for keyword search
        await FtsSync.syncDoc(docId, importWorkspace, title, html);
        // Harvest entities if extraction succeeded
        if (extractionSummary?.extractionId) {
          const storedExtraction = await ExtractionsStore.getByDocId(docId);
          if (storedExtraction) {
            EntityHarvester.harvestFromExtraction(storedExtraction, importWorkspace);
          }
        }
      } catch (hookErr) {
        try { (app.log as any)?.warn?.({ err: hookErr }, 'import: auto-index hook failed'); } catch {}
      }
    }

    // 5) Response
    return reply.code(201).send({
      docId,
      title,
      kind,
      source: { path: path.relative(process.cwd(), sourcePath), sha256: sourceHash, bytes },
      converted: { path: path.relative(process.cwd(), convPath), sha256: htmlHash },
      html,
      meta,
      extraction: extractionSummary,
    });
  });

  /**
   * GET /docs/:id/import/source
   * Serves the original uploaded file (PDF, DOCX, etc.) for side-by-side viewing
   */
  app.get('/docs/:id/import/source', async (req: any, reply: any) => {
    const docId = req.params.id;

    // Doc-level permission check (viewer+ required)
    if (!checkDocAccess(db, req, reply, docId, 'viewer')) return;

    const upDir = repoPath('storage', 'uploads', `doc-${docId}`);

    try {
      const files = await fs.readdir(upDir);
      // Find the most recent source file
      const sourceFiles = files
        .filter((f: string) => f.includes('_source.'))
        .sort()
        .reverse();

      if (!sourceFiles.length) {
        return reply.code(404).send({ error: 'No source file found for this document' });
      }

      const sourceFile = sourceFiles[0];
      const ext = path.extname(sourceFile).slice(1).toLowerCase();

      // Determine MIME type
      const mimeMap: Record<string, string> = {
        pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        doc: 'application/msword',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        html: 'text/html',
        txt: 'text/plain',
      };
      const mime = mimeMap[ext] || 'application/octet-stream';

      const filePath = path.join(upDir, sourceFile);
      const stream = createReadStream(filePath);

      return reply
        .type(mime)
        .header('Content-Disposition', `inline; filename="${sourceFile}"`)
        .send(stream);
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        return reply.code(404).send({ error: 'Upload directory not found' });
      }
      return reply.code(500).send({ error: 'Failed to read source file', detail: e?.message });
    }
  });

  /**
   * GET /docs/:id/import/meta
   * Returns import metadata for the frontend to decide which import UI to show
   */
  app.get('/docs/:id/import/meta', async (req: any, reply: any) => {
    const docId = req.params.id;

    // Doc-level permission check (viewer+ required)
    if (!checkDocAccess(db, req, reply, docId, 'viewer')) return;

    try {
      // Query proofs table for import proof
      const proof = await db.queryOne<any>(`
        SELECT * FROM proofs
        WHERE doc_id = ? AND kind LIKE 'import:%'
        ORDER BY ts DESC LIMIT 1
      `, [docId]);

      if (!proof) {
        return reply.code(404).send({ error: 'No import record found for this document' });
      }

      // Parse meta if it's a string
      let meta = {};
      try {
        meta = proof.meta ? JSON.parse(proof.meta) : {};
      } catch {
        meta = {};
      }

      return reply.send({
        docId,
        kind: proof.kind,
        sourceUrl: `/api/docs/${docId}/import/source`,
        hash: proof.hash,
        ts: proof.ts,
        meta,
      });
    } catch (e: any) {
      return reply.code(500).send({ error: 'Failed to fetch import metadata', detail: e?.message });
    }
  });
});
