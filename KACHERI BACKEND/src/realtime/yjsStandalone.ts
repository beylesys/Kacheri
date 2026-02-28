// KACHERI BACKEND/src/realtime/yjsStandalone.ts
/**
 * Standalone Yjs WebSocket sync server with LevelDB persistence.
 *
 * Documents are persisted to disk so they survive server restarts.
 *
 * Authentication (Slice 4):
 * - JWT token required as ?token= query param
 * - User identity extracted from JWT payload
 * - Document access verified against SQLite DB (read-only)
 * - Dev mode bypass when DEV_BYPASS_AUTH=true
 */
import 'dotenv/config';
import * as http from 'node:http';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as url from 'node:url';
import * as Y from 'yjs';
import jwt from 'jsonwebtoken';
import pino from 'pino';

// Standalone logger (separate process from main server)
const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'kacheri-yjs' },
  ...(process.env.LOG_PRETTY === 'true' ? { transport: { target: 'pino-pretty' } } : {}),
});

// Use require for packages with ESM/CJS interop issues
const { WebSocketServer } = require('ws') as { WebSocketServer: any };
const { LeveldbPersistence } = require('y-leveldb') as {
  LeveldbPersistence: new (dir: string) => LeveldbPersistenceType;
};
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

interface LeveldbPersistenceType {
  getYDoc(docName: string): Promise<Y.Doc>;
  storeUpdate(docName: string, update: Uint8Array): Promise<void>;
  clearDocument(docName: string): Promise<void>;
  destroy(): Promise<void>;
}

// Map of active documents
const docs = new Map<string, Y.Doc>();

function toPort(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function repoRoot(): string {
  return path.resolve(process.cwd(), '..');
}

const HOST = (process.env.YJS_HOST || '127.0.0.1').trim();
const PORT = toPort(process.env.YJS_PORT, 1234);

// Persistence directory
const PERSISTENCE_DIR = process.env.YJS_PERSISTENCE_DIR || path.join(repoRoot(), 'data', 'yjs-leveldb');

// Ensure persistence directory exists
fs.mkdirSync(PERSISTENCE_DIR, { recursive: true });

// Initialize LevelDB persistence
const persistence = new LeveldbPersistence(PERSISTENCE_DIR);
log.info({ persistenceDir: PERSISTENCE_DIR }, 'Persistence enabled');

// ============================================
// Authentication (Slice 4 — WebSocket Auth)
// ============================================

const DEV_BYPASS = (process.env.DEV_BYPASS_AUTH ?? 'true').toLowerCase() === 'true'
  && (process.env.NODE_ENV ?? 'development') !== 'production';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-do-not-use-in-production';

// Read-only SQLite connection for doc access checks
const AUTH_DB_PATH = process.env.KACHERI_DB_PATH || path.resolve(repoRoot(), 'data/db/kacheri.db');
let authDb: InstanceType<typeof BetterSqlite3> | null = null;

function getAuthDb(): InstanceType<typeof BetterSqlite3> | null {
  if (authDb) return authDb;
  try {
    if (!fs.existsSync(AUTH_DB_PATH)) {
      log.warn({ dbPath: AUTH_DB_PATH }, 'Auth DB not found — doc access checks disabled');
      return null;
    }
    authDb = new BetterSqlite3(AUTH_DB_PATH, { readonly: true });
    log.info({ dbPath: AUTH_DB_PATH }, 'Auth DB opened (read-only)');
    return authDb;
  } catch (err) {
    log.warn({ err, dbPath: AUTH_DB_PATH }, 'Failed to open auth DB — doc access checks disabled');
    return null;
  }
}

interface JwtPayload {
  sub: string;
  email?: string;
  name?: string;
  type: string;
  iat: number;
  exp: number;
}

/**
 * Verify a JWT token. Returns the payload or null.
 */
function verifyWsToken(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    if (payload && payload.type === 'access' && payload.sub) {
      return payload;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a user has access to a document.
 * Mirrors the getEffectiveDocRole logic from src/store/docPermissions.ts:
 * 1. Explicit doc_permissions entry
 * 2. Workspace membership (user is in the doc's workspace)
 * 3. Doc creator (implicit owner)
 *
 * The docName from Yjs uses "doc-<docId>" format. We strip the "doc-" prefix.
 */
function hasDocAccess(userId: string, docName: string): boolean {
  const db = getAuthDb();
  if (!db) {
    // DB unavailable — in dev mode allow, in prod deny
    return DEV_BYPASS;
  }

  // Strip "doc-" prefix used by the Yjs room naming convention
  const docId = docName.startsWith('doc-') ? docName.slice(4) : docName;

  try {
    // 1. Explicit doc permission
    const explicitPerm = db.prepare(
      'SELECT role FROM doc_permissions WHERE doc_id = ? AND user_id = ?'
    ).get(docId, userId) as { role: string } | undefined;
    if (explicitPerm) return true;

    // 2. Workspace membership (user is a member of the doc's workspace)
    const workspacePerm = db.prepare(`
      SELECT wm.role FROM docs d
      JOIN workspace_members wm ON wm.workspace_id = d.workspace_id AND wm.user_id = ?
      WHERE d.id = ? AND d.deleted_at IS NULL
    `).get(userId, docId) as { role: string } | undefined;
    if (workspacePerm) return true;

    // 3. Doc creator (implicit owner)
    const creator = db.prepare(
      'SELECT 1 FROM docs WHERE id = ? AND created_by = ? AND deleted_at IS NULL'
    ).get(docId, userId) as { '1': number } | undefined;
    if (creator) return true;

    return false;
  } catch (err) {
    log.error({ err, docId, userId }, 'Doc access check failed');
    // Fail closed in production, open in dev
    return DEV_BYPASS;
  }
}

/**
 * Authenticate a WebSocket upgrade request.
 * Extracts token from query params, verifies JWT, and checks doc access.
 * Returns userId on success, or null (socket destroyed) on failure.
 */
function authenticateUpgrade(
  reqUrl: string,
  socket: import('stream').Duplex,
): { userId: string; docName: string } | null {
  const parsed = url.parse(reqUrl, true);
  const token = typeof parsed.query.token === 'string' ? parsed.query.token : undefined;

  // Parse docName from URL path (strip /yjs/ prefix)
  const docName =
    (parsed.pathname || '')
      .slice(1)
      .replace(/^yjs\/?/, '')
      || 'default';

  // Attempt JWT auth if token provided
  if (token) {
    const payload = verifyWsToken(token);
    if (payload) {
      const userId = payload.sub;

      // Verify doc access
      if (!hasDocAccess(userId, docName)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return null;
      }

      return { userId, docName };
    }

    // Token provided but invalid
    if (!DEV_BYPASS) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return null;
    }
    // In dev mode, fall through to dev bypass
  }

  // Dev mode bypass: allow all connections
  if (DEV_BYPASS) {
    return { userId: 'user_anonymous', docName };
  }

  // No token, not dev mode — reject
  socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
  socket.destroy();
  return null;
}

// ============================================
// Yjs document management
// ============================================

/**
 * Get or create a Y.Doc for the given document name.
 * Loads persisted state from LevelDB if it exists.
 */
async function getDoc(docName: string): Promise<Y.Doc> {
  let doc = docs.get(docName);
  if (doc) return doc;

  // Load from persistence
  doc = await persistence.getYDoc(docName);
  docs.set(docName, doc);

  // Listen for updates and persist them
  doc.on('update', (update: Uint8Array) => {
    persistence.storeUpdate(docName, update).catch((err: Error) => {
      log.error({ err, docName }, 'Failed to persist update');
    });
  });

  return doc;
}

/**
 * Encode document state for sync protocol.
 */
function encodeStateAsUpdate(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

/**
 * Apply an update to a document.
 */
function applyUpdate(doc: Y.Doc, update: Uint8Array): void {
  Y.applyUpdate(doc, update);
}

// HTTP server for health checks
const server = http.createServer((req, res) => {
  if ((req.url || '') === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'kacheri-yjs',
      host: HOST,
      port: PORT,
      persistence: PERSISTENCE_DIR,
      activeDocs: docs.size,
    }));
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not found');
});

const wss = new WebSocketServer({ noServer: true });

// Track connections per document for awareness/presence
const docConnections = new Map<string, Set<any>>();

server.on('upgrade', (req, socket, head) => {
  const reqUrl = req.url || '';

  if (!reqUrl.startsWith('/yjs')) {
    try { socket.destroy(); } catch { /* ignore */ }
    return;
  }

  // Authenticate before upgrading (Slice 4)
  const auth = authenticateUpgrade(reqUrl, socket);
  if (!auth) return; // socket already destroyed

  wss.handleUpgrade(req, socket as any, head, async (ws: any) => {
    const { docName } = auth;

    try {
      const doc = await getDoc(docName);

      // Track this connection
      if (!docConnections.has(docName)) {
        docConnections.set(docName, new Set());
      }
      docConnections.get(docName)!.add(ws);

      // Send initial state
      const initialState = encodeStateAsUpdate(doc);
      ws.send(createSyncStep1(initialState));

      // Handle incoming messages
      ws.on('message', (message: Buffer | ArrayBuffer | Uint8Array) => {
        try {
          const data = new Uint8Array(
            message instanceof ArrayBuffer ? message :
            message instanceof Buffer ? message.buffer.slice(message.byteOffset, message.byteOffset + message.byteLength) :
            message
          );

          const messageType = data[0];

          // Sync protocol message types:
          // 0 = sync step 1 (state vector)
          // 1 = sync step 2 (update)
          // 2 = update

          if (messageType === 0) {
            // Client is requesting sync - send our state
            const stateVector = data.slice(1);
            const update = Y.encodeStateAsUpdate(doc, stateVector);
            ws.send(createSyncStep2(update));
          } else if (messageType === 1 || messageType === 2) {
            // Client sent an update - apply it
            const update = data.slice(1);
            applyUpdate(doc, update);

            // Broadcast to other clients
            const connections = docConnections.get(docName);
            if (connections) {
              const broadcastMsg = createUpdate(update);
              for (const conn of connections) {
                if (conn !== ws && conn.readyState === 1) {
                  try {
                    conn.send(broadcastMsg);
                  } catch { /* ignore */ }
                }
              }
            }
          }
        } catch (err) {
          log.error({ err, docName }, 'Error handling message');
        }
      });

      ws.on('close', () => {
        const connections = docConnections.get(docName);
        if (connections) {
          connections.delete(ws);
          if (connections.size === 0) {
            docConnections.delete(docName);
            // Optionally: keep doc in memory for a while, or remove it
            // For now, we keep it since LevelDB has the state
          }
        }
      });

      ws.on('error', (err: Error) => {
        log.error({ err, docName }, 'WebSocket error');
      });

    } catch (err) {
      log.error({ err, docName }, 'Failed to setup connection');
      ws.close();
    }
  });
});

// Sync protocol helpers
function createSyncStep1(encodedState: Uint8Array): Uint8Array {
  const msg = new Uint8Array(1 + encodedState.length);
  msg[0] = 0; // sync step 1
  msg.set(encodedState, 1);
  return msg;
}

function createSyncStep2(update: Uint8Array): Uint8Array {
  const msg = new Uint8Array(1 + update.length);
  msg[0] = 1; // sync step 2
  msg.set(update, 1);
  return msg;
}

function createUpdate(update: Uint8Array): Uint8Array {
  const msg = new Uint8Array(1 + update.length);
  msg[0] = 2; // update
  msg.set(update, 1);
  return msg;
}

// Start server
server.listen(PORT, HOST, () => {
  log.info(
    { host: HOST, port: PORT, persistenceDir: PERSISTENCE_DIR },
    'Yjs WebSocket server listening'
  );
});

// Graceful shutdown
async function shutdown() {
  log.info('Shutting down...');

  // Close all WebSocket connections
  for (const [_docName, connections] of docConnections) {
    for (const ws of connections) {
      try { ws.close(); } catch { /* ignore */ }
    }
  }

  // Close servers
  try { wss.close(); } catch { /* ignore */ }
  try { server.close(); } catch { /* ignore */ }

  // Close auth DB
  try { authDb?.close(); } catch { /* ignore */ }

  // Close persistence
  try {
    await persistence.destroy();
    log.info('Persistence closed');
  } catch (err) {
    log.error({ err }, 'Error closing persistence');
  }

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
