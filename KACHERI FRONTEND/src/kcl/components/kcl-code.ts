/* === kcl-code — Syntax-Highlighted Code v1.0.0 === */

import { KCLBaseElement } from '../base.ts';
import type {
  PropertySchema,
  CodeData,
  SupportedLanguage,
  Token,
  TokenType,
} from '../types.ts';
import { LANGUAGE_ALIASES } from '../types.ts';

// --- Lightweight tokenizers ---

interface TokenRule {
  type: TokenType;
  pattern: RegExp;
}

function tokenize(code: string, rules: TokenRule[]): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < code.length) {
    let matched = false;
    for (const rule of rules) {
      rule.pattern.lastIndex = pos;
      const m = rule.pattern.exec(code);
      if (m && m.index === pos) {
        tokens.push({ type: rule.type, text: m[0] });
        pos += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      tokens.push({ type: 'plain', text: code[pos] });
      pos++;
    }
  }
  return tokens;
}

const JS_KEYWORDS = 'abstract|arguments|await|boolean|break|byte|case|catch|char|class|const|continue|debugger|default|delete|do|double|else|enum|eval|export|extends|final|finally|float|for|function|goto|if|implements|import|in|instanceof|int|interface|let|long|native|new|null|of|package|private|protected|public|return|short|static|super|switch|synchronized|this|throw|throws|transient|try|typeof|undefined|var|void|volatile|while|with|yield|async|from|true|false';
const TS_EXTRA = '|type|declare|namespace|module|keyof|readonly|infer|is|asserts|satisfies|override|accessor|as|unknown|never|any|string|number|bigint|symbol|object';

function jsRules(extra = ''): TokenRule[] {
  const kw = JS_KEYWORDS + extra;
  return [
    { type: 'comment', pattern: /\/\/.*$/gm },
    { type: 'comment', pattern: /\/\*[\s\S]*?\*\//gm },
    { type: 'string', pattern: /`(?:[^`\\]|\\.)*`/gm },
    { type: 'string', pattern: /"(?:[^"\\]|\\.)*"/gm },
    { type: 'string', pattern: /'(?:[^'\\]|\\.)*'/gm },
    { type: 'number', pattern: /\b(?:0[xX][\da-fA-F]+|0[bB][01]+|0[oO][0-7]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/gm },
    { type: 'keyword', pattern: new RegExp(`\\b(?:${kw})\\b`, 'gm') },
    { type: 'operator', pattern: /[+\-*/%=<>!&|^~?:]+/gm },
    { type: 'punctuation', pattern: /[{}[\]();,.]/gm },
    { type: 'identifier', pattern: /\b[a-zA-Z_$][\w$]*\b/gm },
  ];
}

const PY_KEYWORDS = 'False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield';

function pyRules(): TokenRule[] {
  return [
    { type: 'comment', pattern: /#.*$/gm },
    { type: 'string', pattern: /"""[\s\S]*?"""/gm },
    { type: 'string', pattern: /'''[\s\S]*?'''/gm },
    { type: 'string', pattern: /"(?:[^"\\]|\\.)*"/gm },
    { type: 'string', pattern: /'(?:[^'\\]|\\.)*'/gm },
    { type: 'number', pattern: /\b(?:0[xX][\da-fA-F]+|0[bB][01]+|0[oO][0-7]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/gm },
    { type: 'keyword', pattern: new RegExp(`\\b(?:${PY_KEYWORDS})\\b`, 'gm') },
    { type: 'builtin', pattern: /\b(?:print|len|range|int|str|float|list|dict|set|tuple|bool|input|open|type|super|map|filter|zip|enumerate|sorted|reversed|abs|min|max|sum|any|all|isinstance|hasattr|getattr|setattr)\b/gm },
    { type: 'operator', pattern: /[+\-*/%=<>!&|^~@]+/gm },
    { type: 'punctuation', pattern: /[{}[\]();:,.]/gm },
    { type: 'identifier', pattern: /\b[a-zA-Z_]\w*\b/gm },
  ];
}

function htmlRules(): TokenRule[] {
  return [
    { type: 'comment', pattern: /<!--[\s\S]*?-->/gm },
    { type: 'tag', pattern: /<\/?[\w-]+/gm },
    { type: 'tag', pattern: /\/?>/gm },
    { type: 'attribute', pattern: /\b[\w-]+(?==)/gm },
    { type: 'value', pattern: /=\s*"[^"]*"/gm },
    { type: 'value', pattern: /=\s*'[^']*'/gm },
    { type: 'plain', pattern: /[^<]+/gm },
  ];
}

function cssRules(): TokenRule[] {
  return [
    { type: 'comment', pattern: /\/\*[\s\S]*?\*\//gm },
    { type: 'keyword', pattern: /@[\w-]+/gm },
    { type: 'property', pattern: /[\w-]+(?=\s*:)/gm },
    { type: 'value', pattern: /#[\da-fA-F]{3,8}\b/gm },
    { type: 'number', pattern: /\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b/gm },
    { type: 'string', pattern: /"[^"]*"|'[^']*'/gm },
    { type: 'punctuation', pattern: /[{}();:,]/gm },
    { type: 'identifier', pattern: /[\w.-]+/gm },
  ];
}

const SQL_KEYWORDS = 'SELECT|FROM|WHERE|AND|OR|NOT|IN|IS|NULL|AS|ON|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|GROUP|BY|ORDER|ASC|DESC|HAVING|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP|INDEX|VIEW|DISTINCT|UNION|ALL|EXISTS|BETWEEN|LIKE|CASE|WHEN|THEN|ELSE|END|COUNT|SUM|AVG|MIN|MAX|PRIMARY|KEY|FOREIGN|REFERENCES|CONSTRAINT|DEFAULT|CHECK|UNIQUE|NOT|WITH';

function sqlRules(): TokenRule[] {
  return [
    { type: 'comment', pattern: /--.*$/gm },
    { type: 'comment', pattern: /\/\*[\s\S]*?\*\//gm },
    { type: 'string', pattern: /'(?:[^'\\]|\\.)*'/gm },
    { type: 'number', pattern: /\b\d+(?:\.\d+)?\b/gm },
    { type: 'keyword', pattern: new RegExp(`\\b(?:${SQL_KEYWORDS})\\b`, 'gim') },
    { type: 'operator', pattern: /[=<>!+\-*/]+/gm },
    { type: 'punctuation', pattern: /[();,.]/gm },
    { type: 'identifier', pattern: /\b[\w]+\b/gm },
  ];
}

function jsonRules(): TokenRule[] {
  return [
    { type: 'property', pattern: /"(?:[^"\\]|\\.)*"(?=\s*:)/gm },
    { type: 'string', pattern: /"(?:[^"\\]|\\.)*"/gm },
    { type: 'number', pattern: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/gm },
    { type: 'keyword', pattern: /\b(?:true|false|null)\b/gm },
    { type: 'punctuation', pattern: /[{}[\]:,]/gm },
  ];
}

function mdRules(): TokenRule[] {
  return [
    { type: 'keyword', pattern: /^#{1,6}\s.*$/gm },
    { type: 'string', pattern: /\*\*[^*]+\*\*/gm },
    { type: 'string', pattern: /\*[^*]+\*/gm },
    { type: 'value', pattern: /`[^`]+`/gm },
    { type: 'tag', pattern: /\[([^\]]+)\]\([^)]+\)/gm },
    { type: 'punctuation', pattern: /^[-*+]\s/gm },
    { type: 'number', pattern: /^\d+\.\s/gm },
  ];
}

const TOKENIZERS: Record<SupportedLanguage, TokenRule[]> = {
  javascript: jsRules(),
  typescript: jsRules(TS_EXTRA),
  python: pyRules(),
  html: htmlRules(),
  css: cssRules(),
  sql: sqlRules(),
  json: jsonRules(),
  markdown: mdRules(),
};

function resolveLanguage(lang: string): SupportedLanguage {
  const lower = lang.toLowerCase();
  return (LANGUAGE_ALIASES[lower] as SupportedLanguage) ?? (lower as SupportedLanguage);
}

function parseHighlightLines(attr: string): Set<number> {
  const result = new Set<number>();
  if (!attr) return result;
  for (const part of attr.split(',')) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) result.add(i);
      }
    } else {
      const n = parseInt(trimmed, 10);
      if (!isNaN(n)) result.add(n);
    }
  }
  return result;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// --- Component ---

export class KCLCode extends KCLBaseElement {
  static get observedAttributes(): string[] {
    return ['language', 'line-numbers', 'highlight-lines', 'theme'];
  }

  static override get editableProperties(): PropertySchema[] {
    return [
      { name: 'code', label: 'Code', type: 'text', isAttribute: false, group: 'content' },
      { name: 'language', label: 'Language', type: 'select', options: ['javascript', 'typescript', 'python', 'html', 'css', 'sql', 'json', 'markdown'], isAttribute: true, group: 'content' },
      { name: 'theme', label: 'Theme', type: 'select', options: ['dark', 'light'], isAttribute: true, group: 'appearance', defaultValue: 'dark' },
      { name: 'line-numbers', label: 'Line Numbers', type: 'boolean', isAttribute: true, group: 'appearance' },
      { name: 'highlight-lines', label: 'Highlight Lines', type: 'text', isAttribute: true, group: 'appearance' },
    ];
  }

  protected render(): void {
    const langAttr = this.attr('language', 'javascript');
    const language = resolveLanguage(langAttr);
    const showLineNumbers = this.boolAttr('line-numbers');
    const highlightLines = parseHighlightLines(this.attr('highlight-lines'));
    const theme = this.attr('theme', 'dark');

    const data = this.data as CodeData | undefined;
    const code = data?.code ?? this.initialContent.trim();

    const rules = TOKENIZERS[language] ?? TOKENIZERS.javascript;
    const tokens = tokenize(code, rules);

    // Split tokens into lines
    const lines: Token[][] = [[]];
    for (const token of tokens) {
      const parts = token.text.split('\n');
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) lines.push([]);
        if (parts[i]) {
          lines[lines.length - 1].push({ type: token.type, text: parts[i] });
        }
      }
    }

    // Build HTML
    const langLabel = language.charAt(0).toUpperCase() + language.slice(1);
    let html = `<div class="kcl-code-container kcl-code--${theme}" role="region" aria-label="Code block">`;
    html += `<div class="kcl-code-header"><span class="kcl-code-lang">${langLabel}</span></div>`;
    html += '<pre class="kcl-code-pre"><code class="kcl-code-content"><table class="kcl-code-lines">';

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const isHighlighted = highlightLines.has(lineNum);
      const rowClass = `kcl-code-line${isHighlighted ? ' kcl-code-line--highlight' : ''}`;

      html += `<tr class="${rowClass}">`;
      if (showLineNumbers) {
        html += `<td class="kcl-code-ln" aria-hidden="true">${lineNum}</td>`;
      }
      html += '<td class="kcl-code-text">';
      for (const token of lines[i]) {
        if (token.type === 'plain') {
          html += escapeHtml(token.text);
        } else {
          html += `<span class="kcl-tok-${token.type}">${escapeHtml(token.text)}</span>`;
        }
      }
      // Empty line gets a zero-width space for correct height
      if (lines[i].length === 0) {
        html += '\u200b';
      }
      html += '</td></tr>';
    }

    html += '</table></code></pre></div>';

    this.innerHTML = html;
  }
}

customElements.define('kcl-code', KCLCode);
