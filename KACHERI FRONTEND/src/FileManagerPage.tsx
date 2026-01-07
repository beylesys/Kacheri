// KACHERI FRONTEND/src/FileManagerPage.tsx
import React, { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  FilesAPI,
  DocsAPI,
  AIWatchAPI,
  type FileNode,
  type DocMeta,
  type TrashedDocMeta,
  type TrashedFileNode,
  type ExportSummary,
  type ComposeSummary,
} from "./api";
import ImportButton from "./components/ImportButton";
import PromptDialog from "./components/PromptDialog";
import AllDocsModal from "./components/AllDocsModal";
import ProofHealthBadge from "./components/ProofHealthBadge";
import { WorkspaceSwitcher, useWorkspace, type Workspace } from "./workspace";
import { WorkspaceSettingsModal } from "./components/workspace/WorkspaceSettingsModal";
import { useAuth } from "./auth";

const ROOT_KEY = "root";

type TreeMap = Record<string, FileNode[]>;
type BoolMap = Record<string, boolean>;

function parentKey(parentId: string | null | undefined): string {
  return parentId ?? ROOT_KEY;
}

type AttachDocModalProps = {
  folder: FileNode;
  onClose: () => void;
  onAttached: () => void;
};

/**
 * AI Watch summary shape (from AIWatchAPI.summary).
 */
type AIWatchSummary = {
  total: number;
  byAction: Record<string, number> | { action: string; count: number }[];
  avgElapsedMs: number;
  last24h: number;
  verificationRate: number;
};

/**
 * Modal for attaching an existing document into a folder
 * (or moving it into that folder if it already has an fs node).
 */
function AttachDocModal({ folder, onClose, onAttached }: AttachDocModalProps) {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      setError(null);
      try {
        const list = await DocsAPI.list();
        setDocs(list);
      } catch (err: any) {
        setError(err?.message || "Failed to load documents");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredDocs = docs.filter((d) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      (d.title ?? "").toLowerCase().includes(q) ||
      d.id.toLowerCase().includes(q)
    );
  });

  async function handleAttach(doc: DocMeta) {
    try {
      await FilesAPI.attachDoc({
        docId: doc.id,
        name: doc.title ?? "Untitled",
        parentId: folder.id,
      });
      onAttached();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to attach document");
    }
  }

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
            Add document to folder
          </div>
          <div style={{ fontSize: 12, color: "#555" }}>
            Folder: <strong>{folder.name}</strong>
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <input
            type="text"
            placeholder="Search documents by title or id…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%",
              fontSize: 13,
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #ddd",
            }}
          />
        </div>

        {error && (
          <div
            style={{
              fontSize: 12,
              color: "#b00020",
              marginBottom: 8,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            maxHeight: 260,
            overflowY: "auto",
            borderRadius: 8,
            border: "1px solid #eee",
            background: "#fafafa",
            padding: 4,
            marginBottom: 8,
          }}
        >
          {loading && (
            <div style={{ fontSize: 13, color: "#555", padding: 6 }}>
              Loading documents…
            </div>
          )}
          {!loading && filteredDocs.length === 0 && (
            <div style={{ fontSize: 13, color: "#777", padding: 6 }}>
              No documents match that search.
            </div>
          )}
          {!loading &&
            filteredDocs.map((doc) => (
              <div key={doc.id} style={attachDocRow}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {doc.title ?? "Untitled"}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#888",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, monospace",
                    }}
                  >
                    doc-{doc.id.slice(0, 8)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleAttach(doc)}
                  style={smallPillButtonSecondary}
                >
                  Attach
                </button>
              </div>
            ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            type="button"
            className="button sm ghost"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

type OrganizeDocState = {
  docId: string;
  title: string;
  currentLocation: string;
};

/**
 * Folder chooser for putting/moving a doc into a folder in the File Manager.
 * Uses FilesAPI.attachDoc under the hood.
 */
type OrganizeDocModalProps = {
  state: OrganizeDocState;
  onClose: () => void;
  onMoved: (parentId: string | null) => Promise<void>;
};

function OrganizeDocModal({ state, onClose, onMoved }: OrganizeDocModalProps) {
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<
    Array<{ id: string | null; name: string }>
  >([{ id: null, name: "Root" }]);
  const [foldersByParent, setFoldersByParent] = useState<
    Record<string, FileNode[]>
  >({});
  const [loadingByParent, setLoadingByParent] = useState<BoolMap>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadFolders(parentId: string | null) {
    const key = parentKey(parentId);
    setLoadingByParent((prev) => ({ ...prev, [key]: true }));
    setError(null);
    try {
      const res = await FilesAPI.list(parentId);
      const onlyFolders = (res.nodes || []).filter((n) => n.kind === "folder");
      setFoldersByParent((prev) => ({ ...prev, [key]: onlyFolders }));
    } catch (err: any) {
      setError(err?.message || "Failed to load folders");
    } finally {
      setLoadingByParent((prev) => ({ ...prev, [key]: false }));
    }
  }

  useEffect(() => {
    // Start at Root
    setCurrentParentId(null);
    setBreadcrumbs([{ id: null, name: "Root" }]);
    void loadFolders(null);
  }, []);

  function ensureLoaded(parentId: string | null) {
    const key = parentKey(parentId);
    const hasLoaded = foldersByParent[key] !== undefined;
    const isLoading = !!loadingByParent[key];
    if (!hasLoaded && !isLoading) {
      void loadFolders(parentId);
    }
  }

  function goToFolder(folder: FileNode) {
    if (folder.kind !== "folder") return;
    setCurrentParentId(folder.id);
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    ensureLoaded(folder.id);
  }

  function handleBreadcrumbClick(index: number) {
    const crumb = breadcrumbs[index];
    setCurrentParentId(crumb.id);
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    ensureLoaded(crumb.id);
  }

  const key = parentKey(currentParentId);
  const folders = foldersByParent[key] ?? [];
  const isLoading = !!loadingByParent[key];

  async function confirmMove() {
    setSaving(true);
    try {
      await onMoved(currentParentId);
      onClose();
    } catch (err) {
      // onMoved already surfaced errors if needed
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
            Organize document
          </div>
          <div style={{ fontSize: 12, color: "#555" }}>
            Choose where <strong>{state.title}</strong> should live in the File
            Manager.
          </div>
          <div style={{ fontSize: 11, color: "#777", marginTop: 4 }}>
            Current location: {state.currentLocation}
          </div>
        </div>

        <div style={{ fontSize: 12, marginBottom: 8 }}>
          {breadcrumbs.map((crumb, index) => (
            <span key={index}>
              {index > 0 && " / "}
              <button
                type="button"
                onClick={() => handleBreadcrumbClick(index)}
                style={breadcrumbButton(index === breadcrumbs.length - 1)}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {error && (
          <div
            style={{
              fontSize: 12,
              color: "#b00020",
              marginBottom: 8,
            }}
          >
            {error}
          </div>
        )}

        <div style={folderListBox}>
          {isLoading && (
            <div style={{ fontSize: 13, color: "#555", padding: 6 }}>
              Loading folders…
            </div>
          )}
          {!isLoading && folders.length === 0 && (
            <div style={{ fontSize: 13, color: "#777", padding: 6 }}>
              No subfolders here yet. Use “+Folder” in the File Manager to
              create more structure.
            </div>
          )}
          {!isLoading &&
            folders.map((folder) => (
              <div
                key={folder.id}
                onClick={() => goToFolder(folder)}
                style={folderRow}
              >
                <span
                  style={{
                    fontSize: 13,
                    flex: 1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {folder.name}
                </span>
                <span style={{ fontSize: 11, color: "#888" }}>Open</span>
              </div>
            ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 8,
          }}
        >
          <button
            type="button"
            className="button sm ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button sm primary"
            onClick={confirmMove}
            disabled={saving}
          >
            {saving ? "Placing…" : "Place here"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Kinds of dialog we show from FileManagerPage. */
type PromptKind =
  | "create-folder"
  | "create-doc"
  | "rename-folder"
  | "rename-doc"
  | "delete-folder"
  | "remove-doc-link"
  | "delete-doc"
  | "trash-doc";

type PromptState = {
  kind: PromptKind;
  mode: "prompt" | "confirm";
  parentId?: string | null;
  node?: FileNode;
  docId?: string;
  currentTitle?: string;
};

export default function FileManagerPage() {
  const { currentWorkspace, setCurrentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const currentUserId = user?.id ?? 'anonymous';

  // Derive permissions from workspace role
  const userRole = currentWorkspace?.role ?? "viewer";
  const canEdit = userRole === "owner" || userRole === "admin" || userRole === "editor";
  const canAdmin = userRole === "owner" || userRole === "admin";

  const [tree, setTree] = useState<TreeMap>({});
  const [expanded, setExpanded] = useState<BoolMap>({});
  const [loadingTree, setLoadingTree] = useState<BoolMap>({});
  const [error, setError] = useState<string | null>(null);

  const [attachFolder, setAttachFolder] = useState<FileNode | null>(null);
  const [organizingDoc, setOrganizingDoc] = useState<OrganizeDocState | null>(
    null
  );

  const [allDocs, setAllDocs] = useState<DocMeta[]>([]);
  const [allDocsLoading, setAllDocsLoading] = useState(true);
  const [allDocsError, setAllDocsError] = useState<string | null>(null);

  // NEW: All-docs search + filter
  const [docsQuery, setDocsQuery] = useState("");
  const [docsFilter, setDocsFilter] = useState<
    "all" | "in-tree" | "not-in-tree"
  >("all");

  const [aiSummary, setAiSummary] = useState<AIWatchSummary | null>(null);
  const [aiExportsSummary, setAiExportsSummary] =
    useState<ExportSummary | null>(null);
  const [aiComposeSummary, setAiComposeSummary] =
    useState<ComposeSummary | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Shared prompt dialog state
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);

  // Trash state
  const [trashedDocs, setTrashedDocs] = useState<TrashedDocMeta[]>([]);
  const [trashedFiles, setTrashedFiles] = useState<TrashedFileNode[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);

  // All Docs Modal state
  const [showAllDocsModal, setShowAllDocsModal] = useState(false);

  // Workspace Settings Modal state
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const navigate = useNavigate();

  async function loadChildren(parentId: string | null) {
    const key = parentKey(parentId);
    setLoadingTree((prev) => ({ ...prev, [key]: true }));
    setError(null);

    try {
      const res = await FilesAPI.list(parentId);
      setTree((prev) => ({ ...prev, [key]: res.nodes }));
    } catch (err: any) {
      setError(err?.message || "Failed to load files");
    } finally {
      setLoadingTree((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function loadAllDocs() {
    setAllDocsError(null);
    try {
      setAllDocsLoading(true);
      const list = await DocsAPI.list();
      setAllDocs(list);
    } catch (err: any) {
      setAllDocsError(err?.message || "Failed to load documents");
    } finally {
      setAllDocsLoading(false);
    }
  }

  async function loadAiWatch() {
    setAiLoading(true);
    setAiError(null);
    try {
      const [summary, exportsSummary, composeSummary] = await Promise.all([
        AIWatchAPI.summary(),
        AIWatchAPI.exportsSummary(),
        AIWatchAPI.composeSummary({ limit: 50 }),
      ]);
      setAiSummary(summary);
      setAiExportsSummary(exportsSummary);
      setAiComposeSummary(composeSummary);
    } catch (err: any) {
      setAiError(err?.message || "Failed to load AI Watch");
    } finally {
      setAiLoading(false);
    }
  }

  async function loadTrash() {
    setTrashLoading(true);
    setTrashError(null);
    try {
      const [docs, files] = await Promise.all([
        DocsAPI.listTrash(),
        FilesAPI.listTrash(),
      ]);
      setTrashedDocs(docs);
      setTrashedFiles(files);
    } catch (err: any) {
      setTrashError(err?.message || "Failed to load trash");
    } finally {
      setTrashLoading(false);
    }
  }

  async function restoreDoc(id: string) {
    try {
      await DocsAPI.restore(id);
      await Promise.all([loadTrash(), loadAllDocs(), loadChildren(null)]);
    } catch (err: any) {
      setTrashError(err?.message || "Failed to restore document");
    }
  }

  async function permanentDeleteDoc(id: string) {
    if (!confirm("Permanently delete this document? This cannot be undone.")) return;
    try {
      await DocsAPI.permanentDelete(id);
      await loadTrash();
    } catch (err: any) {
      setTrashError(err?.message || "Failed to permanently delete document");
    }
  }

  async function restoreFile(id: string) {
    try {
      await FilesAPI.restore(id);
      await Promise.all([loadTrash(), loadChildren(null)]);
    } catch (err: any) {
      setTrashError(err?.message || "Failed to restore file");
    }
  }

  async function permanentDeleteFile(id: string) {
    if (!confirm("Permanently delete this file? This cannot be undone.")) return;
    try {
      await FilesAPI.permanentDelete(id);
      await loadTrash();
    } catch (err: any) {
      setTrashError(err?.message || "Failed to permanently delete file");
    }
  }

  useEffect(() => {
    void loadChildren(null);
    void loadAllDocs();
    void loadAiWatch();
  }, []);

  // Load trash when panel is opened
  useEffect(() => {
    if (showTrash) {
      void loadTrash();
    }
  }, [showTrash]);

  async function refreshEverything() {
    await Promise.all([loadChildren(null), loadAllDocs(), loadAiWatch()]);
    // Refresh any expanded folders as well
    const expandedIds = Object.keys(expanded).filter((id) => expanded[id]);
    for (const id of expandedIds) {
      await loadChildren(id);
    }
  }

  async function toggleFolder(node: FileNode) {
    const isExpanded = !!expanded[node.id];
    if (isExpanded) {
      setExpanded((prev) => ({ ...prev, [node.id]: false }));
      return;
    }
    setExpanded((prev) => ({ ...prev, [node.id]: true }));
    await loadChildren(node.id);
  }

  function openNode(node: FileNode) {
    if (node.kind === "doc" && node.docId) {
      navigate(`/doc/${node.docId}`);
    } else if (node.kind === "folder") {
      void toggleFolder(node);
    }
  }

  /** Open dialog: create folder under parentId (or root if null). */
  function createFolderHere(parentId: string | null) {
    setPromptError(null);
    setPromptState({
      kind: "create-folder",
      mode: "prompt",
      parentId,
    });
  }

  /** Open dialog: create doc under parentId (or root if null). */
  function createDocHere(parentId: string | null) {
    setPromptError(null);
    setPromptState({
      kind: "create-doc",
      mode: "prompt",
      parentId,
    });
  }

  /** Open dialog: rename a folder node. */
  function renameFolder(node: FileNode) {
    setPromptError(null);
    setPromptState({
      kind: "rename-folder",
      mode: "prompt",
      node,
    });
  }

  /** Open dialog: rename a doc everywhere. */
  function renameDocEverywhere(docId: string, currentTitle: string) {
    setPromptError(null);
    setPromptState({
      kind: "rename-doc",
      mode: "prompt",
      docId,
      currentTitle,
    });
  }

  /** Open dialog: delete folder or move doc to trash. */
  function deleteNode(node: FileNode) {
    setPromptError(null);
    if (node.kind === "folder") {
      setPromptState({
        kind: "delete-folder",
        mode: "confirm",
        node,
      });
    } else {
      // For doc nodes, prompt to move to trash
      setPromptState({
        kind: "trash-doc",
        mode: "confirm",
        node,
        docId: node.docId ?? "",
        currentTitle: node.name ?? "Untitled",
      });
    }
  }

  /** Open confirm dialog to delete a document entirely. */
  function openDeleteDocPrompt(doc: DocMeta) {
    setPromptError(null);
    setPromptState({
      kind: "delete-doc",
      mode: "confirm",
      docId: doc.id,
      currentTitle: doc.title ?? "Untitled",
    });
  }

  /** Helper: compute which docs already appear in the tree. */
  function computeDocIdsInTree(currentTree: TreeMap): Set<string> {
    const s = new Set<string>();
    for (const list of Object.values(currentTree)) {
      for (const node of list) {
        if (node.kind === "doc" && node.docId) {
          s.add(node.docId);
        }
      }
    }
    return s;
  }

  function findDocLocation(docId: string): {
    parentId: string | null;
    label: string;
  } {
    const folderNameById: Record<string, string> = {};
    for (const list of Object.values(tree)) {
      for (const node of list) {
        if (node.kind === "folder") {
          folderNameById[node.id] = node.name;
        }
      }
    }

    let parentId: string | null = null;
    let found = false;
    for (const list of Object.values(tree)) {
      for (const node of list) {
        if (node.kind === "doc" && node.docId === docId) {
          parentId = node.parentId ?? null;
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      return {
        parentId: null,
        label: "Not yet in File Manager (will be placed at Root)",
      };
    }

    if (parentId === null) {
      return { parentId: null, label: "Root (top level)" };
    }

    return {
      parentId,
      label: folderNameById[parentId] || "Folder",
    };
  }

  function openOrganizeModalForDoc(docId: string, title: string) {
    const loc = findDocLocation(docId);
    setOrganizingDoc({
      docId,
      title,
      currentLocation: loc.label,
    });
  }

  function renderNodes(
    parentId: string | null,
    depth: number
  ): React.ReactElement[] {
    const key = parentKey(parentId);
    const list = tree[key] ?? [];
    const items: React.ReactElement[] = [];

    for (const node of list) {
      const isFolder = node.kind === "folder";
      const isExpanded = !!expanded[node.id];
      const childLoading = isFolder && !!loadingTree[parentKey(node.id)];

      items.push(
        <div
          key={node.id}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "4px 8px",
            paddingLeft: 12 + depth * 18,
            borderRadius: 999,
            marginBottom: 6,
            background:
              "linear-gradient(135deg, rgba(14,24,44,0.9), rgba(17,34,64,0.92))",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            onClick={() => openNode(node)}
            style={{
              display: "flex",
              alignItems: "center",
              flex: 1,
              gap: 8,
              minWidth: 0,
              cursor: "pointer",
            }}
          >
            <span
              style={{
                width: 14,
                textAlign: "center",
                fontSize: 11,
                color: "#e5e7eb",
              }}
            >
              {isFolder ? (isExpanded ? "▾" : "▸") : "•"}
            </span>
            <span
              style={{
                fontSize: 13,
                color: "#f9fafb",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {node.name}
              {node.kind === "doc" && node.docId && (
                <>
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 11,
                      color: "#9ca3af",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, monospace",
                    }}
                  >
                    (doc-{node.docId.slice(0, 6)})
                  </span>
                  <span style={{ marginLeft: 6 }}>
                    <ProofHealthBadge docId={node.docId} size="sm" />
                  </span>
                </>
              )}
            </span>
            {childLoading && (
              <span style={{ fontSize: 11, color: "#9ca3af" }}>Loading…</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {isFolder ? (
              <>
                <button
                  type="button"
                  onClick={() => canEdit && createFolderHere(node.id)}
                  disabled={!canEdit}
                  title={!canEdit ? "Requires editor role or higher" : undefined}
                  style={canEdit ? smallPillButton : smallPillButtonDisabled}
                >
                  +Folder
                </button>
                <button
                  type="button"
                  onClick={() => canEdit && createDocHere(node.id)}
                  disabled={!canEdit}
                  title={!canEdit ? "Requires editor role or higher" : undefined}
                  style={canEdit ? smallPillButton : smallPillButtonDisabled}
                >
                  New doc
                </button>
                <button
                  type="button"
                  onClick={() => canEdit && setAttachFolder(node)}
                  disabled={!canEdit}
                  title={!canEdit ? "Requires editor role or higher" : undefined}
                  style={canEdit ? smallPillButton : smallPillButtonDisabled}
                >
                  +Doc
                </button>
                <button
                  type="button"
                  onClick={() => canEdit && renameFolder(node)}
                  disabled={!canEdit}
                  title={!canEdit ? "Requires editor role or higher" : undefined}
                  style={canEdit ? smallPillButton : smallPillButtonDisabled}
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => canEdit && deleteNode(node)}
                  disabled={!canEdit}
                  title={!canEdit ? "Requires editor role or higher" : undefined}
                  style={canEdit ? smallPillButtonDanger : smallPillButtonDangerDisabled}
                >
                  Delete
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() =>
                    canEdit && node.docId &&
                    openOrganizeModalForDoc(node.docId, node.name)
                  }
                  disabled={!canEdit}
                  title={!canEdit ? "Requires editor role or higher" : undefined}
                  style={canEdit ? smallPillButton : smallPillButtonDisabled}
                >
                  Move
                </button>
                <button
                  type="button"
                  onClick={() =>
                    canEdit && node.docId &&
                    renameDocEverywhere(node.docId, node.name)
                  }
                  disabled={!canEdit}
                  title={!canEdit ? "Requires editor role or higher" : undefined}
                  style={canEdit ? smallPillButton : smallPillButtonDisabled}
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => canEdit && deleteNode(node)}
                  disabled={!canEdit}
                  title={!canEdit ? "Requires editor role or higher" : undefined}
                  style={canEdit ? smallPillButtonSoftDanger : smallPillButtonSoftDangerDisabled}
                >
                  Move to Trash
                </button>
              </>
            )}
          </div>
        </div>
      );

      if (isFolder && isExpanded) {
        items.push(...renderNodes(node.id, depth + 1));
      }
    }

    return items;
  }

  const rootKey = parentKey(null);
  const rootLoading =
    !!loadingTree[rootKey] && !(tree[rootKey] && tree[rootKey].length > 0);

  const docIdsInTree = computeDocIdsInTree(tree);

  // Derived AI snapshot labels
  const aiVerificationPercent =
    aiSummary && typeof aiSummary.verificationRate === "number"
      ? Math.round(
          aiSummary.verificationRate > 1
            ? aiSummary.verificationRate
            : aiSummary.verificationRate * 100
        )
      : null;

  const exportVerificationLabel =
    aiExportsSummary && aiExportsSummary.total > 0
      ? `${aiExportsSummary.pass}/${aiExportsSummary.total} exports verified`
      : "No exports yet";

  const composeDeterminismLabel =
    aiComposeSummary && aiComposeSummary.total > 0
      ? `${aiComposeSummary.pass}/${aiComposeSummary.total} stable • ${aiComposeSummary.drift} drift`
      : "No compose runs yet";

  // NEW: apply search + filter to allDocs
  const filteredDocs = allDocs.filter((doc) => {
    const inTree = docIdsInTree.has(doc.id);

    if (docsFilter === "in-tree" && !inTree) return false;
    if (docsFilter === "not-in-tree" && inTree) return false;

    if (!docsQuery.trim()) return true;
    const q = docsQuery.toLowerCase();
    const title = (doc.title ?? "").toLowerCase();
    const id = doc.id.toLowerCase();
    return title.includes(q) || id.includes(q);
  });

  /** Compute dialog labels & defaults from promptState. */
  const promptConfig = (() => {
    if (!promptState) return null;
    switch (promptState.kind) {
      case "create-folder":
        return {
          mode: "prompt" as const,
          title: "New folder",
          description:
            promptState.parentId != null
              ? "Create a subfolder inside this folder."
              : "Create a folder at the top level.",
          initialValue: "",
          placeholder: "Folder name",
          confirmLabel: "Create folder",
        };
      case "create-doc":
        return {
          mode: "prompt" as const,
          title: "New document",
          description:
            promptState.parentId != null
              ? "Create a document inside this folder."
              : "Create a document at the workspace root.",
          initialValue: "Untitled",
          placeholder: "Document title",
          confirmLabel: "Create doc",
        };
      case "rename-folder":
        return {
          mode: "prompt" as const,
          title: "Rename folder",
          description: "Update the folder name.",
          initialValue: promptState.node?.name ?? "",
          placeholder: "Folder name",
          confirmLabel: "Rename",
        };
      case "rename-doc":
        return {
          mode: "prompt" as const,
          title: "Rename document",
          description: "Update the document title.",
          initialValue: promptState.currentTitle ?? "",
          placeholder: "Document title",
          confirmLabel: "Rename",
        };
      case "delete-folder":
        return {
          mode: "confirm" as const,
          title: "Delete folder?",
          description:
            "This folder must be empty before it can be deleted. Any subfolders or documents will block deletion.",
          confirmLabel: "Delete folder",
        };
      case "remove-doc-link":
        return {
          mode: "confirm" as const,
          title: "Remove from File Manager?",
          description:
            "This will remove the document shortcut from this folder, but will not delete the document itself.",
          confirmLabel: "Remove",
        };
      case "delete-doc":
        return {
          mode: "confirm" as const,
          title: "Delete document?",
          description:
            "This will delete the document and remove it from any folders. This cannot be undone.",
          confirmLabel: "Delete document",
        };
      case "trash-doc":
        return {
          mode: "confirm" as const,
          title: "Move to Trash?",
          description: `Move "${promptState.currentTitle ?? "Untitled"}" to trash? You can restore it later from the Trash panel.`,
          confirmLabel: "Move to Trash",
        };
      default:
        return null;
    }
  })();

  function closePrompt() {
    setPromptState(null);
    setPromptError(null);
    setPromptLoading(false);
  }

  async function handlePromptConfirm(value?: string) {
    if (!promptState) return;
    const kind = promptState.kind;

    const finish = () => {
      setPromptLoading(false);
    };

    try {
      setPromptLoading(true);
      setPromptError(null);

      if (kind === "create-folder") {
        const parentId = promptState.parentId ?? null;
        const name = (value ?? "").trim();
        if (!name) {
          setPromptError("Folder name can’t be empty.");
          return;
        }
        await FilesAPI.createFolder({ name, parentId });
        await loadChildren(parentId);
        closePrompt();
      } else if (kind === "create-doc") {
        const parentId = promptState.parentId ?? null;
        const title = (value ?? "").trim() || "Untitled";
        try {
          const doc = await DocsAPI.create(title);
          await FilesAPI.attachDoc({
            docId: doc.id,
            name: doc.title ?? "Untitled",
            parentId,
          });
          await Promise.all([loadChildren(parentId), loadAllDocs(), loadAiWatch()]);
          closePrompt();
          navigate(`/doc/${doc.id}`);
        } catch (err: any) {
          const msg = err?.message || "Failed to create document";
          console.error("[create-doc]", err);
          setPromptError(msg);
        }
      } else if (kind === "rename-folder") {
        const node = promptState.node!;
        const nextName = (value ?? "").trim();
        if (!nextName) {
          setPromptError("Folder name can’t be empty.");
          return;
        }
        if (nextName === node.name) {
          closePrompt();
          return;
        }
        await FilesAPI.rename(node.id, nextName);
        await loadChildren(node.parentId ?? null);
        closePrompt();
      } else if (kind === "rename-doc") {
        const docId = promptState.docId!;
        const currentTitle = promptState.currentTitle ?? "";
        const next = (value ?? "").trim();
        if (!next) {
          setPromptError("Document title can’t be empty.");
          return;
        }
        if (next === currentTitle) {
          closePrompt();
          return;
        }
        try {
          await DocsAPI.rename(docId, next);
          await refreshEverything();
          closePrompt();
        } catch (err: any) {
          const msg = err?.message || "Failed to rename document";
          setAllDocsError(msg);
          setPromptError(msg);
        }
      } else if (kind === "delete-folder") {
        const node = promptState.node!;
        try {
          await FilesAPI.delete(node.id);
          await loadChildren(node.parentId ?? null);
          closePrompt();
        } catch (err: any) {
          const msg =
            err?.message ||
            "Cannot delete folder (it may still contain items).";
          setError(msg);
          setPromptError(msg);
        }
      } else if (kind === "remove-doc-link") {
        const node = promptState.node!;
        try {
          await FilesAPI.delete(node.id);
          await Promise.all([
            loadChildren(node.parentId ?? null),
            loadAllDocs(),
            loadAiWatch(),
          ]);
          closePrompt();
        } catch (err: any) {
          const msg = err?.message || "Failed to remove document link";
          setError(msg);
          setPromptError(msg);
        }
      } else if (kind === "delete-doc") {
        const docId = promptState.docId!;
        try {
          await DocsAPI.delete(docId);
          await refreshEverything();
          closePrompt();
        } catch (err: any) {
          const msg = err?.message || "Failed to delete document";
          setAllDocsError(msg);
          setPromptError(msg);
        }
      } else if (kind === "trash-doc") {
        const docId = promptState.docId!;
        try {
          await DocsAPI.delete(docId);
          await refreshEverything();
          closePrompt();
        } catch (err: any) {
          const msg = err?.message || "Failed to move document to trash";
          setError(msg);
          setPromptError(msg);
        }
      }
    } finally {
      finish();
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "32px 24px 40px",
        background:
          "radial-gradient(circle at top left, #1f2937 0, #020617 45%, #020617 100%)",
        color: "#e5e7eb",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header */}
        <header style={{ marginBottom: 24 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 6,
            }}
          >
            <div
              style={{
                fontSize: 32,
                fontWeight: 800,
                letterSpacing: 0.3,
                color: "#f9fafb",
              }}
            >
              Kacheri Docs
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {/* Role badge */}
              <span
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: canEdit
                    ? "1px solid rgba(34,197,94,0.7)"
                    : "1px solid rgba(148,163,184,0.6)",
                  background: canEdit
                    ? "rgba(22,163,74,0.22)"
                    : "rgba(15,23,42,0.7)",
                  color: canEdit ? "#bbf7d0" : "#9ca3af",
                  textTransform: "capitalize",
                }}
                title={
                  canEdit
                    ? "You can create, edit, and delete items"
                    : "You have read-only access to this workspace"
                }
              >
                {userRole}
              </span>
              <button
                type="button"
                onClick={() => setShowTrash(!showTrash)}
                style={{
                  fontSize: 13,
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: showTrash
                    ? "1px solid rgba(248,113,113,0.9)"
                    : "1px solid rgba(148,163,184,0.6)",
                  background: showTrash
                    ? "rgba(127,29,29,0.4)"
                    : "rgba(15,23,42,0.7)",
                  color: showTrash ? "#fecaca" : "#e5e7eb",
                  cursor: "pointer",
                }}
              >
                {showTrash ? "Hide Trash" : "Trash"}
                {(trashedDocs.length + trashedFiles.length) > 0 && !showTrash && (
                  <span style={{ marginLeft: 6, opacity: 0.8 }}>
                    ({trashedDocs.length + trashedFiles.length})
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowAllDocsModal(true)}
                style={{
                  fontSize: 13,
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: "1px solid rgba(148,163,184,0.6)",
                  background: "rgba(15,23,42,0.7)",
                  color: "#e5e7eb",
                  cursor: "pointer",
                }}
              >
                All Documents
              </button>
              {currentWorkspace && (
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(true)}
                  style={{
                    fontSize: 13,
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: "1px solid rgba(139,92,246,0.6)",
                    background: "rgba(139,92,246,0.15)",
                    color: "#c4b5fd",
                    cursor: "pointer",
                  }}
                  title="Workspace Settings"
                >
                  Settings
                </button>
              )}
              <WorkspaceSwitcher />
            </div>
          </div>
          <p
            style={{
              margin: 0,
              maxWidth: 640,
              fontSize: 14,
              lineHeight: 1.5,
              color: "#cbd5f5",
            }}
          >
            Organize documents into folders inside Kacheri. Create new docs
            directly in a folder, click a document to open it in the editor, or
            use "+Doc" on a folder to attach an existing document.
          </p>
        </header>

        {/* Search & Filter Section */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
            padding: "12px 16px",
            borderRadius: 16,
            background: "rgba(15,23,42,0.6)",
            border: "1px solid rgba(148,163,184,0.25)",
          }}
        >
          <div style={{ flex: 1 }}>
            <input
              type="text"
              value={docsQuery}
              onChange={(e) => setDocsQuery(e.target.value)}
              placeholder="Search documents by title or ID…"
              style={{
                width: "100%",
                fontSize: 13,
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid rgba(148,163,184,0.5)",
                background: "rgba(15,23,42,0.85)",
                color: "#e5e7eb",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              style={filterPill(docsFilter === "all")}
              onClick={() => setDocsFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              style={filterPill(docsFilter === "in-tree")}
              onClick={() => setDocsFilter("in-tree")}
            >
              In Folders
            </button>
            <button
              type="button"
              style={filterPill(docsFilter === "not-in-tree")}
              onClick={() => setDocsFilter("not-in-tree")}
            >
              Orphaned
            </button>
          </div>
        </div>

        {/* Folders & Docs - Main Content */}
        <section
          style={{
            borderRadius: 24,
            padding: 18,
            background:
              "radial-gradient(circle at top left, rgba(30,64,175,0.7), rgba(15,23,42,0.95))",
            boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
            border: "1px solid rgba(148,163,184,0.35)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: 1.3,
                  textTransform: "uppercase",
                  color: "#e5e7eb",
                }}
              >
                Folders & Docs
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => canEdit && createDocHere(null)}
                disabled={!canEdit}
                title={!canEdit ? "Requires editor role or higher" : undefined}
                style={canEdit ? primaryCtaButton : primaryCtaButtonDisabled}
              >
                + New doc
              </button>
              <button
                type="button"
                onClick={() => canEdit && createFolderHere(null)}
                disabled={!canEdit}
                title={!canEdit ? "Requires editor role or higher" : undefined}
                style={canEdit ? secondaryCtaButton : secondaryCtaButtonDisabled}
              >
                + New folder
              </button>
              <ImportButton
                label="Import…"
                accept=".docx,.pdf,.html,.md"
                disabled={!canEdit}
                title={!canEdit ? "Requires editor role or higher" : "Import a file (.docx, .pdf, .html, .md)"}
                style={canEdit ? secondaryCtaButton : secondaryCtaButtonDisabled}
              />
            </div>
          </div>

          {error && (
            <div
              style={{
                color: "#fecaca",
                fontSize: 13,
                marginBottom: 8,
              }}
            >
              {error}
            </div>
          )}

          {rootLoading && (
            <div style={{ fontSize: 13, color: "#e5e7eb" }}>Loading…</div>
          )}

          <div>{renderNodes(null, 0)}</div>

          {!rootLoading &&
            (!tree[rootKey] || tree[rootKey].length === 0) && (
              <div
                style={{
                  fontSize: 13,
                  color: "#cbd5f5",
                  marginTop: 4,
                }}
              >
                No items yet. Use "+ New folder" or "+ New doc" to get
                started.
              </div>
            )}

          {/* Search Results - Only shown when searching */}
          {docsQuery.trim() && (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#9ca3af",
                  marginBottom: 8,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                Search Results ({filteredDocs.length})
              </div>

              {allDocsLoading ? (
                <div style={{ fontSize: 13, color: "#e5e7eb" }}>Searching…</div>
              ) : filteredDocs.length === 0 ? (
                <div style={{ fontSize: 13, color: "#cbd5f5" }}>
                  No documents match "{docsQuery}"
                </div>
              ) : (
                filteredDocs.map((doc) => {
                  const inTree = docIdsInTree.has(doc.id);
                  return (
                    <div key={doc.id} style={docCard}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => navigate(`/doc/${doc.id}`)}
                          style={docTitleButton}
                        >
                          {doc.title ?? "Untitled"}
                        </button>
                        <span style={docStatusPill(inTree)}>
                          {inTree ? "In Folders" : "Orphaned"}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#9ca3af",
                          marginTop: 4,
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        }}
                      >
                        doc-{doc.id.slice(0, 8)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>

        {/* AI Watch Footer */}
        <div
          style={{
            marginTop: 16,
            padding: "10px 16px",
            borderRadius: 12,
            background: "rgba(15,23,42,0.7)",
            border: "1px solid rgba(148,163,184,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "#9ca3af",
            }}
          >
            AI Watch
          </div>

          {aiLoading ? (
            <span style={{ fontSize: 12, color: "#9ca3af" }}>Loading…</span>
          ) : aiError ? (
            <span style={{ fontSize: 12, color: "#fca5a5" }}>Error loading stats</span>
          ) : (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span style={aiFooterPill}>
                Verification: {aiVerificationPercent != null ? `${aiVerificationPercent}%` : "—"}
              </span>
              <span style={aiFooterPill}>
                {exportVerificationLabel}
              </span>
              <span style={aiFooterPill}>
                {composeDeterminismLabel}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate("/ai-watch")}
            style={{
              fontSize: 11,
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid rgba(148,163,184,0.4)",
              background: "transparent",
              color: "#9ca3af",
              cursor: "pointer",
            }}
          >
            View Dashboard
          </button>
        </div>

        {/* Trash Panel */}
        {showTrash && (
          <div
            style={{
              marginTop: 24,
              borderRadius: 24,
              padding: 18,
              background:
                "radial-gradient(circle at top left, rgba(127,29,29,0.5), rgba(15,23,42,0.95))",
              boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
              border: "1px solid rgba(248,113,113,0.4)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: 1.3,
                    textTransform: "uppercase",
                    color: "#fecaca",
                  }}
                >
                  Trash
                </div>
                <div style={{ fontSize: 12, color: "#e5e7eb", marginTop: 2 }}>
                  Deleted items can be restored or permanently deleted.
                </div>
              </div>
              <button
                type="button"
                onClick={() => void loadTrash()}
                style={smallPillButton}
              >
                Refresh
              </button>
            </div>

            {trashError && (
              <div style={{ color: "#fecaca", fontSize: 13, marginBottom: 8 }}>
                {trashError}
              </div>
            )}

            {trashLoading ? (
              <div style={{ fontSize: 13, color: "#e5e7eb" }}>Loading trash…</div>
            ) : trashedDocs.length === 0 && trashedFiles.length === 0 ? (
              <div style={{ fontSize: 13, color: "#cbd5f5" }}>
                Trash is empty.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: 12,
                }}
              >
                {trashedDocs.map((doc) => (
                  <div
                    key={`doc-${doc.id}`}
                    style={{
                      borderRadius: 16,
                      padding: "10px 14px",
                      background: "rgba(15,23,42,0.7)",
                      border: "1px solid rgba(148,163,184,0.3)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#f9fafb",
                        marginBottom: 4,
                      }}
                    >
                      {doc.title ?? "Untitled"}
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>
                      Document • Deleted{" "}
                      {new Date(doc.deletedAt).toLocaleDateString()}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => canEdit && restoreDoc(doc.id)}
                        disabled={!canEdit}
                        title={!canEdit ? "Requires editor role or higher" : undefined}
                        style={canEdit ? smallPillButton : smallPillButtonDisabled}
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => canAdmin && permanentDeleteDoc(doc.id)}
                        disabled={!canAdmin}
                        title={!canAdmin ? "Requires admin role" : undefined}
                        style={canAdmin ? smallPillButtonDanger : smallPillButtonDangerDisabled}
                      >
                        Delete Forever
                      </button>
                    </div>
                  </div>
                ))}

                {trashedFiles.map((file) => (
                  <div
                    key={`file-${file.id}`}
                    style={{
                      borderRadius: 16,
                      padding: "10px 14px",
                      background: "rgba(15,23,42,0.7)",
                      border: "1px solid rgba(148,163,184,0.3)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#f9fafb",
                        marginBottom: 4,
                      }}
                    >
                      {file.name}
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>
                      {file.kind === "folder" ? "Folder" : "File"} • Deleted{" "}
                      {new Date(file.deletedAt).toLocaleDateString()}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => canEdit && restoreFile(file.id)}
                        disabled={!canEdit}
                        title={!canEdit ? "Requires editor role or higher" : undefined}
                        style={canEdit ? smallPillButton : smallPillButtonDisabled}
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => canAdmin && permanentDeleteFile(file.id)}
                        disabled={!canAdmin}
                        title={!canAdmin ? "Requires admin role" : undefined}
                        style={canAdmin ? smallPillButtonDanger : smallPillButtonDangerDisabled}
                      >
                        Delete Forever
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {attachFolder && (
        <AttachDocModal
          folder={attachFolder}
          onClose={() => setAttachFolder(null)}
          onAttached={() => {
            void Promise.all([
              loadChildren(attachFolder.parentId ?? null),
              loadChildren(attachFolder.id),
              loadAllDocs(),
              loadAiWatch(),
            ]);
          }}
        />
      )}

      {organizingDoc && (
        <OrganizeDocModal
          state={organizingDoc}
          onClose={() => setOrganizingDoc(null)}
          onMoved={async (parentId) => {
            try {
              await FilesAPI.attachDoc({
                docId: organizingDoc.docId,
                name: organizingDoc.title,
                parentId,
              });
              await refreshEverything();
            } catch (err: any) {
              alert(err?.message || "Failed to organize document");
            }
          }}
        />
      )}

      {promptState && promptConfig && (
        <PromptDialog
          open={true}
          mode={promptConfig.mode}
          title={promptConfig.title}
          description={promptConfig.description}
          initialValue={promptConfig.initialValue}
          placeholder={promptConfig.placeholder}
          confirmLabel={promptConfig.confirmLabel}
          cancelLabel="Cancel"
          errorMessage={promptError}
          loading={promptLoading}
          onConfirm={handlePromptConfirm}
          onCancel={closePrompt}
        />
      )}

      {showAllDocsModal && (
        <AllDocsModal
          open={showAllDocsModal}
          onClose={() => setShowAllDocsModal(false)}
          allDocs={allDocs}
          docsInTree={docIdsInTree}
          loading={allDocsLoading}
          error={allDocsError}
          onOrganizeDoc={(docId, title) => {
            setShowAllDocsModal(false);
            openOrganizeModalForDoc(docId, title);
          }}
          onOpenDoc={(docId) => {
            setShowAllDocsModal(false);
            navigate(`/doc/${docId}`);
          }}
        />
      )}

      {showSettingsModal && currentWorkspace && (
        <WorkspaceSettingsModal
          open={showSettingsModal}
          workspace={currentWorkspace}
          currentUserId={currentUserId}
          onClose={() => setShowSettingsModal(false)}
          onWorkspaceUpdated={(updated) => {
            setCurrentWorkspace(updated);
          }}
          onWorkspaceDeleted={() => {
            setCurrentWorkspace(null);
            navigate('/');
          }}
        />
      )}
    </div>
  );
}

/* ----- Shared styles ----- */

const modalOverlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
};

const modalCard: CSSProperties = {
  width: "100%",
  maxWidth: 520,
  background: "#fff",
  borderRadius: 16,
  boxShadow: "0 20px 60px rgba(15,23,42,0.5)",
  padding: 16,
};

const attachDocRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "4px 6px",
  borderRadius: 6,
  background: "#fff",
  border: "1px solid #e5e5e5",
  marginBottom: 4,
  gap: 8,
};

const folderListBox: CSSProperties = {
  maxHeight: 220,
  overflowY: "auto",
  borderRadius: 8,
  border: "1px solid #eee",
  padding: 4,
  background: "#fafafa",
  marginBottom: 8,
};

const folderRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "4px 6px",
  borderRadius: 6,
  cursor: "pointer",
  background: "#fff",
  border: "1px solid #e5e5e5",
  marginBottom: 4,
};

const smallPillButton: CSSProperties = {
  fontSize: 11,
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid rgba(248,250,252,0.6)",
  background: "rgba(15,23,42,0.7)",
  color: "#f9fafb",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const smallPillButtonSecondary: CSSProperties = {
  ...smallPillButton,
  background: "#fff",
  color: "#111827",
  border: "1px solid #e5e7eb",
};

const smallPillButtonDanger: CSSProperties = {
  ...smallPillButton,
  border: "1px solid rgba(248,113,113,0.9)",
  color: "#fee2e2",
};

const smallPillButtonSoftDanger: CSSProperties = {
  ...smallPillButtonSecondary,
  border: "1px solid rgba(248,113,113,0.6)",
  color: "#b91c1c",
};

const smallPillButtonDisabled: CSSProperties = {
  ...smallPillButton,
  opacity: 0.4,
  cursor: "not-allowed",
};

const smallPillButtonDangerDisabled: CSSProperties = {
  ...smallPillButtonDanger,
  opacity: 0.4,
  cursor: "not-allowed",
};

const smallPillButtonSoftDangerDisabled: CSSProperties = {
  ...smallPillButtonSoftDanger,
  opacity: 0.4,
  cursor: "not-allowed",
};

const aiFooterPill: CSSProperties = {
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 6,
  background: "rgba(30,64,175,0.2)",
  border: "1px solid rgba(59,130,246,0.3)",
  color: "#93c5fd",
};

const primaryCtaButton: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: "6px 18px",
  borderRadius: 999,
  border: "none",
  background: "linear-gradient(90deg,#4f46e5,#9333ea)",
  color: "#f9fafb",
  cursor: "pointer",
  boxShadow: "0 10px 30px rgba(15,23,42,0.7)",
};

const secondaryCtaButton: CSSProperties = {
  ...primaryCtaButton,
  background: "rgba(248,250,252,0.98)",
  color: "#111827",
  boxShadow: "0 8px 24px rgba(15,23,42,0.6)",
};

const primaryCtaButtonDisabled: CSSProperties = {
  ...primaryCtaButton,
  opacity: 0.4,
  cursor: "not-allowed",
};

const secondaryCtaButtonDisabled: CSSProperties = {
  ...secondaryCtaButton,
  opacity: 0.4,
  cursor: "not-allowed",
};

const docCard: CSSProperties = {
  borderRadius: 999,
  padding: "10px 14px",
  marginBottom: 10,
  background:
    "linear-gradient(135deg, rgba(59,130,246,0.25), rgba(124,58,237,0.35))",
  border: "1px solid rgba(148,163,184,0.45)",
  boxShadow: "0 10px 30px rgba(15,23,42,0.7)",
};

const docTitleButton: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  padding: 0,
  margin: 0,
  border: "none",
  background: "transparent",
  color: "#f9fafb",
  cursor: "pointer",
  textAlign: "left",
};

const aiStatPillBase: CSSProperties = {
  fontSize: 11,
  padding: "4px 9px",
  borderRadius: 999,
  borderWidth: 1,
  borderStyle: "solid",
  whiteSpace: "nowrap",
};

function docStatusPill(inTree: boolean): CSSProperties {
  return {
    fontSize: 11,
    padding: "3px 10px",
    borderRadius: 999,
    border: inTree
      ? "1px solid rgba(34,197,94,0.7)"
      : "1px solid rgba(148,163,184,0.7)",
    background: inTree
      ? "rgba(22,163,74,0.25)"
      : "rgba(30,64,175,0.35)",
    color: inTree ? "#bbf7d0" : "#e5e7eb",
    whiteSpace: "nowrap",
  };
}

function breadcrumbButton(active: boolean): CSSProperties {
  return {
    border: "none",
    background: "transparent",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    fontSize: 12,
    color: active ? "#111827" : "#2563eb",
    textDecoration: active ? "none" : "underline",
    fontWeight: active ? 600 : 400,
  };
}

// NEW: filter pill styling for All Documents
function filterPill(active: boolean): CSSProperties {
  return {
    fontSize: 11,
    padding: "4px 9px",
    borderRadius: 999,
    border: active
      ? "1px solid rgba(59,130,246,0.9)"
      : "1px solid rgba(148,163,184,0.6)",
    background: active
      ? "rgba(37,99,235,0.25)"
      : "rgba(15,23,42,0.6)",
    color: "#e5e7eb",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}
