// src/realtime/workspaceWs.ts
import type { FastifyInstance } from 'fastify';
import { WebSocketServer, WebSocket } from 'ws';
import { parse as parseUrl } from 'url';
import type { ClientInfo, FrameLock, WorkspaceHub, WorkspaceClientEvent, WorkspaceServerEvent } from './types';
import { setWorkspaceHub, trackUserWorkspace, untrackUserWorkspace } from './globalHub';
import { verifyToken, isAccessToken, type AccessTokenPayload } from '../auth/jwt';
import { getAuthConfig } from '../auth/config';
import { createWorkspaceStore } from '../workspace/store';
import { db } from '../db';

/**
 * Separate workspace WebSocket namespace at /workspace/:workspaceId
 * - presence updates
 * - AI job lifecycle (emitted by routes via global hub)
 * - proof broadcasts (emitted by provenance store via global hub)
 * - lightweight notes: client sends { type: "chat", text }, server rebroadcasts { type:"system", level:"info", message:"name: text" }
 *
 * Authentication (Slice 4):
 * - JWT token required as ?token= query param
 * - User identity extracted from JWT, not from query params
 * - Workspace membership validated before connection
 * - Dev mode bypass preserves existing behavior when DEV_BYPASS_AUTH=true
 */
export function installWorkspaceWs(fastify: FastifyInstance) {
  const wss = new WebSocketServer({ noServer: true });
  const workspaceStore = createWorkspaceStore(db);

  const rooms = new Map<string, Set<WebSocket>>();
  const meta = new WeakMap<WebSocket, ClientInfo>();

  function getRoom(id: string) {
    let s = rooms.get(id);
    if (!s) {
      s = new Set();
      rooms.set(id, s);
    }
    return s;
  }

  function broadcast(workspaceId: string, msg: WorkspaceServerEvent, except?: WebSocket) {
    const room = rooms.get(workspaceId);
    if (!room) return;
    const data = JSON.stringify(msg);
    for (const client of room) {
      if (client !== except && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  // E8 — Frame-level locks: keyed by "canvasId:frameId"
  const frameLocks = new Map<string, FrameLock>();
  const LOCK_TIMEOUT_MS = 60_000;

  // Auto-release stale frame locks every 15s
  const lockSweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, lock] of frameLocks) {
      if (now - lock.acquiredAt > LOCK_TIMEOUT_MS) {
        frameLocks.delete(key);
        const [canvasId, frameId] = key.split(':');
        if (canvasId && frameId) {
          // Find workspace for this canvas viewer
          for (const [wsId, room] of rooms) {
            for (const client of room) {
              const info = meta.get(client);
              if (info?.canvasId === canvasId) {
                broadcast(wsId, {
                  type: 'canvas_lock', canvasId, frameId,
                  userId: lock.userId, displayName: lock.displayName,
                  action: 'released', ts: now,
                });
                break;
              }
            }
            break;
          }
        }
      }
    }
  }, 15_000);

  // Cleanup interval on server close
  fastify.addHook('onClose', () => clearInterval(lockSweepInterval));

  function broadcastToCanvas(workspaceId: string, canvasId: string, msg: WorkspaceServerEvent, except?: WebSocket) {
    const room = rooms.get(workspaceId);
    if (!room) return;
    const data = JSON.stringify(msg);
    for (const client of room) {
      if (client !== except && client.readyState === WebSocket.OPEN) {
        const info = meta.get(client);
        if (info?.canvasId === canvasId) {
          client.send(data);
        }
      }
    }
  }

  function getCanvasViewers(workspaceId: string, canvasId: string): ClientInfo[] {
    const out: ClientInfo[] = [];
    for (const ws of rooms.get(workspaceId) || []) {
      const info = meta.get(ws);
      if (info?.canvasId === canvasId) out.push(info);
    }
    return out;
  }

  /** Release all frame locks held by a specific user and broadcast releases */
  function releaseUserLocks(userId: string, workspaceId: string) {
    const now = Date.now();
    for (const [key, lock] of frameLocks) {
      if (lock.userId === userId) {
        frameLocks.delete(key);
        const [canvasId, frameId] = key.split(':');
        if (canvasId && frameId) {
          broadcastToCanvas(workspaceId, canvasId, {
            type: 'canvas_lock', canvasId, frameId,
            userId: lock.userId, displayName: lock.displayName,
            action: 'released', ts: now,
          });
        }
      }
    }
  }

  function join(workspaceId: string, ws: WebSocket, initial?: Partial<Omit<ClientInfo, 'ws' | 'workspaceId' | 'status' | 'lastSeen'>>) {
    getRoom(workspaceId).add(ws);
    const info: ClientInfo = {
      ws, workspaceId,
      userId: initial?.userId,
      displayName: initial?.displayName,
      status: 'online',
      lastSeen: Date.now(),
    };
    meta.set(ws, info);
    if (info.userId) {
      trackUserWorkspace(info.userId, workspaceId);
      broadcast(workspaceId, { type: 'presence', userId: info.userId, displayName: info.displayName, status: 'online' }, ws);
    }
  }

  function leave(ws: WebSocket) {
    const info = meta.get(ws);
    if (!info) return;
    // E8 — Release frame locks and notify canvas viewers on disconnect
    if (info.userId) {
      releaseUserLocks(info.userId, info.workspaceId);
      if (info.canvasId) {
        broadcastToCanvas(info.workspaceId, info.canvasId, {
          type: 'canvas_presence', canvasId: info.canvasId, frameId: null,
          userId: info.userId, displayName: info.displayName,
          action: 'left', ts: Date.now(),
        }, ws);
      }
    }
    const room = rooms.get(info.workspaceId);
    if (room) room.delete(ws);
    if (info.userId) {
      untrackUserWorkspace(info.userId, info.workspaceId);
      broadcast(info.workspaceId, { type: 'presence', userId: info.userId, displayName: info.displayName, status: 'offline' }, ws);
    }
    meta.delete(ws);
  }

  /**
   * Authenticate a WebSocket upgrade request.
   * Returns { userId, displayName } on success, or null on failure (socket destroyed).
   */
  function authenticateUpgrade(
    query: Record<string, any>,
    workspaceId: string,
    socket: import('stream').Duplex,
  ): { userId: string; displayName: string } | null {
    const config = getAuthConfig();
    const token = typeof query.token === 'string' ? query.token : undefined;

    // Attempt JWT auth if token provided
    if (token) {
      const payload = verifyToken<AccessTokenPayload>(token);
      if (payload && isAccessToken(payload)) {
        const userId = payload.sub;
        const displayName = payload.name || userId;

        // Verify workspace membership
        const role = workspaceStore.getUserRole(workspaceId, userId);
        if (!role) {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return null;
        }

        return { userId, displayName };
      }

      // Token provided but invalid — reject even in dev mode (stale token)
      if (!config.devBypassAuth) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return null;
      }
      // In dev mode, fall through to dev bypass below
    }

    // Dev mode bypass: allow connection with query param identity
    if (config.devBypassAuth) {
      const userId = (typeof query.userId === 'string' ? query.userId : undefined) || 'user_anonymous';
      const displayName = (typeof query.displayName === 'string' ? query.displayName : undefined) || userId;
      return { userId, displayName };
    }

    // No token, not dev mode — reject
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return null;
  }

  // Handle HTTP upgrade only for /workspace/<id>
  fastify.server.on('upgrade', (req, socket, head) => {
    try {
      const { pathname, query } = parseUrl(req.url || '', true);
      if (!pathname || !pathname.startsWith('/workspace/')) return;

      const workspaceId = pathname.split('/')[2];
      if (!workspaceId) return;

      // Authenticate before upgrading
      const auth = authenticateUpgrade(query as Record<string, any>, workspaceId, socket);
      if (!auth) return; // socket already destroyed

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, {
          workspaceId,
          userId: auth.userId,
          displayName: auth.displayName,
        });
      });
    } catch {
      // ignore malformed
    }
  });

  wss.on('connection', (ws: WebSocket, _req: any, ctx: { workspaceId: string; userId: string; displayName: string }) => {
    // Identity comes from JWT (verified in authenticateUpgrade), not query params
    join(ctx.workspaceId, ws, {
      userId: ctx.userId,
      displayName: ctx.displayName,
    });

    ws.on('message', (buf) => {
      let parsed: any = null;
      try { parsed = JSON.parse(String(buf)); } catch { /* ignore */ }
      if (!parsed) return;

      const info = meta.get(ws);
      if (!info) return;

      // Lightweight note/chat
      if (parsed.type === 'chat') {
        const raw = String(parsed.text ?? '');
        const text = raw.trim().slice(0, 500);
        if (text) {
          const who = info.displayName || info.userId || 'user';
          broadcast(info.workspaceId, { type: 'system', level: 'info', message: `${who}: ${text}` }, ws);
        }
        return;
      }

      const msg = parsed as WorkspaceClientEvent;

      if (msg.type === 'hello') {
        // Identity is already set from JWT — ignore client-supplied userId/displayName
        info.lastSeen = Date.now();
        return;
      }

      if (msg.type === 'presence') {
        info.status = msg.status;
        info.lastSeen = Date.now();
        if (info.userId) {
          broadcast(info.workspaceId, { type: 'presence', userId: info.userId, displayName: info.displayName, status: msg.status }, ws);
        }
        return;
      }

      if (msg.type === 'typing') {
        info.lastSeen = Date.now();
        if (info.userId && info.workspaceId) {
          broadcast(info.workspaceId, {
            type: 'typing',
            userId: info.userId,
            isTyping: Boolean(msg.isTyping),
            ts: Date.now(),
          }, ws); // exclude sender
        }
        return;
      }

      // E8 — Canvas collaboration events
      if (msg.type === 'canvas_join') {
        info.lastSeen = Date.now();
        const canvasId = String(msg.canvasId ?? '');
        if (!canvasId || !info.userId) return;
        // Leave previous canvas if any
        if (info.canvasId && info.canvasId !== canvasId) {
          broadcastToCanvas(info.workspaceId, info.canvasId, {
            type: 'canvas_presence', canvasId: info.canvasId, frameId: null,
            userId: info.userId, displayName: info.displayName,
            action: 'left', ts: Date.now(),
          }, ws);
        }
        info.canvasId = canvasId;
        info.focusedFrameId = null;
        broadcastToCanvas(info.workspaceId, canvasId, {
          type: 'canvas_presence', canvasId, frameId: null,
          userId: info.userId, displayName: info.displayName,
          action: 'viewing', ts: Date.now(),
        }, ws);
        // Send existing canvas viewers and frame locks to the joining client
        const viewers = getCanvasViewers(info.workspaceId, canvasId);
        for (const viewer of viewers) {
          if (viewer.ws !== ws && viewer.userId) {
            try {
              ws.send(JSON.stringify({
                type: 'canvas_presence', canvasId,
                frameId: viewer.focusedFrameId ?? null,
                userId: viewer.userId, displayName: viewer.displayName,
                action: 'viewing', ts: Date.now(),
              } satisfies WorkspaceServerEvent));
            } catch { /* ignore */ }
          }
        }
        // Send existing locks for this canvas
        for (const [key, lock] of frameLocks) {
          if (key.startsWith(canvasId + ':')) {
            const frameId = key.slice(canvasId.length + 1);
            try {
              ws.send(JSON.stringify({
                type: 'canvas_lock', canvasId, frameId,
                userId: lock.userId, displayName: lock.displayName,
                action: 'acquired', ts: lock.acquiredAt,
              } satisfies WorkspaceServerEvent));
            } catch { /* ignore */ }
          }
        }
        return;
      }

      if (msg.type === 'canvas_leave') {
        info.lastSeen = Date.now();
        if (!info.userId || !info.canvasId) return;
        releaseUserLocks(info.userId, info.workspaceId);
        broadcastToCanvas(info.workspaceId, info.canvasId, {
          type: 'canvas_presence', canvasId: info.canvasId, frameId: null,
          userId: info.userId, displayName: info.displayName,
          action: 'left', ts: Date.now(),
        }, ws);
        info.canvasId = undefined;
        info.focusedFrameId = undefined;
        return;
      }

      if (msg.type === 'canvas_frame_focus') {
        info.lastSeen = Date.now();
        const canvasId = String(msg.canvasId ?? '');
        const frameId = msg.frameId != null ? String(msg.frameId) : null;
        if (!canvasId || !info.userId) return;
        info.focusedFrameId = frameId;
        broadcastToCanvas(info.workspaceId, canvasId, {
          type: 'canvas_presence', canvasId, frameId,
          userId: info.userId, displayName: info.displayName,
          action: 'viewing', ts: Date.now(),
        }, ws);
        return;
      }

      if (msg.type === 'canvas_lock_request') {
        info.lastSeen = Date.now();
        const canvasId = String(msg.canvasId ?? '');
        const frameId = String(msg.frameId ?? '');
        const action = msg.action as 'acquire' | 'release';
        if (!canvasId || !frameId || !info.userId) return;
        const lockKey = `${canvasId}:${frameId}`;
        const now = Date.now();

        if (action === 'acquire') {
          const existing = frameLocks.get(lockKey);
          if (existing && existing.userId !== info.userId) {
            // Deny — another user holds the lock
            try {
              ws.send(JSON.stringify({
                type: 'canvas_lock', canvasId, frameId,
                userId: existing.userId, displayName: existing.displayName,
                action: 'denied', ts: now,
              } satisfies WorkspaceServerEvent));
            } catch { /* ignore */ }
          } else {
            // Grant lock (or re-acquire own lock to refresh timeout)
            frameLocks.set(lockKey, {
              userId: info.userId,
              displayName: info.displayName ?? info.userId,
              acquiredAt: now,
            });
            broadcastToCanvas(info.workspaceId, canvasId, {
              type: 'canvas_lock', canvasId, frameId,
              userId: info.userId, displayName: info.displayName,
              action: 'acquired', ts: now,
            });
            // Update presence to 'editing'
            broadcastToCanvas(info.workspaceId, canvasId, {
              type: 'canvas_presence', canvasId, frameId,
              userId: info.userId, displayName: info.displayName,
              action: 'editing', ts: now,
            }, ws);
          }
        } else if (action === 'release') {
          const existing = frameLocks.get(lockKey);
          if (existing && existing.userId === info.userId) {
            frameLocks.delete(lockKey);
            broadcastToCanvas(info.workspaceId, canvasId, {
              type: 'canvas_lock', canvasId, frameId,
              userId: info.userId, displayName: info.displayName,
              action: 'released', ts: now,
            });
            // Update presence back to 'viewing'
            broadcastToCanvas(info.workspaceId, canvasId, {
              type: 'canvas_presence', canvasId, frameId,
              userId: info.userId, displayName: info.displayName,
              action: 'viewing', ts: now,
            }, ws);
          }
        }
        return;
      }
    });

    ws.on('close', () => leave(ws));
    ws.on('error', () => leave(ws));
  });

  const hub: WorkspaceHub = {
    join,
    leave,
    broadcast,
    broadcastToCanvas,
    getMembers(workspaceId: string) {
      const out: ClientInfo[] = [];
      for (const ws of rooms.get(workspaceId) || []) {
        const info = meta.get(ws);
        if (info) out.push(info);
      }
      return out;
    },
    getCanvasViewers,
    getFrameLocks() { return frameLocks; },
  };

  setWorkspaceHub(hub);
  fastify.log.info('[workspace-ws] installed');
  return hub;
}
