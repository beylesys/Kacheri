// KACHERI FRONTEND/src/headingsIndex.ts
// Shared heading index helper used by HeadingsOutline and TableOfContents.
//
// It parses the current document HTML, extracts H1–H6 headings,
// and best‑effort maps them into plain‑text offsets so we can
// jump via EditorApi.selectPlainTextRange.

export type HeadingIndexItem = {
  id: string;
  level: number; // 1–6
  text: string;
  start: number | null; // plain‑text start offset
  end: number | null; // plain‑text end offset
  indentLevel: number; // 1–4 for visual indent
};

type BuildOptions = {
  /** Maximum heading level to include (default: 6). */
  maxLevel?: number;
  /** Maximum visual indent level (default: 4). */
  maxIndentLevel?: number;
};

export function buildHeadingIndex(
  html: string,
  plainText: string,
  opts?: BuildOptions
): HeadingIndexItem[] {
  if (!html) return [];

  const container = document.createElement("div");
  container.innerHTML = html;

  const nodes = container.querySelectorAll("h1,h2,h3,h4,h5,h6");
  const items: HeadingIndexItem[] = [];

  const haystack = plainText || "";
  let searchFrom = 0;

  const maxLevel = opts?.maxLevel ?? 6;
  const maxIndentLevel = opts?.maxIndentLevel ?? 4;

  nodes.forEach((node, index) => {
    const tag = node.tagName.toLowerCase(); // "h1"…"h6"
    const numericLevel = Number(tag.replace("h", "")) || 1;

    // Optionally ignore deep levels (e.g. H5/H6 for ToC).
    if (numericLevel > maxLevel) return;

    const rawText = (node.textContent || "").replace(/\s+/g, " ").trim();
    const text = rawText || "(untitled heading)";

    let start: number | null = null;
    let end: number | null = null;

    if (haystack && rawText) {
      const idx = haystack.indexOf(rawText, searchFrom);
      if (idx !== -1) {
        start = idx;
        end = idx + rawText.length;
        searchFrom = end;
      }
    }

    const indentLevel = Math.min(
      Math.max(numericLevel, 1),
      maxIndentLevel
    );

    items.push({
      id: `heading-${index}`,
      level: numericLevel,
      text,
      start,
      end,
      indentLevel,
    });
  });

  return items;
}
