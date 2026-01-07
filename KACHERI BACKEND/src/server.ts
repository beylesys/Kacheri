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
import { db, repoPath } from './db';

// Auth module
import {
  getAuthConfig,
  registerAuthMiddleware,
  createAuthRoutes,
  seedDevUser,
} from './auth';

// Workspace module
import { createWorkspaceRoutes, registerWorkspaceMiddleware } from './workspace';
import { hasWorkspaceWriteAccess, hasWorkspaceAdminAccess } from './workspace/middleware';

// Rate limiting middleware
import { registerRateLimit } from './middleware/rateLimit';

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

// File manager routes
import filesRoutes from './routes/files';

// 🌟 Global AI Watch routes (summary/events/exports + debug)
import aiWatchRoutes from './routes/aiWatch';

// Audit log routes
import auditRoutes from './routes/audit';
import { logAuditEvent } from './store/audit';

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

// Invite routes (workspace member invites)
import { createInviteRoutes } from './routes/invites';

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

// Metrics routes (Phase 5 - P5.2)
import metricsRoutes from './routes/metrics';

// Health routes (Phase 5 - P5.3)
import healthRoutes from './routes/health';

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
  const rawProofs = listProofsForDoc(id, 200);
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
    let verified = false, size = 0;

    try {
      const buf = await fs.readFile(filePath);
      size = buf.byteLength;
      const hash = 'sha256:' + sha256Hex(buf);
      verified = (hash === p.hash);
    } catch {
      verified = false;
      size = 0;
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

    const proofFile = (p.meta as any)?.proofFile as string | undefined;
    if (proofFile) {
      try {
        const text = await fs.readFile(proofFile, 'utf8');
        const json = JSON.parse(text);
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
    record: (packet: ProofPacket) => {
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

        db.prepare(`
          INSERT INTO proofs (doc_id, type, ts, sha256, path, payload)
          VALUES (@doc, 'ai:action', @ts, @sha, NULL, @payload)
        `).run({ doc: docId, ts: now, payload: payloadStr, sha });
      } catch (err) {
        app.log.warn({ err }, 'provenance.record failed (non-fatal)');
      }
    }
  };
}

// --- Main ---
async function main() {
  // Create Fastify with custom request ID generator for correlation
  const app = Fastify({
    logger: true,
    genReqId: requestIdGenerator,
  });

  // Register observability hooks (request ID, request logging)
  registerObservability(app);

  await app.register(cors, { origin: true });

  // Register rate limiting plugin (must be before route registration)
  await registerRateLimit(app);

  // Boot info
  const dbList = db.prepare('PRAGMA database_list').all() as Array<{ seq: number; name: string; file: string }>;
  const DB_FILE = dbList.find(r => r.name === 'main')?.file || '(memory/unknown)';
  const authConfig = getAuthConfig();
  app.log.info({
    cwd: process.cwd(),
    repoRoot: repoPath('.'),
    dbFile: DB_FILE,
    node: process.version,
    authMode: authConfig.mode,
    devBypass: authConfig.devBypassAuth,
  }, 'Kacheri API boot');

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

  // Register workspace routes (/workspaces, /workspaces/:id, etc.)
  app.register(createWorkspaceRoutes(db));

  // Attach provenance bridge for new routes
  attachProvenanceBridge(app);

  // Install the separate workspace WebSocket route (/workspace/:id)
  installWorkspaceWs(app);

  // --- Register routes (order matters: specific first, generic last) ---
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

  // File manager (folders + docs + artifacts tree)
  app.register(filesRoutes);

  // Generic AI doc actions
  app.register(aiRoutes);            // generic /docs/:id/ai/:action must be last among /docs/:id/ai/*

  // 🌐 Global AI Watch (summary/events/exports + debug endpoints)
  app.register(aiWatchRoutes);

  // Verification reports routes (Phase 5 - P0.3)
  app.register(verificationReportRoutes);

  // Proof health routes (Phase 5 - P1.1)
  app.register(proofHealthRoutes);

  // Workspace AI Safety routes (Phase 5 - P2.1)
  app.register(workspaceAISafetyRoutes);

  // Artifacts routes (Phase 5 - P4.1)
  app.register(artifactsRoutes);

  // Jobs routes (Phase 5 - P4.3)
  app.register(jobsRoutes);

  // Metrics routes (Phase 5 - P5.2)
  app.register(metricsRoutes);

  // Health routes (Phase 5 - P5.3)
  app.register(healthRoutes);

  // Audit log routes (workspace-scoped)
  app.register(auditRoutes);

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

  // Message routes (workspace chat)
  app.register(createMessageRoutes(db));

  // Notification routes (user alerts)
  app.register(createNotificationRoutes(db));

  // Invite routes (workspace member invites)
  app.register(createInviteRoutes);

  const yjsPort = Number(process.env.YJS_PORT || 1234);

  // Index
  app.get('/', async () => ({
    service: 'Kacheri API',
    authMode: authConfig.mode,
    routes: [
      '/health',
      '/auth/status',
      '/auth/register [POST]',
      '/auth/login [POST]',
      '/auth/logout [POST]',
      '/auth/refresh [POST]',
      '/auth/me',
      '/workspaces [GET, POST]',
      '/workspaces/:id [GET, PATCH, DELETE]',
      '/workspaces/:id/members [GET, POST]',
      '/workspaces/:id/members/:userId [PATCH, DELETE]',
      '/workspaces/:id/audit [GET]',
      '/workspaces/:id/audit/export [GET]',
      '/workspaces/:id/audit/stats [GET]',
      '/workspaces/default',
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
      '/workspaces/:id/messages [GET, POST]',
      '/messages/:id [PATCH, DELETE]',
      '/notifications [GET]',
      '/notifications/count [GET]',
      '/notifications/:id/read [POST]',
      '/notifications/read-all [POST]',
      '/notifications/:id [DELETE]',
      '/docs/import [POST]',            // advertised
      '/files/tree',
      '/files/folder [POST]',
      '/files/:id [PATCH, DELETE]',
      '/docs/:id/export/pdf',
      '/docs/:id/export/docx',
      '/docs/:id/exports',
      '/docs/:id/exports/pdf/:file',
      '/docs/:id/exports/docx/:file',
      '/docs/:id/provenance [GET, POST]',
      '/provenance?artifactId=doc-...&action=&limit=&before=&from=&to=',
      '/docs/:id/ai/compose',
      '/docs/:id/ai/translate',
      '/docs/:id/ai/rewriteSelection',
      '/docs/:id/ai/constrainedRewrite',
      '/docs/:id/ai/detectFields',
      '/docs/:id/ai/:action',
      '/ai/providers',
      '/ai/watch/summary',
      '/ai/watch/events',
      '/ai/watch/exports-summary',
      '/artifacts [GET]',
      '/artifacts/:id [GET, DELETE]',
      '/artifacts/stats [GET]',
      '/artifacts/pending [GET]',
      '/artifacts/failed [GET]',
      '/artifacts/:id/verify [POST]',
      '/docs/:docId/artifacts [GET]',
      '/jobs [GET, POST]',
      '/jobs/:id [GET, DELETE]',
      '/jobs/:id/retry [POST]',
      '/jobs/stats [GET]',
      '/jobs/cleanup [POST]',
      '/docs/:docId/jobs [GET]',
      '/metrics [GET]',
      '/health [GET]',
      '/health/ready [GET]',
      '/health/live [GET]',
      `WS (Yjs standalone): ws://localhost:${yjsPort}/yjs/<room>`,
      'WS: /workspace/<id> (on API port)'
    ]
  }));

  // Debug
  app.get('/__debug/sqlite', async () => {
    let provCount = 0, proofsCount = 0;
    try {
      provCount = (db.prepare('SELECT COUNT(*) as c FROM provenance').get() as { c: number }).c;
    } catch {}
    try {
      proofsCount = (db.prepare('SELECT COUNT(*) as c FROM proofs').get() as { c: number }).c;
    } catch {}
    const list = db.prepare('PRAGMA database_list').all() as Array<{ name: string; file: string }>;
    const dbFile = list.find(x => x.name === 'main')?.file || '(memory/unknown)';
    return { cwd: process.cwd(), repoRoot: repoPath('.'), dbFile, counts: { provenance: provCount, proofs: proofsCount } };
  });

  app.get('/__debug/docIds', async () => {
    const rows = db.prepare(`
      SELECT doc_id, COUNT(*) AS n, MAX(ts) AS lastTs
      FROM provenance
      GROUP BY doc_id
      ORDER BY lastTs DESC
      LIMIT 100
    `).all() as Array<{ doc_id: string; n: number; lastTs: number }>;
    return { dbFile: DB_FILE, rows };
  });

  app.get('/__debug/doc/:id/provRaw', async (req) => {
    const id = normalizeId((req.params as { id: string }).id);
    const rows = db.prepare(`
      SELECT id, doc_id, action, actor, ts, details
      FROM provenance
      WHERE doc_id = ?
      ORDER BY ts DESC, id DESC
      LIMIT 200
    `).all(id) as any[];
    return { dbFile: DB_FILE, id, rows };
  });

  // Docs CRUD (workspace-scoped)
  app.get('/docs', async (req) => {
    const workspaceId = devWorkspace(req);
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
    const doc = createDoc(body.title?.trim() || 'Untitled', workspaceId, actorId);
    recordProvenance({ docId: doc.id, action: 'create', actor: 'human', details: { title: doc.title, workspaceId, devUser: devUser(req) } });

    // Log audit event if workspace-scoped
    if (workspaceId) {
      logAuditEvent({
        workspaceId,
        actorId: devUser(req) || 'user:local',
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
    const doc = createDoc(docTitle, workspaceId, actorId);

    // Store the template content as the initial Yjs state
    // Note: Content is stored in the template, will be loaded by frontend
    recordProvenance({
      docId: doc.id,
      action: 'create',
      actor: 'human',
      details: { title: doc.title, workspaceId, devUser: devUser(req), templateId }
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
    const doc = getDoc(id);
    if (!doc) {
      req.log.warn({ rawId: raw, normalized: id }, 'GET /docs/:id not found');
      return reply.code(404).send({ error: 'Not found' });
    }
    return doc;
  });

  app.patch('/docs/:id', async (req, reply) => {
    const workspaceId = devWorkspace(req);
    // Require editor+ role for workspace-scoped doc updates
    if (workspaceId && !hasWorkspaceWriteAccess(req)) {
      return reply.code(403).send({ error: 'Requires editor role or higher to update documents' });
    }
    const raw = (req.params as { id: string }).id;
    const id = normalizeId(raw);
    const body = (req.body ?? {}) as { title?: string };
    const title = (body.title ?? '').trim();
    if (!title) return reply.code(400).send({ error: 'title required' });

    const updated = updateDocTitle(id, title);
    if (!updated) {
      req.log.warn({ rawId: raw, normalized: id }, 'PATCH /docs/:id not found');
      return reply.code(404).send({ error: 'Not found' });
    }
    recordProvenance({ docId: id, action: 'rename', actor: 'human', details: { title, devUser: devUser(req) } });
    return updated;
  });

  // Update document layout settings
  app.patch('/docs/:id/layout', async (req, reply) => {
    const workspaceId = devWorkspace(req);
    // Require editor+ role for workspace-scoped doc updates
    if (workspaceId && !hasWorkspaceWriteAccess(req)) {
      return reply.code(403).send({ error: 'Requires editor role or higher to update document layout' });
    }
    const raw = (req.params as { id: string }).id;
    const id = normalizeId(raw);
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
      header: body.header,
      footer: body.footer,
    };

    const updated = updateDocLayout(id, layoutSettings);
    if (!updated) {
      req.log.warn({ rawId: raw, normalized: id }, 'PATCH /docs/:id/layout not found');
      return reply.code(404).send({ error: 'Not found' });
    }

    recordProvenance({ docId: id, action: 'layout_update', actor: 'human', details: { layoutSettings, devUser: devUser(req) } });
    return updated;
  });

  // Get document layout settings (with defaults)
  app.get('/docs/:id/layout', async (req, reply) => {
    const raw = (req.params as { id: string }).id;
    const id = normalizeId(raw);
    const layout = getDocLayout(id);
    if (!layout) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return layout;
  });

  app.delete('/docs/:id', async (req, reply) => {
    const workspaceId = devWorkspace(req);
    // Require editor+ role for workspace-scoped doc deletion (soft delete)
    if (workspaceId && !hasWorkspaceWriteAccess(req)) {
      return reply.code(403).send({ error: 'Requires editor role or higher to delete documents' });
    }
    const raw = (req.params as { id: string }).id;
    const id = normalizeId(raw);
    const ok = deleteDoc(id);
    if (!ok) {
      req.log.warn({ rawId: raw, normalized: id }, 'DELETE /docs/:id not found');
      return reply.code(404).send({ error: 'Not found' });
    }
    recordProvenance({ docId: id, action: 'delete', actor: 'human', details: { devUser: devUser(req) } });

    // Log audit event if workspace-scoped
    if (workspaceId) {
      logAuditEvent({
        workspaceId,
        actorId: devUser(req) || 'user:local',
        action: 'doc:delete',
        targetType: 'doc',
        targetId: id,
      });
    }

    reply.code(204).send();
  });

  // Trash routes for docs
  app.get('/docs/trash', async (req) => {
    const workspaceId = devWorkspace(req);
    return listDocsTrash(workspaceId);
  });

  app.post('/docs/:id/restore', async (req, reply) => {
    const workspaceId = devWorkspace(req);
    // Require editor+ role for workspace-scoped doc restore
    if (workspaceId && !hasWorkspaceWriteAccess(req)) {
      return reply.code(403).send({ error: 'Requires editor role or higher to restore documents' });
    }
    const raw = (req.params as { id: string }).id;
    const id = normalizeId(raw);
    const restored = restoreDoc(id);
    if (!restored) {
      req.log.warn({ rawId: raw, normalized: id }, 'POST /docs/:id/restore not found or not in trash');
      return reply.code(404).send({ error: 'Not found or not in trash' });
    }
    recordProvenance({ docId: id, action: 'restore', actor: 'human', details: { devUser: devUser(req) } });

    // Log audit event if workspace-scoped
    if (workspaceId) {
      logAuditEvent({
        workspaceId,
        actorId: devUser(req) || 'user:local',
        action: 'doc:restore',
        targetType: 'doc',
        targetId: id,
        details: { title: restored.title },
      });
    }

    return restored;
  });

  app.delete('/docs/:id/permanent', async (req, reply) => {
    const workspaceId = devWorkspace(req);
    // Require admin role for permanent deletion (destructive operation)
    if (workspaceId && !hasWorkspaceAdminAccess(req)) {
      return reply.code(403).send({ error: 'Requires admin role to permanently delete documents' });
    }
    const raw = (req.params as { id: string }).id;
    const id = normalizeId(raw);
    const ok = permanentDeleteDoc(id);
    if (!ok) {
      req.log.warn({ rawId: raw, normalized: id }, 'DELETE /docs/:id/permanent not found or not in trash');
      return reply.code(404).send({ error: 'Not found or not in trash' });
    }
    recordProvenance({ docId: id, action: 'permanent_delete', actor: 'human', details: { devUser: devUser(req) } });

    // Log audit event if workspace-scoped
    if (workspaceId) {
      logAuditEvent({
        workspaceId,
        actorId: devUser(req) || 'user:local',
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

    const doc = getDoc(id);
    if (!doc) {
      req.log.warn({ rawId: raw, normalized: id }, 'POST /docs/:id/export/pdf not found');
      return reply.code(404).send({ error: 'Doc not found' });
    }

    // Get layout settings (with defaults)
    const layout = getDocLayout(id) ?? DEFAULT_LAYOUT_SETTINGS;
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

    // Add header/footer if enabled
    if (layout.header?.enabled || layout.footer?.enabled) {
      pdfOptions.displayHeaderFooter = true;

      if (layout.header?.enabled) {
        pdfOptions.headerTemplate = `<div style="font-size:10px;width:100%;text-align:center;padding:0 ${margins.left}mm;">${layout.header.content || ''}</div>`;
      } else {
        pdfOptions.headerTemplate = '<span></span>';
      }

      if (layout.footer?.enabled) {
        const footerContent = layout.footer.content || '';
        const pageNumbers = layout.footer.showPageNumbers
          ? 'Page <span class="pageNumber"></span> of <span class="totalPages"></span>'
          : '';
        pdfOptions.footerTemplate = `<div style="font-size:10px;width:100%;text-align:center;padding:0 ${margins.left}mm;">${footerContent}${footerContent && pageNumbers ? ' — ' : ''}${pageNumbers}</div>`;
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
      details: { pdfPath, proofPath, actorId, hashes: { html: 'sha256:' + sha256Hex(Buffer.from(html)), pdf: pdfHash } }
    });

    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="doc-${id}.pdf"`)
      .send(pdfBuffer);
  });

  // Download previously exported PDF (parity with DOCX)
  app.get('/docs/:id/exports/pdf/:file', async (req, reply) => {
    const { id: raw, file } = req.params as { id: string; file: string };
    const id = normalizeId(raw);

    const safe = path.basename(file);
    if (safe !== file || !/\.pdf$/i.test(safe)) {
      return reply.code(400).send({ error: 'invalid filename' });
    }

    const dir = repoPath('storage', 'exports', `doc-${id}`);
    const full = path.join(dir, safe);

    try {
      const buf = await fs.readFile(full);
      return reply
        .type('application/pdf')
        .header('Content-Disposition', `attachment; filename="${safe}"`)
        .send(buf);
    } catch {
      return reply.code(404).send({ error: 'Not found' });
    }
  });

  // Download a previously exported DOCX
  app.get('/docs/:id/exports/docx/:file', async (req, reply) => {
    const { id: raw, file } = req.params as { id: string; file: string };
    const id = normalizeId(raw);

    const safe = path.basename(file);
    const isDocx = /\.docx$/i.test(safe);
    if (safe !== file || !isDocx) {
      return reply.code(400).send({ error: 'invalid filename' });
    }

    const dir = repoPath('storage', 'exports', `doc-${id}`);
    const full = path.join(dir, safe);

    try {
      const buf = await fs.readFile(full);
      return reply
        .type('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        .header('Content-Disposition', `attachment; filename="${safe}"`)
        .send(buf);
    } catch {
      return reply.code(404).send({ error: 'Not found' });
    }
  });

  // Evidence APIs
  app.get('/docs/:id/exports', async (req) => {
    const id = normalizeId((req.params as { id: string }).id);
    return await listDocExports(id);
  });

  app.get('/docs/:id/provenance', async (req) => {
    const id = normalizeId((req.params as { id: string }).id);
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
    const body = (req.body ?? {}) as {
      action: string;          // e.g. "ai:apply"
      actor?: string;          // default: x-user-id or "human"
      preview?: string;
      details?: any;           // include proofHash/source if available
    };
    if (!body.action) return reply.code(400).send({ error: 'action required' });

    const actorHeader = (req.headers['x-user-id'] as string | undefined)?.toString().trim();
    const actor = body.actor || actorHeader || 'human';

    const details = { ...(body.details || {}) };
    if (body.preview) (details as any).preview = body.preview;

    const row = recordProvenance({ docId: id, action: body.action, actor, details });
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

  // Start job queue and register workers (Phase 5 - P4.3)
  try {
    registerAllWorkers();
    const jobQueue = getJobQueue();
    jobQueue.start();
    app.log.info('Job queue started');
  } catch (err) {
    app.log.warn({ err }, 'Job queue initialization failed (non-fatal)');
  }

  const PORT = Number(process.env.PORT || 4000);
  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info({ port: PORT }, 'API listening');
}

// Module-level logger for startup errors
const startupLogger = createLogger('startup');

main().catch((err) => {
  startupLogger.fatal({ err }, 'Server startup failed');
  process.exit(1);
});
