/* src/ai/designDocBridge.ts
   Doc Cross-Reference Engine for Beyle Design Studio (Slice B2).

   Bridges Design Studio AI to Kacheri Docs content with provenance tracking.
   Fetches doc content from docs_fts FTS5 index, extracts relevant sections
   via AI, builds provenance links, and generates <kcl-source> citation markup.

   Graceful degradation:
   - When Docs product is disabled: all methods return { available: false }
   - When doc content is not in FTS (never extracted): returns metadata only
   - No errors thrown in any degradation path */

import { createHash } from 'node:crypto';
import { db } from '../db';
import { getDoc } from '../store/docs';
import { isProductEnabled, isFeatureEnabled } from '../modules/registry';
import { composeText } from './modelRouter';
import { FtsSync } from '../knowledge/ftsSync';
import { WorkspaceEntitiesStore } from '../store/workspaceEntities';
import { EntityMentionsStore } from '../store/entityMentions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A provenance link tracking which doc section was used in a canvas frame. */
export interface ProvenanceLink {
  docId: string;
  section: string;
  textUsed: string;
  textHash: string;
  sourceType: 'full' | 'section' | 'excerpt';
}

/** A section extracted from a document. */
export interface DocBridgeSection {
  heading: string;
  text: string;
}

/** Content fetched from a single document. */
export interface DocBridgeContent {
  docId: string;
  title: string;
  content: string;
  sections: DocBridgeSection[];
  contentAvailable: boolean;
}

/** Result from any doc bridge fetch operation. */
export interface DocBridgeResult {
  available: boolean;
  docs: DocBridgeContent[];
  provenance: ProvenanceLink[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default token budget per document (~4000 tokens * ~4 chars/token). */
const DEFAULT_CHAR_BUDGET = 16_000;

/** Maximum tokens for the AI section extraction call. */
const SECTION_EXTRACTION_MAX_TOKENS = 2048;

// ---------------------------------------------------------------------------
// Internal: FTS5 content reader
// ---------------------------------------------------------------------------

interface FtsContentRow {
  content_text: string;
}

/**
 * Read document plain text from docs_fts FTS5 table.
 * Returns null if the document has not been synced to FTS.
 */
async function readDocFtsContent(docId: string): Promise<string | null> {
  try {
    const row = await db.queryOne<FtsContentRow>(
      `SELECT content_text FROM docs_fts WHERE doc_id = ?`,
      [docId],
    );

    return row?.content_text ?? null;
  } catch {
    // FTS table may not exist in minimal deployments — degrade silently
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal: Content sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitize doc content before AI injection.
 * Strips excessive whitespace and normalizes line breaks.
 */
function sanitizeContent(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/ {3,}/g, '  ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

/**
 * Truncate content to a character budget.
 * Cuts at a word boundary to avoid splitting mid-word.
 */
function truncateToCharBudget(
  text: string,
  budget: number = DEFAULT_CHAR_BUDGET,
): string {
  if (text.length <= budget) return text;

  // Find the last space before the budget limit
  const cutPoint = text.lastIndexOf(' ', budget);
  const effectiveCut = cutPoint > 0 ? cutPoint : budget;
  return text.slice(0, effectiveCut) + '\n\n[... content truncated ...]';
}

// ---------------------------------------------------------------------------
// Internal: HTML attribute escaping
// ---------------------------------------------------------------------------

/**
 * Escape special characters for safe use in HTML attribute values.
 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if the Docs product is enabled, making the doc bridge available.
 * B3 must call this before invoking any fetch methods.
 */
export function isDocBridgeAvailable(): boolean {
  return isProductEnabled('docs');
}

/**
 * Fetch document content for AI context injection.
 *
 * Retrieves doc metadata from SQLite and content from the docs_fts FTS5 table.
 * When content is unavailable (doc never extracted), returns metadata only
 * with contentAvailable: false — no errors thrown.
 */
export async function fetchDocContent(
  docId: string,
  workspaceId: string,
  charBudget: number = DEFAULT_CHAR_BUDGET,
): Promise<DocBridgeResult> {
  const unavailable: DocBridgeResult = {
    available: false,
    docs: [],
    provenance: [],
  };

  // Guard: Docs product must be enabled
  if (!isDocBridgeAvailable()) {
    return unavailable;
  }

  // Get doc metadata
  const doc = await getDoc(docId);
  if (!doc) {
    return unavailable;
  }

  // Security: verify workspace match
  if (doc.workspaceId && doc.workspaceId !== workspaceId) {
    return unavailable;
  }

  // Read content from FTS5 index
  const ftsContent = await readDocFtsContent(docId);
  const contentAvailable = ftsContent !== null && ftsContent.length > 0;

  let content = '';
  if (contentAvailable) {
    content = sanitizeContent(ftsContent);
    content = truncateToCharBudget(content, charBudget);
  }

  return {
    available: true,
    docs: [
      {
        docId,
        title: doc.title,
        content,
        sections: [],
        contentAvailable,
      },
    ],
    provenance: [],
  };
}

/**
 * Fetch content for multiple documents.
 * Each doc gets its own token budget allocation.
 * Aggregates results into a single DocBridgeResult.
 */
export async function fetchMultipleDocContents(
  docIds: string[],
  workspaceId: string,
  charBudgetPerDoc: number = DEFAULT_CHAR_BUDGET,
): Promise<DocBridgeResult> {
  if (!isDocBridgeAvailable()) {
    return { available: false, docs: [], provenance: [] };
  }

  const allDocs: DocBridgeContent[] = [];
  const allProvenance: ProvenanceLink[] = [];

  for (const docId of docIds) {
    const result = await fetchDocContent(docId, workspaceId, charBudgetPerDoc);
    if (result.available) {
      allDocs.push(...result.docs);
      allProvenance.push(...result.provenance);
    }
  }

  return {
    available: allDocs.length > 0,
    docs: allDocs,
    provenance: allProvenance,
  };
}

/**
 * Extract relevant sections from document content based on user intent.
 *
 * If content fits within the character budget, returns it as a single section.
 * If content exceeds the budget, uses AI (composeText) to identify and extract
 * the most relevant sections for the given design prompt intent.
 *
 * On AI failure, falls back to truncating the content to the first N chars.
 */
export async function extractRelevantSections(
  content: string,
  intent: string,
  charBudget: number = DEFAULT_CHAR_BUDGET,
): Promise<DocBridgeSection[]> {
  if (!content || content.length === 0) {
    return [];
  }

  // If content fits within budget, return as single section
  if (content.length <= charBudget) {
    return [{ heading: 'Full Document', text: content }];
  }

  // Content exceeds budget — use AI to extract relevant sections
  try {
    const systemPrompt = `You are a document analysis assistant. Given a document and a user's design intent, extract the most relevant sections.

## Instructions
- Identify the sections of the document most relevant to the user's intent.
- Return ONLY a JSON array of objects with "heading" and "text" fields.
- Each section should have a descriptive heading and the relevant text excerpt.
- Keep total text under ${charBudget} characters.
- Preserve exact wording from the source document — do not paraphrase.
- If the document has clear headings, use those as section headings.
- If no clear headings exist, create descriptive headings based on content.

## Output Format
Return ONLY valid JSON — no markdown, no explanation:
[{"heading": "Section Title", "text": "Exact text from document..."}]`;

    const userPrompt = `## Design Intent
${intent}

## Document Content
${content}`;

    const result = await composeText(userPrompt, {
      systemPrompt,
      maxTokens: SECTION_EXTRACTION_MAX_TOKENS,
    });

    // Parse AI response as JSON array
    const parsed = JSON.parse(result.text.trim());
    if (Array.isArray(parsed)) {
      const sections: DocBridgeSection[] = [];
      for (const item of parsed) {
        if (
          item &&
          typeof item === 'object' &&
          typeof item.heading === 'string' &&
          typeof item.text === 'string'
        ) {
          sections.push({
            heading: item.heading,
            text: item.text,
          });
        }
      }
      if (sections.length > 0) return sections;
    }
  } catch {
    // AI extraction failed — fall back to truncation
  }

  // Fallback: truncate content to budget and return as single section
  return [
    {
      heading: 'Document Excerpt',
      text: truncateToCharBudget(content, charBudget),
    },
  ];
}

/**
 * Build provenance links tracking which doc sections were used.
 * Creates a SHA256 hash of each section's text for verification.
 */
export function buildProvenanceLinks(
  docId: string,
  sectionsUsed: DocBridgeSection[],
): ProvenanceLink[] {
  return sectionsUsed.map((section) => {
    const textHash = createHash('sha256')
      .update(section.text, 'utf8')
      .digest('hex');

    let sourceType: ProvenanceLink['sourceType'];
    if (section.heading === 'Full Document') {
      sourceType = 'full';
    } else if (section.heading === 'Document Excerpt') {
      sourceType = 'excerpt';
    } else {
      sourceType = 'section';
    }

    return {
      docId,
      section: section.heading,
      textUsed: section.text,
      textHash,
      sourceType,
    };
  });
}

/**
 * Generate <kcl-source> citation markup pointing back to a Kacheri Doc.
 * Used by AI-generated frame code to cite document references.
 */
export function generateSourceMarkup(
  docId: string,
  section: string,
  label: string,
): string {
  const safeDocId = escapeAttr(docId);
  const safeSection = escapeAttr(section);
  const safeLabel = escapeAttr(label);
  return `<kcl-source doc-id="${safeDocId}" section="${safeSection}" label="${safeLabel}"></kcl-source>`;
}

// ---------------------------------------------------------------------------
// Memory Graph Context (Slice P7)
// ---------------------------------------------------------------------------

/** A mention source label with product + reference title. */
interface MemoryMentionSource {
  productSource: string;
  label: string;
}

/** An entity with its cross-product mention sources for AI context. */
export interface MemoryContextEntity {
  name: string;
  entityType: string;
  sources: MemoryMentionSource[];
}

/** Result from a memory graph context query. */
export interface MemoryContextResult {
  entities: MemoryContextEntity[];
  entityCount: number;
}

/** Default max entities to inject into AI context. */
const DEFAULT_MAX_MEMORY_ENTITIES = 20;

/** Max mentions to fetch per entity for source labeling. */
const MENTIONS_PER_ENTITY = 3;

/** Minimum keyword length for FTS search. */
const MIN_KEYWORD_LENGTH = 3;

/** Common stop words to exclude from FTS keyword extraction. */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all',
  'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has',
  'have', 'been', 'this', 'that', 'with', 'from', 'they',
  'will', 'each', 'make', 'like', 'how', 'what', 'when',
  'which', 'their', 'about', 'would', 'there', 'could',
  'create', 'slide', 'frame', 'presentation', 'design',
  'please', 'want', 'need', 'should',
]);

/** Map product_source values to human-readable labels. */
const PRODUCT_SOURCE_LABELS: Record<string, string> = {
  docs: 'Docs',
  'design-studio': 'Design Studio',
  research: 'Research',
  notes: 'Notes',
  sheets: 'Sheets',
};

/**
 * Extract search keywords from a user prompt for FTS5 entity lookup.
 * Simple whitespace split + stop word filtering — no AI call to keep <200ms.
 */
function extractKeywords(prompt: string): string {
  const words = prompt
    .toLowerCase()
    .replace(/[?!.,;:'"()[\]{}<>\/\\@#$%^&*+=~`|]/g, ' ')
    .split(/\s+/)
    .filter(
      (w) => w.length >= MIN_KEYWORD_LENGTH && !STOP_WORDS.has(w),
    );

  // Deduplicate and take first 10 keywords to keep FTS query focused
  const unique = [...new Set(words)].slice(0, 10);
  return unique.join(' ');
}

/**
 * Query the memory graph for entities relevant to a prompt.
 *
 * Uses FTS5 entities_fts index for fast keyword search (<200ms).
 * Fetches entity details and cross-product mention sources.
 * Graceful degradation: returns empty result if memory graph is disabled
 * or on any error.
 */
export async function queryMemoryGraphContext(
  workspaceId: string,
  prompt: string,
  maxEntities: number = DEFAULT_MAX_MEMORY_ENTITIES,
): Promise<MemoryContextResult> {
  const empty: MemoryContextResult = { entities: [], entityCount: 0 };

  // Guard: memory graph must be enabled
  if (!isFeatureEnabled('memoryGraph')) {
    return empty;
  }

  try {
    // Extract keywords from prompt
    const keywords = extractKeywords(prompt);
    if (!keywords) {
      return empty;
    }

    // FTS5 search for matching entities
    const ftsResults = await FtsSync.searchEntities(workspaceId, keywords, {
      limit: maxEntities,
    });

    if (ftsResults.length === 0) {
      return empty;
    }

    // Enrich each FTS hit with full entity data + mention sources
    const entities: MemoryContextEntity[] = [];

    for (const ftsHit of ftsResults) {
      const entity = await WorkspaceEntitiesStore.getById(ftsHit.entityId);
      if (!entity) continue;

      // Fetch recent mentions to determine product sources
      const mentions = await EntityMentionsStore.getByEntity(ftsHit.entityId, {
        limit: MENTIONS_PER_ENTITY,
      });

      const sources: MemoryMentionSource[] = mentions.map((m) => ({
        productSource: m.productSource,
        label: m.docTitle ?? m.sourceRef ?? m.docId ?? 'unknown',
      }));

      entities.push({
        name: entity.name,
        entityType: entity.entityType,
        sources,
      });
    }

    return {
      entities,
      entityCount: entities.length,
    };
  } catch (err) {
    // Graceful degradation: any failure returns empty context
    console.warn('[designDocBridge] Memory graph context query failed:', err);
    return empty;
  }
}

/**
 * Format memory graph entities into a prompt section for AI context injection.
 *
 * Produces a "Related Knowledge" block:
 * ```
 * ## Related Knowledge (from your workspace)
 * - "Acme Corp" (organization) — from: Docs (Contract Review), Research (session_2026-02-15)
 * ```
 *
 * Returns empty string if no entities provided.
 */
export function formatMemoryContext(
  entities: MemoryContextEntity[],
): string {
  if (entities.length === 0) return '';

  const lines: string[] = ['## Related Knowledge (from your workspace)'];

  for (const entity of entities) {
    // Group sources by product for compact display
    const grouped = new Map<string, string[]>();
    for (const source of entity.sources) {
      const productLabel =
        PRODUCT_SOURCE_LABELS[source.productSource] ?? source.productSource;
      if (!grouped.has(productLabel)) {
        grouped.set(productLabel, []);
      }
      grouped.get(productLabel)!.push(source.label);
    }

    // Format: "Acme Corp" (organization) — from: Docs (Contract Review, Q3 Report), Research (session_xyz)
    const sourceParts: string[] = [];
    for (const [product, labels] of grouped) {
      const uniqueLabels = [...new Set(labels)];
      sourceParts.push(`${product} (${uniqueLabels.join(', ')})`);
    }

    const fromClause =
      sourceParts.length > 0
        ? ` — from: ${sourceParts.join(', ')}`
        : '';

    lines.push(`- "${entity.name}" (${entity.entityType})${fromClause}`);
  }

  return lines.join('\n');
}
