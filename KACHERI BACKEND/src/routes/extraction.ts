// KACHERI BACKEND/src/routes/extraction.ts
// Document Intelligence: Extraction API routes
//
// Endpoints:
// - POST /docs/:id/extract - Trigger AI extraction
// - GET /docs/:id/extraction - Get existing extraction
// - PATCH /docs/:id/extraction - Apply manual corrections
// - GET /docs/:id/extraction/export - Export extraction data
// - POST /docs/:id/extraction/actions - Create action (reminder or flag_review)
// - GET /docs/:id/extraction/actions - List actions for extraction
// - DELETE /docs/:id/extraction/actions/:actionId - Delete an action
//
// See: Docs/Roadmap/document-intelligence-work-scope.md (Slices 4 & 6)

import type { FastifyPluginAsync } from 'fastify';
import { createHash } from 'crypto';
import {
  ExtractionsStore,
  type DocumentType,
  type Anomaly,
} from '../store/extractions';
import {
  ExtractionActionsStore,
  type ActionType,
} from '../store/extractionActions';
import { extractDocument } from '../ai/extractors';
import { getDoc } from '../store/docs';
import { createComment } from '../store/comments';
import { jobQueue } from '../jobs/queue';
import type { ReminderExtractionPayload } from '../jobs/types';
import { recordProof } from '../provenanceStore';
import { recordProvenance } from '../provenance';
import { newProofPacket, writeProofPacket } from '../utils/proofs';
import { AI_RATE_LIMITS } from '../middleware/rateLimit';
import { wsBroadcast } from '../realtime/globalHub';
import { config, type AIProvider } from '../config';
import { checkDocAccess } from '../workspace/middleware';
import { db } from '../db';
// Slice 10: Auto-index integration hook
import { EntityHarvester } from '../knowledge/entityHarvester';
import { FtsSync } from '../knowledge/ftsSync';

/* ---------- Types ---------- */

interface ExtractBody {
  text: string;
  forceDocType?: DocumentType;
  reextract?: boolean;
  provider?: AIProvider;
  model?: string;
  seed?: string;
}

interface PatchExtractionBody {
  documentType?: DocumentType;
  corrections?: Record<string, unknown>;
}

interface ExportQuery {
  format?: 'json' | 'csv';
}

interface CreateActionBody {
  type: 'reminder' | 'flag_review';
  field?: string;
  config?: {
    reminderDate?: string;  // ISO date string for reminders
    message?: string;
  };
}

/* ---------- Helpers ---------- */

function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Flatten nested object for CSV export.
 * Arrays are joined with semicolons.
 */
function flattenForCsv(
  obj: Record<string, unknown>,
  prefix = ''
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const flatKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      result[flatKey] = '';
    } else if (Array.isArray(value)) {
      // Join array elements with semicolons
      result[flatKey] = value
        .map((v) =>
          typeof v === 'object' ? JSON.stringify(v) : String(v)
        )
        .join('; ');
    } else if (typeof value === 'object') {
      // Recursively flatten nested objects
      Object.assign(
        result,
        flattenForCsv(value as Record<string, unknown>, flatKey)
      );
    } else {
      result[flatKey] = String(value);
    }
  }

  return result;
}

/**
 * Convert flat object to CSV string.
 */
function objectToCsv(obj: Record<string, string>): string {
  const headers = Object.keys(obj);
  const values = Object.values(obj);

  // Escape values for CSV
  const escape = (v: string) => {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  return `${headers.map(escape).join(',')}\n${values.map(escape).join(',')}`;
}

/**
 * Get value at nested path in object.
 * Supports dot notation: "paymentTerms.netDays"
 */
function getNestedValue(
  obj: Record<string, unknown>,
  path: string
): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Set value at nested path in object.
 * Creates intermediate objects as needed.
 */
function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

/* ---------- Routes ---------- */

export const extractionRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /docs/:id/extract
   * Trigger AI extraction for a document.
   */
  fastify.post<{ Params: { id: string }; Body: ExtractBody }>(
    '/docs/:id/extract',
    {
      config: {
        rateLimit: AI_RATE_LIMITS.compose, // Extraction is expensive like compose
      },
    },
    async (req, reply) => {
      const { id: docId } = req.params;
      const { text, forceDocType, reextract, provider, model, seed } = req.body ?? {};

      // Validate required field
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return reply.code(400).send({
          error: 'text_required',
          message: 'Document text is required for extraction',
        });
      }

      // Doc-level permission check (editor+ required for extraction)
      if (!checkDocAccess(db, req, reply, docId, 'editor')) return;

      // Verify document exists
      const doc = await getDoc(docId);
      if (!doc) {
        return reply.code(404).send({
          error: 'doc_not_found',
          message: `Document ${docId} not found`,
        });
      }

      // Check if extraction already exists
      const existing = await ExtractionsStore.getByDocId(docId);
      if (existing && !reextract) {
        return reply.code(409).send({
          error: 'extraction_exists',
          message: 'Extraction already exists for this document. Set reextract=true to override.',
          existingExtractionId: existing.id,
        });
      }

      // User/workspace context
      const workspaceId = (req.headers['x-workspace-id'] as string | undefined)?.toString().trim();
      const userId =
        (req.headers['x-user-id'] as string | undefined)?.toString().trim() ||
        (req.headers['x-dev-user'] as string | undefined)?.toString().trim() ||
        'user:local';
      const jobId = `ext_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Notify: extraction started
      if (workspaceId) {
        wsBroadcast(workspaceId, {
          type: 'ai_job',
          jobId,
          docId,
          kind: 'extraction',
          phase: 'started',
          meta: { userId },
        });
      }

      // Determine AI provider/model
      const effectiveProvider: AIProvider =
        (provider as AIProvider) || config.ai.provider || 'dev';
      const effectiveModel =
        model ||
        (effectiveProvider === 'openai'
          ? config.ai.model?.openai || 'gpt-4o-mini'
          : effectiveProvider === 'anthropic'
          ? config.ai.model?.anthropic || 'claude-sonnet-4-5-20250929'
          : effectiveProvider === 'ollama'
          ? config.ai.model?.ollama || 'llama3'
          : 'dev-stub-1');

      // Run extraction (Slice 18: error categorization with timeout/failure distinction)
      let result;
      try {
        result = await extractDocument({
          text,
          forceDocType,
          provider: effectiveProvider,
          model: effectiveModel,
          seed,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Extraction failed';
        const isTimeout = message.toLowerCase().includes('timed out');

        if (workspaceId) {
          wsBroadcast(workspaceId, {
            type: 'ai_job',
            jobId,
            docId,
            kind: 'extraction',
            phase: 'failed',
            meta: { userId, error: message },
          });
        }

        return reply.code(isTimeout ? 504 : 500).send({
          error: isTimeout ? 'extraction_timeout' : 'extraction_failed',
          message: isTimeout
            ? 'Extraction timed out. The document may be too large or the AI service is slow. Try again later.'
            : `Extraction failed: ${message}`,
        });
      }

      // Create proof packet
      const truncatedText = text.length > 500 ? text.slice(0, 500) + '...' : text;
      const packet = newProofPacket(
        'ai:extraction',
        { type: 'ai', provider: effectiveProvider, model: effectiveModel },
        { text: truncatedText, docId, forceDocType, textLength: text.length },
        {
          documentType: result.documentType,
          typeConfidence: result.typeConfidence,
          extraction: result.extraction,
          anomalyCount: result.anomalies?.length || 0,
        },
        docId
      );
      packet.meta = { ...(packet.meta || {}), seed };

      const proofPath = await writeProofPacket(packet);
      const outputHashHex = packet.hashes?.output ?? '';
      const proofHash = `sha256:${outputHashHex}`;

      // Record proof in DB
      const proofRow = await recordProof({
        doc_id: docId,
        kind: 'ai:extraction',
        hash: proofHash,
        path: '',
        meta: {
          proofFile: proofPath,
          provider: effectiveProvider,
          model: effectiveModel,
          documentType: result.documentType,
          seed,
          ...(workspaceId ? { workspaceId } : {}),
        },
      });

      // Record provenance
      try {
        await recordProvenance({
          docId,
          action: 'ai:extraction',
          actor: 'ai',
          actorId: userId,
          workspaceId: workspaceId ?? null,
          details: {
            provider: effectiveProvider,
            model: effectiveModel,
            documentType: result.documentType,
            typeConfidence: result.typeConfidence,
            anomalyCount: result.anomalies?.length || 0,
            seed: seed ?? null,
            proofHash,
            proofId: proofRow?.id ?? null,
          },
        });
      } catch {
        // non-fatal
      }

      // Delete existing extraction if re-extracting
      if (existing) {
        await ExtractionsStore.deleteByDocId(docId);
      }

      // Store extraction in database
      const extraction = await ExtractionsStore.create({
        docId,
        documentType: result.documentType,
        typeConfidence: result.typeConfidence,
        extraction: result.extraction,
        fieldConfidences: result.fieldConfidences,
        anomalies: result.anomalies as Anomaly[] | undefined,
        proofId: proofRow?.id,
        createdBy: userId,
      });

      // Notify: extraction finished
      if (workspaceId) {
        wsBroadcast(workspaceId, {
          type: 'ai_job',
          jobId,
          docId,
          kind: 'extraction',
          phase: 'finished',
          meta: { userId, extractionId: extraction.id },
        });
        wsBroadcast(workspaceId, {
          type: 'proof_added',
          docId,
          proofId: proofRow?.id,
          sha256: proofHash,
          ts: Date.now(),
        });
      }

      // Slice 10: Auto-index — harvest entities + sync FTS after extraction
      if (workspaceId) {
        try {
          EntityHarvester.harvestFromExtraction(extraction, workspaceId);
          FtsSync.syncDoc(docId, workspaceId, doc.title || '', text);
        } catch (hookErr) {
          console.warn('[extraction] Auto-index hook failed:', hookErr);
        }
      }

      return reply.code(200).send({
        extractionId: extraction.id,
        docId: extraction.docId,
        documentType: extraction.documentType,
        confidence: extraction.typeConfidence,
        extraction: extraction.extraction,
        fieldConfidences: extraction.fieldConfidences,
        anomalies: extraction.anomalies,
        proofId: proofRow?.id,
        proofHash,
        extractedAt: extraction.createdAt,
      });
    }
  );

  /**
   * GET /docs/:id/extraction
   * Get existing extraction for a document.
   */
  fastify.get<{ Params: { id: string } }>(
    '/docs/:id/extraction',
    async (req, reply) => {
      const { id: docId } = req.params;

      // Doc-level permission check (viewer+ required)
      if (!checkDocAccess(db, req, reply, docId, 'viewer')) return;

      // Verify document exists
      const doc = await getDoc(docId);
      if (!doc) {
        return reply.code(404).send({
          error: 'doc_not_found',
          message: `Document ${docId} not found`,
        });
      }

      const extraction = await ExtractionsStore.getByDocId(docId);
      if (!extraction) {
        return reply.code(404).send({
          error: 'extraction_not_found',
          message: `No extraction found for document ${docId}`,
        });
      }

      // Get correction history
      const corrections = await ExtractionsStore.getCorrectionsByExtraction(extraction.id);

      return reply.code(200).send({
        extractionId: extraction.id,
        docId: extraction.docId,
        documentType: extraction.documentType,
        confidence: extraction.typeConfidence,
        extraction: extraction.extraction,
        fieldConfidences: extraction.fieldConfidences,
        anomalies: extraction.anomalies,
        proofId: extraction.proofId,
        extractedAt: extraction.createdAt,
        updatedAt: extraction.updatedAt,
        corrections: corrections.length > 0 ? corrections : undefined,
      });
    }
  );

  /**
   * PATCH /docs/:id/extraction
   * Apply manual corrections to extracted fields.
   */
  fastify.patch<{ Params: { id: string }; Body: PatchExtractionBody }>(
    '/docs/:id/extraction',
    async (req, reply) => {
      const { id: docId } = req.params;
      const { documentType, corrections } = req.body ?? {};

      // Doc-level permission check (editor+ required for corrections)
      if (!checkDocAccess(db, req, reply, docId, 'editor')) return;

      // Verify document exists
      const doc = await getDoc(docId);
      if (!doc) {
        return reply.code(404).send({
          error: 'doc_not_found',
          message: `Document ${docId} not found`,
        });
      }

      // Get existing extraction
      const extraction = await ExtractionsStore.getByDocId(docId);
      if (!extraction) {
        return reply.code(404).send({
          error: 'extraction_not_found',
          message: `No extraction found for document ${docId}`,
        });
      }

      const workspaceId = (req.headers['x-workspace-id'] as string | undefined)?.toString().trim();
      const userId =
        (req.headers['x-user-id'] as string | undefined)?.toString().trim() ||
        (req.headers['x-dev-user'] as string | undefined)?.toString().trim() ||
        'user:local';

      const correctedFields: string[] = [];
      const updates: { extraction?: Record<string, unknown>; documentType?: DocumentType } = {};

      // Handle document type override
      if (documentType && documentType !== extraction.documentType) {
        updates.documentType = documentType;
        correctedFields.push('documentType');

        // Record correction
        await ExtractionsStore.createCorrection({
          extractionId: extraction.id,
          fieldPath: 'documentType',
          oldValue: extraction.documentType,
          newValue: documentType,
          correctedBy: userId,
        });
      }

      // Handle field corrections
      if (corrections && typeof corrections === 'object') {
        const updatedExtraction = { ...extraction.extraction };

        for (const [fieldPath, newValue] of Object.entries(corrections)) {
          const oldValue = getNestedValue(extraction.extraction, fieldPath);

          // Skip if value hasn't changed
          if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
            continue;
          }

          // Update the extraction object
          setNestedValue(updatedExtraction, fieldPath, newValue);
          correctedFields.push(fieldPath);

          // Record correction
          await ExtractionsStore.createCorrection({
            extractionId: extraction.id,
            fieldPath,
            oldValue,
            newValue,
            correctedBy: userId,
          });
        }

        if (correctedFields.length > 0) {
          updates.extraction = updatedExtraction;
        }
      }

      if (correctedFields.length === 0) {
        return reply.code(200).send({
          extractionId: extraction.id,
          extraction: extraction.extraction,
          correctedFields: [],
          message: 'No changes applied',
        });
      }

      // Update extraction
      const updated = await ExtractionsStore.update(extraction.id, updates);
      if (!updated) {
        return reply.code(500).send({
          error: 'update_failed',
          message: 'Failed to update extraction',
        });
      }

      // Record provenance
      try {
        await recordProvenance({
          docId,
          action: 'extraction:correction',
          actor: 'human',
          actorId: userId,
          workspaceId: workspaceId ?? null,
          details: {
            extractionId: extraction.id,
            correctedFields,
            correctedBy: userId,
          },
        });
      } catch {
        // non-fatal
      }

      return reply.code(200).send({
        extractionId: updated.id,
        docId: updated.docId,
        documentType: updated.documentType,
        extraction: updated.extraction,
        correctedFields,
        correctedAt: updated.updatedAt,
        correctedBy: userId,
      });
    }
  );

  /**
   * GET /docs/:id/extraction/export
   * Export extraction data as JSON or CSV.
   */
  fastify.get<{ Params: { id: string }; Querystring: ExportQuery }>(
    '/docs/:id/extraction/export',
    async (req, reply) => {
      const { id: docId } = req.params;
      const { format = 'json' } = req.query;

      // Doc-level permission check (viewer+ required)
      if (!checkDocAccess(db, req, reply, docId, 'viewer')) return;

      // Verify document exists
      const doc = await getDoc(docId);
      if (!doc) {
        return reply.code(404).send({
          error: 'doc_not_found',
          message: `Document ${docId} not found`,
        });
      }

      const extraction = await ExtractionsStore.getByDocId(docId);
      if (!extraction) {
        return reply.code(404).send({
          error: 'extraction_not_found',
          message: `No extraction found for document ${docId}`,
        });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      if (format === 'csv') {
        // Flatten extraction for CSV
        const flatData = flattenForCsv({
          documentType: extraction.documentType,
          confidence: extraction.typeConfidence,
          extractedAt: extraction.createdAt,
          ...extraction.extraction,
        });

        const csv = objectToCsv(flatData);

        return reply
          .header('Content-Type', 'text/csv')
          .header(
            'Content-Disposition',
            `attachment; filename="extraction-${docId}-${timestamp}.csv"`
          )
          .send(csv);
      }

      // Default: JSON format
      const jsonData = {
        extractionId: extraction.id,
        docId: extraction.docId,
        documentType: extraction.documentType,
        confidence: extraction.typeConfidence,
        extraction: extraction.extraction,
        fieldConfidences: extraction.fieldConfidences,
        anomalies: extraction.anomalies,
        extractedAt: extraction.createdAt,
        exportedAt: new Date().toISOString(),
      };

      return reply
        .header('Content-Type', 'application/json')
        .header(
          'Content-Disposition',
          `attachment; filename="extraction-${docId}-${timestamp}.json"`
        )
        .send(JSON.stringify(jsonData, null, 2));
    }
  );

  /* ---------- Extraction Actions (Slice 6) ---------- */

  /**
   * POST /docs/:id/extraction/actions
   * Create an action (reminder or flag_review) for an extraction.
   */
  fastify.post<{ Params: { id: string }; Body: CreateActionBody }>(
    '/docs/:id/extraction/actions',
    async (req, reply) => {
      const { id: docId } = req.params;
      const { type, field, config } = req.body ?? {};

      // Doc-level permission check (editor+ required for creating actions)
      if (!checkDocAccess(db, req, reply, docId, 'editor')) return;

      // Validate required fields
      if (!type || (type !== 'reminder' && type !== 'flag_review')) {
        return reply.code(400).send({
          error: 'invalid_type',
          message: 'Action type must be "reminder" or "flag_review"',
        });
      }

      // Verify document exists
      const doc = await getDoc(docId);
      if (!doc) {
        return reply.code(404).send({
          error: 'doc_not_found',
          message: `Document ${docId} not found`,
        });
      }

      // Get extraction
      const extraction = await ExtractionsStore.getByDocId(docId);
      if (!extraction) {
        return reply.code(404).send({
          error: 'extraction_not_found',
          message: `No extraction found for document ${docId}`,
        });
      }

      // User/workspace context
      const workspaceId = (req.headers['x-workspace-id'] as string | undefined)?.toString().trim();
      const userId =
        (req.headers['x-user-id'] as string | undefined)?.toString().trim() ||
        (req.headers['x-dev-user'] as string | undefined)?.toString().trim() ||
        'user:local';

      if (type === 'reminder') {
        // Validate reminder date
        if (!config?.reminderDate) {
          return reply.code(400).send({
            error: 'reminder_date_required',
            message: 'config.reminderDate is required for reminder actions',
          });
        }

        const reminderDate = new Date(config.reminderDate);
        if (isNaN(reminderDate.getTime())) {
          return reply.code(400).send({
            error: 'invalid_date',
            message: 'config.reminderDate must be a valid ISO date string',
          });
        }

        const scheduledFor = reminderDate.getTime();
        const message = config.message || `Reminder for extracted field: ${field || 'document'}`;

        // Create action record
        const action = await ExtractionActionsStore.create({
          extractionId: extraction.id,
          actionType: 'reminder',
          fieldPath: field,
          config: { reminderDate: config.reminderDate, message },
          scheduledFor,
          createdBy: userId,
        });

        // Schedule job in queue
        const payload: ReminderExtractionPayload = {
          extractionId: extraction.id,
          actionId: action.id,
          docId,
          fieldPath: field || null,
          message,
          userId,
          workspaceId,
        };

        try {
          await jobQueue.add(
            'reminder:extraction',
            payload,
            userId,
            docId,
            { scheduledAt: scheduledFor }
          );
        } catch (err) {
          console.error('[extraction/actions] Failed to schedule reminder job:', err);
          // Action was created, job scheduling failed - don't fail the request
          // The worker can pick up pending actions via getPendingReminders()
        }

        return reply.code(201).send({
          actionId: action.id,
          type: 'reminder',
          status: action.status,
          scheduledFor: action.scheduledFor,
          field: action.fieldPath,
          config: action.config,
          createdAt: action.createdAt,
        });
      }

      if (type === 'flag_review') {
        // Create a comment on the document for flag_review
        const message = config?.message || `This document has been flagged for review.`;
        const fieldNote = field ? ` (Field: ${field})` : '';

        const comment = await createComment({
          docId,
          authorId: userId,
          content: `🚩 **Flagged for Review**${fieldNote}\n\n${message}`,
        });

        if (!comment) {
          return reply.code(500).send({
            error: 'comment_failed',
            message: 'Failed to create review flag comment',
          });
        }

        // Create action record (immediately completed since comment was created)
        const action = await ExtractionActionsStore.create({
          extractionId: extraction.id,
          actionType: 'flag_review',
          fieldPath: field,
          config: { message, commentId: comment.id },
          createdBy: userId,
        });

        // Mark as completed immediately
        await ExtractionActionsStore.updateStatus(action.id, 'completed', Date.now());

        return reply.code(201).send({
          actionId: action.id,
          type: 'flag_review',
          status: 'completed',
          field: action.fieldPath,
          config: action.config,
          commentId: comment.id,
          createdAt: action.createdAt,
        });
      }

      // Shouldn't reach here due to validation above
      return reply.code(400).send({
        error: 'invalid_type',
        message: 'Action type must be "reminder" or "flag_review"',
      });
    }
  );

  /**
   * GET /docs/:id/extraction/actions
   * List all actions for an extraction.
   */
  fastify.get<{ Params: { id: string } }>(
    '/docs/:id/extraction/actions',
    async (req, reply) => {
      const { id: docId } = req.params;

      // Doc-level permission check (viewer+ required)
      if (!checkDocAccess(db, req, reply, docId, 'viewer')) return;

      // Verify document exists
      const doc = await getDoc(docId);
      if (!doc) {
        return reply.code(404).send({
          error: 'doc_not_found',
          message: `Document ${docId} not found`,
        });
      }

      // Get extraction
      const extraction = await ExtractionsStore.getByDocId(docId);
      if (!extraction) {
        return reply.code(404).send({
          error: 'extraction_not_found',
          message: `No extraction found for document ${docId}`,
        });
      }

      // Get all actions for this extraction
      const actions = await ExtractionActionsStore.getByExtraction(extraction.id);

      // Format response
      const formattedActions = actions.map((action) => ({
        actionId: action.id,
        type: action.actionType,
        status: action.status,
        field: action.fieldPath,
        config: action.config,
        scheduledFor: action.scheduledFor,
        completedAt: action.completedAt,
        createdBy: action.createdBy,
        createdAt: action.createdAt,
      }));

      return reply.code(200).send({
        extractionId: extraction.id,
        docId,
        actions: formattedActions,
        total: formattedActions.length,
      });
    }
  );

  /**
   * DELETE /docs/:id/extraction/actions/:actionId
   * Delete or cancel an extraction action.
   */
  fastify.delete<{ Params: { id: string; actionId: string } }>(
    '/docs/:id/extraction/actions/:actionId',
    async (req, reply) => {
      const { id: docId, actionId } = req.params;

      // Doc-level permission check (editor+ required for deleting actions)
      if (!checkDocAccess(db, req, reply, docId, 'editor')) return;

      // Verify document exists
      const doc = await getDoc(docId);
      if (!doc) {
        return reply.code(404).send({
          error: 'doc_not_found',
          message: `Document ${docId} not found`,
        });
      }

      // Get extraction
      const extraction = await ExtractionsStore.getByDocId(docId);
      if (!extraction) {
        return reply.code(404).send({
          error: 'extraction_not_found',
          message: `No extraction found for document ${docId}`,
        });
      }

      // Get the action
      const action = await ExtractionActionsStore.getById(actionId);
      if (!action) {
        return reply.code(404).send({
          error: 'action_not_found',
          message: `Action ${actionId} not found`,
        });
      }

      // Verify action belongs to this extraction
      if (action.extractionId !== extraction.id) {
        return reply.code(404).send({
          error: 'action_not_found',
          message: `Action ${actionId} does not belong to this extraction`,
        });
      }

      // If action is pending/scheduled, cancel it; otherwise delete
      if (action.status === 'pending' || action.status === 'scheduled') {
        // Cancel the action (job will be skipped when it processes)
        const updated = await ExtractionActionsStore.updateStatus(actionId, 'cancelled', Date.now());
        if (!updated) {
          return reply.code(500).send({
            error: 'cancel_failed',
            message: 'Failed to cancel action',
          });
        }

        return reply.code(200).send({
          actionId,
          status: 'cancelled',
          message: 'Action cancelled',
        });
      }

      // For completed/cancelled actions, delete the record
      const deleted = await ExtractionActionsStore.delete(actionId);
      if (!deleted) {
        return reply.code(500).send({
          error: 'delete_failed',
          message: 'Failed to delete action',
        });
      }

      return reply.code(200).send({
        actionId,
        status: 'deleted',
        message: 'Action deleted',
      });
    }
  );
};

export default extractionRoutes;
