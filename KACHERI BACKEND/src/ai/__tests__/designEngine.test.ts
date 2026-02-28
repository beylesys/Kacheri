import { describe, it, expect } from 'vitest';
import {
  validateFrameCode,
  parseFramesFromResponse,
  buildProofPayload,
  buildImageAssetRef,
} from '../designEngine.js';
import type { DesignResult } from '../designEngine.js';

/* ============= validateFrameCode ============= */

describe('validateFrameCode', () => {
  it('accepts valid kcl-slide frame', () => {
    const code = '<kcl-slide background="#fff"><kcl-text level="h1">Hello</kcl-text></kcl-slide>';
    const result = validateFrameCode(code);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects frame without kcl-slide root', () => {
    const code = '<div><kcl-text>Hello</kcl-text></div>';
    const result = validateFrameCode(code);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === 'invalid_nesting')).toBe(true);
  });

  it('rejects HTML document-level tags', () => {
    const code = '<!DOCTYPE html><html><head></head><body><kcl-slide></kcl-slide></body></html>';
    const result = validateFrameCode(code);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === 'invalid_tag')).toBe(true);
  });

  it('detects unknown KCL tags', () => {
    const code = '<kcl-slide><kcl-unknown>Content</kcl-unknown></kcl-slide>';
    const result = validateFrameCode(code);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Unknown KCL component'))).toBe(true);
  });

  it('accepts all valid KCL tags', () => {
    const tags = [
      'kcl-text', 'kcl-layout', 'kcl-image', 'kcl-list', 'kcl-quote',
      'kcl-metric', 'kcl-icon', 'kcl-animate', 'kcl-code', 'kcl-embed',
      'kcl-source', 'kcl-chart', 'kcl-table', 'kcl-timeline', 'kcl-compare',
    ];
    const code = `<kcl-slide>${tags.map((t) => `<${t}></${t}>`).join('')}</kcl-slide>`;
    const result = validateFrameCode(code);
    expect(result.errors.filter((e) => e.type === 'invalid_tag')).toHaveLength(0);
  });

  it('validates data-for references to existing IDs', () => {
    const code = '<kcl-slide><kcl-chart id="chart1"></kcl-chart><script data-for="chart1" type="application/json">{"labels":[]}</script></kcl-slide>';
    const result = validateFrameCode(code);
    expect(result.errors.filter((e) => e.type === 'missing_data_script')).toHaveLength(0);
  });

  it('detects data-for referencing non-existent ID', () => {
    const code = '<kcl-slide><script data-for="missing_id" type="application/json">{}</script></kcl-slide>';
    const result = validateFrameCode(code);
    expect(result.errors.some((e) => e.type === 'missing_data_script')).toBe(true);
  });

  it('detects invalid JSON in data binding scripts', () => {
    const code = '<kcl-slide><kcl-chart id="c1"></kcl-chart><script data-for="c1" type="application/json">{invalid json}</script></kcl-slide>';
    const result = validateFrameCode(code);
    expect(result.errors.some((e) => e.type === 'parse_error')).toBe(true);
  });

  it('accepts valid JSON in data binding scripts', () => {
    const code = '<kcl-slide><kcl-chart id="c1"></kcl-chart><script data-for="c1" type="application/json">{"labels":["A","B"],"datasets":[{"data":[1,2]}]}</script></kcl-slide>';
    const result = validateFrameCode(code);
    expect(result.errors.filter((e) => e.type === 'parse_error')).toHaveLength(0);
  });

  it('warns on missing alt for kcl-image', () => {
    const code = '<kcl-slide><kcl-image src="/img.png" /></kcl-slide>';
    const result = validateFrameCode(code);
    expect(result.warnings.some((w) => w.type === 'missing_alt')).toBe(true);
  });

  it('does not warn when kcl-image has alt', () => {
    const code = '<kcl-slide><kcl-image src="/img.png" alt="Description" /></kcl-slide>';
    const result = validateFrameCode(code);
    expect(result.warnings.filter((w) => w.type === 'missing_alt')).toHaveLength(0);
  });

  it('warns on large output', () => {
    const code = '<kcl-slide>' + 'x'.repeat(21_000) + '</kcl-slide>';
    const result = validateFrameCode(code);
    expect(result.warnings.some((w) => w.type === 'large_output')).toBe(true);
  });

  it('handles empty string input', () => {
    const result = validateFrameCode('');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === 'invalid_nesting')).toBe(true);
  });

  it('warns on data-required component without data binding', () => {
    const code = '<kcl-slide><kcl-chart id="c1"></kcl-chart></kcl-slide>';
    const result = validateFrameCode(code);
    expect(result.warnings.some((w) => w.type === 'empty_content')).toBe(true);
  });
});

/* ============= parseFramesFromResponse ============= */

describe('parseFramesFromResponse', () => {
  it('parses single frame', () => {
    const response = '<kcl-slide><kcl-text>Hello</kcl-text></kcl-slide>';
    const frames = parseFramesFromResponse(response);
    expect(frames).toHaveLength(1);
    expect(frames[0].code).toContain('<kcl-slide>');
  });

  it('parses multiple frames separated by FRAME_SEPARATOR', () => {
    const response = [
      '<kcl-slide><kcl-text>Frame 1</kcl-text></kcl-slide>',
      '<!-- FRAME_SEPARATOR -->',
      '<kcl-slide><kcl-text>Frame 2</kcl-text></kcl-slide>',
    ].join('\n');
    const frames = parseFramesFromResponse(response);
    expect(frames).toHaveLength(2);
    expect(frames[0].code).toContain('Frame 1');
    expect(frames[1].code).toContain('Frame 2');
  });

  it('strips markdown code fences', () => {
    const response = '```html\n<kcl-slide><kcl-text>Hello</kcl-text></kcl-slide>\n```';
    const frames = parseFramesFromResponse(response);
    expect(frames).toHaveLength(1);
    expect(frames[0].code).not.toContain('```');
    expect(frames[0].code).toContain('<kcl-slide>');
  });

  it('extracts title from h1 kcl-text', () => {
    const response = '<kcl-slide><kcl-text level="h1">My Title</kcl-text></kcl-slide>';
    const frames = parseFramesFromResponse(response);
    expect(frames[0].title).toBe('My Title');
  });

  it('returns undefined title when no h1', () => {
    const response = '<kcl-slide><kcl-text level="h2">Subtitle</kcl-text></kcl-slide>';
    const frames = parseFramesFromResponse(response);
    expect(frames[0].title).toBeUndefined();
  });

  it('handles empty response', () => {
    const frames = parseFramesFromResponse('');
    expect(frames).toHaveLength(0);
  });

  it('handles whitespace-only response', () => {
    const frames = parseFramesFromResponse('   \n  \n  ');
    expect(frames).toHaveLength(0);
  });

  it('computes code hashes', () => {
    const response = '<kcl-slide><kcl-text>Hello</kcl-text></kcl-slide>';
    const frames = parseFramesFromResponse(response);
    expect(frames[0].codeHash).toBeTruthy();
    expect(frames[0].codeHash).toHaveLength(64); // SHA256 hex
  });

  it('extracts narrative blocks from NARRATIVE_START/NARRATIVE_END markers', () => {
    const response = [
      '<!-- NARRATIVE_START --><p>This is the intro</p><!-- NARRATIVE_END -->',
      '<kcl-slide><kcl-text>Slide content</kcl-text></kcl-slide>',
    ].join('\n');
    const frames = parseFramesFromResponse(response);
    expect(frames).toHaveLength(1);
    expect(frames[0].narrativeHtml).toBe('<p>This is the intro</p>');
    expect(frames[0].code).toContain('<kcl-slide>');
    expect(frames[0].code).not.toContain('NARRATIVE_START');
  });

  it('returns undefined narrative when markers absent', () => {
    const response = '<kcl-slide><kcl-text>Hello</kcl-text></kcl-slide>';
    const frames = parseFramesFromResponse(response);
    expect(frames[0].narrativeHtml).toBeUndefined();
  });

  it('produces deterministic hashes for identical code', () => {
    const response = '<kcl-slide><kcl-text>Hello</kcl-text></kcl-slide>';
    const frames1 = parseFramesFromResponse(response);
    const frames2 = parseFramesFromResponse(response);
    expect(frames1[0].codeHash).toBe(frames2[0].codeHash);
  });
});

/* ============= buildProofPayload ============= */

describe('buildProofPayload', () => {
  const makeResult = (overrides?: Partial<DesignResult>): DesignResult => ({
    action: 'generate',
    frames: [{ code: '<kcl-slide></kcl-slide>', codeHash: 'abc123' }],
    proofKind: 'design:generate',
    rawResponse: 'raw',
    provider: 'anthropic',
    model: 'claude-3',
    validation: { valid: true, errors: [], warnings: [] },
    retriesUsed: 0,
    isClarification: false,
    ...overrides,
  });

  it('returns correct structure for design:generate', () => {
    const result = makeResult();
    const payload = buildProofPayload('Create a slide', result, 'canvas-1');
    expect(payload.input.prompt).toBe('Create a slide');
    expect(payload.input.action).toBe('generate');
    expect(payload.input.canvasId).toBe('canvas-1');
    expect(payload.input.provider).toBe('anthropic');
    expect(payload.input.model).toBe('claude-3');
    expect(payload.output.frameCount).toBe(1);
    expect(payload.output.codeHashes).toEqual(['abc123']);
  });

  it('returns correct structure for design:edit', () => {
    const result = makeResult({ action: 'edit' });
    const payload = buildProofPayload('Fix the text', result, 'canvas-2');
    expect(payload.input.action).toBe('edit');
    expect(payload.output.validation).toEqual({
      valid: true,
      errorCount: 0,
      warningCount: 0,
    });
  });

  it('captures retries count', () => {
    const result = makeResult({ retriesUsed: 2 });
    const payload = buildProofPayload('prompt', result, 'c');
    expect(payload.output.retriesUsed).toBe(2);
  });

  it('captures validation failures', () => {
    const result = makeResult({
      validation: {
        valid: false,
        errors: [{ type: 'invalid_tag', message: 'bad tag' }],
        warnings: [{ type: 'missing_alt', message: 'no alt' }],
      },
    });
    const payload = buildProofPayload('prompt', result, 'c');
    expect(payload.output.validation).toEqual({
      valid: false,
      errorCount: 1,
      warningCount: 1,
    });
  });
});

/* ============= buildImageAssetRef ============= */

describe('buildImageAssetRef', () => {
  it('returns correct kcl-image HTML', () => {
    const html = buildImageAssetRef('asset-123', 'canvas-456', 'A chart');
    expect(html).toBe('<kcl-image src="/canvases/canvas-456/assets/asset-123" alt="A chart" />');
  });

  it('escapes HTML special characters in alt text', () => {
    const html = buildImageAssetRef('a1', 'c1', 'A "quote" & <tag>');
    expect(html).toContain('alt="A &quot;quote&quot; &amp; &lt;tag&gt;"');
  });

  it('escapes HTML special characters in asset ID', () => {
    const html = buildImageAssetRef('a<b', 'c1', 'img');
    expect(html).toContain('assets/a&lt;b');
  });

  it('escapes HTML special characters in canvas ID', () => {
    const html = buildImageAssetRef('a1', 'c"1', 'img');
    expect(html).toContain('/canvases/c&quot;1/');
  });
});
