// KACHERI BACKEND/src/server.ts
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { FastifyRequest } from 'fastify';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash, type BinaryLike } from 'crypto';

// Observability (Phase 5 - P5.1)
import {
  createLogger,
  registerObservability,
  requestIdGenerator,
} from './observability';

import { listDocs, getDoc, createDoc, updateDocTitle, updateDocLayout, getDocLayout, deleteDoc, restoreDoc, permanentDeleteDoc, listTrash as listDocsTrash, migrateFromJson, type LayoutSettings, DEFAULT_LAYOUT_SETTINGS } from './store/docs';
import { recordProvenance, listProvenance } from './provenance';
import { listProofsForDoc, recordProof } from './provenanceStore';
import { db, initDb, repoPath } from './db';
import { getStorage, readArtifactBuffer } from './storage';

// Auth module
import {
  getAuthConfig,
  registerAuthMiddleware,
  createAuthRoutes,
  seedDevUser,
} from './auth';

// Workspace module
import { createWorkspaceRoutes, registerWorkspaceMiddleware } from './workspace';
import { hasWorkspaceWriteAccess, hasWorkspaceAdminAccess, checkDocAccess, getUserId, requirePlatformAdmin } from './workspace/middleware';

// Rate limiting middleware
import { registerRateLimit } from './middleware/rateLimit';

// Product module registry (Slices M1 + P3)
import { isProductEnabled, areAllProductsEnabled, getProductRegistry, isFeatureEnabled } from './modules/registry';
import { stripDangerousHtml } from './utils/sanitize';
import { config } from './config';

// --- AI routes (specific first, generic last) ---
import aiComposeRoutes from './routes/ai/compose';
import aiTranslateRoutes from './routes/ai/translate';             // AI translation
import constrainedRewriteRoutes from './routes/ai/constrainedRewrite';
import rewriteSelectionRoutes from './routes/ai/rewriteSelection'; // <-- ensure before generic
import aiDetectFieldsRoutes from './routes/ai/detectFields';       // PDF field detection
import aiVerifyRoutes from './routes/aiVerify';
import providersRoute from './routes/ai/providers';                // provider/model catalog
import aiRoutes from './routes/ai';                                // generic /docs/:id/ai/:action
import exportDocxRoutes from './routes/exportDocx';

// Import/Upload route
import importDocRoutes from './routes/importDoc';

// Image upload route
import imageUploadRoutes from './routes/imageUpload';

// Document attachment routes (Phase 2 Sprint 2, Slice 4)
import docAttachmentRoutes from './routes/docAttachments';

// Document reviewer routes (Phase 2 Sprint 4, Slice 12)
import docReviewerRoutes from './routes/docReviewers';

// File manager routes
import filesRoutes from './routes/files';

// 🌟 Global AI Watch routes (summary/events/exports + debug)
import aiWatchRoutes from './routes/aiWatch';

// Audit log routes
import auditRoutes from './routes/audit';
import { logAuditEvent } from './store/audit';

// Activity feed routes (Slice S3)
import activityFeedRoutes from './routes/activityFeed';

// JAAL Research Browser routes (Slice S5)
import jaalRoutes from './routes/jaal';

// Doc permission routes
import { createDocPermissionRoutes } from './routes/docPermissions';

// Comment routes
import { createCommentRoutes } from './routes/comments';

// Version history routes
import { createVersionRoutes } from './routes/versions';

// Suggestion routes (track changes)
import { createSuggestionRoutes } from './routes/suggestions';

// Template routes
import { createTemplateRoutes } from './routes/templates';
import { getTemplate } from './store/templates';

// Doc link routes (cross-doc references and backlinks)
import { createDocLinkRoutes } from './routes/docLinks';

// Message routes (workspace chat)
import { createMessageRoutes } from './routes/messages';

// Notification routes (user alerts)
import { createNotificationRoutes } from './routes/notifications';

// Notification preference routes (channel preferences per workspace)
import notificationPreferenceRoutes from './routes/notificationPreferences';

// Workspace AI settings routes (BYOK + model selection)
import workspaceAiSettingsRoutes from './routes/workspaceAiSettings';

// Invite routes (workspace member invites)
import { createInviteRoutes } from './routes/invites';

// Platform config endpoint (Slice M3)
import configRoutes from './routes/config';

// Verification reports routes (Phase 5 - P0.3)
import verificationReportRoutes from './routes/verificationReports';

// Proof health routes (Phase 5 - P1.1)
import proofHealthRoutes from './routes/proofHealth';

// Workspace AI Safety routes (Phase 5 - P2.1)
import workspaceAISafetyRoutes from './routes/workspaceAISafety';

// Artifacts routes (Phase 5 - P4.1)
import artifactsRoutes from './routes/artifacts';

// Jobs routes (Phase 5 - P4.3)
import jobsRoutes from './routes/jobs';
import { getJobQueue } from './jobs/queue';
import { registerAllWorkers } from './jobs/workers';

// Document Intelligence: Extraction routes (Slice 4)
import extractionRoutes from './routes/extraction';

// Document Intelligence: Workspace Extraction Standards routes (Slice 7)
import extractionStandardsRoutes from './routes/extractionStandards';

// Compliance Checker: Check API routes (Slice A5)
import complianceRoutes from './routes/compliance';

// Compliance Checker: Policy Management routes (Slice A6)
import compliancePoliciesRoutes from './routes/compliancePolicies';

// Compliance Checker: Store for pre-export compliance warning (Slice A7)
import { ComplianceChecksStore } from './store/complianceChecks';

// Clause Library: Clause CRUD routes (Slice B2)
import clauseRoutes from './routes/clauses';

// Clause Library: Clause Insertion & Usage Tracking routes (Slice B4)
import clauseInsertRoutes from './routes/clauseInsert';

// Cross-Document Intelligence: Knowledge Graph routes (Slice 8)
import knowledgeRoutes from './routes/knowledge';

// Redline / Negotiation AI: Session & Round routes (Slice 6)
import negotiationRoutes from './routes/negotiations';

// Metrics routes (Phase 5 - P5.2)
import metricsRoutes from './routes/metrics';

// Health routes (Phase 5 - P5.3)
import healthRoutes from './routes/health';

// Design Studio: Canvas API routes (Slice A3)
import canvasRoutes from './routes/canvases';

// Design Studio: KCL bundle serving (Slice A6)
import kclServeRoutes from './routes/kclServe';

// Design Studio: Canvas AI routes — generate, edit, style, conversation (Slice B3)
import canvasAiRoutes from './routes/canvasAi';

// Design Studio: Frame template routes — CRUD with tag filtering (Slice D9)
import canvasTemplateRoutes from './routes/canvasTemplates';

// Design Studio: Public embed / widget routes (Slice E5)
import publicEmbedRoutes from './routes/publicEmbed';

// Cross-product: Canvas frame embedding for Docs (Slice P9)
import canvasEmbedRoutes from './routes/canvasEmbed';

// Memory Graph: Ingest endpoint (Slice P2)
import memoryIngestRoutes from './routes/memoryIngest';

// Personal Access Tokens: PAT CRUD routes (Slice P4)
import { createPatRoutes } from './routes/pat';

// Workspace WebSocket (separate namespace /workspace/:id)
import { installWorkspaceWs } from './realtime/workspaceWs';

// Packet types for the provenance bridge
import type { ProofPacket } from './types/proofs';

/**
 * IMPORTANT ARCHITECTURE CHANGE:
 * --------------------------------
 * Yjs WebSocket is no longer embedded inside Fastify's HTTP server.
 *
 * It now runs as a standalone process in:
 *   src/realtime/yjsServer.ts
 *
 * Dev still stays "one command" via backend/package.json using concurrently.
 * Frontend continues to connect to /yjs via Vite proxy.
 */

// --- Helpers ---
async function ensureDir(dir: string) { await fs.mkdir(dir, { recursive: true }); }
function sha256Hex(data: BinaryLike) { return createHash('sha256').update(data).digest('hex'); }
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function normalizeId(raw: string) { return raw.startsWith('doc-') ? raw.slice(4) : raw; }
function toInt(v: unknown): number | undefined { if (v == null) return undefined; const n = Number(v); return Number.isFinite(n) ? n : undefined; }
function capLimit(v?: number) { const n = v ?? 50; return Math.min(Math.max(n, 1), 200); }
function devUser(req: FastifyRequest): string | undefined {
  const u = (req.headers['x-dev-user'] as string | undefined)?.toString().trim();
  return u && u.length ? u : undefined;
}
function devWorkspace(req: FastifyRequest): string | undefined {
  const w = (req.headers['x-workspace-id'] as string | undefined)?.toString().trim();
  return w && w.length ? w : undefined;
}

// --- Fastify augmentation ---
declare module 'fastify' {
  interface FastifyInstance {
    provenance?: {
      /** Accepts our ProofPacket and stores a summarized AI action row in the `proofs` table */
      record: (p: ProofPacket) => Promise<void> | void;
    };
    docs?: {
      /** Optional HTML resolver; if not provided, /export/docx requires body.html */
      getHtml?: (docId: string) => Promise<string>;
    };
  }
}

// --- Local export summary util (add 'kind' + FS fallback for resiliency) ---
type ExportSummary = {
  kind: string;
  ts: string;
  pdfHash: string | null;
  size: number;
  verified: boolean;
  fileName: string;
  proof: any;
};

async function listDocExports(id: string): Promise<ExportSummary[]> {
  const rawProofs = await listProofsForDoc(id, 200);
  const out: ExportSummary[] = [];
  const seenPaths = new Set<string>();

  // 1) DB-backed proofs (preferred)
  // Only treat *file-based exports* as exports:
  // - require a non-empty path
  // - ignore ai:* kinds
  // - keep kinds 'pdf' / 'docx' or anything whose path ends with .pdf/.docx
  const proofs = rawProofs.filter((p) => {
    const kind = (p.kind ?? '').toString().toLowerCase();
    const filePath = (p.path ?? '').toString().trim();
    const ext = filePath ? path.extname(filePath).toLowerCase() : '';

    if (!filePath) return false;            // text-only proofs (rewrites, compose, etc.)
    if (kind.startsWith('ai:')) return false;

    if (kind === 'pdf' || kind === 'docx') return true;
    if (ext === '.pdf' || ext === '.docx') return true;

    // Be conservative: unknown kinds without a clear file extension are not exports.
    return false;
  });

  for (const p of proofs) {
    const filePath = (p.path ?? '').toString();
    const storageKey = (p.meta as any)?.storageKey as string | undefined;
    let verified = false, size = 0;

    // Storage-first read with filesystem fallback
    const buf = await readArtifactBuffer(storageKey ?? null, filePath || null);
    if (buf) {
      size = buf.byteLength;
      const hash = 'sha256:' + sha256Hex(buf);
      verified = (hash === p.hash);
    }

    const tsIso = new Date(p.ts).toISOString();
    const kind = p.kind || 'file';

    let sanitizedProof: any = {
      artifactId: p.doc_id,
      action: `export:${kind}`,
      actor: { type: 'human', id: 'user:local' },
      timestamp: tsIso,
      input: p.meta?.input ?? undefined,
      output: { fileHash: p.hash, path: undefined },
      runtime: { source: 'db' }
    };

    // Load proof JSON via storage-first read
    const proofFile = (p.meta as any)?.proofFile as string | undefined;
    const proofStorageKey = (p.meta as any)?.storageKey as string | undefined;
    const proofBuf = await readArtifactBuffer(proofStorageKey ?? null, proofFile ?? null);
    if (proofBuf) {
      try {
        const json = JSON.parse(proofBuf.toString('utf8'));
        sanitizedProof = { ...json, output: { ...json.output, path: undefined } };
      } catch {
        // fall back to sanitizedProof above
      }
    }

    out.push({
      kind,
      ts: tsIso,
      pdfHash: p.hash || null,
      size,
      verified,
      fileName: path.basename(filePath),
      proof: sanitizedProof
    });

    if (filePath) {
      seenPaths.add(path.normalize(filePath));
    }
  }

  // 2) FS fallback
  const exportDir = repoPath('storage', 'exports', `doc-${id}`);
  let files: string[] = [];
  try { files = await fs.readdir(exportDir); } catch { files = []; }

  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (ext !== '.pdf' && ext !== '.docx') continue;
    const full = path.join(exportDir, f);
    if (seenPaths.has(path.normalize(full))) continue;

    try {
      const stat = await fs.stat(full);
      const buf = await fs.readFile(full);
      const hash = 'sha256:' + sha256Hex(buf);
      const kind = ext === '.pdf' ? 'pdf' : 'docx';
      const tsIso = new Date((stat as any).mtimeMs || stat.mtime || Date.now()).toISOString();

      out.push({
        kind,
        ts: tsIso,
        pdfHash: hash,
        size: buf.byteLength,
        verified: false,
        fileName: f,
        proof: {
          artifactId: id,
          action: `export:${kind}`,
          actor: { type: 'system', id: 'fs-scan' },
          timestamp: tsIso,
          output: { fileHash: hash, path: undefined },
          runtime: { source: 'fs-scan' }
        }
      });
    } catch {
      // ignore unreadable files
    }
  }

  out.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return out;
}

// --- Provenance bridge ---
function attachProvenanceBridge(app: FastifyInstance) {
  app.provenance = {
    record: async (packet: ProofPacket) => {
      try {
        const now = Date.now();
        const docId = packet.docId ?? '';

        const action: string = packet.kind === 'ai:compose' ? 'compose' : packet.kind;

        let preview = '';
        const inputs = packet.input ?? {};
        let outputs: any = packet.output ?? {};

        if (packet.kind === 'ai:compose') {
          const text =
            typeof outputs === 'object' && outputs && 'proposalText' in outputs
              ? String((outputs as any).proposalText || '')
              : '';
          preview = text.slice(0, 300);
          outputs = { preview };
        }

        const payloadObj = { action, inputs, outputs, packetId: packet.id, ts: packet.timestamp };
        const payloadStr = JSON.stringify(payloadObj);
        const sha = sha256Hex(payloadStr);

        await db.run(
          `INSERT INTO proofs (doc_id, type, ts, sha256, path, payload) VALUES (?, 'ai:action', ?, ?, NULL, ?)`,
          [docId, now, sha, payloadStr]
        );
      } catch (err) {
        app.log.warn({ err }, 'provenance.record failed (non-fatal)');
      }
    }
  };
}

// --- App Factory (Slice S8: extracted from main() for embedded use) ---
async function createApp(): Promise<FastifyInstance> {
  // Create Fastify with custom request ID generator for correlation
  const app = Fastify({
    logger: true,
    genReqId: requestIdGenerator,
  });

  // Register observability hooks (request ID, request logging)
  registerObservability(app);

  // S17: Wire CORS to config — production uses CORS_ORIGINS env var, dev allows all
  await app.register(cors, {
    origin: config.nodeEnv === 'production' ? config.cors.origins : true,
  });

  // Register rate limiting plugin (must be before route registration)
  await registerRateLimit(app);

  // Initialize the database (no-op for SQLite; runs PG migrations for PostgreSQL)
  await initDb();

  // Boot info
  let DB_FILE = '(memory/unknown)';
  if (db.dbType === 'sqlite') {
    const dbList = await db.queryAll<{ seq: number; name: string; file: string }>('PRAGMA database_list');
    DB_FILE = dbList.find(r => r.name === 'main')?.file || '(memory/unknown)';
  } else {
    console.log('[db] PostgreSQL mode');
    DB_FILE = '(postgresql)';
  }
  const authConfig = getAuthConfig();
  app.log.info({
    cwd: process.cwd(),
    repoRoot: repoPath('.'),
    dbFile: DB_FILE,
    node: process.version,
    authMode: authConfig.mode,
    devBypass: authConfig.devBypassAuth,
  }, 'Kacheri API boot');

  // Log enabled product modules and feature flags (Slices M1 + P3)
  const productConfig = getProductRegistry();
  app.log.info({
    enabledProducts: productConfig.enabledProducts,
    memoryGraphEnabled: isFeatureEnabled('memoryGraph'),
  }, 'Product modules & features');

  // Seed dev user in development mode
  if (authConfig.devAutoSeed) {
    await seedDevUser(db);
  }

  // Migrate docs from legacy JSON file to SQLite (idempotent)
  const jsonDocsPath = repoPath('data', 'docs.json');
  const migrationResult = await migrateFromJson(jsonDocsPath);
  if (migrationResult.migrated > 0) {
    app.log.info({ migrated: migrationResult.migrated, skipped: migrationResult.skipped }, 'Migrated docs from JSON to SQLite');
  }

  // Register auth middleware (validates JWT, handles dev bypass, maintenance mode)
  registerAuthMiddleware(app, db);

  // Register workspace middleware (extracts workspace context from headers)
  registerWorkspaceMiddleware(app, db);

  // Register auth routes (/auth/login, /auth/register, etc.)
  app.register(createAuthRoutes(db), { prefix: '/auth' });

  // Register PAT routes (/auth/tokens — create, list, revoke) (Slice P4)
  app.register(createPatRoutes(db), { prefix: '/auth' });

  // Register workspace routes (/workspaces, /workspaces/:id, etc.)
  app.register(createWorkspaceRoutes(db));

  // Attach provenance bridge for new routes
  attachProvenanceBridge(app);

  // Install the separate workspace WebSocket route (/workspace/:id)
  installWorkspaceWs(app);

  // ========== SHARED ROUTES (always registered) ==========

  // Metrics routes (Phase 5 - P5.2)
  app.register(metricsRoutes);

  // Health routes (Phase 5 - P5.3)
  app.register(healthRoutes);

  // Platform config endpoint (Slice M3)
  app.register(configRoutes);

  // Audit log routes (workspace-scoped)
  app.register(auditRoutes);

  // Activity feed routes (Slice S3 — cross-product recent activity)
  app.register(activityFeedRoutes);

  // Artifacts routes (Phase 5 - P4.1)
  app.register(artifactsRoutes);

  // Jobs routes (Phase 5 - P4.3)
  app.register(jobsRoutes);

  // Message routes (workspace chat)
  app.register(createMessageRoutes(db));

  // Notification routes (user alerts)
  app.register(createNotificationRoutes(db));

  // Notification preference routes (channel preferences per workspace)
  app.register(notificationPreferenceRoutes);

  // Workspace AI settings routes (BYOK + model selection)
  app.register(workspaceAiSettingsRoutes);

  // Invite routes (workspace member invites)
  app.register(createInviteRoutes);

  // ========== DOCS PRODUCT ROUTES (conditional on 'docs' product) ==========
  if (isProductEnabled('docs')) {
    // --- AI routes (order matters: specific first, generic last) ---
    app.register(aiComposeRoutes);
    app.register(aiTranslateRoutes);
    app.register(rewriteSelectionRoutes);
    app.register(constrainedRewriteRoutes);
    app.register(aiDetectFieldsRoutes);  // PDF field detection
    app.register(aiVerifyRoutes);
    app.register(providersRoute);      // GET /ai/providers
    app.register(exportDocxRoutes);

    // Import/Upload (safe to mount before generic AI)
    app.register(importDocRoutes);

    // Image upload/serve/delete
    app.register(imageUploadRoutes);

    // Document attachment upload/list/serve/delete (Phase 2 Sprint 2, Slice 4)
    app.register(docAttachmentRoutes);

    // Document reviewer assignment routes (Phase 2 Sprint 4, Slice 12)
    app.register(docReviewerRoutes);

    // File manager (folders + docs + artifacts tree)
    app.register(filesRoutes);

    // Generic AI doc actions — must be last among /docs/:id/ai/*
    app.register(aiRoutes);

    // Global AI Watch (summary/events/exports + debug endpoints)
    app.register(aiWatchRoutes);

    // Verification reports routes (Phase 5 - P0.3)
    app.register(verificationReportRoutes);

    // Proof health routes (Phase 5 - P1.1)
    app.register(proofHealthRoutes);

    // Workspace AI Safety routes (Phase 5 - P2.1)
    app.register(workspaceAISafetyRoutes);

    // Document Intelligence: Extraction routes (Slice 4)
    app.register(extractionRoutes);

    // Document Intelligence: Workspace Extraction Standards routes (Slice 7)
    app.register(extractionStandardsRoutes);

    // Compliance Checker: Check API routes (Slice A5)
    app.register(complianceRoutes);

    // Compliance Checker: Policy Management routes (Slice A6)
    app.register(compliancePoliciesRoutes);

    // Clause Library: Clause CRUD routes (Slice B2)
    app.register(clauseRoutes);

    // Clause Library: Clause Insertion & Usage Tracking routes (Slice B4)
    app.register(clauseInsertRoutes);

    // Cross-Document Intelligence: Knowledge Graph routes (Slice 8)
    app.register(knowledgeRoutes);

    // Redline / Negotiation AI: Session & Round routes (Slice 6)
    app.register(negotiationRoutes);

    // Doc permission routes
    app.register(createDocPermissionRoutes(db));

    // Comment routes
    app.register(createCommentRoutes(db));

    // Version history routes
    app.register(createVersionRoutes(db));

    // Suggestion routes (track changes)
    app.register(createSuggestionRoutes(db));

    // Template routes
    app.register(createTemplateRoutes(db));

    // Doc link routes (cross-doc references and backlinks)
    app.register(createDocLinkRoutes(db));
  }

  // ========== DESIGN STUDIO ROUTES (conditional) ==========
  if (isProductEnabled('design-studio')) {
    // Canvas CRUD, Search & Permissions routes (Slice A3)
    app.register(canvasRoutes);

    // KCL bundle serving — versioned JS/CSS assets (Slice A6)
    app.register(kclServeRoutes);

    // Canvas AI routes — generate, edit, style, conversation (Slice B3)
    app.register(canvasAiRoutes);

    // Frame template routes — CRUD with tag filtering (Slice D9)
    app.register(canvasTemplateRoutes);

    // Public embed / widget routes — publish toggle + public HTML rendering (Slice E5)
    app.register(publicEmbedRoutes);

    app.log.info('Design Studio product enabled');
  }

  // ========== JAAL RESEARCH BROWSER ROUTES (conditional) ==========
  if (isProductEnabled('jaal')) {
    app.register(jaalRoutes);

    app.log.info('JAAL Research Browser product enabled');
  }

  // ========== CROSS-PRODUCT ROUTES (requires both Docs + Design Studio) ==========
  if (areAllProductsEnabled('docs', 'design-studio')) {
    // Canvas frame embedding in Docs (Slice P9)
    app.register(canvasEmbedRoutes);

    app.log.info('Cross-product routes enabled (Docs + Design Studio)');
  }

  // ========== MEMORY GRAPH ROUTES (conditional on memoryGraph feature — Slice P3) ==========
  if (isFeatureEnabled('memoryGraph')) {
    // POST /platform/memory/ingest — unified ingest endpoint (Slice P2)
    // Existing knowledge graph routes (Docs-owned) remain under the Docs
    // product section above — they are unaffected by this toggle.
    app.register(memoryIngestRoutes);

    app.log.info('Memory Graph feature enabled');
  }

  const yjsPort = Number(process.env.YJS_PORT || 1234);

  // Index (dynamic based on enabled products — Slice M1)
  const sharedRoutes = [
    '/config [GET]',
    '/health [GET]',
    '/health/ready [GET]',
    '/health/live [GET]',
    '/auth/status',
    '/auth/register [POST]',
    '/auth/login [POST]',
    '/auth/logout [POST]',
    '/auth/refresh [POST]',
    '/auth/me',
    '/auth/tokens [GET, POST]',
    '/auth/tokens/:id [DELETE]',
    '/workspaces [GET, POST]',
    '/workspaces/:id [GET, PATCH, DELETE]',
    '/workspaces/:id/members [GET, POST]',
    '/workspaces/:id/members/:userId [PATCH, DELETE]',
    '/workspaces/:id/audit [GET]',
    '/workspaces/:id/audit/export [GET]',
    '/workspaces/:id/audit/stats [GET]',
    '/workspaces/default',
    '/workspaces/:id/messages [GET, POST]',
    '/messages/:id [PATCH, DELETE]',
    '/notifications [GET]',
    '/notifications/count [GET]',
    '/notifications/:id/read [POST]',
    '/notifications/read-all [POST]',
    '/notifications/:id [DELETE]',
    '/workspaces/:id/notification-preferences [GET, PUT]',
    '/artifacts [GET]',
    '/artifacts/:id [GET, DELETE]',
    '/artifacts/stats [GET]',
    '/artifacts/pending [GET]',
    '/artifacts/failed [GET]',
    '/artifacts/:id/verify [POST]',
    '/jobs [GET, POST]',
    '/jobs/:id [GET, DELETE]',
    '/jobs/:id/retry [POST]',
    '/jobs/stats [GET]',
    '/jobs/cleanup [POST]',
    '/metrics [GET]',
    `WS (Yjs standalone): ws://localhost:${yjsPort}/yjs/<room>`,
    'WS: /workspace/<id> (on API port)',
  ];

  const docsRoutes = [
    '/docs',
    '/docs/:id',
    '/docs/:id/permissions [GET, POST]',
    '/docs/:id/permissions/:userId [PATCH, DELETE]',
    '/docs/:id/comments [GET, POST]',
    '/comments/:id [GET, PATCH, DELETE]',
    '/comments/:id/resolve [POST]',
    '/comments/:id/reopen [POST]',
    '/docs/:id/versions [GET, POST]',
    '/docs/:id/versions/:versionId [GET, PATCH, DELETE]',
    '/docs/:id/versions/:versionId/diff [GET]',
    '/docs/:id/restore-version [POST]',
    '/docs/:id/suggestions [GET, POST]',
    '/suggestions/:id [GET, PATCH, DELETE]',
    '/suggestions/:id/accept [POST]',
    '/suggestions/:id/reject [POST]',
    '/docs/:id/suggestions/accept-all [POST]',
    '/docs/:id/suggestions/reject-all [POST]',
    '/templates [GET]',
    '/templates/:id [GET]',
    '/docs/from-template [POST]',
    '/docs/:id/links [GET, POST]',
    '/docs/:id/links/:linkId [DELETE]',
    '/docs/:id/links/sync [PUT]',
    '/docs/:id/backlinks [GET]',
    '/docs/import [POST]',
    '/files/tree',
    '/files/folder [POST]',
    '/files/:id [PATCH, DELETE]',
    '/docs/:id/export/pdf',
    '/docs/:id/export/docx',
    '/docs/:id/exports',
    '/docs/:id/exports/pdf/:file',
    '/docs/:id/exports/docx/:file',
    '/docs/:id/attachments [GET, POST]',
    '/docs/:id/attachments/:attachmentId/file [GET]',
    '/docs/:id/attachments/:attachmentId [DELETE]',
    '/docs/:id/reviewers [GET, POST]',
    '/docs/:id/reviewers/:userId [PATCH, DELETE]',
    '/docs/:id/provenance [GET, POST]',
    '/provenance?artifactId=doc-...&action=&limit=&before=&from=&to=',
    '/docs/:id/ai/compose',
    '/docs/:id/ai/translate',
    '/docs/:id/ai/rewriteSelection',
    '/docs/:id/ai/constrainedRewrite',
    '/docs/:id/ai/detectFields',
    '/docs/:id/ai/:action',
    '/ai/providers',
    '/docs/:id/extract [POST]',
    '/docs/:id/extraction [GET, PATCH]',
    '/docs/:id/extraction/export [GET]',
    '/docs/:id/extraction/actions [GET, POST]',
    '/docs/:id/extraction/actions/:actionId [DELETE]',
    '/workspaces/:id/extraction-standards [GET, POST]',
    '/workspaces/:id/extraction-standards/:standardId [PATCH, DELETE]',
    '/docs/:id/compliance/check [POST]',
    '/docs/:id/compliance [GET]',
    '/docs/:id/compliance/history [GET]',
    '/workspaces/:id/compliance-policies [GET, POST]',
    '/workspaces/:id/compliance-policies/:pid [PATCH, DELETE]',
    '/workspaces/:id/compliance-policies/templates [GET]',
    '/workspaces/:id/clauses [GET, POST]',
    '/workspaces/:id/clauses/:cid [GET, PATCH, DELETE]',
    '/workspaces/:id/clauses/:cid/versions [GET]',
    '/workspaces/:id/clauses/:cid/versions/:vid [GET]',
    '/docs/:id/clauses/insert [POST]',
    '/workspaces/:id/knowledge/entities [GET]',
    '/workspaces/:id/knowledge/entities/:eid [GET, PATCH, DELETE]',
    '/workspaces/:id/knowledge/entities/merge [POST]',
    '/workspaces/:id/knowledge/relationships [GET]',
    '/workspaces/:id/knowledge/search [POST] (semantic)',
    '/workspaces/:id/knowledge/search?q= [GET] (keyword)',
    '/workspaces/:id/knowledge/index [POST]',
    '/workspaces/:id/knowledge/cleanup [POST]',
    '/workspaces/:id/knowledge/status [GET]',
    '/workspaces/:id/knowledge/summary [GET]',
    '/docs/:id/entities [GET]',
    '/docs/:id/related [GET]',
    '/docs/:id/negotiations [GET, POST]',
    '/negotiations/:nid [GET, PATCH, DELETE]',
    '/negotiations/:nid/rounds [GET, POST]',
    '/negotiations/:nid/rounds/import [POST]',
    '/negotiations/:nid/rounds/:rid [GET]',
    '/negotiations/:nid/settle [POST]',
    '/negotiations/:nid/abandon [POST]',
    '/workspaces/:wid/negotiations [GET]',
    '/workspaces/:wid/negotiations/stats [GET]',
    '/ai/watch/summary',
    '/ai/watch/events',
    '/ai/watch/exports-summary',
    '/docs/:docId/artifacts [GET]',
    '/docs/:docId/jobs [GET]',
  ];

  // Design Studio routes will be added here in Slice A3
  const designStudioRoutes: string[] = [];

  app.get('/', async () => ({
    service: 'Kacheri API',
    authMode: authConfig.mode,
    enabledProducts: productConfig.enabledProducts,
    routes: [
      ...sharedRoutes,
      ...(isProductEnabled('docs') ? docsRoutes : []),
      ...(isProductEnabled('design-studio') ? designStudioRoutes : []),
    ],
  }));

  // Debug (dev only, admin-gated — Slice 8 security hardening)
  if (process.env.NODE_ENV === 'production') {
    app.get('/__debug/*', async (_req, reply) => {
      return reply.code(404).send({ error: 'not_found' });
    });
  } else {
    app.get('/__debug/sqlite', async (req, reply) => {
      if (!requirePlatformAdmin(req, reply)) return;
      let provCount = 0, proofsCount = 0;
      try {
        const r = await db.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM provenance');
        provCount = r?.c ?? 0;
      } catch {}
      try {
        const r = await db.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM proofs');
        proofsCount = r?.c ?? 0;
      } catch {}
      let dbFile = '(postgresql)';
      if (db.dbType === 'sqlite') {
        const list = await db.queryAll<{ name: string; file: string }>('PRAGMA database_list');
        dbFile = list.find(x => x.name === 'main')?.file || '(memory/unknown)';
      }
      return { cwd: process.cwd(), repoRoot: repoPath('.'), dbFile, counts: { provenance: provCount, proofs: proofsCount } };
    });

    app.get('/__debug/docIds', async (req, reply) => {
      if (!requirePlatformAdmin(req, reply)) return;
      const rows = await db.queryAll<{ doc_id: string; n: number; lastTs: number }>(`
        SELECT doc_id, COUNT(*) AS n, MAX(ts) AS lastTs
        FROM provenance
        GROUP BY doc_id
        ORDER BY lastTs DESC
        LIMIT 100
      `);
      return { dbFile: DB_FILE, rows };
    });

    app.get('/__debug/doc/:id/provRaw', async (req, reply) => {
      if (!requirePlatformAdmin(req, reply)) return;
      const id = normalizeId((req.params as { id: string }).id);
      const rows = await db.queryAll<any>(`
        SELECT id, doc_id, action, actor, ts, details
        FROM provenance
        WHERE doc_id = ?
        ORDER BY ts DESC, id DESC
        LIMIT 200
      `, [id]);
      return { dbFile: DB_FILE, id, rows };
    });
  }

  // ========== DOCS INLINE ROUTES (conditional on 'docs' product) ==========
  if (isProductEnabled('docs')) {

  // Docs CRUD (workspace-scoped)
  app.get('/docs', async (req, reply) => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return reply.code(400).send({ error: 'workspace_required', message: 'X-Workspace-Id header or workspace path required' });
    }
    if (!req.workspaceRole) {
      return reply.code(403).send({ error: 'forbidden', message: 'Not a member of this workspace' });
    }
    return listDocs(workspaceId);
  });

  app.post('/docs', async (req, reply) => {
    const workspaceId = devWorkspace(req);
    const actorId = devUser(req) || 'user:local';
    // Require editor+ role for workspace-scoped doc creation
    if (workspaceId && !hasWorkspaceWriteAccess(req)) {
      return reply.code(403).send({ error: 'Requires editor role or higher to create documents' });
    }
    const body = (req.body ?? {}) as { title?: string };
    // Pass createdBy for implicit ownership tracking
    const doc = await createDoc(body.title?.trim() || 'Untitled', workspaceId, actorId);
    recordProvenance({ docId: doc.id, action: 'create', actor: 'human', actorId, workspaceId: workspaceId ?? null, details: { title: doc.title } });

    // Log audit event if workspace-scoped
    if (workspaceId) {
      logAuditEvent({
        workspaceId,
        actorId,
        action: 'doc:create',
        targetType: 'doc',
        targetId: doc.id,
        details: { title: doc.title },
      });
    }

    reply.code(201).send(doc);
  });

  // Create doc from template
  app.post('/docs/from-template', async (req, reply) => {
    const workspaceId = devWorkspace(req);
    const actorId = devUser(req) || 'user:local';
    // Require editor+ role for workspace-scoped doc creation
    if (workspaceId && !hasWorkspaceWriteAccess(req)) {
      return reply.code(403).send({ error: 'Requires editor role or higher to create documents' });
    }
    const body = (req.body ?? {}) as { templateId?: string; title?: string };
    const templateId = body.templateId?.trim();
    if (!templateId) {
      return reply.code(400).send({ error: 'templateId required' });
    }

    const template = getTemplate(templateId);
    if (!template) {
      return reply.code(404).send({ error: 'Template not found' });
    }

    // Create doc with template content
    const docTitle = body.title?.trim() || template.name;
    const doc = await createDoc(docTitle, workspaceId, actorId);

    // Store the template content as the initial Yjs state
    // Note: Content is stored in the template, will be loaded by frontend
    recordProvenance({
      docId: doc.id,
      action: 'create',
      actor: 'human',
      actorId,
      workspaceId: workspaceId ?? null,
      details: { title: doc.title, templateId }
    });

    // Log audit event if workspace-scoped
    if (workspaceId) {
      logAuditEvent({
        workspaceId,
        actorId,
        action: 'doc:create',
        targetType: 'doc',
        targetId: doc.id,
        details: { title: doc.title, templateId },
      });
    }

    reply.code(201).send({
      doc,
      templateContent: template.content
    });
  });

  app.get('/docs/:id', async (req, reply) => {
    const raw = (req.params as { id: string }).id;
    const id = normalizeId(raw);
    const doc = await getDoc(id);
    if (!doc) {
      req.log.warn({ rawId: raw, normalized: id }, 'GET /docs/:id not found');
      return reply.code(404).send({ error: 'Not found' });
    }
    if (!checkDocAccess(db, req, reply, id, 'viewer')) return;
    return doc;
  });

  app.patch('/docs/:id', async (req, reply) => {
    const raw = (req.params as { id: string }).id;
    const id = normalizeId(raw);
    if (!checkDocAccess(db, req, reply, id, 'editor')) return;
    const body = (req.body ?? {}) as { title?: string };
    const title = (body.title ?? '').trim();
    if (!title) return reply.code(400).send({ error: 'title required' });

    const updated = await updateDocTitle(id, title);
    if (!updated) {
      req.log.warn({ rawId: raw, normalized: id }, 'PATCH /docs/:id not found');
      return reply.code(404).send({ error: 'Not found' });
    }
    const actorId = getUserId(req) || 'user:local';
    const workspaceId = devWorkspace(req);
    recordProvenance({ docId: id, action: 'rename', actor: 'human', actorId, workspaceId: workspaceId ?? null, details: { title } });
    return updated;
  });

  // Update document layout settings
  app.patch('/docs/:id/layout', async (req, reply) => {
    const raw = (req.params as { id: string }).id;
    const id = normalizeId(raw);
    if (!checkDocAccess(db, req, reply, id, 'editor')) return;
    const body = (req.body ?? {}) as Partial<LayoutSettings>;

    // Validate required fields
    if (!body.pageSize || !body.orientation || !body.margins) {
      return reply.code(400).send({ error: 'pageSize, orientation, and margins are required' });
    }

    // Validate pageSize
    if (!['a4', 'letter', 'legal'].includes(body.pageSize)) {
      return reply.code(400).send({ error: 'pageSize must be a4, letter, or legal' });
    }

    // Validate orientation
    if (!['portrait', 'landscape'].includes(body.orientation)) {
      return reply.code(400).send({ error: 'orientation must be portrait or landscape' });
    }

    // Validate margins
    const margins = body.margins;
    if (typeof margins.top !== 'number' || typeof margins.bottom !== 'number' ||
        typeof margins.left !== 'number' || typeof margins.right !== 'number') {
      return reply.code(400).send({ error: 'margins must have numeric top, bottom, left, right values' });
    }

    const layoutSettings: LayoutSettings = {
      pageSize: body.pageSize,
      orientation: body.orientation,
      margins: {
        top: margins.top,
        bottom: margins.bottom,
        left: margins.left,
        right: margins.right,
      },
      header: body.header ? { ...body.header, content: body.header.content ? stripDangerousHtml(body.header.content) : body.header.content } : body.header,
      footer: body.footer ? { ...body.footer, content: body.footer.content ? stripDangerousHtml(body.footer.content) : body.footer.content } : body.footer,
    };

    const updated = await updateDocLayout(id, layoutSettings);
    if (!updated) {
      req.log.warn({ rawId: raw, normalized: id }, 'PATCH /docs/:id/layout not found');
      return reply.code(404).send({ error: 'Not found' });
    }

    const actorId = getUserId(req) || 'user:local';
    const workspaceId = devWorkspace(req);
    recordProvenance({ docId: id, action: 'layout_update', actor: 'human', actorId, workspaceId: workspaceId ?? null, details: { layoutSettings } });
    return updated;
  });

  // Get document layout settings (with defaults)
  app.get('/docs/:id/layout', async (req, reply) => {
    const raw = (req.params as { id: string }).id;
    const id = normalizeId(raw);
    if (!checkDocAccess(db, req, reply, id, 'viewer')) return;
    const layout = await getDocLayout(id);
    if (!layout) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return layout;
  });

  app.delete('/docs/:id', async (req, reply) => {
    const raw = (req.params as { id: string }).id;
    const id = normalizeId(raw);
    if (!checkDocAccess(db, req, reply, id, 'editor')) return;
    const ok = await deleteDoc(id);
    if (!ok) {
      req.log.warn({ rawId: raw, normalized: id }, 'DELETE /docs/:id not found');
      return reply.code(404).send({ error: 'Not found' });
    }
    const actorId = getUserId(req) || 'user:local';
    const workspaceId = devWorkspace(req);
    recordProvenance({ docId: id, action: 'delete', actor: 'human', actorId, workspaceId: workspaceId ?? null, details: {} });

    // Log audit event if workspace-scoped
    if (workspaceId) {
      logAuditEvent({
        workspaceId,
        actorId,
        action: 'doc:delete',
        targetType: 'doc',
        targetId: id,
      });
    }

    reply.code(204).send();
  });

  // Trash routes for docs
  app.get('/docs/trash', async (req, reply) => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return reply.code(400).send({ error: 'workspace_required', message: 'X-Workspace-Id header or workspace path required' });
    }
    if (!req.workspaceRole) {
      return reply.code(403).send({ error: 'forbidden', message: 'Not a member of this workspace' });
    }
    return listDocsTrash(workspaceId);
  });

  app.post('/docs/:id/restore', async (req, reply) => {
    const raw = (req.params as { id: string }).id;
    const id = normalizeId(raw);
    if (!checkDocAccess(db, req, reply, id, 'editor')) return;
    const restored = await restoreDoc(id);
    if (!restored) {
      req.log.warn({ rawId: raw, normalized: id }, 'POST /docs/:id/restore not found or not in trash');
      return reply.code(404).send({ error: 'Not found or not in trash' });
    }
    const actorId = getUserId(req) || 'user:local';
    const workspaceId = devWorkspace(req);
    recordProvenance({ docId: id, action: 'restore', actor: 'human', actorId, workspaceId: workspaceId ?? null, details: {} });

    // Log audit event if workspace-scoped
    if (workspaceId) {
      logAuditEvent({
        workspaceId,
        actorId,
        action: 'doc:restore',
        targetType: 'doc',
        targetId: id,
        details: { title: restored.title },
      });
    }

    return restored;
  });

  app.delete('/docs/:id/permanent', async (req, reply) => {
    const raw = (req.params as { id: string }).id;
    const id = normalizeId(raw);
    if (!checkDocAccess(db, req, reply, id, 'owner')) return;
    const ok = await permanentDeleteDoc(id);
    if (!ok) {
      req.log.warn({ rawId: raw, normalized: id }, 'DELETE /docs/:id/permanent not found or not in trash');
      return reply.code(404).send({ error: 'Not found or not in trash' });
    }
    const actorId = getUserId(req) || 'user:local';
    const workspaceId = devWorkspace(req);
    recordProvenance({ docId: id, action: 'permanent_delete', actor: 'human', actorId, workspaceId: workspaceId ?? null, details: {} });

    // Log audit event if workspace-scoped
    if (workspaceId) {
      logAuditEvent({
        workspaceId,
        actorId,
        action: 'doc:permanent_delete',
        targetType: 'doc',
        targetId: id,
      });
    }

    reply.code(204).send();
  });

  // Export → PDF (existing)
  app.post('/docs/:id/export/pdf', async (req, reply) => {
    const raw = (req.params as { id: string }).id;
    const id = normalizeId(raw);
    const body = (req.body ?? {}) as { html?: string };
    const html = (body.html ?? '').toString();
    if (!html) return reply.code(400).send({ error: 'html required' });

    const doc = await getDoc(id);
    if (!doc) {
      req.log.warn({ rawId: raw, normalized: id }, 'POST /docs/:id/export/pdf not found');
      return reply.code(404).send({ error: 'Doc not found' });
    }
    if (!checkDocAccess(db, req, reply, id, 'viewer')) return;

    // Get layout settings (with defaults)
    const layout = (await getDocLayout(id)) ?? DEFAULT_LAYOUT_SETTINGS;
    const margins = layout.margins;

    const pageHtml = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(doc.title)} — Kacheri</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.45}h1,h2,h3{margin:1.2em 0 .6em}p{margin:.6em 0}</style>
</head><body><h1>${escapeHtml(doc.title)}</h1><main>${html}</main></body></html>`;

    const { default: puppeteer } = await import('puppeteer');
    const browser = await puppeteer.launch({ });
    const page = await browser.newPage();
    await page.setContent(pageHtml, { waitUntil: 'networkidle0' });

    // Build PDF options from layout settings
    const pdfFormat = layout.pageSize.toUpperCase() as 'A4' | 'LETTER' | 'LEGAL';
    const pdfOptions: Parameters<typeof page.pdf>[0] = {
      format: pdfFormat,
      landscape: layout.orientation === 'landscape',
      printBackground: true,
      margin: {
        top: `${margins.top}mm`,
        bottom: `${margins.bottom}mm`,
        left: `${margins.left}mm`,
        right: `${margins.right}mm`,
      },
    };

    // --- Page number position mapping ---
    // Puppeteer limitations (cannot be worked around):
    //   - Format: always decimal — <span class="pageNumber"> outputs plain integers
    //   - StartAt: always 1 — Puppeteer has no page offset API
    //   - Section reset: not supported — only DOCX (Slice A4)
    // The pageNumberPosition setting controls WHERE the number appears (header vs footer, alignment).
    const showPageNums = !!(layout.footer?.enabled && layout.footer.showPageNumbers);
    const pageNumPosition = layout.footer?.pageNumberPosition ?? 'footer-center';
    const pageNumPlacement = pageNumPosition.startsWith('header-') ? 'header' : 'footer';
    const pageNumAlign = pageNumPosition.split('-').pop() as 'left' | 'center' | 'right';
    const pageNumHtml = 'Page <span class="pageNumber"></span> of <span class="totalPages"></span>';

    const needsHeaderFooter = !!(layout.header?.enabled || layout.footer?.enabled || showPageNums);
    if (needsHeaderFooter) {
      pdfOptions.displayHeaderFooter = true;

      // --- Header template ---
      const headerContent = layout.header?.enabled ? (layout.header.content || '') : '';
      const headerPageNums = showPageNums && pageNumPlacement === 'header';
      if (headerContent || headerPageNums) {
        if (headerContent && headerPageNums) {
          // Header content + page numbers: content centered, page numbers aligned separately
          pdfOptions.headerTemplate = `<div style="font-size:10px;width:100%;display:flex;justify-content:space-between;padding:0 ${margins.left}mm;"><span>${headerContent}</span><span style="text-align:${pageNumAlign};">${pageNumHtml}</span></div>`;
        } else if (headerPageNums) {
          pdfOptions.headerTemplate = `<div style="font-size:10px;width:100%;text-align:${pageNumAlign};padding:0 ${margins.left}mm;">${pageNumHtml}</div>`;
        } else {
          pdfOptions.headerTemplate = `<div style="font-size:10px;width:100%;text-align:center;padding:0 ${margins.left}mm;">${headerContent}</div>`;
        }
      } else {
        pdfOptions.headerTemplate = '<span></span>';
      }

      // --- Footer template ---
      const footerContent = layout.footer?.enabled ? (layout.footer.content || '') : '';
      const footerPageNums = showPageNums && pageNumPlacement === 'footer';
      if (footerContent || footerPageNums) {
        if (footerContent && footerPageNums) {
          pdfOptions.footerTemplate = `<div style="font-size:10px;width:100%;text-align:${pageNumAlign};padding:0 ${margins.left}mm;">${footerContent} — ${pageNumHtml}</div>`;
        } else if (footerPageNums) {
          pdfOptions.footerTemplate = `<div style="font-size:10px;width:100%;text-align:${pageNumAlign};padding:0 ${margins.left}mm;">${pageNumHtml}</div>`;
        } else {
          pdfOptions.footerTemplate = `<div style="font-size:10px;width:100%;text-align:center;padding:0 ${margins.left}mm;">${footerContent}</div>`;
        }
      } else {
        pdfOptions.footerTemplate = '<span></span>';
      }
    }

    const pdfBytes = await page.pdf(pdfOptions);
    const pdfBuffer = Buffer.from(pdfBytes);
    await browser.close();

    const proofsDir = repoPath('data', 'proofs', `doc-${id}`);
    const exportDir = repoPath('storage', 'exports', `doc-${id}`);
    await ensureDir(proofsDir);
    await ensureDir(exportDir);

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const pdfPath = path.join(exportDir, `${ts}.pdf`);
    await fs.writeFile(pdfPath, pdfBuffer);

    const actorId = devUser(req) || 'user:local';
    const workspaceId = devWorkspace(req);
    const proof = {
      artifactId: id,
      action: 'export:pdf',
      actor: { type: 'human', id: actorId },
      timestamp: new Date().toISOString(),
      input: { htmlHash: 'sha256:' + sha256Hex(Buffer.from(html)), title: doc.title, nodeVersion: process.version },
      output: { pdfHash: 'sha256:' + sha256Hex(pdfBuffer), path: pdfPath },
      runtime: { chromium: 'puppeteer' }
    };
    const proofPath = path.join(proofsDir, `${ts}-pdf.json`);
    await fs.writeFile(proofPath, JSON.stringify(proof, null, 2), 'utf8');

    const pdfHash = 'sha256:' + sha256Hex(pdfBuffer);
    await recordProof({
      doc_id: id,
      kind: 'pdf',
      hash: pdfHash,
      path: pdfPath,
      meta: {
        proofFile: proofPath,
        input: { htmlHash: 'sha256:' + sha256Hex(Buffer.from(html)), title: doc.title },
        actorId,
        ...(workspaceId ? { workspaceId } : {})
      }
    });

    recordProvenance({
      docId: id,
      action: 'export:pdf',
      actor: 'human',
      actorId,
      workspaceId: workspaceId ?? null,
      details: { pdfPath, proofPath, hashes: { html: 'sha256:' + sha256Hex(Buffer.from(html)), pdf: pdfHash } }
    });

    // Pre-export compliance status header (Slice A7)
    // PDF response is binary, so compliance status is communicated via response header.
    // Non-blocking: export always completes regardless of compliance status.
    let complianceStatus = 'unknown';
    if (workspaceId) {
      try {
        const latestCheck = await ComplianceChecksStore.getLatest(id);
        if (latestCheck) {
          complianceStatus = latestCheck.violations > 0 ? 'failed' : latestCheck.status;
        } else {
          complianceStatus = 'unchecked';
        }
      } catch {
        // Non-fatal
      }
    }

    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="doc-${id}.pdf"`)
      .header('X-Compliance-Status', complianceStatus)
      .send(pdfBuffer);
  });

  // Download previously exported PDF (parity with DOCX)
  app.get('/docs/:id/exports/pdf/:file', async (req, reply) => {
    const { id: raw, file } = req.params as { id: string; file: string };
    const id = normalizeId(raw);
    if (!checkDocAccess(db, req, reply, id, 'viewer')) return;

    const safe = path.basename(file);
    if (safe !== file || !/\.pdf$/i.test(safe)) {
      return reply.code(400).send({ error: 'invalid filename' });
    }

    // Look up storage_key from DB for this export
    const row = await db.queryOne<{ storage_key: string | null; path: string | null }>(
      `SELECT storage_key, path FROM proofs WHERE doc_id = ? AND kind = 'pdf' AND path LIKE ? ORDER BY ts DESC LIMIT 1`,
      [id, `%${safe}`]
    );

    const dir = repoPath('storage', 'exports', `doc-${id}`);
    const full = path.join(dir, safe);

    const buf = await readArtifactBuffer(row?.storage_key ?? null, row?.path ?? full);
    if (buf) {
      return reply
        .type('application/pdf')
        .header('Content-Disposition', `attachment; filename="${safe}"`)
        .send(buf);
    }
    return reply.code(404).send({ error: 'Not found' });
  });

  // Download a previously exported DOCX
  app.get('/docs/:id/exports/docx/:file', async (req, reply) => {
    const { id: raw, file } = req.params as { id: string; file: string };
    const id = normalizeId(raw);
    if (!checkDocAccess(db, req, reply, id, 'viewer')) return;

    const safe = path.basename(file);
    const isDocx = /\.docx$/i.test(safe);
    if (safe !== file || !isDocx) {
      return reply.code(400).send({ error: 'invalid filename' });
    }

    // Look up storage_key from DB for this export
    const row = await db.queryOne<{ storage_key: string | null; path: string | null }>(
      `SELECT storage_key, path FROM proofs WHERE doc_id = ? AND kind = 'docx' AND path LIKE ? ORDER BY ts DESC LIMIT 1`,
      [id, `%${safe}`]
    );

    const dir = repoPath('storage', 'exports', `doc-${id}`);
    const full = path.join(dir, safe);

    const buf = await readArtifactBuffer(row?.storage_key ?? null, row?.path ?? full);
    if (buf) {
      return reply
        .type('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        .header('Content-Disposition', `attachment; filename="${safe}"`)
        .send(buf);
    }
    return reply.code(404).send({ error: 'Not found' });
  });

  // Evidence APIs
  app.get('/docs/:id/exports', async (req, reply) => {
    const id = normalizeId((req.params as { id: string }).id);
    if (!checkDocAccess(db, req, reply, id, 'viewer')) return;
    return await listDocExports(id);
  });

  app.get('/docs/:id/provenance', async (req, reply) => {
    const id = normalizeId((req.params as { id: string }).id);
    if (!checkDocAccess(db, req, reply, id, 'viewer')) return;
    const q = req.query as Partial<{ action: string; limit: string | number; before: string | number; from: string | number; to: string | number }>;
    return listProvenance(id, {
      action: q.action,
      limit: capLimit(toInt(q.limit)),
      before: toInt(q.before),
      from: toInt(q.from),
      to: toInt(q.to)
    });
  });

  // ✅ client can append a provenance row (e.g., ai:apply on Accept)
  app.post('/docs/:id/provenance', async (req, reply) => {
    const id = normalizeId((req.params as { id: string }).id);
    if (!checkDocAccess(db, req, reply, id, 'editor')) return;
    const body = (req.body ?? {}) as {
      action: string;          // e.g. "ai:apply"
      actor?: string;          // default: x-user-id or "human"
      preview?: string;
      details?: any;           // include proofHash/source if available
    };
    if (!body.action) return reply.code(400).send({ error: 'action required' });

    const actorHeader = (req.headers['x-user-id'] as string | undefined)?.toString().trim();
    const actor = body.actor || actorHeader || 'human';
    const actorId = getUserId(req) || 'user:local';
    const workspaceId = devWorkspace(req);

    const details = { ...(body.details || {}) };
    if (body.preview) (details as any).preview = body.preview;

    const row = await recordProvenance({ docId: id, action: body.action, actor, actorId, workspaceId: workspaceId ?? null, details });
    return reply.send({ ok: true, id: row.id, ts: row.ts });
  });

  app.get('/provenance', async (req, reply) => {
    const q = req.query as Partial<{ artifactId: string; action: string; limit: string | number; before: string | number; from: string | number; to: string | number }>;
    if (!q.artifactId) return reply.code(400).send({ error: 'artifactId required' });
    const id = q.artifactId.startsWith('doc-') ? q.artifactId.slice(4) : q.artifactId;
    return listProvenance(id, {
      action: q.action,
      limit: capLimit(toInt(q.limit)),
      before: toInt(q.before),
      from: toInt(q.from),
      to: toInt(q.to)
    });
  });

  } // end: isProductEnabled('docs') — inline doc routes

  // Start job queue and register workers (Phase 5 - P4.3)
  try {
    registerAllWorkers();
    const jobQueue = getJobQueue();
    jobQueue.start();
    app.log.info('Job queue started');
  } catch (err) {
    app.log.warn({ err }, 'Job queue initialization failed (non-fatal)');
  }

  return app;
}

// --- Server Start (Slice S8: separated from createApp for embedded use) ---
async function startServer(
  options?: { port?: number; host?: string }
): Promise<{ app: FastifyInstance; port: number }> {
  const theApp = await createApp();
  const port = options?.port ?? Number(process.env.PORT || 4000);
  const host = options?.host ?? '0.0.0.0';
  await theApp.listen({ port, host });

  const address = theApp.server.address();
  const boundPort =
    typeof address === 'object' && address ? address.port : port;
  theApp.log.info({ port: boundPort }, 'API listening');

  // Signal embedded host (Electron) via IPC when running as a subprocess
  if (typeof process.send === 'function') {
    process.send({ type: 'backend:ready', port: boundPort });
  }

  return { app: theApp, port: boundPort };
}

export { createApp, startServer };

// Module-level logger for startup errors
const startupLogger = createLogger('startup');

// Auto-start when running directly (not when imported for embedding)
if (!process.env.BEYLE_EMBEDDED) {
  startServer().catch((err) => {
    startupLogger.fatal({ err }, 'Server startup failed');
    process.exit(1);
  });
}
