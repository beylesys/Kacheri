// KACHERI BACKEND/src/routes/files.ts
// File manager APIs: tree listing + basic folder/doc CRUD.
// Now with workspace scoping support via X-Workspace-Id header.

import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  listChildren,
  createFolder,
  renameNode,
  moveNode,
  deleteNode,
  attachDocNode,
  getNodeWithChildCount,
  restoreNode,
  permanentDeleteNode,
  listTrash as listFilesTrash,
} from "../store/fsNodes";
import { hasWorkspaceWriteAccess, hasWorkspaceAdminAccess } from "../workspace/middleware";
import { logAuditEvent } from "../store/audit";

/** Extract workspace ID from request headers */
function getWorkspaceId(req: FastifyRequest): string | undefined {
  const w = (req.headers['x-workspace-id'] as string | undefined)?.toString().trim();
  return w && w.length ? w : undefined;
}

/** Extract actor ID from request headers */
function getActorId(req: FastifyRequest): string {
  const u = (req.headers['x-dev-user'] as string | undefined)?.toString().trim();
  return u && u.length ? u : 'user:local';
}

export default async function filesRoutes(app: FastifyInstance) {
  // List nodes under a parent (root if omitted)
  // Workspace-scoped via X-Workspace-Id header
  app.get<{
    Querystring: { parentId?: string };
  }>("/files/tree", async (req) => {
    const parentId = (req.query.parentId ?? "").toString() || undefined;
    const workspaceId = getWorkspaceId(req);
    const nodes = listChildren(parentId, workspaceId);
    return { parentId: parentId ?? null, nodes };
  });

  // Create a folder
  // Workspace-scoped via X-Workspace-Id header
  app.post<{
    Body: { parentId?: string | null; name?: string };
  }>("/files/folder", async (req, reply) => {
    const workspaceId = getWorkspaceId(req);
    // Require editor+ role for workspace-scoped folder creation
    if (workspaceId && !hasWorkspaceWriteAccess(req)) {
      return reply.code(403).send({ error: "Requires editor role or higher to create folders" });
    }

    const body = (req.body ?? {}) as {
      parentId?: string | null;
      name?: string;
    };
    const rawName = (body.name ?? "").toString().trim();
    if (!rawName) {
      return reply.code(400).send({ error: "name required" });
    }

    try {
      const node = createFolder({
        parentId: body.parentId ?? undefined,
        name: rawName,
        workspaceId,
      });

      // Log audit event if workspace-scoped
      if (workspaceId) {
        logAuditEvent({
          workspaceId,
          actorId: getActorId(req),
          action: 'folder:create',
          targetType: 'folder',
          targetId: String(node.id),
          details: { name: rawName },
        });
      }

      return reply.code(201).send(node);
    } catch (err) {
      req.log.error({ err }, "failed to create folder");
      return reply.code(500).send({ error: "failed to create folder" });
    }
  });

  // Attach or move a DOC node into the file tree
  // Workspace-scoped via X-Workspace-Id header
  //
  // Body: { docId: string, name: string, parentId?: string | null }
  // - docId: the existing document id from /docs
  // - name: label to show in the tree (usually the doc title)
  // - parentId: folder node id ("node-123") or "root"/null for root
  app.post<{
    Body: { parentId?: string | null; docId?: string; name?: string };
  }>("/files/doc", async (req, reply) => {
    const workspaceId = getWorkspaceId(req);
    // Require editor+ role for workspace-scoped doc attachment
    if (workspaceId && !hasWorkspaceWriteAccess(req)) {
      return reply.code(403).send({ error: "Requires editor role or higher to attach documents" });
    }

    const body = (req.body ?? {}) as {
      parentId?: string | null;
      docId?: string;
      name?: string;
    };

    const docId = (body.docId ?? "").toString().trim();
    const rawName = (body.name ?? "").toString().trim();

    if (!docId) {
      return reply.code(400).send({ error: "docId required" });
    }
    if (!rawName) {
      return reply.code(400).send({ error: "name required" });
    }

    try {
      const node = attachDocNode(docId, rawName, body.parentId ?? undefined, workspaceId);
      return reply.code(201).send(node);
    } catch (err) {
      // Most common error here is an invalid parentId format.
      req.log.error({ err }, "failed to attach doc node");
      return reply.code(400).send({ error: "invalid parentId or request" });
    }
  });

  // Rename and/or move a node
  // For move, workspace is used to determine the correct root if parentId is null
  app.patch<{
    Params: { id: string };
    Body: { name?: string; parentId?: string | null };
  }>("/files/:id", async (req, reply) => {
    const workspaceId = getWorkspaceId(req);
    // Require editor+ role for workspace-scoped node updates
    if (workspaceId && !hasWorkspaceWriteAccess(req)) {
      return reply.code(403).send({ error: "Requires editor role or higher to update files" });
    }

    const nodeId = (req.params.id || "").toString();
    const body = (req.body ?? {}) as {
      name?: string;
      parentId?: string | null;
    };

    let node = null;
    try {
      if (body.name && body.name.trim()) {
        node = renameNode(nodeId, body.name);
      }
      if (body.parentId !== undefined) {
        node = moveNode(nodeId, body.parentId, workspaceId);
      }
    } catch (err) {
      req.log.error({ err }, "failed to update fs node");
      return reply.code(400).send({ error: "invalid request" });
    }

    if (!node) {
      return reply.code(404).send({ error: "not found" });
    }

    return node;
  });

  // Delete a node (soft delete - moves to trash).
  //
  // Behaviour:
  // - 404 if the node does not exist.
  // - 409 if the node is a folder that still has children (returns a small summary).
  // - 204 on successful delete.
  app.delete<{
    Params: { id: string };
  }>("/files/:id", async (req, reply) => {
    const workspaceId = getWorkspaceId(req);
    // Require editor+ role for workspace-scoped node deletion
    if (workspaceId && !hasWorkspaceWriteAccess(req)) {
      return reply.code(403).send({ error: "Requires editor role or higher to delete files" });
    }

    const nodeId = (req.params.id || "").toString();

    try {
      const info = getNodeWithChildCount(nodeId);

      if (!info) {
        return reply.code(404).send({ error: "not found" });
      }

      const { node, childCount } = info;

      if (node.kind === "folder" && childCount > 0) {
        // Surface the immediate children so the UI can explain "why".
        const children = listChildren(nodeId, workspaceId);
        return reply.code(409).send({
          error: "folder_not_empty",
          message: "Cannot delete a non-empty folder.",
          childCount,
          children,
        });
      }

      const ok = deleteNode(nodeId);
      if (!ok) {
        // If we got here, any failure is effectively "not found" (race / double-delete).
        return reply.code(404).send({ error: "not found" });
      }

      // Log audit event if workspace-scoped
      if (workspaceId) {
        logAuditEvent({
          workspaceId,
          actorId: getActorId(req),
          action: node.kind === 'folder' ? 'folder:delete' : 'file:permanent_delete',
          targetType: node.kind === 'folder' ? 'folder' : 'file',
          targetId: nodeId,
          details: { name: node.name },
        });
      }
    } catch (err) {
      req.log.error({ err }, "failed to delete fs node");
      return reply.code(500).send({ error: "failed to delete node" });
    }

    return reply.code(204).send();
  });

  // Trash routes for files/nodes
  app.get("/files/trash", async (req) => {
    const workspaceId = getWorkspaceId(req);
    return listFilesTrash(workspaceId);
  });

  app.post<{
    Params: { id: string };
  }>("/files/:id/restore", async (req, reply) => {
    const workspaceId = getWorkspaceId(req);
    // Require editor+ role for workspace-scoped node restore
    if (workspaceId && !hasWorkspaceWriteAccess(req)) {
      return reply.code(403).send({ error: "Requires editor role or higher to restore files" });
    }

    const nodeId = (req.params.id || "").toString();

    try {
      const restored = restoreNode(nodeId);
      if (!restored) {
        return reply.code(404).send({ error: "not found or not in trash" });
      }

      // Log audit event if workspace-scoped
      if (workspaceId) {
        logAuditEvent({
          workspaceId,
          actorId: getActorId(req),
          action: 'file:restore',
          targetType: restored.kind === 'folder' ? 'folder' : 'file',
          targetId: nodeId,
          details: { name: restored.name },
        });
      }

      return restored;
    } catch (err) {
      req.log.error({ err }, "failed to restore fs node");
      return reply.code(500).send({ error: "failed to restore node" });
    }
  });

  app.delete<{
    Params: { id: string };
  }>("/files/:id/permanent", async (req, reply) => {
    const workspaceId = getWorkspaceId(req);
    // Require admin role for permanent deletion (destructive operation)
    if (workspaceId && !hasWorkspaceAdminAccess(req)) {
      return reply.code(403).send({ error: "Requires admin role to permanently delete files" });
    }

    const nodeId = (req.params.id || "").toString();

    try {
      // Get node info before deleting for audit log
      const nodeInfo = getNodeWithChildCount(nodeId);

      const ok = permanentDeleteNode(nodeId);
      if (!ok) {
        return reply.code(404).send({ error: "not found or not in trash" });
      }

      // Log audit event if workspace-scoped
      if (workspaceId && nodeInfo) {
        logAuditEvent({
          workspaceId,
          actorId: getActorId(req),
          action: 'file:permanent_delete',
          targetType: nodeInfo.node.kind === 'folder' ? 'folder' : 'file',
          targetId: nodeId,
          details: { name: nodeInfo.node.name },
        });
      }
    } catch (err) {
      req.log.error({ err }, "failed to permanently delete fs node");
      return reply.code(500).send({ error: "failed to permanently delete node" });
    }

    return reply.code(204).send();
  });
}
