// KACHERI BACKEND/src/routes/clauses.ts
// Clause Library: Clause CRUD + Versioning + From-Selection API routes
//
// Endpoints:
// - GET    /workspaces/:wid/clauses              — List clauses (search, filter, paginate)
// - POST   /workspaces/:wid/clauses              — Create clause + initial version
// - POST   /workspaces/:wid/clauses/from-selection — Create clause from selected text (AI-assisted)
// - GET    /workspaces/:wid/clauses/:cid          — Get clause by ID
// - PATCH  /workspaces/:wid/clauses/:cid          — Update clause (creates version on content change)
// - DELETE /workspaces/:wid/clauses/:cid          — Archive clause (soft delete)
// - GET    /workspaces/:wid/clauses/:cid/versions      — List all versions for a clause
// - GET    /workspaces/:wid/clauses/:cid/versions/:vid  — Get specific version content
//
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slices B2, B3, B7

import type { FastifyPluginAsync } from "fastify";
import {
  ClausesStore,
  type ClauseCategory,
} from "../store/clauses";
import { ClauseVersionsStore } from "../store/clauseVersions";
import { db } from "../db";
import { hasWorkspaceWriteAccess, requireWorkspaceMatch } from "../workspace/middleware";
import { composeText } from "../ai/modelRouter";
import { withTimeout } from "../ai/extractors/index";
import { AI_RATE_LIMITS } from "../middleware/rateLimit";
import { stripDangerousHtml } from "../utils/sanitize";

/* ---------- Types ---------- */

interface WorkspaceParams {
  wid: string;
}

interface ClauseParams extends WorkspaceParams {
  cid: string;
}

interface VersionParams extends ClauseParams {
  vid: string;
}

interface ListClausesQuery {
  search?: string;
  category?: string;
  tag?: string;
  limit?: string;
  offset?: string;
}

interface CreateClauseBody {
  title: string;
  description?: string;
  contentHtml: string;
  contentText: string;
  category?: ClauseCategory;
  tags?: string[];
  language?: string;
}

interface UpdateClauseBody {
  title?: string;
  description?: string | null;
  contentHtml?: string;
  contentText?: string;
  category?: ClauseCategory;
  tags?: string[];
  language?: string;
  changeNote?: string;
}

interface FromSelectionBody {
  contentHtml: string;
  contentText: string;
  title?: string;
  description?: string;
  category?: ClauseCategory;
  tags?: string[];
  language?: string;
}

/* ---------- Helpers ---------- */

function getUserId(req: { headers: Record<string, unknown> }): string {
  const userId =
    (req.headers["x-user-id"] as string | undefined)?.toString().trim() ||
    (req.headers["x-dev-user"] as string | undefined)?.toString().trim() ||
    "user:local";
  return userId;
}

/** Clamp limit to [1, 200] with default 50 */
function capLimit(v?: string): number {
  const n = v ? Number(v) : 50;
  if (!Number.isFinite(n)) return 50;
  return Math.min(Math.max(n, 1), 200);
}

/** Parse offset to non-negative integer */
function parseOffset(v?: string): number {
  const n = v ? Number(v) : 0;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/* ---------- AI-assisted from-selection helpers ---------- */

const FROM_SELECTION_TIMEOUT_MS = 10_000; // 10 seconds per AI call
const MAX_CONTENT_FOR_AI = 2_000; // truncate content for AI prompts
const MAX_TITLE_FALLBACK_LEN = 60; // fallback title max chars

const TITLE_SYSTEM_PROMPT =
  "You are a document clause analyzer. Given the following text from a legal/business document, " +
  "generate a short, descriptive title (maximum 10 words). Output ONLY the title, nothing else.";

const DESCRIPTION_SYSTEM_PROMPT =
  "You are a document clause analyzer. Given the following text from a legal/business document, " +
  "generate a brief 1-2 sentence description of what this clause covers. Output ONLY the description, nothing else.";

/** Keyword-based category detection heuristic (no AI). */
function detectCategory(text: string): ClauseCategory {
  const lower = text.toLowerCase();

  const legalTerms = [
    "liability", "indemnif", "terminat", "governing law", "jurisdiction",
    "warranty", "breach", "tort", "arbitrat", "litigation",
  ];
  const financialTerms = [
    "payment", "pricing", "invoice", "fee", "compensat",
    "reimburs", "billing", "cost", "expense",
  ];
  const boilerplateTerms = [
    "confidential", "force majeure", "severability", "entire agreement",
    "amendment", "waiver", "assignment", "notice",
  ];

  const legalScore = legalTerms.filter((t) => lower.includes(t)).length;
  const financialScore = financialTerms.filter((t) => lower.includes(t)).length;
  const boilerplateScore = boilerplateTerms.filter((t) => lower.includes(t)).length;

  if (legalScore >= 2 || (legalScore === 1 && financialScore === 0 && boilerplateScore === 0)) return "legal";
  if (financialScore >= 2 || (financialScore === 1 && legalScore === 0 && boilerplateScore === 0)) return "financial";
  if (boilerplateScore >= 2 || (boilerplateScore === 1 && legalScore === 0 && financialScore === 0)) return "boilerplate";
  return "general";
}

/** Generate a title for a clause using AI. Falls back to truncated content. */
async function generateTitle(contentText: string): Promise<string> {
  const truncated = contentText.length > MAX_CONTENT_FOR_AI
    ? contentText.slice(0, MAX_CONTENT_FOR_AI) + " [truncated]"
    : contentText;

  try {
    const result = await withTimeout(
      composeText(truncated, {
        systemPrompt: TITLE_SYSTEM_PROMPT,
        maxTokens: 50,
      }),
      FROM_SELECTION_TIMEOUT_MS,
      "Title generation timed out"
    );

    const title = result.text.trim().replace(/^["']|["']$/g, ""); // strip quotes
    if (title && title.length > 0) return title;
  } catch {
    // AI failed — use fallback
  }

  // Fallback: first N chars of content text
  const clean = contentText.trim().replace(/\s+/g, " ");
  if (clean.length <= MAX_TITLE_FALLBACK_LEN) return clean;
  return clean.slice(0, MAX_TITLE_FALLBACK_LEN) + "...";
}

/** Generate a description for a clause using AI. Falls back to null. */
async function generateDescription(contentText: string): Promise<string | null> {
  const truncated = contentText.length > MAX_CONTENT_FOR_AI
    ? contentText.slice(0, MAX_CONTENT_FOR_AI) + " [truncated]"
    : contentText;

  try {
    const result = await withTimeout(
      composeText(truncated, {
        systemPrompt: DESCRIPTION_SYSTEM_PROMPT,
        maxTokens: 150,
      }),
      FROM_SELECTION_TIMEOUT_MS,
      "Description generation timed out"
    );

    const desc = result.text.trim();
    if (desc && desc.length > 0) return desc;
  } catch {
    // AI failed — no description
  }

  return null;
}

/* ---------- Routes ---------- */

export const clauseRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /workspaces/:wid/clauses
   * List all clauses for a workspace with optional search, category, tag filters + pagination.
   */
  fastify.get<{ Params: WorkspaceParams; Querystring: ListClausesQuery }>(
    "/workspaces/:wid/clauses",
    async (req, reply) => {
      const { wid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;
      const { search, category, tag, limit, offset } = req.query;

      // Validate category if provided
      if (category && !ClausesStore.validateCategory(category)) {
        return reply.code(400).send({
          error: "invalid_category",
          message:
            "Invalid category. Must be one of: general, legal, financial, boilerplate, custom",
        });
      }

      const parsedLimit = capLimit(limit);
      const parsedOffset = parseOffset(offset);

      const clauses = await ClausesStore.getByWorkspace(wid, {
        category: category as ClauseCategory | undefined,
        search: search || undefined,
        limit: parsedLimit,
        offset: parsedOffset,
      });

      // Apply tag filter if provided (tags stored as JSON array)
      const filteredClauses = tag
        ? clauses.filter((c) =>
            c.tags.some((t) => t.toLowerCase() === tag.toLowerCase())
          )
        : clauses;

      // Get total count for pagination
      const total = await ClausesStore.count(wid);

      return reply.code(200).send({
        workspaceId: wid,
        clauses: filteredClauses,
        total,
        limit: parsedLimit,
        offset: parsedOffset,
      });
    }
  );

  /**
   * POST /workspaces/:wid/clauses
   * Create a new clause + initial version record. Editor+ required.
   */
  fastify.post<{ Params: WorkspaceParams; Body: CreateClauseBody }>(
    "/workspaces/:wid/clauses",
    async (req, reply) => {
      const { wid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;
      const body = req.body ?? ({} as CreateClauseBody);
      const { title, description, contentHtml, contentText, category, tags, language } = body;

      // Editor+ access control
      if (!hasWorkspaceWriteAccess(req)) {
        return reply.code(403).send({
          error: "editor_required",
          message: "Requires editor role or higher to create clauses",
        });
      }

      // Validate required fields
      if (!title || typeof title !== "string" || !title.trim()) {
        return reply.code(400).send({
          error: "missing_required_fields",
          message: "title is required and must be a non-empty string",
        });
      }

      if (!contentHtml || typeof contentHtml !== "string") {
        return reply.code(400).send({
          error: "missing_required_fields",
          message: "contentHtml is required and must be a string",
        });
      }

      if (!contentText || typeof contentText !== "string") {
        return reply.code(400).send({
          error: "missing_required_fields",
          message: "contentText is required and must be a string",
        });
      }

      // Validate category if provided
      if (category && !ClausesStore.validateCategory(category)) {
        return reply.code(400).send({
          error: "invalid_category",
          message:
            "Invalid category. Must be one of: general, legal, financial, boilerplate, custom",
        });
      }

      // Validate tags if provided
      if (tags !== undefined) {
        if (!Array.isArray(tags)) {
          return reply.code(400).send({
            error: "invalid_tags",
            message: "tags must be an array of strings",
          });
        }
        if (!tags.every((t: unknown) => typeof t === "string")) {
          return reply.code(400).send({
            error: "invalid_tags",
            message: "tags must contain only strings",
          });
        }
      }

      const userId = getUserId(req);
      const safeContentHtml = stripDangerousHtml(contentHtml);

      try {
        // Create clause
        const clause = await ClausesStore.create({
          workspaceId: wid,
          title: title.trim(),
          description,
          contentHtml: safeContentHtml,
          contentText,
          category,
          tags,
          language,
          createdBy: userId,
        });

        // Create initial version record
        await ClauseVersionsStore.create({
          clauseId: clause.id,
          version: 1,
          contentHtml: safeContentHtml,
          contentText,
          changeNote: "Initial version",
          createdBy: userId,
        });

        return reply.code(201).send({
          clause,
          message: "Clause created successfully",
        });
      } catch (err) {
        console.error("[clauses] Create failed:", err);
        return reply.code(500).send({
          error: "create_failed",
          message: "Failed to create clause",
        });
      }
    }
  );

  /**
   * POST /workspaces/:wid/clauses/from-selection
   * Create a clause from selected document text with AI-assisted title/description generation.
   * If title/description not provided, AI generates them from the content.
   * If category not provided, auto-detected via keyword heuristics.
   * Rate limited (compose) due to AI usage. Editor+ required.
   *
   * Registered BEFORE /:cid routes to avoid path conflict.
   */
  fastify.post<{ Params: WorkspaceParams; Body: FromSelectionBody }>(
    "/workspaces/:wid/clauses/from-selection",
    {
      config: {
        rateLimit: AI_RATE_LIMITS.compose,
      },
    },
    async (req, reply) => {
      const { wid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;
      const body = req.body ?? ({} as FromSelectionBody);
      const {
        contentHtml,
        contentText,
        title: userTitle,
        description: userDescription,
        category: userCategory,
        tags,
        language,
      } = body;

      // Editor+ access control
      if (!hasWorkspaceWriteAccess(req)) {
        return reply.code(403).send({
          error: "editor_required",
          message: "Requires editor role or higher to create clauses",
        });
      }

      // Validate required fields
      if (!contentHtml || typeof contentHtml !== "string" || !contentHtml.trim()) {
        return reply.code(400).send({
          error: "missing_required_fields",
          message: "contentHtml is required and must be a non-empty string",
        });
      }

      if (!contentText || typeof contentText !== "string" || !contentText.trim()) {
        return reply.code(400).send({
          error: "missing_required_fields",
          message: "contentText is required and must be a non-empty string",
        });
      }

      // Validate category if provided
      if (userCategory && !ClausesStore.validateCategory(userCategory)) {
        return reply.code(400).send({
          error: "invalid_category",
          message:
            "Invalid category. Must be one of: general, legal, financial, boilerplate, custom",
        });
      }

      // Validate tags if provided
      if (tags !== undefined) {
        if (!Array.isArray(tags)) {
          return reply.code(400).send({
            error: "invalid_tags",
            message: "tags must be an array of strings",
          });
        }
        if (!tags.every((t: unknown) => typeof t === "string")) {
          return reply.code(400).send({
            error: "invalid_tags",
            message: "tags must contain only strings",
          });
        }
      }

      // Validate title if provided
      if (userTitle !== undefined && (typeof userTitle !== "string" || !userTitle.trim())) {
        return reply.code(400).send({
          error: "invalid_title",
          message: "title must be a non-empty string if provided",
        });
      }

      const userId = getUserId(req);
      const safeContentHtml = stripDangerousHtml(contentHtml);

      try {
        // Resolve title: user-provided or AI-generated
        const aiGeneratedTitle = !userTitle || !userTitle.trim();
        const title = aiGeneratedTitle
          ? await generateTitle(contentText)
          : userTitle!.trim();

        // Resolve description: user-provided or AI-generated
        const aiGeneratedDescription = userDescription === undefined || userDescription === null;
        const descriptionRaw = aiGeneratedDescription
          ? await generateDescription(contentText)
          : (userDescription || null);
        // Convert null → undefined to match CreateClauseInput.description type
        const description = descriptionRaw ?? undefined;

        // Resolve category: user-provided or auto-detected
        const aiGeneratedCategory = !userCategory;
        const category = userCategory || detectCategory(contentText);

        // Create clause (same pattern as POST /workspaces/:wid/clauses)
        const clause = await ClausesStore.create({
          workspaceId: wid,
          title,
          description,
          contentHtml: safeContentHtml,
          contentText,
          category,
          tags,
          language,
          createdBy: userId,
        });

        // Create initial version record
        await ClauseVersionsStore.create({
          clauseId: clause.id,
          version: 1,
          contentHtml: safeContentHtml,
          contentText,
          changeNote: "Initial version (from selection)",
          createdBy: userId,
        });

        return reply.code(201).send({
          clause,
          aiGenerated: {
            title: aiGeneratedTitle,
            description: aiGeneratedDescription,
            category: aiGeneratedCategory,
          },
          message: "Clause created from selection successfully",
        });
      } catch (err) {
        console.error("[clauses] From-selection create failed:", err);
        return reply.code(500).send({
          error: "create_failed",
          message: "Failed to create clause from selection",
        });
      }
    }
  );

  /**
   * GET /workspaces/:wid/clauses/:cid
   * Get a single clause by ID.
   */
  fastify.get<{ Params: ClauseParams }>(
    "/workspaces/:wid/clauses/:cid",
    async (req, reply) => {
      const { wid, cid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;

      const clause = await ClausesStore.getById(cid);
      if (!clause) {
        return reply.code(404).send({
          error: "clause_not_found",
          message: `Clause ${cid} not found`,
        });
      }

      // Verify clause belongs to this workspace
      if (clause.workspaceId !== wid) {
        return reply.code(404).send({
          error: "clause_not_found",
          message: `Clause ${cid} not found in this workspace`,
        });
      }

      return reply.code(200).send({ clause });
    }
  );

  /**
   * PATCH /workspaces/:wid/clauses/:cid
   * Update an existing clause. If content changes, bumps version and creates version record.
   * Editor+ required.
   */
  fastify.patch<{ Params: ClauseParams; Body: UpdateClauseBody }>(
    "/workspaces/:wid/clauses/:cid",
    async (req, reply) => {
      const { wid, cid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;
      const body = req.body ?? ({} as UpdateClauseBody);
      const { title, description, contentHtml, contentText, category, tags, language, changeNote } = body;

      // Editor+ access control
      if (!hasWorkspaceWriteAccess(req)) {
        return reply.code(403).send({
          error: "editor_required",
          message: "Requires editor role or higher to update clauses",
        });
      }

      // Get existing clause
      const existing = await ClausesStore.getById(cid);
      if (!existing) {
        return reply.code(404).send({
          error: "clause_not_found",
          message: `Clause ${cid} not found`,
        });
      }

      // Verify clause belongs to this workspace
      if (existing.workspaceId !== wid) {
        return reply.code(404).send({
          error: "clause_not_found",
          message: `Clause ${cid} not found in this workspace`,
        });
      }

      // Validate fields if provided
      if (title !== undefined && (typeof title !== "string" || !title.trim())) {
        return reply.code(400).send({
          error: "invalid_title",
          message: "title must be a non-empty string",
        });
      }

      if (category && !ClausesStore.validateCategory(category)) {
        return reply.code(400).send({
          error: "invalid_category",
          message:
            "Invalid category. Must be one of: general, legal, financial, boilerplate, custom",
        });
      }

      if (tags !== undefined) {
        if (!Array.isArray(tags)) {
          return reply.code(400).send({
            error: "invalid_tags",
            message: "tags must be an array of strings",
          });
        }
        if (!tags.every((t: unknown) => typeof t === "string")) {
          return reply.code(400).send({
            error: "invalid_tags",
            message: "tags must contain only strings",
          });
        }
      }

      const userId = getUserId(req);

      // Determine if content is changing (triggers version bump)
      const contentChanged =
        (contentHtml !== undefined && contentHtml !== existing.contentHtml) ||
        (contentText !== undefined && contentText !== existing.contentText);

      try {
        // Build update payload
        const updatePayload: Parameters<typeof ClausesStore.update>[1] = {};

        if (title !== undefined) updatePayload.title = title.trim();
        if (description !== undefined) updatePayload.description = description;
        if (contentHtml !== undefined) updatePayload.contentHtml = stripDangerousHtml(contentHtml);
        if (contentText !== undefined) updatePayload.contentText = contentText;
        if (category !== undefined) updatePayload.category = category;
        if (tags !== undefined) updatePayload.tags = tags;
        if (language !== undefined) updatePayload.language = language;

        // Update the clause
        const updated = await ClausesStore.update(cid, updatePayload);

        if (!updated) {
          return reply.code(500).send({
            error: "update_failed",
            message: "Failed to update clause",
          });
        }

        // If content changed, bump version and create version record
        let newVersion: number | null = null;
        if (contentChanged) {
          newVersion = existing.version + 1;

          // Bump version number in clause row
          await db.run(`UPDATE clauses SET version = ? WHERE id = ?`, [newVersion, cid]);

          // Create version record
          await ClauseVersionsStore.create({
            clauseId: cid,
            version: newVersion,
            contentHtml: contentHtml ? stripDangerousHtml(contentHtml) : existing.contentHtml,
            contentText: contentText ?? existing.contentText,
            changeNote: changeNote ?? undefined,
            createdBy: userId,
          });
        }

        // Re-fetch to get the latest state (including bumped version)
        const finalClause = await ClausesStore.getById(cid);

        return reply.code(200).send({
          clause: finalClause,
          versionCreated: contentChanged,
          newVersion,
          message: contentChanged
            ? `Clause updated successfully (version ${newVersion})`
            : "Clause updated successfully",
        });
      } catch (err) {
        console.error("[clauses] Update failed:", err);
        return reply.code(500).send({
          error: "update_failed",
          message: "Failed to update clause",
        });
      }
    }
  );

  /**
   * DELETE /workspaces/:wid/clauses/:cid
   * Archive a clause (soft delete). Editor+ required.
   */
  fastify.delete<{ Params: ClauseParams }>(
    "/workspaces/:wid/clauses/:cid",
    async (req, reply) => {
      const { wid, cid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;

      // Editor+ access control
      if (!hasWorkspaceWriteAccess(req)) {
        return reply.code(403).send({
          error: "editor_required",
          message: "Requires editor role or higher to archive clauses",
        });
      }

      // Get existing clause
      const existing = await ClausesStore.getById(cid);
      if (!existing) {
        return reply.code(404).send({
          error: "clause_not_found",
          message: `Clause ${cid} not found`,
        });
      }

      // Verify clause belongs to this workspace
      if (existing.workspaceId !== wid) {
        return reply.code(404).send({
          error: "clause_not_found",
          message: `Clause ${cid} not found in this workspace`,
        });
      }

      try {
        const archived = await ClausesStore.archive(cid);

        if (!archived) {
          return reply.code(500).send({
            error: "archive_failed",
            message: "Failed to archive clause",
          });
        }

        return reply.code(200).send({
          clause: archived,
          message: "Clause archived successfully",
        });
      } catch (err) {
        console.error("[clauses] Archive failed:", err);
        return reply.code(500).send({
          error: "archive_failed",
          message: "Failed to archive clause",
        });
      }
    }
  );

  /**
   * GET /workspaces/:wid/clauses/:cid/versions
   * List all versions for a clause, ordered by version descending.
   */
  fastify.get<{ Params: ClauseParams }>(
    "/workspaces/:wid/clauses/:cid/versions",
    async (req, reply) => {
      const { wid, cid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;

      // Verify clause exists and belongs to workspace
      const clause = await ClausesStore.getById(cid);
      if (!clause) {
        return reply.code(404).send({
          error: "clause_not_found",
          message: `Clause ${cid} not found`,
        });
      }

      if (clause.workspaceId !== wid) {
        return reply.code(404).send({
          error: "clause_not_found",
          message: `Clause ${cid} not found in this workspace`,
        });
      }

      const versions = await ClauseVersionsStore.getByClause(cid);

      return reply.code(200).send({
        clauseId: cid,
        versions,
        total: versions.length,
      });
    }
  );

  /**
   * GET /workspaces/:wid/clauses/:cid/versions/:vid
   * Get a specific version by version number.
   */
  fastify.get<{ Params: VersionParams }>(
    "/workspaces/:wid/clauses/:cid/versions/:vid",
    async (req, reply) => {
      const { wid, cid, vid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;

      // Verify clause exists and belongs to workspace
      const clause = await ClausesStore.getById(cid);
      if (!clause) {
        return reply.code(404).send({
          error: "clause_not_found",
          message: `Clause ${cid} not found`,
        });
      }

      if (clause.workspaceId !== wid) {
        return reply.code(404).send({
          error: "clause_not_found",
          message: `Clause ${cid} not found in this workspace`,
        });
      }

      // Parse version number
      const versionNum = Number(vid);
      if (!Number.isFinite(versionNum) || versionNum < 1 || !Number.isInteger(versionNum)) {
        return reply.code(400).send({
          error: "invalid_version",
          message: "Version must be a positive integer",
        });
      }

      const version = await ClauseVersionsStore.getByVersion(cid, versionNum);
      if (!version) {
        return reply.code(404).send({
          error: "version_not_found",
          message: `Version ${versionNum} not found for clause ${cid}`,
        });
      }

      return reply.code(200).send({ version });
    }
  );
};

export default clauseRoutes;
