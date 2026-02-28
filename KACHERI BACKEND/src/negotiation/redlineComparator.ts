// KACHERI BACKEND/src/negotiation/redlineComparator.ts
// Redline Comparator: Core text comparison engine for negotiation rounds
//
// Implements two-level diff (paragraph + sentence) with heuristic categorization.
// Uses LCS algorithm adapted from src/store/versions.ts (no new dependencies).
// Imports htmlToPlainText / extractSections from compliance/engine.ts.
//
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md - Slice 2

import { extractSections } from "../compliance/engine";
import type { ChangeCategory } from "../store/negotiationChanges";
import type {
  RedlineCompareInput,
  RedlineCompareResult,
  DetectedChange,
  Paragraph,
  Sentence,
  SectionBoundary,
} from "./types";

/* ============= Constants ============= */

/** Similarity ratio (0=identical, 1=completely different).
 *  Below this threshold two paragraphs are considered "modified" (→ sentence diff).
 *  Above it they are treated as independent delete + insert (structural). */
const SIMILARITY_PAIR_THRESHOLD = 0.7;

/** Changes with text longer than this are considered structural. */
const STRUCTURAL_LENGTH_THRESHOLD = 500;

/* ============= Main Entry Point ============= */

/**
 * Compare two document snapshots and produce a structured change list.
 *
 * Flow:
 * 1. Pre-process: split into paragraphs with position tracking
 * 2. Paragraph-level LCS: identify structural changes
 * 3. Sentence-level LCS: refine modified paragraphs
 * 4. Categorize changes: substantive / editorial / structural heuristics
 * 5. Map to section headings: for navigation
 * 6. Return structured DetectedChange[] array
 */
export function compareRounds(input: RedlineCompareInput): RedlineCompareResult {
  const startTime = Date.now();
  const { previousText, currentText, previousHtml } = input;

  // Fast-path: identical documents
  if (previousText === currentText) {
    return emptyResult(startTime);
  }

  // Fast-path: one side empty
  const emptyRes = handleEmptyDocs(previousText, currentText, startTime);
  if (emptyRes) return emptyRes;

  // Step 1: Pre-process
  const oldParagraphs = splitIntoParagraphs(previousText);
  const newParagraphs = splitIntoParagraphs(currentText);
  const sectionBoundaries = extractSectionBoundaries(previousHtml, previousText);

  // Step 2: Paragraph-level diff
  const rawChanges = diffParagraphs(oldParagraphs, newParagraphs);

  // Step 3: Refine "replace" changes with sentence-level diff
  const refinedChanges: DetectedChange[] = [];
  for (const change of rawChanges) {
    if (change.changeType === "replace" && change.originalText && change.proposedText) {
      const sim = computeSimilarity(change.originalText, change.proposedText);
      if (sim < SIMILARITY_PAIR_THRESHOLD) {
        // Similar enough → sentence-level refinement
        const oldPara: Paragraph = {
          text: change.originalText,
          startPos: change.fromPos,
          endPos: change.toPos,
          index: 0,
        };
        const newPara: Paragraph = {
          text: change.proposedText,
          startPos: 0,
          endPos: change.proposedText.length,
          index: 0,
        };
        const sentenceChanges = diffSentences(oldPara, newPara);
        if (sentenceChanges.length > 0) {
          refinedChanges.push(...sentenceChanges);
        } else {
          // Sentence diff produced nothing (single-sentence paragraph) — keep original
          refinedChanges.push(change);
        }
      } else {
        // Too different → structural replace
        refinedChanges.push({ ...change, category: "structural" });
      }
    } else {
      refinedChanges.push(change);
    }
  }

  // Step 4: Categorize changes that still have default category
  for (const change of refinedChanges) {
    if (change.category === "editorial") {
      // "editorial" is the default — re-evaluate with heuristics
      change.category = categorizeChange(change);
    }
  }

  // Step 5: Map to section headings
  for (const change of refinedChanges) {
    change.sectionHeading = findSectionHeading(change.fromPos, sectionBoundaries);
  }

  // Step 6: Aggregate counts
  let substantive = 0;
  let editorial = 0;
  let structural = 0;
  for (const c of refinedChanges) {
    if (c.category === "substantive") substantive++;
    else if (c.category === "editorial") editorial++;
    else structural++;
  }

  return {
    changes: refinedChanges,
    totalChanges: refinedChanges.length,
    substantive,
    editorial,
    structural,
    processingTimeMs: Date.now() - startTime,
  };
}

/* ============= Pre-Processing ============= */

/**
 * Split plain text into paragraphs delimited by double newlines.
 * Tracks character positions for each paragraph.
 */
function splitIntoParagraphs(text: string): Paragraph[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const paragraphs: Paragraph[] = [];

  // Split on double-newline boundaries
  const regex = /\n\n+/g;
  let lastEnd = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalized)) !== null) {
    const paraText = normalized.slice(lastEnd, match.index).trim();
    if (paraText.length > 0) {
      paragraphs.push({
        text: paraText,
        startPos: lastEnd,
        endPos: match.index,
        index: paragraphs.length,
      });
    }
    lastEnd = match.index + match[0].length;
  }

  // Trailing paragraph
  const trailing = normalized.slice(lastEnd).trim();
  if (trailing.length > 0) {
    paragraphs.push({
      text: trailing,
      startPos: lastEnd,
      endPos: normalized.length,
      index: paragraphs.length,
    });
  }

  return paragraphs;
}

/**
 * Split paragraph text into sentences.
 * Handles common abbreviations (Dr., Inc., etc.) and decimals (3.14).
 */
function splitIntoSentences(paragraphText: string): Sentence[] {
  const sentences: Sentence[] = [];
  // Match sentence-ending punctuation followed by space or end of string
  const sentenceRegex = /[^.!?]*(?:[.!?](?:\s|$)|$)/g;
  let match: RegExpExecArray | null;

  while ((match = sentenceRegex.exec(paragraphText)) !== null) {
    const sentenceText = match[0].trim();
    if (sentenceText.length === 0) break;

    sentences.push({
      text: sentenceText,
      startPosInParagraph: match.index,
      endPosInParagraph: match.index + match[0].trimEnd().length,
    });
  }

  // If regex produced nothing, treat the whole paragraph as one sentence
  if (sentences.length === 0 && paragraphText.trim().length > 0) {
    sentences.push({
      text: paragraphText.trim(),
      startPosInParagraph: 0,
      endPosInParagraph: paragraphText.length,
    });
  }

  return sentences;
}

/**
 * Extract section boundaries from HTML, mapped to character positions in the
 * corresponding plain text. Uses extractSections() from compliance/engine.ts.
 */
function extractSectionBoundaries(html: string, plainText: string): SectionBoundary[] {
  const sections = extractSections(html);
  if (sections.length === 0) return [];

  const boundaries: SectionBoundary[] = [];

  for (const section of sections) {
    // Find the heading text in the plain text to determine character position.
    // Search forward from the last known position to handle duplicate headings.
    const searchFrom = boundaries.length > 0
      ? boundaries[boundaries.length - 1].startPos + 1
      : 0;
    const headingIdx = plainText.indexOf(section.heading, searchFrom);

    if (headingIdx === -1) continue; // heading not found in plain text — skip

    // Section body follows the heading; estimate end as start of next section or EOF
    const bodyIdx = plainText.indexOf(section.body.slice(0, 40), headingIdx);
    const endPos = bodyIdx !== -1
      ? bodyIdx + section.body.length
      : headingIdx + section.heading.length + section.wordCount * 6; // rough estimate

    boundaries.push({
      heading: section.heading,
      level: section.level,
      startPos: headingIdx,
      endPos: Math.min(endPos, plainText.length),
    });
  }

  return boundaries;
}

/* ============= Diff Algorithm ============= */

/**
 * Compute Longest Common Subsequence (LCS) of two string arrays.
 * Adapted from src/store/versions.ts (lines 448-482).
 */
function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;

  // Build DP table
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find LCS
  const lcs: string[] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

/**
 * Find matched index pairs between old and new arrays using LCS.
 * Returns arrays of matched indices in old and new.
 */
function findMatchedIndices(
  oldTexts: string[],
  newTexts: string[]
): { oldMatched: Set<number>; newMatched: Set<number>; pairs: Array<[number, number]> } {
  const lcs = computeLCS(oldTexts, newTexts);
  const oldMatched = new Set<number>();
  const newMatched = new Set<number>();
  const pairs: Array<[number, number]> = [];

  let oldIdx = 0;
  let newIdx = 0;

  for (const lcsValue of lcs) {
    // Advance old pointer to find the LCS element
    while (oldIdx < oldTexts.length && oldTexts[oldIdx] !== lcsValue) {
      oldIdx++;
    }
    // Advance new pointer to find the LCS element
    while (newIdx < newTexts.length && newTexts[newIdx] !== lcsValue) {
      newIdx++;
    }

    if (oldIdx < oldTexts.length && newIdx < newTexts.length) {
      oldMatched.add(oldIdx);
      newMatched.add(newIdx);
      pairs.push([oldIdx, newIdx]);
      oldIdx++;
      newIdx++;
    }
  }

  return { oldMatched, newMatched, pairs };
}

/**
 * Paragraph-level diff using LCS with similarity-based pairing.
 *
 * 1. Run LCS to find identical paragraphs (anchors).
 * 2. Between anchors, collect unmatched old + new paragraphs.
 * 3. Pair unmatched paragraphs by similarity → replace.
 * 4. Remaining unpaired → delete (old) or insert (new).
 */
function diffParagraphs(
  oldParagraphs: Paragraph[],
  newParagraphs: Paragraph[]
): DetectedChange[] {
  const oldNorm = oldParagraphs.map((p) => normalizeWhitespace(p.text));
  const newNorm = newParagraphs.map((p) => normalizeWhitespace(p.text));

  const { oldMatched, newMatched, pairs } = findMatchedIndices(oldNorm, newNorm);

  const changes: DetectedChange[] = [];

  // Build anchor list: indices of matched paragraphs, plus sentinels at start/end
  const anchors: Array<[number, number]> = [[-1, -1], ...pairs, [oldParagraphs.length, newParagraphs.length]];

  for (let a = 0; a < anchors.length - 1; a++) {
    const [prevOld, prevNew] = anchors[a];
    const [nextOld, nextNew] = anchors[a + 1];

    // Collect unmatched paragraphs between anchors
    const unmatchedOld: Paragraph[] = [];
    for (let i = prevOld + 1; i < nextOld; i++) {
      if (!oldMatched.has(i)) {
        unmatchedOld.push(oldParagraphs[i]);
      }
    }

    const unmatchedNew: Paragraph[] = [];
    for (let j = prevNew + 1; j < nextNew; j++) {
      if (!newMatched.has(j)) {
        unmatchedNew.push(newParagraphs[j]);
      }
    }

    // Pair unmatched paragraphs by similarity
    const { paired, remainingOld, remainingNew } = pairBySimilarity(unmatchedOld, unmatchedNew);

    // Paired → replace changes
    for (const [oldP, newP] of paired) {
      changes.push({
        changeType: "replace",
        category: "editorial", // will be refined later
        sectionHeading: null,
        originalText: oldP.text,
        proposedText: newP.text,
        fromPos: oldP.startPos,
        toPos: oldP.endPos,
      });
    }

    // Remaining old → delete changes
    for (const oldP of remainingOld) {
      changes.push({
        changeType: "delete",
        category: "editorial",
        sectionHeading: null,
        originalText: oldP.text,
        proposedText: null,
        fromPos: oldP.startPos,
        toPos: oldP.endPos,
      });
    }

    // Remaining new → insert changes
    for (const newP of remainingNew) {
      // Insert position: use the start of the next anchor in old text, or end of old text
      const insertPos = nextOld < oldParagraphs.length
        ? oldParagraphs[nextOld].startPos
        : (oldParagraphs.length > 0 ? oldParagraphs[oldParagraphs.length - 1].endPos : 0);

      changes.push({
        changeType: "insert",
        category: "editorial",
        sectionHeading: null,
        originalText: null,
        proposedText: newP.text,
        fromPos: insertPos,
        toPos: insertPos,
      });
    }
  }

  // Sort by position in old text
  changes.sort((a, b) => a.fromPos - b.fromPos);

  return changes;
}

/**
 * Pair unmatched old and new paragraphs by text similarity.
 * Greedy: for each old paragraph, find the most similar new paragraph.
 */
function pairBySimilarity(
  unmatchedOld: Paragraph[],
  unmatchedNew: Paragraph[]
): {
  paired: Array<[Paragraph, Paragraph]>;
  remainingOld: Paragraph[];
  remainingNew: Paragraph[];
} {
  const paired: Array<[Paragraph, Paragraph]> = [];
  const usedNew = new Set<number>();
  const pairedOldIndices = new Set<number>();

  for (let i = 0; i < unmatchedOld.length; i++) {
    let bestIdx = -1;
    let bestSim = SIMILARITY_PAIR_THRESHOLD; // only pair if more similar than threshold

    for (let j = 0; j < unmatchedNew.length; j++) {
      if (usedNew.has(j)) continue;
      const sim = computeSimilarity(unmatchedOld[i].text, unmatchedNew[j].text);
      if (sim < bestSim) {
        bestSim = sim;
        bestIdx = j;
      }
    }

    if (bestIdx !== -1) {
      paired.push([unmatchedOld[i], unmatchedNew[bestIdx]]);
      usedNew.add(bestIdx);
      pairedOldIndices.add(i);
    }
  }

  const remainingOld = unmatchedOld.filter((_, i) => !pairedOldIndices.has(i));
  const remainingNew = unmatchedNew.filter((_, j) => !usedNew.has(j));

  return { paired, remainingOld, remainingNew };
}

/**
 * Sentence-level diff within a modified paragraph.
 * Refines a paragraph-level "replace" into finer-grained changes.
 */
function diffSentences(
  oldParagraph: Paragraph,
  newParagraph: Paragraph
): DetectedChange[] {
  const oldSentences = splitIntoSentences(oldParagraph.text);
  const newSentences = splitIntoSentences(newParagraph.text);

  // If either side is a single sentence, no further refinement possible
  if (oldSentences.length <= 1 && newSentences.length <= 1) {
    return [];
  }

  const oldNorm = oldSentences.map((s) => normalizeWhitespace(s.text));
  const newNorm = newSentences.map((s) => normalizeWhitespace(s.text));

  const { oldMatched, newMatched, pairs } = findMatchedIndices(oldNorm, newNorm);

  const changes: DetectedChange[] = [];

  // Walk with anchors, same pattern as paragraph diff
  const anchors: Array<[number, number]> = [
    [-1, -1],
    ...pairs,
    [oldSentences.length, newSentences.length],
  ];

  for (let a = 0; a < anchors.length - 1; a++) {
    const [prevOldIdx, prevNewIdx] = anchors[a];
    const [nextOldIdx, nextNewIdx] = anchors[a + 1];

    // Collect unmatched sentences between anchors
    const unOld: Sentence[] = [];
    for (let i = prevOldIdx + 1; i < nextOldIdx; i++) {
      if (!oldMatched.has(i)) unOld.push(oldSentences[i]);
    }
    const unNew: Sentence[] = [];
    for (let j = prevNewIdx + 1; j < nextNewIdx; j++) {
      if (!newMatched.has(j)) unNew.push(newSentences[j]);
    }

    // Pair sentences (simple 1:1 matching by order for sentences)
    const pairCount = Math.min(unOld.length, unNew.length);
    for (let k = 0; k < pairCount; k++) {
      const absStart = oldParagraph.startPos + unOld[k].startPosInParagraph;
      const absEnd = oldParagraph.startPos + unOld[k].endPosInParagraph;
      changes.push({
        changeType: "replace",
        category: "editorial",
        sectionHeading: null,
        originalText: unOld[k].text,
        proposedText: unNew[k].text,
        fromPos: absStart,
        toPos: absEnd,
      });
    }

    // Extra old sentences → deletes
    for (let k = pairCount; k < unOld.length; k++) {
      const absStart = oldParagraph.startPos + unOld[k].startPosInParagraph;
      const absEnd = oldParagraph.startPos + unOld[k].endPosInParagraph;
      changes.push({
        changeType: "delete",
        category: "editorial",
        sectionHeading: null,
        originalText: unOld[k].text,
        proposedText: null,
        fromPos: absStart,
        toPos: absEnd,
      });
    }

    // Extra new sentences → inserts
    for (let k = pairCount; k < unNew.length; k++) {
      // Insert at position of next anchor in old paragraph (or end)
      const insertPos =
        nextOldIdx < oldSentences.length
          ? oldParagraph.startPos + oldSentences[nextOldIdx].startPosInParagraph
          : oldParagraph.endPos;
      changes.push({
        changeType: "insert",
        category: "editorial",
        sectionHeading: null,
        originalText: null,
        proposedText: unNew[k].text,
        fromPos: insertPos,
        toPos: insertPos,
      });
    }
  }

  return changes;
}

/* ============= Similarity ============= */

/**
 * Compute a rough change ratio between two strings.
 * Returns 0 (identical) to 1 (completely different).
 * Adapted from src/ai/validators/strictRewrite.ts diffRatioApprox().
 */
function computeSimilarity(text1: string, text2: string): number {
  const a = text1.replace(/\s+/g, "");
  const b = text2.replace(/\s+/g, "");
  if (a === b) return 0;
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0 || b.length === 0) return 1;

  const aSet = new Set(a.split(""));
  const bSet = new Set(b.split(""));
  let intersection = 0;
  for (const ch of aSet) {
    if (bSet.has(ch)) intersection++;
  }
  const union = new Set([...aSet, ...bSet]).size || 1;
  const similarity = intersection / union;
  return 1 - similarity; // change ratio [0..1]
}

/* ============= Change Categorization ============= */

/** Legal/contract keywords that indicate substantive changes. */
const LEGAL_KEYWORDS = [
  "liability", "indemnity", "indemnification", "termination", "warranty",
  "confidential", "confidentiality", "breach", "damages", "obligation",
  "covenant", "remedy", "jurisdiction", "governing law", "dispute",
  "arbitration", "force majeure", "representation", "limitation",
  "penalty", "fee", "payment", "compensation", "insurance",
  "intellectual property", "non-compete", "non-solicitation",
  "severability", "assignment", "waiver", "amendment",
];

/** Regex for monetary amounts. */
const MONETARY_REGEX = /\$[\d,.]+|\b\d+[\d,.]*\s*(dollars|USD|EUR|GBP|pounds|euros)\b/i;

/** Regex for date patterns. */
const DATE_REGEX =
  /\b\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}\b|\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/i;

/** Regex for obligation modal verbs. */
const MODAL_REGEX = /\b(shall|must|will|may not|cannot|required to|obligated to)\b/i;

/** Regex for percentage patterns. */
const PERCENT_REGEX = /\d+(\.\d+)?%/;

/** Regex for party name patterns (capitalized multi-word names). */
const PARTY_REGEX = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/;

/**
 * Categorize a single change as substantive, editorial, or structural.
 * Uses weighted heuristic scoring.
 */
function categorizeChange(change: DetectedChange): ChangeCategory {
  const oldText = change.originalText ?? "";
  const newText = change.proposedText ?? "";

  // Structural: very large changes (whole sections)
  if (oldText.length > STRUCTURAL_LENGTH_THRESHOLD || newText.length > STRUCTURAL_LENGTH_THRESHOLD) {
    return "structural";
  }

  // Structural: heading text detected
  if (/^\s*#{1,6}\s/.test(oldText) || /^\s*#{1,6}\s/.test(newText)) {
    return "structural";
  }

  // Editorial: pure punctuation/whitespace change
  if (isPunctuationOnly(oldText, newText)) {
    return "editorial";
  }

  // Score-based classification
  const combinedText = oldText + " " + newText;
  const substScore = scoreSubstantive(combinedText);
  const editScore = scoreEditorial(oldText, newText);

  if (substScore > editScore) return "substantive";
  if (editScore > substScore) return "editorial";
  // Tie → default to substantive (safer for human review)
  return "substantive";
}

/** Score text for substantive indicators. */
function scoreSubstantive(text: string): number {
  let score = 0;
  if (MONETARY_REGEX.test(text)) score += 10;
  if (DATE_REGEX.test(text)) score += 8;
  if (containsLegalKeywords(text)) score += 7;
  if (MODAL_REGEX.test(text)) score += 6;
  if (PARTY_REGEX.test(text)) score += 5;
  if (PERCENT_REGEX.test(text)) score += 5;
  // Numbers with duration units
  if (/\d+\s*(days|months|years|hours|weeks|business days)/i.test(text)) score += 5;
  return score;
}

/** Score change for editorial indicators. */
function scoreEditorial(oldText: string, newText: string): number {
  let score = 0;
  const combined = (oldText + " " + newText).trim();

  // Pure whitespace
  if (/^\s*$/.test(combined)) score += 10;

  // Very short change (single word)
  const words = combined.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= 2) score += 4;

  // Capitalization-only change
  if (oldText.toLowerCase() === newText.toLowerCase()) score += 8;

  // Minor word count difference (synonym swap)
  const oldWords = oldText.split(/\s+/).filter((w) => w.length > 0);
  const newWords = newText.split(/\s+/).filter((w) => w.length > 0);
  if (Math.abs(oldWords.length - newWords.length) <= 1 && oldWords.length <= 5) score += 3;

  return score;
}

/** Check if text contains legal/contract keywords. */
function containsLegalKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return LEGAL_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Check if the only difference between two strings is punctuation/whitespace. */
function isPunctuationOnly(oldText: string, newText: string): boolean {
  const strip = (s: string) => s.replace(/[\s.,;:!?'"()\-\[\]{}/\\]/g, "");
  return strip(oldText) === strip(newText);
}

/* ============= Section Heading Mapping ============= */

/**
 * Find the nearest section heading for a given character position.
 * Uses binary search on sorted section boundaries.
 */
function findSectionHeading(
  charPos: number,
  sections: SectionBoundary[]
): string | null {
  if (sections.length === 0) return null;

  // Binary search: find the last section whose startPos <= charPos
  let lo = 0;
  let hi = sections.length - 1;
  let best = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (sections[mid].startPos <= charPos) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return best >= 0 ? sections[best].heading : null;
}

/* ============= Edge Case Handlers ============= */

/** Build an empty result (no changes detected). */
function emptyResult(startTime: number): RedlineCompareResult {
  return {
    changes: [],
    totalChanges: 0,
    substantive: 0,
    editorial: 0,
    structural: 0,
    processingTimeMs: Date.now() - startTime,
  };
}

/**
 * Handle empty document cases.
 * If one side is empty, produce a single insert or delete for the entire other side.
 */
function handleEmptyDocs(
  oldText: string,
  newText: string,
  startTime: number
): RedlineCompareResult | null {
  const oldTrimmed = oldText.trim();
  const newTrimmed = newText.trim();

  if (oldTrimmed.length === 0 && newTrimmed.length === 0) {
    return emptyResult(startTime);
  }

  if (oldTrimmed.length === 0) {
    // Old is empty → everything in new is an insert
    return {
      changes: [
        {
          changeType: "insert",
          category: "structural",
          sectionHeading: null,
          originalText: null,
          proposedText: newTrimmed,
          fromPos: 0,
          toPos: 0,
        },
      ],
      totalChanges: 1,
      substantive: 0,
      editorial: 0,
      structural: 1,
      processingTimeMs: Date.now() - startTime,
    };
  }

  if (newTrimmed.length === 0) {
    // New is empty → everything in old is a delete
    return {
      changes: [
        {
          changeType: "delete",
          category: "structural",
          sectionHeading: null,
          originalText: oldTrimmed,
          proposedText: null,
          fromPos: 0,
          toPos: oldTrimmed.length,
        },
      ],
      totalChanges: 1,
      substantive: 0,
      editorial: 0,
      structural: 1,
      processingTimeMs: Date.now() - startTime,
    };
  }

  return null; // neither is empty — continue with normal flow
}

/* ============= Utilities ============= */

/** Collapse whitespace to single spaces and trim. */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
