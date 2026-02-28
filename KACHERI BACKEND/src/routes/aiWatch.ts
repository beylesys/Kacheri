// KACHERI BACKEND/src/routes/aiWatch.ts
import type { FastifyInstance, FastifyReply } from "fastify";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, repoPath } from "../db";
import { requirePlatformAdmin, checkDocAccess } from "../workspace/middleware";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AI_WATCH_VERSION = "aiwatch-v4-2025-11-30";

function sha256HexUTF8(s: string) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function sha256HexBuf(b: Buffer) {
  return crypto.createHash("sha256").update(b).digest("hex");
}

// Legacy summary rows written by the provenance bridge.
const LEGACY_AI_TYPE = "ai:action" as const;

/**
 * Unified WHERE clause for "AI actions" used by both /summary and /events.
 *
 * We intentionally support three shapes:
 *  1) Canonical proofs where kind starts with "ai:" (compose, rewrites, etc.).
 *  2) Export proofs (kind IN ('docx', 'pdf')) so exports show up as actions.
 *  3) Legacy / summary rows:
 *     - type = 'ai:action' (old bridge summary packets)
 *     - type LIKE 'ai:%'   (older writers that encoded action in type)
 *
 * Uses positional '?' placeholder for the legacy type parameter.
 */
const AI_ACTION_WHERE = `
  (
    -- Canonical AI proofs (compose, rewrites, etc.)
    (kind IS NOT NULL AND kind LIKE 'ai:%')
    -- Exports appear as actions in the dashboard
    OR kind IN ('docx', 'pdf')
    -- Legacy summary packets emitted by the provenance bridge
    OR type = ?
    -- Older AI rows that stored the action directly in "type"
    OR (type IS NOT NULL AND type LIKE 'ai:%')
  )
`;

type ProofRow = {
  id: number;
  doc_id: string;
  ts: number;
  path: string | null;
  kind: string | null;
  type?: string | null;
  payload: string | null;
  meta: string | null;
  sha256?: string | null;
};

function safeJson(str: string | null): any {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Normalize an action label so that different encodings of the same thing
 * collapse to a single key (e.g. "ai:rewriteSelection" → "rewriteSelection").
 */
function normalizeActionLabel(
  raw: unknown,
  row: Pick<ProofRow, "kind" | "type">
): string {
  const base = String(raw ?? row.kind ?? row.type ?? "").trim();
  if (!base) return "unknown";

  const lower = base.toLowerCase();

  // Compose
  if (
    lower === "ai:compose" ||
    lower === "compose" ||
    lower === "ai_compose"
  ) {
    return "compose";
  }

  // Selective rewrite
  if (
    lower === "ai:rewriteselection" ||
    lower === "rewriteselection" ||
    lower === "rewrite_selection"
  ) {
    return "rewriteSelection";
  }

  // Constrained / strict rewrite
  if (
    lower === "ai:rewriteconstrained" ||
    lower === "ai:constrainedrewrite" ||
    lower === "rewriteconstrained" ||
    lower === "constrainedrewrite" ||
    lower === "rewrite"
  ) {
    return "rewriteConstrained";
  }

  // Exports
  if (lower === "docx" || lower === "export:docx") {
    return "export:docx";
  }
  if (lower === "pdf" || lower === "export:pdf") {
    return "export:pdf";
  }

  // Legacy ai:action packets may store the real kind in payload/meta,
  // but if we get here with "ai:action" just surface that as-is.
  if (lower === "ai:action") {
    return "ai:action";
  }

  // Fallback: keep whatever we got (useful for future ai:* kinds)
  return base;
}

// Derive a best-effort timestamp from meta/payload, falling back to row.ts.
function deriveTimestamp(row: ProofRow, meta: any, payload: any): number {
  const fromMeta = Number(meta?.ts ?? meta?.timestamp) || undefined;
  const fromPayload = Number(payload?.ts ?? payload?.timestamp) || undefined;
  return fromMeta ?? fromPayload ?? row.ts;
}

// Derive a best-effort elapsedMs from meta/payload.
function deriveElapsedMs(meta: any, payload: any): number {
  const raw = Number(
    meta?.elapsedMs ??
      payload?.elapsedMs ??
      payload?.timing?.elapsedMs ??
      0
  );
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return raw;
}

// Short preview for tables (AI Events list).
function derivePreview(meta: any, payload: any): string {
  let src: unknown =
    payload?.output?.proposalText ??
    payload?.output?.newFullText ??
    payload?.outputs?.proposalText ??
    payload?.outputs?.preview ??
    meta?.preview ??
    meta?.instructions ??
    payload?.input?.prompt ??
    payload?.inputs?.prompt ??
    "";

  let preview = String(src || "").replace(/\s+/g, " ").trim();
  if (preview.length > 280) preview = preview.slice(0, 277) + "…";
  return preview;
}

// Rough input size for events (characters).
function deriveInputSize(meta: any, payload: any): number {
  const input =
    meta?.input ??
    payload?.input ??
    payload?.inputs ??
    {};

  let text = "";
  if (typeof input.prompt === "string") text = input.prompt;
  else if (typeof input.fullText === "string") text = input.fullText;
  else if (typeof input.text === "string") text = input.text;

  if (text && text.length) {
    return text.length;
  }

  // Numeric fallbacks for more scalable packets (rewrites, etc.)
  const numeric = Number(
    input.fullTextLength ??
      input.textLength ??
      meta?.inputSize ??
      payload?.inputSize ??
      0
  );

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export default async function aiWatchRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------------
  // AI ACTIONS: summary
  // -------------------------------------------------------------------------
  app.get("/ai/watch/summary", async (req, reply) => {
    if (!requirePlatformAdmin(req, reply)) return;
    const q = (req.query || {}) as Partial<{ debug: string | number }>;
    const debug =
      q.debug !== undefined &&
      String(q.debug).toLowerCase() !== "false" &&
      String(q.debug) !== "0";

    const totalRow = await db.queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c
       FROM proofs
       WHERE ${AI_ACTION_WHERE}`,
      [LEGACY_AI_TYPE]
    );

    const total = Number(totalRow?.c || 0);

    const sampleRows = await db.queryAll<ProofRow>(
      `SELECT id, doc_id, ts, path, kind, type, payload, meta, sha256
       FROM proofs
       WHERE ${AI_ACTION_WHERE}
       ORDER BY ts DESC, id DESC
       LIMIT 500`,
      [LEGACY_AI_TYPE]
    );

    const byAction: Record<string, number> = {};
    const byKind: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let msSum = 0;
    let msCount = 0;
    let last24h = 0;

    let verifyOk = 0;
    let verifyTotal = 0;

    const now = Date.now();
    const cutoff = now - 24 * 3600 * 1000;

    for (const r of sampleRows) {
      const payloadStr = r.payload || "";
      const payload = safeJson(payloadStr);
      const meta = safeJson(r.meta);

      const action = normalizeActionLabel(
        meta?.action ??
          meta?.kind ??
          payload?.action ??
          payload?.kind,
        r
      );
      byAction[action] = (byAction[action] || 0) + 1;

      const kindKey = (r.kind ?? "null").toString();
      const typeKey = (r.type ?? "null").toString();
      byKind[kindKey] = (byKind[kindKey] || 0) + 1;
      byType[typeKey] = (byType[typeKey] || 0) + 1;

      const elapsed = deriveElapsedMs(meta, payload);
      if (elapsed > 0) {
        msSum += elapsed;
        msCount++;
      }

      const tsCandidate = deriveTimestamp(r, meta, payload);
      if (tsCandidate >= cutoff) {
        last24h++;
      }

      // Legacy ai:action packets store a sha256 over payload JSON.
      if (r.sha256 && payloadStr) {
        verifyTotal++;
        const h = sha256HexUTF8(payloadStr);
        if (String(r.sha256) === h) {
          verifyOk++;
        }
      }
    }

    const avgElapsedMs = msCount ? msSum / msCount : 0;
    const verificationRate = verifyTotal ? verifyOk / verifyTotal : 1;

    const response: any = {
      debugTag: AI_WATCH_VERSION,
      total,
      byAction,
      avgElapsedMs,
      last24h,
      verificationRate,
    };

    // Light optional debug envelope – safe to leave in prod
    if (debug) {
      response._debug = {
        version: AI_WATCH_VERSION,
        where: AI_ACTION_WHERE,
        matchedSample: sampleRows.length,
        byKind,
        byType,
      };
    }

    return response;
  });

  // -------------------------------------------------------------------------
  // AI ACTIONS: events (recent feed)
  // -------------------------------------------------------------------------
  app.get("/ai/watch/events", async (req, reply) => {
    if (!requirePlatformAdmin(req, reply)) return;
    const q = (req.query || {}) as Partial<{
      limit: string | number;
      before: string | number;
    }>;

    const requestedLimit = Number(q.limit ?? 50);
    const limit = Math.min(Math.max(requestedLimit || 50, 1), 200);
    const before = q.before ? Number(q.before) : undefined;

    const hasBefore = before != null && !Number.isNaN(before);
    const queryParams: unknown[] = [LEGACY_AI_TYPE];
    if (hasBefore) queryParams.push(before!);
    queryParams.push(limit);

    const rows = await db.queryAll<ProofRow>(
      `
      SELECT id, doc_id, ts, path, kind, type, payload, meta, sha256
      FROM proofs
      WHERE ${AI_ACTION_WHERE}
        ${hasBefore ? "AND ts < ?" : ""}
      ORDER BY ts DESC, id DESC
      LIMIT ?
      `,
      queryParams
    );

    const events = rows.map((r) => {
      const payloadStr = r.payload || "";
      const payload = safeJson(payloadStr);
      const meta = safeJson(r.meta);

      const action = normalizeActionLabel(
        meta?.action ??
          meta?.kind ??
          payload?.action ??
          payload?.kind,
        r
      );

      const elapsedMs = deriveElapsedMs(meta, payload);
      const preview = derivePreview(meta, payload);
      const inputSize = deriveInputSize(meta, payload);

      return {
        id: r.id,
        ts: r.ts,
        docId: r.doc_id,
        path: r.path,
        action,
        elapsedMs,
        preview,
        inputSize,
      };
    });

    return { debugTag: AI_WATCH_VERSION, events };
  });

  // -------------------------------------------------------------------------
  // EXPORTS verification summary (docx/pdf)
  // -------------------------------------------------------------------------
  app.get("/ai/watch/exports-summary", async (req, reply) => {
    if (!requirePlatformAdmin(req, reply)) return;
    type Row = {
      doc_id: string;
      kind: string | null;
      hash: string | null;
      path: string | null;
    };

    const rows = await db.queryAll<Row>(
      `
      SELECT doc_id, kind, hash, path
      FROM proofs
      WHERE kind IN ('docx','pdf')
      ORDER BY ts DESC, id DESC
      LIMIT 5000
      `,
      []
    );

    const exportRoot = repoPath("storage", "exports");

    function checkOne(r: Row) {
      const expected = String(r.hash || "");
      const p = String(r.path || "");
      if (!p || !expected) return "miss" as const;

      try {
        const fullPath = path.isAbsolute(p) ? p : path.join(exportRoot, p);
        const data = fs.readFileSync(fullPath);
        const actual = "sha256:" + sha256HexBuf(data);
        return actual === expected ? ("pass" as const) : ("fail" as const);
      } catch {
        return "miss" as const;
      }
    }

    let pass = 0;
    let fail = 0;
    let miss = 0;

    const byKind: Record<
      string,
      { pass: number; fail: number; miss: number; total: number }
    > = {
      docx: { pass: 0, fail: 0, miss: 0, total: 0 },
      pdf: { pass: 0, fail: 0, miss: 0, total: 0 },
    };

    for (const r of rows) {
      const kind = (r.kind || "other") as "docx" | "pdf" | "other";
      const status = checkOne(r);

      if (status === "pass") pass++;
      else if (status === "fail") fail++;
      else miss++;

      if (kind === "docx" || kind === "pdf") {
        byKind[kind].total++;
        (byKind[kind] as any)[status]++;
      }
    }

    const total = rows.length;
    const totalByKind = {
      docx: byKind.docx.total,
      pdf: byKind.pdf.total,
    };

    return {
      debugTag: AI_WATCH_VERSION,
      total,
      pass,
      fail,
      miss,
      totalByKind,
      byKind,
      exportRoot,
    };
  });

  // -------------------------------------------------------------------------
  // COMPOSE DETERMINISM: per-document summary (Phase 5 - P1.4)
  // -------------------------------------------------------------------------
  app.get<{
    Params: { id: string };
  }>("/docs/:id/compose-determinism", async (req, reply) => {
    const docId = req.params.id;
    if (!await checkDocAccess(db, req, reply, docId, 'viewer')) return;

    // Get all compose proofs for this document
    const rows = await db.queryAll<{
      id: number;
      ts: number;
      payload: string | null;
      meta: string | null;
    }>(
      `
      SELECT id, ts, payload, meta
      FROM proofs
      WHERE doc_id = ?
        AND kind LIKE 'ai:compose%'
      ORDER BY ts DESC
      LIMIT 100
      `,
      [docId]
    );

    let total = rows.length;
    let checked = 0;
    let pass = 0;
    let drift = 0;
    let lastChecked: string | null = null;

    for (const r of rows) {
      const meta = safeJson(r.meta);
      const payload = safeJson(r.payload);

      // Check if determinism was verified
      const deterStatus = meta?.determinism_status ?? payload?.determinism_status;
      const deterCheckedAt = meta?.determinism_checked_at ?? payload?.determinism_checked_at;

      if (deterStatus) {
        checked++;
        if (deterStatus === 'pass') {
          pass++;
        } else if (deterStatus === 'drift') {
          drift++;
        }

        if (deterCheckedAt && (!lastChecked || deterCheckedAt > lastChecked)) {
          lastChecked = deterCheckedAt;
        }
      }
    }

    const rate = (pass + drift > 0) ? pass / (pass + drift) : 1;

    return {
      docId,
      total,
      checked,
      pass,
      drift,
      lastChecked,
      rate,
    };
  });

  // -------------------------------------------------------------------------
  // AI PROVIDER ANALYTICS: usage and latency stats by provider/model (Phase 5 - P2.3)
  // -------------------------------------------------------------------------
  app.get("/ai/watch/providers", async (req, reply) => {
    if (!requirePlatformAdmin(req, reply)) return;
    // First, get aggregate stats per provider/model
    const aggregateRows = await db.queryAll<{
      provider: string | null;
      model: string | null;
      totalCalls: number;
      lastUsed: number;
    }>(
      `
      SELECT
        json_extract(meta, '$.provider') as provider,
        json_extract(meta, '$.model') as model,
        COUNT(*) as totalCalls,
        MAX(ts) as lastUsed
      FROM proofs
      WHERE kind LIKE 'ai:%'
        AND json_extract(meta, '$.provider') IS NOT NULL
      GROUP BY provider, model
      ORDER BY totalCalls DESC
      LIMIT 50
      `,
      []
    );

    // For each provider/model combo, fetch latencies for percentile calculation
    const providers: Array<{
      provider: string;
      model: string;
      totalCalls: number;
      avgLatencyMs: number;
      p50LatencyMs: number;
      p95LatencyMs: number;
      p99LatencyMs: number;
      errorRate: number;
      lastUsed: string;
    }> = [];

    let totalCallsAll = 0;
    let latencySumAll = 0;
    let latencyCountAll = 0;
    const uniqueProviders = new Set<string>();
    const uniqueModels = new Set<string>();

    for (const row of aggregateRows) {
      const providerName = row.provider || "unknown";
      const modelName = row.model || "unknown";

      uniqueProviders.add(providerName);
      uniqueModels.add(modelName);
      totalCallsAll += row.totalCalls;

      // Fetch all latencies for this provider/model to calculate percentiles
      const latencyRows = await db.queryAll<{
        metaMs: number | null;
        payloadMs: number | null;
        timingMs: number | null;
      }>(
        `
        SELECT
          json_extract(meta, '$.elapsedMs') as metaMs,
          json_extract(payload, '$.elapsedMs') as payloadMs,
          json_extract(payload, '$.timing.elapsedMs') as timingMs
        FROM proofs
        WHERE kind LIKE 'ai:%'
          AND json_extract(meta, '$.provider') = ?
          AND json_extract(meta, '$.model') = ?
        ORDER BY ts DESC
        LIMIT 500
        `,
        [providerName, modelName]
      );

      // Extract valid latencies
      const latencies: number[] = [];
      for (const lr of latencyRows) {
        const ms = lr.metaMs ?? lr.payloadMs ?? lr.timingMs;
        if (typeof ms === "number" && Number.isFinite(ms) && ms > 0) {
          latencies.push(ms);
        }
      }

      // Calculate percentiles
      let avgLatencyMs = 0;
      let p50LatencyMs = 0;
      let p95LatencyMs = 0;
      let p99LatencyMs = 0;

      if (latencies.length > 0) {
        latencies.sort((a, b) => a - b);
        avgLatencyMs = latencies.reduce((sum, v) => sum + v, 0) / latencies.length;
        p50LatencyMs = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
        p95LatencyMs = latencies[Math.floor(latencies.length * 0.95)] ?? latencies[latencies.length - 1] ?? 0;
        p99LatencyMs = latencies[Math.floor(latencies.length * 0.99)] ?? latencies[latencies.length - 1] ?? 0;

        latencySumAll += avgLatencyMs * latencies.length;
        latencyCountAll += latencies.length;
      }

      providers.push({
        provider: providerName,
        model: modelName,
        totalCalls: row.totalCalls,
        avgLatencyMs: Math.round(avgLatencyMs),
        p50LatencyMs: Math.round(p50LatencyMs),
        p95LatencyMs: Math.round(p95LatencyMs),
        p99LatencyMs: Math.round(p99LatencyMs),
        errorRate: 0, // TODO: Track errors when we have error metadata
        lastUsed: new Date(row.lastUsed).toISOString(),
      });
    }

    return {
      providers,
      summary: {
        totalCalls: totalCallsAll,
        avgLatencyMs: latencyCountAll > 0 ? Math.round(latencySumAll / latencyCountAll) : 0,
        uniqueProviders: uniqueProviders.size,
        uniqueModels: uniqueModels.size,
      },
    };
  });

  // -------------------------------------------------------------------------
  // AI USAGE HOTSPOTS: identify high-activity documents (Phase 5 - P2.2)
  // -------------------------------------------------------------------------
  app.get("/ai/watch/hotspots", async (req, reply) => {
    if (!requirePlatformAdmin(req, reply)) return;
    const q = (req.query || {}) as Partial<{
      period: string;
      limit: string | number;
    }>;

    // Parse period (default: 24h)
    const periodStr = q.period || "24h";
    let periodMs = 24 * 3600 * 1000; // default 24h
    if (periodStr === "7d") periodMs = 7 * 24 * 3600 * 1000;
    else if (periodStr === "30d") periodMs = 30 * 24 * 3600 * 1000;

    const cutoffTs = Date.now() - periodMs;
    const limit = Math.min(Math.max(Number(q.limit) || 10, 1), 50);

    // Thresholds for risk levels
    const thresholds = {
      high: { actions: 50, failures: 3, drift: 2 },
      medium: { actions: 20, failures: 1, drift: 1 },
    };

    // Query documents with AI activity in the period
    const rows = await db.queryAll<{
      docId: string;
      docTitle: string | null;
      workspaceId: string | null;
      workspaceName: string | null;
      aiActionCount: number;
      verificationFailures: number;
      driftEvents: number;
      lastActivity: number;
    }>(
      `
      SELECT
        d.id as docId,
        d.title as docTitle,
        d.workspace_id as workspaceId,
        w.name as workspaceName,
        COUNT(p.id) as aiActionCount,
        SUM(CASE
          WHEN json_extract(p.meta, '$.verificationStatus') = 'fail' THEN 1
          ELSE 0
        END) as verificationFailures,
        SUM(CASE
          WHEN json_extract(p.meta, '$.determinismStatus') = 'drift' THEN 1
          ELSE 0
        END) as driftEvents,
        MAX(p.ts) as lastActivity
      FROM proofs p
      INNER JOIN docs d ON p.doc_id = d.id
      LEFT JOIN workspaces w ON d.workspace_id = w.id
      WHERE p.kind LIKE 'ai:%'
        AND p.ts > ?
      GROUP BY d.id
      HAVING aiActionCount >= 5
      ORDER BY aiActionCount DESC
      LIMIT ?
      `,
      [cutoffTs, limit]
    );

    // Calculate risk level for each hotspot
    const hotspots = rows.map((row) => {
      let riskLevel: "high" | "medium" | "low" = "low";

      if (
        row.aiActionCount >= thresholds.high.actions ||
        row.verificationFailures >= thresholds.high.failures ||
        row.driftEvents >= thresholds.high.drift
      ) {
        riskLevel = "high";
      } else if (
        row.aiActionCount >= thresholds.medium.actions ||
        row.verificationFailures >= thresholds.medium.failures ||
        row.driftEvents >= thresholds.medium.drift
      ) {
        riskLevel = "medium";
      }

      return {
        docId: row.docId,
        docTitle: row.docTitle || "Untitled",
        workspaceId: row.workspaceId || null,
        workspaceName: row.workspaceName || null,
        aiActionCount: row.aiActionCount,
        verificationFailures: row.verificationFailures,
        driftEvents: row.driftEvents,
        riskLevel,
        lastActivity: new Date(row.lastActivity).toISOString(),
      };
    });

    return {
      period: periodStr,
      hotspots,
      thresholds,
    };
  });

  // -------------------------------------------------------------------------
  // AI RANGES: get AI-touched ranges for heatmap (Phase 5 - P1.2)
  // -------------------------------------------------------------------------
  app.get<{
    Params: { id: string };
  }>("/docs/:id/ai-ranges", async (req, reply) => {
    const docId = req.params.id;
    if (!await checkDocAccess(db, req, reply, docId, 'viewer')) return;

    // Get all AI proofs with position data for this document
    const rows = await db.queryAll<{
      id: number;
      ts: number;
      kind: string | null;
      meta: string | null;
      payload: string | null;
    }>(
      `
      SELECT id, ts, kind, meta, payload
      FROM proofs
      WHERE doc_id = ?
        AND (kind LIKE 'ai:%')
      ORDER BY ts DESC
      LIMIT 200
      `,
      [docId]
    );

    const ranges: Array<{
      id: number;
      kind: string;
      start: number;
      end: number;
      ts: number;
      provider: string;
      model: string;
    }> = [];

    for (const r of rows) {
      const meta = safeJson(r.meta);
      const payload = safeJson(r.payload);
      const kind = r.kind || 'ai:unknown';

      // For compose actions: they cover the full document (no specific position)
      // For rewrite actions: they have selection start/end
      let start = 0;
      let end = 0;

      // Try to get position from meta or payload
      const selection =
        meta?.selection ??
        payload?.input?.selection ??
        payload?.inputs?.selection;

      if (selection && typeof selection.start === 'number' && typeof selection.end === 'number') {
        start = selection.start;
        end = selection.end;
      } else if (kind === 'ai:compose') {
        // Compose covers full document - mark as 0-0 (will be interpreted as full-doc)
        start = 0;
        end = 0;
      }

      const provider = meta?.provider ?? payload?.provider ?? 'unknown';
      const model = meta?.model ?? payload?.model ?? 'unknown';

      ranges.push({
        id: r.id,
        kind,
        start,
        end,
        ts: r.ts,
        provider,
        model,
      });
    }

    return {
      docId,
      ranges,
    };
  });
}
