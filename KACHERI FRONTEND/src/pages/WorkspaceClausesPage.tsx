// KACHERI FRONTEND/src/pages/WorkspaceClausesPage.tsx
// Workspace Clause Library management page.
// Editor+ access: allows creating, editing, archiving, and bulk-managing clauses.
// Includes table view, category filter, bulk actions, and ClauseEditor modal.
//
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md — Slice B14

import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../workspace/WorkspaceContext';
import { clausesApi } from '../api/clauses';
import type {
  Clause,
  ClauseCategory,
} from '../types/clause';
import { ClauseEditor } from '../components/clauses';

/* ---------- Helpers ---------- */

const CATEGORY_LABELS: Record<ClauseCategory, string> = {
  general: 'General',
  legal: 'Legal',
  financial: 'Financial',
  boilerplate: 'Boilerplate',
  custom: 'Custom',
};

const CATEGORY_BADGE_STYLES: Record<ClauseCategory, { bg: string; color: string }> = {
  general: { bg: 'rgba(148, 163, 184, 0.2)', color: '#94a3b8' },
  legal: { bg: 'rgba(96, 165, 250, 0.15)', color: '#60a5fa' },
  financial: { bg: 'rgba(52, 211, 153, 0.15)', color: '#34d399' },
  boilerplate: { bg: 'rgba(167, 139, 250, 0.15)', color: '#a78bfa' },
  custom: { bg: 'rgba(251, 146, 60, 0.15)', color: '#fb923c' },
};

function formatDate(ts: string): string {
  try {
    const n = Number(ts);
    const d = isNaN(n) ? new Date(ts) : new Date(n);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

function isEditorOrAbove(role?: string): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

/* ---------- Page Component ---------- */

export default function WorkspaceClausesPage() {
  const navigate = useNavigate();
  const { currentWorkspace, workspaceId } = useWorkspace();

  const [clauses, setClauses] = useState<Clause[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ClauseCategory | 'all'>('all');

  // Editor modal state: null = closed, 'create' = new, Clause = edit
  const [editorMode, setEditorMode] = useState<null | 'create' | Clause>(null);

  // Archive confirmation
  const [archiving, setArchiving] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState(false);
  const [bulkCategory, setBulkCategory] = useState<ClauseCategory>('general');

  // Load clauses
  const fetchClauses = async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const opts = filter !== 'all' ? { category: filter as ClauseCategory, limit: 200 } : { limit: 200 };
      const res = await clausesApi.list(workspaceId, opts);
      setClauses(res.clauses);
      setTotal(res.total);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load clauses';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClauses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, filter]);

  // Archive clause
  const handleArchive = async (clauseId: string, clauseTitle: string) => {
    if (!workspaceId) return;
    if (!window.confirm(`Archive clause "${clauseTitle}"? It will be hidden from the library.`)) return;
    setArchiving(clauseId);
    setArchiveError(null);
    try {
      await clausesApi.archive(workspaceId, clauseId);
      setSelected((prev) => { const next = new Set(prev); next.delete(clauseId); return next; });
      await fetchClauses();
      setArchiving(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to archive';
      setArchiveError(msg);
      setArchiving(null);
    }
  };

  // Bulk archive selected
  const handleBulkArchive = async () => {
    if (!workspaceId || selected.size === 0) return;
    if (!window.confirm(`Archive ${selected.size} selected clause${selected.size !== 1 ? 's' : ''}?`)) return;
    setBulkAction(true);
    try {
      for (const id of selected) {
        await clausesApi.archive(workspaceId, id);
      }
      setSelected(new Set());
      await fetchClauses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bulk archive failed';
      setArchiveError(msg);
    } finally {
      setBulkAction(false);
    }
  };

  // Bulk change category
  const handleBulkCategory = async () => {
    if (!workspaceId || selected.size === 0) return;
    if (!window.confirm(`Change category of ${selected.size} clause${selected.size !== 1 ? 's' : ''} to "${CATEGORY_LABELS[bulkCategory]}"?`)) return;
    setBulkAction(true);
    try {
      for (const id of selected) {
        await clausesApi.update(workspaceId, id, { category: bulkCategory });
      }
      setSelected(new Set());
      await fetchClauses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bulk category change failed';
      setArchiveError(msg);
    } finally {
      setBulkAction(false);
    }
  };

  // Selection toggle
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === clauses.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(clauses.map((c) => c.id)));
    }
  };

  // On editor save
  const handleEditorSaved = () => {
    setEditorMode(null);
    fetchClauses();
  };

  /* ---------- Access Control ---------- */

  if (!currentWorkspace) {
    return (
      <div style={pageStyle}>
        <div style={shellStyle}>
          <div style={{ color: '#9ca3c7', fontSize: 14 }}>Loading workspace...</div>
        </div>
      </div>
    );
  }

  if (!isEditorOrAbove(currentWorkspace.role)) {
    return (
      <div style={pageStyle}>
        <div style={shellStyle}>
          <header style={headerStyle}>
            <div>
              <div style={eyebrowStyle}>CLAUSE LIBRARY</div>
              <h1 style={titleStyle}>Editor Access Required</h1>
              <p style={subtitleStyle}>
                Only workspace editors, admins, and owners can manage the clause library.
                Contact your workspace admin for access.
              </p>
            </div>
            <div style={headerRightStyle}>
              <button type="button" onClick={() => navigate('/')} style={backButtonStyle}>
                Back to Files
              </button>
            </div>
          </header>
        </div>
      </div>
    );
  }

  /* ---------- Render ---------- */

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        {/* Header */}
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>CLAUSE LIBRARY</div>
            <h1 style={titleStyle}>{currentWorkspace.name}</h1>
            <p style={subtitleStyle}>
              Manage reusable content blocks for your workspace.
              Clauses can be inserted into documents with full provenance tracking.
            </p>
          </div>
          <div style={headerRightStyle}>
            <button
              type="button"
              onClick={() => setEditorMode('create')}
              style={addButtonStyle}
            >
              + Add Clause
            </button>
            <button type="button" onClick={() => navigate('/')} style={backButtonStyle}>
              Back to Files
            </button>
          </div>
        </header>

        {/* Filter bar */}
        <section style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: '#9ca3c7' }}>Filter by category:</label>
          <select
            style={filterSelectStyle}
            value={filter}
            onChange={(e) => setFilter(e.target.value as ClauseCategory | 'all')}
          >
            <option value="all">All Categories</option>
            <option value="general">General</option>
            <option value="legal">Legal</option>
            <option value="financial">Financial</option>
            <option value="boilerplate">Boilerplate</option>
            <option value="custom">Custom</option>
          </select>
          <span style={{ fontSize: 11, color: '#9ca3c7' }}>
            {total} clause{total !== 1 ? 's' : ''}
          </span>
        </section>

        {/* Bulk actions bar */}
        {selected.size > 0 && (
          <section style={bulkBarStyle}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              {selected.size} selected
            </span>
            <button
              type="button"
              style={{ ...bulkBtnStyle, color: '#fca5a5', borderColor: 'rgba(239,68,68,0.3)' }}
              onClick={handleBulkArchive}
              disabled={bulkAction}
            >
              {bulkAction ? '...' : 'Archive Selected'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select
                style={{ ...filterSelectStyle, fontSize: 11, padding: '3px 6px' }}
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value as ClauseCategory)}
              >
                <option value="general">General</option>
                <option value="legal">Legal</option>
                <option value="financial">Financial</option>
                <option value="boilerplate">Boilerplate</option>
                <option value="custom">Custom</option>
              </select>
              <button
                type="button"
                style={bulkBtnStyle}
                onClick={handleBulkCategory}
                disabled={bulkAction}
              >
                {bulkAction ? '...' : 'Change Category'}
              </button>
            </div>
            <button
              type="button"
              style={{ ...bulkBtnStyle, marginLeft: 'auto' }}
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
          </section>
        )}

        {/* Error */}
        {error && (
          <div style={errorBannerStyle}>
            {error}
            <button
              type="button"
              onClick={fetchClauses}
              style={{ ...retryButtonStyle, marginLeft: 8 }}
            >
              Retry
            </button>
          </div>
        )}
        {archiveError && (
          <div style={{ ...errorBannerStyle, marginTop: 8 }}>Archive failed: {archiveError}</div>
        )}

        {/* Loading */}
        {loading && !clauses.length && (
          <div style={{ marginTop: 20, color: '#9ca3c7', fontSize: 13 }}>
            Loading clauses...
          </div>
        )}

        {/* Empty state */}
        {!loading && clauses.length === 0 && !error && (
          <div style={emptyStyle}>
            <div style={{ fontSize: 28, opacity: 0.4, marginBottom: 8 }}>&#x1F4DA;</div>
            <div style={{ marginBottom: 8 }}>No clauses in your library yet.</div>
            <div style={{ fontSize: 11, color: '#9ca3c7', marginBottom: 12 }}>
              Create reusable content blocks to insert into documents with version tracking and provenance.
            </div>
            <button
              type="button"
              onClick={() => setEditorMode('create')}
              style={addButtonStyle}
            >
              + Create First Clause
            </button>
          </div>
        )}

        {/* Clauses table */}
        {clauses.length > 0 && (
          <section style={{ marginTop: 16 }}>
            <div style={tableShellStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 36, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selected.size === clauses.length && clauses.length > 0}
                        onChange={toggleSelectAll}
                        title="Select all"
                      />
                    </th>
                    <th style={{ ...thStyle, minWidth: 160 }}>Title</th>
                    <th style={thStyle}>Category</th>
                    <th style={thStyle}>Tags</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Version</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Usage</th>
                    <th style={thStyle}>Last Updated</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {clauses.map((c) => {
                    const catStyle = CATEGORY_BADGE_STYLES[c.category];
                    const maxTags = 3;
                    const visibleTags = c.tags.slice(0, maxTags);
                    const extraTags = c.tags.length - maxTags;
                    return (
                      <tr key={c.id}>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selected.has(c.id)}
                            onChange={() => toggleSelect(c.id)}
                          />
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{c.title}</div>
                          {c.description && (
                            <div style={{ fontSize: 10, color: '#9ca3c7', marginTop: 2 }}>
                              {c.description.length > 60 ? c.description.slice(0, 60) + '...' : c.description}
                            </div>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            display: 'inline-block',
                            padding: '1px 6px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 500,
                            background: catStyle.bg,
                            color: catStyle.color,
                            textTransform: 'capitalize',
                          }}>
                            {CATEGORY_LABELS[c.category] ?? c.category}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {visibleTags.map((tag) => (
                              <span key={tag} style={tagPillStyle}>{tag}</span>
                            ))}
                            {extraTags > 0 && (
                              <span style={{ ...tagPillStyle, fontStyle: 'italic', background: 'transparent', border: 'none', paddingLeft: 2 }}>
                                +{extraTags} more
                              </span>
                            )}
                            {c.tags.length === 0 && (
                              <span style={{ fontSize: 10, color: '#9ca3c7' }}>—</span>
                            )}
                          </div>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontSize: 11, fontWeight: 600 }}>
                          v{c.version}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontSize: 11 }}>
                          {c.usageCount}
                        </td>
                        <td style={{ ...tdStyle, fontSize: 11, color: '#9ca3c7' }}>
                          {formatDate(c.updatedAt)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <button
                            type="button"
                            style={actionBtnStyle}
                            onClick={() => setEditorMode(c)}
                            title="Edit clause"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            style={{ ...actionBtnStyle, color: '#fca5a5', borderColor: 'rgba(239,68,68,0.3)' }}
                            onClick={() => handleArchive(c.id, c.title)}
                            disabled={archiving === c.id}
                            title="Archive clause"
                          >
                            {archiving === c.id ? '...' : 'Archive'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {/* Clause Editor Modal */}
      {editorMode !== null && workspaceId && (
        <ClauseEditor
          workspaceId={workspaceId}
          existing={typeof editorMode === 'object' ? editorMode : undefined}
          onSaved={handleEditorSaved}
          onClose={() => setEditorMode(null)}
        />
      )}
    </div>
  );
}

/* ---------- Styles ---------- */

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  padding: '24px 18px 32px',
  background: 'radial-gradient(circle at top left, #020617 0, #020617 40%, #020617 100%)',
  color: '#e5e7ff',
};

const shellStyle: CSSProperties = {
  maxWidth: 1100,
  margin: '0 auto',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 20,
  alignItems: 'flex-start',
};

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: 2,
  textTransform: 'uppercase',
  color: '#9ca3c7',
};

const titleStyle: CSSProperties = {
  fontSize: 26,
  fontWeight: 800,
  letterSpacing: 0.4,
  margin: '4px 0 4px',
};

const subtitleStyle: CSSProperties = {
  fontSize: 12,
  color: '#cbd5f5',
  maxWidth: 500,
};

const headerRightStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 8,
};

const backButtonStyle: CSSProperties = {
  padding: '6px 12px',
  borderRadius: 999,
  border: '1px solid rgba(148,163,184,0.7)',
  background: 'linear-gradient(145deg, #111827, #1f2937)',
  color: '#e5e7ff',
  fontSize: 12,
  cursor: 'pointer',
};

const addButtonStyle: CSSProperties = {
  padding: '6px 14px',
  borderRadius: 999,
  border: '1px solid rgba(139,92,246,0.5)',
  background: 'linear-gradient(145deg, rgba(139,92,246,0.2), rgba(139,92,246,0.05))',
  color: '#c4b5fd',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};

const filterSelectStyle: CSSProperties = {
  padding: '5px 10px',
  fontSize: 12,
  color: '#e5e7ff',
  background: 'rgba(15, 23, 42, 0.6)',
  border: '1px solid rgba(148,163,184,0.3)',
  borderRadius: 6,
  outline: 'none',
};

const errorBannerStyle: CSSProperties = {
  marginTop: 16,
  padding: '8px 10px',
  borderRadius: 12,
  background: 'rgba(248,113,113,0.14)',
  border: '1px solid rgba(248,113,113,0.7)',
  fontSize: 12,
  color: '#fca5a5',
};

const retryButtonStyle: CSSProperties = {
  padding: '2px 8px',
  fontSize: 11,
  border: '1px solid rgba(248,113,113,0.3)',
  borderRadius: 4,
  background: 'transparent',
  color: '#fca5a5',
  cursor: 'pointer',
};

const emptyStyle: CSSProperties = {
  marginTop: 40,
  textAlign: 'center',
  color: '#9ca3c7',
  fontSize: 13,
};

const tableShellStyle: CSSProperties = {
  borderRadius: 12,
  border: '1px solid rgba(30,64,175,0.7)',
  overflow: 'auto',
  background: 'linear-gradient(135deg, rgba(15,23,42,0.98), rgba(15,23,42,0.95))',
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontWeight: 600,
  fontSize: 11,
  color: '#cbd5f5',
  borderBottom: '1px solid rgba(30,64,175,0.7)',
  background: 'linear-gradient(145deg, rgba(15,23,42,0.98), rgba(30,64,175,0.6))',
  position: 'sticky',
  top: 0,
  zIndex: 1,
};

const tdStyle: CSSProperties = {
  textAlign: 'left',
  padding: '7px 10px',
  fontSize: 12,
  color: '#e5e7ff',
  borderBottom: '1px solid rgba(30,64,175,0.35)',
};

const tagPillStyle: CSSProperties = {
  display: 'inline-block',
  padding: '1px 5px',
  fontSize: 10,
  borderRadius: 3,
  background: 'rgba(148, 163, 184, 0.12)',
  color: '#9ca3c7',
  border: '1px solid rgba(30,64,175,0.35)',
};

const actionBtnStyle: CSSProperties = {
  padding: '2px 8px',
  fontSize: 11,
  color: '#93c5fd',
  background: 'transparent',
  border: '1px solid rgba(59,130,246,0.3)',
  borderRadius: 4,
  cursor: 'pointer',
  marginLeft: 6,
};

const bulkBarStyle: CSSProperties = {
  marginTop: 12,
  padding: '8px 12px',
  borderRadius: 8,
  background: 'rgba(139,92,246,0.08)',
  border: '1px solid rgba(139,92,246,0.3)',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  fontSize: 12,
  color: '#c4b5fd',
};

const bulkBtnStyle: CSSProperties = {
  padding: '3px 10px',
  fontSize: 11,
  color: '#93c5fd',
  background: 'transparent',
  border: '1px solid rgba(59,130,246,0.3)',
  borderRadius: 4,
  cursor: 'pointer',
};
