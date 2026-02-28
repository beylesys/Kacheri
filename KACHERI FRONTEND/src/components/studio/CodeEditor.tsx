// KACHERI FRONTEND/src/components/studio/CodeEditor.tsx
// Power Mode code editor for direct HTML/CSS/JS editing of frame code.
// Provides syntax highlighting, KCL autocompletion, live preview integration,
// format-on-save, validation, and known-good rollback.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 5, Slice D1

import { useRef, useEffect, useCallback, useState } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightSpecialChars } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { html } from '@codemirror/lang-html';
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { highlightSelectionMatches } from '@codemirror/search';
import './codeEditor.css';

// ── Props ──

interface CodeEditorProps {
  /** Current frame code (HTML/CSS/JS string) */
  code: string;
  /** Called when user edits code (debounced 300ms internally — E2) */
  onCodeChange: (code: string) => void;
  /** Called when user presses Ctrl+S / Cmd+S (formatted code) */
  onSave: (code: string) => void;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Set to true when the last render completed without error */
  renderSuccessful?: boolean;
}

// ── KCL Component Autocompletion Data ──

interface KCLComponentDef {
  tag: string;
  description: string;
  attributes: { name: string; values?: string[]; description: string }[];
}

const KCL_COMPONENTS: KCLComponentDef[] = [
  {
    tag: 'kcl-slide',
    description: 'Frame container with background and transition',
    attributes: [
      { name: 'background', description: 'Background color (CSS color)' },
      { name: 'transition', values: ['none', 'fade', 'slide-left', 'slide-right', 'zoom'], description: 'Slide transition type' },
      { name: 'aspect-ratio', values: ['16/9', '4/3', '1/1', '9/16'], description: 'Frame aspect ratio' },
      { name: 'padding', description: 'Inner padding in px (0-120)' },
    ],
  },
  {
    tag: 'kcl-text',
    description: 'Typography element',
    attributes: [
      { name: 'level', values: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span'], description: 'Semantic heading level' },
      { name: 'align', values: ['left', 'center', 'right', 'justify'], description: 'Text alignment' },
      { name: 'color', description: 'Text color (CSS color)' },
      { name: 'animate', values: ['none', 'fade', 'slide-up', 'slide-down', 'scale', 'bounce'], description: 'Entrance animation' },
      { name: 'delay', description: 'Animation delay in ms (0-5000)' },
    ],
  },
  {
    tag: 'kcl-layout',
    description: 'Flexbox/Grid composition container',
    attributes: [
      { name: 'type', values: ['flex', 'grid'], description: 'Layout mode' },
      { name: 'direction', values: ['row', 'column', 'row-reverse', 'column-reverse'], description: 'Flex direction' },
      { name: 'columns', description: 'Grid column count (1-12)' },
      { name: 'gap', description: 'Gap between items in px (0-96)' },
      { name: 'align', values: ['start', 'center', 'end', 'stretch'], description: 'Cross-axis alignment' },
      { name: 'justify', values: ['start', 'center', 'end', 'between', 'around', 'evenly'], description: 'Main-axis justification' },
      { name: 'wrap', description: 'Enable flex wrap (boolean attribute)' },
      { name: 'breakpoint', description: 'Responsive stack breakpoint in px (0-1920)' },
    ],
  },
  {
    tag: 'kcl-image',
    description: 'Image display with aspect ratio control',
    attributes: [
      { name: 'src', description: 'Image URL' },
      { name: 'alt', description: 'Alt text for accessibility' },
      { name: 'fit', values: ['cover', 'contain', 'fill', 'none'], description: 'Object-fit mode' },
      { name: 'aspect-ratio', values: ['16/9', '4/3', '1/1', '3/4', '9/16', 'auto'], description: 'Container aspect ratio' },
      { name: 'lazy', description: 'Enable lazy loading (boolean attribute)' },
      { name: 'width', description: 'Container width (CSS value)' },
      { name: 'radius', description: 'Border radius in px (0-200)' },
    ],
  },
  {
    tag: 'kcl-list',
    description: 'Animated list with staggered entrance',
    attributes: [
      { name: 'type', values: ['bullet', 'number', 'icon', 'none'], description: 'List marker type' },
      { name: 'animate', values: ['none', 'fade', 'slide-up', 'slide-left', 'scale'], description: 'Item entrance animation' },
      { name: 'stagger-delay', description: 'Delay between items in ms (0-1000)' },
    ],
  },
  {
    tag: 'kcl-quote',
    description: 'Blockquote with attribution',
    attributes: [
      { name: 'attribution', description: 'Quote attribution text' },
      { name: 'cite', description: 'Citation URL' },
      { name: 'variant', values: ['default', 'large', 'minimal', 'highlight'], description: 'Visual variant' },
    ],
  },
  {
    tag: 'kcl-metric',
    description: 'Key metric / KPI display with trend indicator',
    attributes: [
      { name: 'label', description: 'Metric label text' },
      { name: 'prefix', description: 'Value prefix (e.g., $)' },
      { name: 'suffix', description: 'Value suffix (e.g., %)' },
      { name: 'trend', values: ['up', 'down', 'flat'], description: 'Trend indicator' },
      { name: 'format', values: ['number', 'compact', 'currency', 'percent'], description: 'Value format' },
      { name: 'animate', description: 'Enable count-up animation (boolean attribute)' },
    ],
  },
  {
    tag: 'kcl-icon',
    description: 'SVG icon from bundled icon set',
    attributes: [
      { name: 'name', description: 'Icon name from the icon set' },
      { name: 'size', description: 'Icon size in px (12-96)' },
      { name: 'color', description: 'Icon color (CSS color)' },
      { name: 'stroke-width', description: 'SVG stroke width' },
      { name: 'label', description: 'Accessible label' },
    ],
  },
  {
    tag: 'kcl-animate',
    description: 'Animation wrapper for child elements',
    attributes: [
      { name: 'type', values: ['fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'scale', 'bounce', 'zoom'], description: 'Animation type' },
      { name: 'trigger', values: ['enter', 'hover', 'click'], description: 'Animation trigger' },
      { name: 'duration', description: 'Duration in ms (100-3000)' },
      { name: 'delay', description: 'Delay in ms (0-5000)' },
      { name: 'easing', description: 'CSS easing function' },
      { name: 'repeat', description: 'Repeat count (0 = infinite)' },
    ],
  },
  {
    tag: 'kcl-code',
    description: 'Syntax-highlighted code block',
    attributes: [
      { name: 'language', values: ['javascript', 'typescript', 'python', 'html', 'css', 'sql', 'json', 'markdown'], description: 'Programming language' },
      { name: 'line-numbers', description: 'Show line numbers (boolean attribute)' },
      { name: 'highlight-lines', description: 'Lines to highlight (e.g., "1,3-5")' },
      { name: 'theme', values: ['dark', 'light'], description: 'Color theme' },
    ],
  },
  {
    tag: 'kcl-embed',
    description: 'Embed external content (YouTube, Vimeo, etc.)',
    attributes: [
      { name: 'src', description: 'Embed URL (whitelisted domains only)' },
      { name: 'aspect-ratio', description: 'Container aspect ratio' },
      { name: 'title', description: 'Embed title for accessibility' },
    ],
  },
  {
    tag: 'kcl-source',
    description: 'Document source citation link',
    attributes: [
      { name: 'doc-id', description: 'Source document ID' },
      { name: 'section', description: 'Section reference within the document' },
      { name: 'label', description: 'Display label' },
    ],
  },
  {
    tag: 'kcl-chart',
    description: 'Data visualization chart (bar, line, pie, donut, scatter, area)',
    attributes: [
      { name: 'type', values: ['bar', 'line', 'pie', 'donut', 'scatter', 'area'], description: 'Chart type' },
      { name: 'palette', description: 'Color palette name' },
      { name: 'animate', description: 'Enable animations (boolean attribute)' },
      { name: 'legend', description: 'Show legend (boolean attribute)' },
      { name: 'axis-labels', description: 'Show axis labels (boolean attribute)' },
    ],
  },
  {
    tag: 'kcl-table',
    description: 'Data table with sorting and responsive overflow',
    attributes: [
      { name: 'sortable', description: 'Enable column sorting (boolean attribute)' },
      { name: 'striped', description: 'Alternating row colors (boolean attribute)' },
      { name: 'compact', description: 'Reduced padding (boolean attribute)' },
      { name: 'max-height', description: 'Maximum table height with scroll (px)' },
      { name: 'sticky-column', description: 'Sticky first column (boolean attribute)' },
    ],
  },
  {
    tag: 'kcl-timeline',
    description: 'Timeline display with events and connectors',
    attributes: [
      { name: 'direction', values: ['vertical', 'horizontal'], description: 'Layout direction' },
      { name: 'connector-style', values: ['solid', 'dashed', 'dotted'], description: 'Connector line style' },
      { name: 'animate', description: 'Enable entrance animations (boolean attribute)' },
    ],
  },
  {
    tag: 'kcl-compare',
    description: 'Before/after comparison slider',
    attributes: [
      { name: 'mode', values: ['slider', 'side-by-side', 'overlay'], description: 'Comparison mode' },
      { name: 'initial-position', description: 'Slider initial position (0-100)' },
    ],
  },
];

const KCL_TAG_SET = new Set(KCL_COMPONENTS.map((c) => c.tag));

// ── KCL Autocompletion ──

function kclCompletions(context: CompletionContext): CompletionResult | null {
  // 1. Tag name completion: triggered when typing <kcl-
  const tagMatch = context.matchBefore(/<kcl-[\w-]*/);
  if (tagMatch) {
    return {
      from: tagMatch.from + 1,
      options: KCL_COMPONENTS.map((c) => ({
        label: c.tag,
        type: 'type' as const,
        info: c.description,
        boost: 10,
      })),
    };
  }

  // 2. Attribute name / value completion inside a KCL tag
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = line.text.slice(0, context.pos - line.from);

  // 2a. Attribute value completion: inside quotes after a known attribute
  const attrValueMatch = textBefore.match(/<(kcl-[\w-]+)\s[^>]*([\w-]+)="([^"]*)$/);
  if (attrValueMatch) {
    const [, tagName, attrName, partialValue] = attrValueMatch;
    const component = KCL_COMPONENTS.find((c) => c.tag === tagName);
    const attr = component?.attributes.find((a) => a.name === attrName);
    if (attr?.values) {
      return {
        from: context.pos - partialValue.length,
        options: attr.values.map((v) => ({
          label: v,
          type: 'enum' as const,
        })),
      };
    }
    return null;
  }

  // 2b. Attribute name completion: inside a KCL tag, after a space
  const tagContextMatch = textBefore.match(/<(kcl-[\w-]+)\s[^>]*$/);
  if (tagContextMatch) {
    const tagName = tagContextMatch[1];
    const component = KCL_COMPONENTS.find((c) => c.tag === tagName);
    if (!component) return null;

    const attrMatch = context.matchBefore(/[\w-]*/);
    if (!attrMatch) return null;

    return {
      from: attrMatch.from,
      options: component.attributes.map((a) => ({
        label: a.name,
        type: 'property' as const,
        info: a.description,
        apply: a.values ? `${a.name}=""` : a.name,
      })),
    };
  }

  // 3. Data binding snippet
  const scriptMatch = context.matchBefore(/<script\s+type="application\/json"\s+data-for/);
  if (scriptMatch) {
    return {
      from: scriptMatch.from,
      options: [{
        label: 'script data-for (KCL data binding)',
        type: 'keyword' as const,
        info: 'KCL JSON data binding block',
        apply: '<script type="application/json" data-for="#">\n{\n  \n}\n</script>',
      }],
    };
  }

  return null;
}

// ── Format-on-Save ──

const VOID_TAGS = new Set([
  'br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base',
  'col', 'embed', 'source', 'track', 'wbr',
]);

function formatHtml(code: string): string {
  const lines = code.split('\n');
  let indent = 0;
  const INDENT = '  ';
  const result: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      result.push('');
      continue;
    }

    // Decrease indent for closing tags
    if (line.startsWith('</') || line === '-->') {
      indent = Math.max(0, indent - 1);
    }

    result.push(INDENT.repeat(indent) + line);

    // Increase indent for opening tags (not self-closing, not void)
    const openTagMatch = line.match(/^<([\w-]+)[^>]*(?<!\/)>$/);
    if (openTagMatch && !VOID_TAGS.has(openTagMatch[1]) && !line.includes('</')) {
      indent++;
    }
  }

  return result.join('\n');
}

// ── Validation ──

export interface ValidationError {
  line: number;
  col: number;
  message: string;
  severity: 'error' | 'warning';
}

export function validateFrameCode(code: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const lines = code.split('\n');

  // 1. Unclosed KCL tags
  const openCounts = new Map<string, number>();
  const kclOpenPattern = /<(kcl-[\w-]+)(?:\s[^>]*)?(?<!\/)>/g;
  const kclClosePattern = /<\/(kcl-[\w-]+)>/g;

  for (const line of lines) {
    let match;
    while ((match = kclOpenPattern.exec(line)) !== null) {
      openCounts.set(match[1], (openCounts.get(match[1]) ?? 0) + 1);
    }
    while ((match = kclClosePattern.exec(line)) !== null) {
      openCounts.set(match[1], (openCounts.get(match[1]) ?? 0) - 1);
    }
    // Reset regex lastIndex for next line
    kclOpenPattern.lastIndex = 0;
    kclClosePattern.lastIndex = 0;
  }

  for (const [tag, count] of openCounts) {
    if (count > 0) {
      errors.push({ line: 1, col: 1, message: `Unclosed <${tag}> tag (${count} unclosed)`, severity: 'error' });
    } else if (count < 0) {
      errors.push({ line: 1, col: 1, message: `Extra closing </${tag}> tag (${Math.abs(count)} extra)`, severity: 'error' });
    }
  }

  // 2. Unknown KCL tags
  for (let i = 0; i < lines.length; i++) {
    const unknownMatches = lines[i].matchAll(/<(kcl-[\w-]+)/g);
    for (const m of unknownMatches) {
      if (!KCL_TAG_SET.has(m[1])) {
        errors.push({
          line: i + 1,
          col: (m.index ?? 0) + 1,
          message: `Unknown KCL component: <${m[1]}>`,
          severity: 'error',
        });
      }
    }
  }

  // 3. Accessibility: kcl-image without alt
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('<kcl-image') && !lines[i].includes('alt=')) {
      errors.push({
        line: i + 1,
        col: 1,
        message: '<kcl-image> missing alt attribute for accessibility',
        severity: 'warning',
      });
    }
  }

  // 4. Network access detection (E1 — Frame Security Hardening)
  // Frames have CSP connect-src 'none' so these APIs will be blocked.
  // Warn the user so they understand why their code won't work.
  const NETWORK_PATTERNS: { pattern: RegExp; api: string }[] = [
    { pattern: /\bfetch\s*\(/g, api: 'fetch()' },
    { pattern: /\bnew\s+XMLHttpRequest\b/g, api: 'XMLHttpRequest' },
    { pattern: /\bnew\s+WebSocket\b/g, api: 'WebSocket' },
    { pattern: /\bnavigator\s*\.\s*sendBeacon\b/g, api: 'navigator.sendBeacon' },
    { pattern: /\bnew\s+EventSource\b/g, api: 'EventSource' },
    { pattern: /\bimport\s*\(/g, api: 'dynamic import()' },
  ];

  for (let i = 0; i < lines.length; i++) {
    for (const { pattern, api } of NETWORK_PATTERNS) {
      pattern.lastIndex = 0;
      const match = pattern.exec(lines[i]);
      if (match) {
        errors.push({
          line: i + 1,
          col: (match.index ?? 0) + 1,
          message: `Network access detected: ${api} \u2014 frames have no network access (CSP connect-src 'none'). This code will be blocked by the browser.`,
          severity: 'warning',
        });
      }
    }
  }

  return errors;
}

// ── Component ──

export function CodeEditor({
  code,
  onCodeChange,
  onSave,
  readOnly = false,
  renderSuccessful,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const readOnlyCompartment = useRef(new Compartment());
  const onCodeChangeRef = useRef(onCodeChange);
  const onSaveRef = useRef(onSave);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [knownGoodCode, setKnownGoodCode] = useState<string>(code);

  // Keep callback refs current
  onCodeChangeRef.current = onCodeChange;
  onSaveRef.current = onSave;

  // Track known-good code when render succeeds
  useEffect(() => {
    if (renderSuccessful && viewRef.current) {
      setKnownGoodCode(viewRef.current.state.doc.toString());
    }
  }, [renderSuccessful]);

  // Create CodeMirror editor on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const saveKeymap = keymap.of([{
      key: 'Mod-s',
      run: (view: EditorView) => {
        const formatted = formatHtml(view.state.doc.toString());
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: formatted },
        });
        onSaveRef.current(formatted);
        return true;
      },
    }]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
          onCodeChangeRef.current(update.state.doc.toString());
        }, 300); // E2 — 300ms debounce (aligned with backend persistence debounce)
      }
    });

    const state = EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightSpecialChars(),
        bracketMatching(),
        indentOnInput(),
        highlightSelectionMatches(),
        html(),
        autocompletion({ override: [kclCompletions] }),
        oneDark,
        saveKeymap,
        keymap.of([...defaultKeymap, indentWithTab]),
        updateListener,
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px' },
          '.cm-scroller': { overflow: 'auto', fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace" },
          '.cm-content': { padding: '8px 0' },
          '.cm-gutters': { borderRight: '1px solid rgba(255,255,255,0.08)' },
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      view.destroy();
      viewRef.current = null;
    };
    // Only create on mount — external code sync handled separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external code changes into the editor (e.g., AI edits)
  const lastExternalCodeRef = useRef(code);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    if (code !== currentDoc && code !== lastExternalCodeRef.current) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: code },
      });
    }
    lastExternalCodeRef.current = code;
  }, [code]);

  // Toggle read-only state
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        EditorState.readOnly.of(readOnly),
      ),
    });
  }, [readOnly]);

  // Validate handler
  const handleValidate = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    setValidationErrors(validateFrameCode(view.state.doc.toString()));
  }, []);

  // Rollback handler
  const handleRollback = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: knownGoodCode },
    });
    onCodeChangeRef.current(knownGoodCode);
    setValidationErrors([]);
  }, [knownGoodCode]);

  const currentCode = viewRef.current?.state.doc.toString() ?? code;
  const showRollback = knownGoodCode !== currentCode;

  return (
    <div className="code-editor">
      {/* Toolbar */}
      <div className="code-editor-toolbar">
        <span className="code-editor-toolbar-title">Code Editor</span>
        <span className="spacer" />

        <button
          className="code-editor-toolbar-btn"
          onClick={handleValidate}
          title="Validate KCL code"
          aria-label="Validate code"
        >
          Validate
        </button>

        {showRollback && (
          <button
            className="code-editor-toolbar-btn code-editor-toolbar-btn--rollback"
            onClick={handleRollback}
            title="Rollback to last known good render"
            aria-label="Rollback to last successful render"
          >
            Rollback
          </button>
        )}

        <span className="code-editor-toolbar-hint">
          Ctrl+S to format &amp; save
        </span>
      </div>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="code-editor-errors" role="alert">
          {validationErrors.map((err, i) => (
            <div
              key={i}
              className={`code-editor-error code-editor-error--${err.severity}`}
            >
              <span className="code-editor-error-location">
                L{err.line}:{err.col}
              </span>
              <span className="code-editor-error-message">{err.message}</span>
            </div>
          ))}
          <button
            className="code-editor-errors-close"
            onClick={() => setValidationErrors([])}
            aria-label="Dismiss validation errors"
          >
            &times;
          </button>
        </div>
      )}

      {/* CodeMirror container */}
      <div className="code-editor-cm" ref={containerRef} />
    </div>
  );
}

export default CodeEditor;
