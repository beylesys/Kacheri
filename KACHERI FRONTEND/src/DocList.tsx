// KACHERI FRONTEND/src/DocList.tsx
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DocsAPI, FilesAPI, type FileNode } from "./api";
import ImportButton from "./components/ImportButton";
import { TemplateGalleryModal } from "./components/TemplateGalleryModal";
import { templatesApi } from "./api/templates";

type ApiDoc = {
  id: string;
  title?: string;
  name?: string;
  updatedAt?: string | number | null;
};

type DocRow = { id: string; title: string; updatedAt: string | number | null };

function normalize(row: ApiDoc): DocRow {
  return {
    id: row.id,
    title: row.title ?? row.name ?? "Untitled",
    updatedAt: row.updatedAt ?? null,
  };
}

const SearchIcon = () => (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M10 4a6 6 0 104.472 10.028l4.25 4.25 1.414-1.414-4.25-4.25A6 6 0 0010 4zm0 2a4 4 0 110 8 4 4 0 010-8z" />
  </svg>
);

/* ---------- Shared confirm dialog ---------- */

type ConfirmDialogProps = {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

function ConfirmDialog({
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div style={confirmOverlayStyle} onClick={busy ? undefined : onCancel}>
      <div
        style={confirmCardStyle}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "#374151",
              lineHeight: 1.4,
            }}
          >
            {body}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 12,
          }}
        >
          <button
            type="button"
            className="button sm ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`button sm ${destructive ? "danger" : "primary"}`}
            onClick={() => void onConfirm()}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Folder picker for "Organize" ---------- */

type FolderPickerProps = {
  doc: DocRow;
  onClose: () => void;
  onConfirm: (parentId: string | null) => void;
};

const FOLDER_ROOT_KEY = "__root__";

function folderParentKey(parentId: string | null): string {
  return parentId ?? FOLDER_ROOT_KEY;
}

/**
 * Simple folder picker used from the Docs home.
 * Lets you choose where this doc should appear in the File Manager.
 */
function FolderPicker({ doc, onClose, onConfirm }: FolderPickerProps) {
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<
    Array<{ id: string | null; name: string }>
  >([{ id: null, name: "Root" }]);
  const [foldersByParent, setFoldersByParent] = useState<
    Record<string, FileNode[]>
  >({});
  const [loadingByParent, setLoadingByParent] = useState<
    Record<string, boolean>
  >({});
  const [error, setError] = useState<string | null>(null);

  async function loadChildren(parentId: string | null) {
    const key = folderParentKey(parentId);
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
    setCurrentParentId(null);
    setBreadcrumbs([{ id: null, name: "Root" }]);
    void loadChildren(null);
  }, []);

  function ensureLoaded(parentId: string | null) {
    const key = folderParentKey(parentId);
    const hasLoaded = foldersByParent[key] !== undefined;
    const isLoading = !!loadingByParent[key];
    if (!hasLoaded && !isLoading) {
      void loadChildren(parentId);
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

  const key = folderParentKey(currentParentId);
  const folders = foldersByParent[key] ?? [];
  const isLoading = !!loadingByParent[key];

  return (
    <div
      style={pickerOverlayStyle}
      onClick={onClose}
    >
      <div
        style={pickerCardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ marginBottom: 8 }}>
          <div className="h2" style={{ fontSize: 16, marginBottom: 4 }}>
            Organize document
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            Choose where <strong>{doc.title}</strong> should appear in the File
            Manager.
          </div>
        </div>

        <div style={{ fontSize: 12, marginBottom: 8 }}>
          {breadcrumbs.map((crumb, index) => (
            <span key={index}>
              {index > 0 && " / "}
              <button
                type="button"
                onClick={() => handleBreadcrumbClick(index)}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  margin: 0,
                  cursor: "pointer",
                  fontSize: 12,
                  color: index === breadcrumbs.length - 1 ? "#111" : "#3366cc",
                  textDecoration:
                    index === breadcrumbs.length - 1 ? "none" : "underline",
                }}
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

        <div style={pickerListBoxStyle}>
          {isLoading && (
            <div style={{ fontSize: 13, color: "#555", padding: 6 }}>
              Loading folders…
            </div>
          )}
          {!isLoading && folders.length === 0 && (
            <div style={{ fontSize: 13, color: "#777", padding: 6 }}>
              No subfolders here yet. You can create folders from the File
              Manager.
            </div>
          )}
          {!isLoading &&
            folders.map((folder) => (
              <div
                key={folder.id}
                onClick={() => goToFolder(folder)}
                style={pickerRowStyle}
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
          >
            Cancel
          </button>
          <button
            type="button"
            className="button sm primary"
            onClick={() => onConfirm(currentParentId)}
          >
            Attach here
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Main Docs list page ---------- */

type ConfirmState =
  | {
      kind: "delete-doc";
      doc: DocRow;
    }
  | null;

export default function DocList() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);

  // Which doc is being edited
  const [editingId, setEditingId] = useState<string | null>(null);
  // A single ref is enough because we only allow editing one row at a time
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  // Prevent double actions per row (and for create)
  const [busyId, setBusyId] = useState<string | null>(null);

  // Which doc we’re currently organizing into folders
  const [organizingDoc, setOrganizingDoc] = useState<DocRow | null>(null);

  // Confirmation dialog state (for destructive actions)
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  // Template gallery modal state
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const list = await DocsAPI.list();
        setDocs(list.map(normalize));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleCreate() {
    const name = title.trim() || "Untitled";
    setBusyId("create");
    try {
      const doc = await DocsAPI.create(name);
      setTitle("");

      // Ensure this new doc also appears in the File Manager
      // by attaching it to the implicit root folder.
      try {
        await FilesAPI.attachDoc({
          docId: doc.id,
          name,
          parentId: null,
        });
      } catch (e) {
        // Non-fatal: doc still exists even if file-manager link fails.
        console.error("Failed to attach doc to File Manager", e);
      }

      navigate(`/doc/${doc.id}`);
    } catch (e: any) {
      alert(`Create failed: ${e.message || e}`);
    } finally {
      setBusyId(null);
    }
  }

  function startRename(d: DocRow) {
    setEditingId(d.id);
    // Focus after the field appears
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }

  function cancelRename() {
    setEditingId(null);
    if (renameInputRef.current) renameInputRef.current.value = "";
  }

  async function saveRename(id: string) {
    const input = renameInputRef.current;
    const next = (input?.value ?? "").trim();
    if (!next) {
      cancelRename();
      return;
    }

    setBusyId(id);
    try {
      const updated = await DocsAPI.rename(id, next);
      const normalized = normalize(updated as ApiDoc);
      setDocs((prev) => prev.map((d) => (d.id === id ? normalized : d)));
      cancelRename();
    } catch (e: any) {
      alert(`Rename failed: ${e.message || e}`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await DocsAPI.delete(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (editingId === id) cancelRename();
      if (organizingDoc && organizingDoc.id === id) {
        setOrganizingDoc(null);
      }
    } catch (e: any) {
      alert(`Delete failed: ${e.message || e}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="container">
      <div
        className="row"
        style={{
          marginBottom: 8,
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
        }}
      >
        <div>
          <div className="h1">Kacheri Docs</div>
          <div className="muted">
            Fast, collaborative writing with export‑grade outputs.
          </div>
        </div>
        <Link
          to="/files"
          className="button sm subtle"
          style={{ whiteSpace: "nowrap" }}
        >
          Open File Manager
        </Link>
      </div>

      {/* Create / Import */}
      <div
        className="surface"
        style={{ padding: 16, borderRadius: 14, marginTop: 16 }}
      >
        <div className="row" style={{ gap: 12, alignItems: "stretch" }}>
          <div className="search" style={{ flex: 1 }}>
            <SearchIcon />
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New doc title"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
          </div>

          <button
            className="button primary"
            onClick={() => setTemplateModalOpen(true)}
            disabled={busyId === "create"}
            title="Create a new document from template"
          >
            New Document
          </button>

          {/* Import existing file (DOCX/PDF/HTML/MD) */}
          <ImportButton
            className="button subtle"
            label="Import…"
            // Accepts the common types we support server-side
            accept=".docx,.pdf,.html,.md"
          />
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Import accepts .docx / text‑based .pdf / .html / .md. You’ll review a
          diff before content is applied.
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="empty" style={{ marginTop: 16 }}>
          Loading documents…
        </div>
      ) : docs.length === 0 ? (
        <div className="empty" style={{ marginTop: 16 }}>
          <div className="h2" style={{ marginBottom: 6 }}>
            No documents yet
          </div>
          <div className="muted">
            Type a title above and hit “New Document”, or use “Import…”.
          </div>
        </div>
      ) : (
        <ul className="list">
          {docs.map((d) => {
            const updatedLabel =
              d.updatedAt != null
                ? new Date(d.updatedAt).toLocaleString()
                : "—";
            const isEditing = editingId === d.id;

            return (
              <li key={d.id} className="list-item">
                <div className="row" style={{ gap: 10, minWidth: 0 }}>
                  <div className="badge">doc-{d.id.slice(0, 6)}</div>

                  <div style={{ minWidth: 0, display: "grid" }}>
                    {isEditing ? (
                      <input
                        ref={renameInputRef}
                        className="input sm"
                        defaultValue={d.title} // uncontrolled; always typeable
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveRename(d.id);
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            cancelRename();
                          }
                        }}
                        style={{ minWidth: 260 }}
                      />
                    ) : (
                      <Link
                        to={`/doc/${d.id}`}
                        className="title"
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {d.title}
                      </Link>
                    )}
                    <span className="meta">Updated {updatedLabel}</span>
                  </div>
                </div>

                <div className="actions">
                  {isEditing ? (
                    <>
                      <button
                        className="button sm subtle"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          saveRename(d.id);
                        }}
                        disabled={busyId === d.id}
                      >
                        Save
                      </button>
                      <button
                        className="button sm ghost"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          cancelRename();
                        }}
                        disabled={busyId === d.id}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="button sm subtle"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          startRename(d);
                        }}
                        disabled={busyId === d.id}
                      >
                        Rename
                      </button>
                      <button
                        className="button sm subtle"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setOrganizingDoc(d);
                        }}
                        disabled={busyId === d.id}
                      >
                        Organize
                      </button>
                    </>
                  )}
                  <button
                    className="button sm danger"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setConfirmState({ kind: "delete-doc", doc: d });
                    }}
                    disabled={busyId === d.id}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {organizingDoc && (
        <FolderPicker
          doc={organizingDoc}
          onClose={() => setOrganizingDoc(null)}
          onConfirm={async (parentId) => {
            setBusyId(organizingDoc.id);
            try {
              await FilesAPI.attachDoc({
                docId: organizingDoc.id,
                name: organizingDoc.title,
                parentId,
              });
              setOrganizingDoc(null);
            } catch (e: any) {
              alert(`Organize failed: ${e?.message || e}`);
            } finally {
              setBusyId(null);
            }
          }}
        />
      )}

      {confirmState && confirmState.kind === "delete-doc" && (
        <ConfirmDialog
          title="Delete document"
          body={`Delete "${confirmState.doc.title}"? This will remove the document and its File Manager links. This action cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          destructive
          busy={busyId === confirmState.doc.id}
          onCancel={() => setConfirmState(null)}
          onConfirm={async () => {
            await handleDelete(confirmState.doc.id);
            setConfirmState(null);
          }}
        />
      )}

      {/* Template Gallery Modal */}
      <TemplateGalleryModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onSelectTemplate={async (templateId, docTitle) => {
          setBusyId("create");
          try {
            const { doc, templateContent } = await templatesApi.createFromTemplate(
              templateId,
              docTitle
            );

            // Attach doc to File Manager root
            try {
              await FilesAPI.attachDoc({
                docId: doc.id,
                name: doc.title,
                parentId: null,
              });
            } catch (e) {
              console.error("Failed to attach doc to File Manager", e);
            }

            // Store template content in sessionStorage for EditorPage to load
            if (templateContent) {
              sessionStorage.setItem(
                `template-content-${doc.id}`,
                JSON.stringify(templateContent)
              );
            }

            setTemplateModalOpen(false);
            navigate(`/doc/${doc.id}`);
          } catch (e: any) {
            throw new Error(e.message || "Failed to create document");
          } finally {
            setBusyId(null);
          }
        }}
      />
    </div>
  );
}

/* ---------- Inline styles for dialogs ---------- */

const confirmOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 60,
};

const confirmCardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 420,
  background: "#ffffff",
  borderRadius: 12,
  boxShadow: "0 20px 60px rgba(15,23,42,0.5)",
  padding: 16,
};

const pickerOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.25)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 40,
};

const pickerCardStyle: CSSProperties = {
  minWidth: 320,
  maxWidth: 480,
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 10px 40px rgba(0,0,0,0.18)",
  padding: 16,
};

const pickerListBoxStyle: CSSProperties = {
  maxHeight: 220,
  overflowY: "auto",
  borderRadius: 8,
  border: "1px solid #eee",
  padding: 4,
  background: "#fafafa",
  marginBottom: 8,
};

const pickerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "4px 6px",
  borderRadius: 6,
  cursor: "pointer",
  background: "#fff",
  border: "1px solid #e5e5e5",
  marginBottom: 4,
};
