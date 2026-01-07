// KACHERI BACKEND/src/ai/validators/strictRewrite.ts
// Purpose: Validate "constrained full rewrite" outputs preserve structure and only allowed spans change.
// This module is intentionally standalone and has zero provider/model assumptions.
// Wire it inside your existing constrainedRewrite route.

export interface Region { start: number; end: number } // [start, end) in plain-text offsets

export interface StrictRewriteInvariants {
  /** If provided, after must have the same number of block units (split on blank line). */
  blockCount?: number;

  /** Headings or marker lines that must remain exactly present (plain-text compare). */
  requiredLines?: string[];

  /** Regions that must NOT change (e.g., IDs/metadata); compared byte-for-byte by slice. */
  disallowedRegions?: Region[];

  /** Optional sanity: minimum & maximum percent of characters allowed to change overall. */
  changeRatio?: { min?: number; max?: number };
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Split into "blocks" using double newlines; trim trailing spaces for stability. */
function toBlocks(s: string): string[] {
  return s.replace(/\r\n/g, '\n').split(/\n{2,}/).map(b => b.replace(/[ \t]+$/gm, ''));
}

/** Compute a rough change ratio (Levenshtein-free; approximate) */
function diffRatioApprox(before: string, after: string): number {
  const a = before.replace(/\s+/g, '');
  const b = after.replace(/\s+/g, '');
  const maxLen = Math.max(a.length, b.length) || 1;
  // Jaccard-like token signal on characters
  const aset = new Set(a.split(''));
  const bset = new Set(b.split(''));
  let inter = 0;
  for (const ch of aset) if (bset.has(ch)) inter++;
  const union = new Set([...aset, ...bset]).size || 1;
  const similarity = inter / union;
  return 1 - similarity; // "ratio changed" in [0..1]
}

export function validateStrictRewrite(
  beforeText: string,
  afterText: string,
  inv: StrictRewriteInvariants
): ValidationResult {
  const errors: string[] = [];
  const before = beforeText.replace(/\r\n/g, '\n');
  const after = afterText.replace(/\r\n/g, '\n');

  // 1) Block count invariant
  if (typeof inv.blockCount === 'number') {
    const bBlocks = toBlocks(before).length;
    const aBlocks = toBlocks(after).length;
    if (aBlocks !== inv.blockCount || bBlocks !== inv.blockCount) {
      errors.push(`Block count changed (before=${bBlocks}, after=${aBlocks}, expected=${inv.blockCount}).`);
    }
  }

  // 2) Required lines must be present exactly (plain-text)
  if (inv.requiredLines && inv.requiredLines.length > 0) {
    for (const line of inv.requiredLines) {
      const needle = line.replace(/\r\n/g, '\n');
      if (!after.includes(needle)) {
        errors.push(`Required line missing in output: ${JSON.stringify(line)}`);
      }
    }
  }

  // 3) Disallowed regions must stay identical
  if (inv.disallowedRegions && inv.disallowedRegions.length > 0) {
    for (const r of inv.disallowedRegions) {
      const bSlice = before.slice(r.start, r.end);
      const aSlice = after.slice(r.start, r.end);
      if (bSlice !== aSlice) {
        errors.push(`Output modified a protected region [${r.start},${r.end}).`);
      }
    }
  }

  // 4) Global change ratio sanity (optional guardrail)
  if (inv.changeRatio) {
    const ratio = diffRatioApprox(before, after); // 0=identical, 1=very different
    const { min, max } = inv.changeRatio;
    if (typeof min === 'number' && ratio < min) {
      errors.push(`Too little changed (ratio=${ratio.toFixed(3)} < min=${min}).`);
    }
    if (typeof max === 'number' && ratio > max) {
      errors.push(`Too much changed (ratio=${ratio.toFixed(3)} > max=${max}).`);
    }
  }

  return { ok: errors.length === 0, errors };
}
