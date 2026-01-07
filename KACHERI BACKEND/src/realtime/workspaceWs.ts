// src/realtime/workspaceWs.ts
import type { FastifyInstance } from 'fastify';
import { WebSocketServer, WebSocket } from 'ws';
import { parse as parseUrl } from 'url';
import type { ClientInfo, WorkspaceHub, WorkspaceClientEvent, WorkspaceServerEvent } from './types';
import { setWorkspaceHub, trackUserWorkspace, untrackUserWorkspace } from './globalHub';

/**
 * Separate workspace WebSocket namespace at /workspace/:workspaceId
 * - presence updates
 * - AI job lifecycle (emitted by routes via global hub)
 * - proof broadcasts (emitted by provenance store via global hub)
 * - lightweight notes: client sends { type: "chat", text }, server rebroadcasts { type:"system", level:"info", message:"name: text" }
 */
export function installWorkspaceWs(fastify: FastifyInstance) {
  const wss = new WebSocketServer({ noServer: true });

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
    const room = rooms.get(info.workspaceId);
    if (room) room.delete(ws);
    if (info.userId) {
      untrackUserWorkspace(info.userId, info.workspaceId);
      broadcast(info.workspaceId, { type: 'presence', userId: info.userId, displayName: info.displayName, status: 'offline' }, ws);
    }
    meta.delete(ws);
  }

  // Handle HTTP upgrade only for /workspace/<id>
  fastify.server.on('upgrade', (req, socket, head) => {
    try {
      const { pathname, query } = parseUrl(req.url || '', true);
      if (!pathname || !pathname.startsWith('/workspace/')) return;

      const workspaceId = pathname.split('/')[2];
      if (!workspaceId) return;

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, { workspaceId, query });
      });
    } catch {
      // ignore malformed
    }
  });

  wss.on('connection', (ws: WebSocket, _req: any, ctx: { workspaceId: string; query: Record<string, any> }) => {
    const initial = {
      userId: ctx.query['userId'] as string | undefined,
      displayName: ctx.query['displayName'] as string | undefined,
    };
    join(ctx.workspaceId, ws, initial);

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
        if (msg.userId) info.userId = msg.userId;
        if (msg.displayName) info.displayName = msg.displayName;
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
    });

    ws.on('close', () => leave(ws));
    ws.on('error', () => leave(ws));
  });

  const hub: WorkspaceHub = {
    join,
    leave,
    broadcast,
    getMembers(workspaceId: string) {
      const out: ClientInfo[] = [];
      for (const ws of rooms.get(workspaceId) || []) {
        const info = meta.get(ws);
        if (info) out.push(info);
      }
      return out;
    },
  };

  setWorkspaceHub(hub);
  fastify.log.info('[workspace-ws] installed');
  return hub;
}
