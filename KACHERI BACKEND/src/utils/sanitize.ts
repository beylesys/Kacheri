/**
 * Strip dangerous HTML tags and event-handler attributes.
 * Defense-in-depth for stored XSS — strips <script>, <iframe>, <object>, <embed>
 * and all on* event handler attributes.
 */
export function stripDangerousHtml(html: string): string {
  return html
    // Strip tags AND their content for script/style/iframe/object/embed
    .replace(/<\s*(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    // Strip any remaining self-closing or orphaned opening/closing tags
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed)\b[^>]*>/gi, '')
    // Strip on* event handler attributes
    .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}
