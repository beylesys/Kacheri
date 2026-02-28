import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "blockquote",
  "pre",
  "code",
  "mark",
  "span",
  "div",
  "img",
];

const ALLOWED_ATTR = ["href", "src", "alt", "class", "style"];

/**
 * Sanitize user-controlled HTML before rendering with dangerouslySetInnerHTML.
 * Uses DOMPurify with a strict allowlist of tags and attributes.
 * Strips <script>, <iframe>, <object>, <embed>, and all on* event handlers.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
}
