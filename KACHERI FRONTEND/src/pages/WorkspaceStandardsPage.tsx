// KACHERI FRONTEND/src/pages/WorkspaceStandardsPage.tsx
// Workspace Extraction Standards management page.
// Admin-only: allows creating, editing, deleting custom anomaly detection rules.
//
// See: Docs/Roadmap/document-intelligence-work-scope.md — Slice 15

import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../workspace/WorkspaceContext';
import { extractionStandardsApi } from '../api/extraction';
import type {
  ExtractionStandard,
  DocumentType,
  RuleType,
  AnomalySeverity,
} from '../types/extraction';
import StandardRuleEditor from '../components/extraction/StandardRuleEditor';

/* ---------- Helpers ---------- */

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  contract: 'Contract',
  invoice: 'Invoice',
  proposal: 'Proposal',
  meeting_notes: 'Meeting Notes',
  report: 'Report',
  other: 'All Types',
};

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  required_field: 'Required Field',
  value_range: 'Value Range',
  comparison: 'Comparison',
  custom: 'Custom',
};

const SEVERITY_STYLES: Record<AnomalySeverity, { bg: string; color: string; border: string }> = {
  info: {
    bg: 'rgba(59, 130, 246, 0.15)',
    color: '#93bbfd',
    border: 'rgba(59, 130, 246, 0.4)',
  },
  warning: {
    bg: 'rgba(234, 179, 8, 0.15)',
    color: '#fde047',
    border: 'rgba(234, 179, 8, 0.4)',
  },
  error: {
    bg: 'rgba(239, 68, 68, 0.15)',
    color: '#fca5a5',
    border: 'rgba(239, 68, 68, 0.4)',
  },
};

function summariseConfig(ruleType: RuleType, config: Record<string, unknown>): string {
  switch (ruleType) {
    case 'required_field':
      return `Require: ${config.fieldPath ?? '—'}`;
    case 'value_range': {
      const parts: string[] = [];
      if (config.fieldPath) parts.push(String(config.fieldPath));
      if (config.min !== undefined) parts.push(`min=${config.min}`);
      if (config.max !== undefined) parts.push(`max=${config.max}`);
      return parts.join(', ') || '—';
    }
    case 'comparison':
      return `${config.field1 ?? '?'} ${config.operator ?? '?'} ${config.field2 ?? '?'}`;
    case 'custom':
      return config.description ? String(config.description).slice(0, 60) : 'Custom rule';
    default:
      return '—';
  }
}

function isAdmin(role?: string): boolean {
  return role === 'owner' || role === 'admin';
}

/* ---------- Page Component ---------- */

export default function WorkspaceStandardsPage() {
  const navigate = useNavigate();
  const { currentWorkspace, workspaceId } = useWorkspace();

  const [standards, setStandards] = useState<ExtractionStandard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DocumentType | 'all'>('all');

  // Editor modal state: null = closed, 'create' = new, ExtractionStandard = edit
  const [editorMode, setEditorMode] = useState<null | 'create' | ExtractionStandard>(null);

  // Delete confirmation
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Toggling enabled
  const [toggling, setToggling] = useState<string | null>(null);

  // Load standards
  const fetchStandards = async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const opts = filter !== 'all' ? { documentType: filter as DocumentType } : undefined;
      const res = await extractionStandardsApi.list(workspaceId, opts);
      setStandards(res.standards);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load standards';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStandards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, filter]);

  // Toggle enabled/disabled
  const handleToggle = async (standard: ExtractionStandard) => {
    if (!workspaceId) return;
    setToggling(standard.id);
    try {
      await extractionStandardsApi.update(workspaceId, standard.id, {
        enabled: !standard.enabled,
      });
      await fetchStandards();
    } catch (err: unknown) {
      console.error('[standards] Toggle failed:', err);
    } finally {
      setToggling(null);
    }
  };

  // Delete standard
  const handleDelete = async (standardId: string) => {
    if (!workspaceId) return;
    setDeleting(standardId);
    setDeleteError(null);
    try {
      await extractionStandardsApi.delete(workspaceId, standardId);
      await fetchStandards();
      setDeleting(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete';
      setDeleteError(msg);
      setDeleting(null);
    }
  };

  // On editor save
  const handleEditorSaved = () => {
    setEditorMode(null);
    fetchStandards();
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

  if (!isAdmin(currentWorkspace.role)) {
    return (
      <div style={pageStyle}>
        <div style={shellStyle}>
          <header style={headerStyle}>
            <div>
              <div style={eyebrowStyle}>EXTRACTION STANDARDS</div>
              <h1 style={titleStyle}>Admin Access Required</h1>
              <p style={subtitleStyle}>
                Only workspace owners and admins can manage extraction standards.
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
            <div style={eyebrowStyle}>EXTRACTION STANDARDS</div>
            <h1 style={titleStyle}>{currentWorkspace.name}</h1>
            <p style={subtitleStyle}>
              Custom anomaly detection rules applied during document extraction.
              These rules flag issues specific to your workspace's requirements.
            </p>
          </div>
          <div style={headerRightStyle}>
            <button
              type="button"
              onClick={() => setEditorMode('create')}
              style={addButtonStyle}
            >
              + Add Rule
            </button>
            <button type="button" onClick={() => navigate('/')} style={backButtonStyle}>
              Back to Files
            </button>
          </div>
        </header>

        {/* Filter bar */}
        <section style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 12, color: '#9ca3c7' }}>Filter by type:</label>
          <select
            style={filterSelectStyle}
            value={filter}
            onChange={(e) => setFilter(e.target.value as DocumentType | 'all')}
          >
            <option value="all">All Types</option>
            <option value="contract">Contract</option>
            <option value="invoice">Invoice</option>
            <option value="proposal">Proposal</option>
            <option value="meeting_notes">Meeting Notes</option>
            <option value="report">Report</option>
            <option value="other">Other</option>
          </select>
          <span style={{ fontSize: 11, color: '#9ca3c7' }}>
            {standards.length} rule{standards.length !== 1 ? 's' : ''}
          </span>
        </section>

        {/* Error */}
        {error && (
          <div style={errorBannerStyle}>
            {error}
            <button
              type="button"
              onClick={fetchStandards}
              style={{ ...retryButtonStyle, marginLeft: 8 }}
            >
              Retry
            </button>
          </div>
        )}
        {deleteError && (
          <div style={{ ...errorBannerStyle, marginTop: 8 }}>Delete failed: {deleteError}</div>
        )}

        {/* Loading */}
        {loading && !standards.length && (
          <div style={{ marginTop: 20, color: '#9ca3c7', fontSize: 13 }}>
            Loading standards...
          </div>
        )}

        {/* Empty state */}
        {!loading && standards.length === 0 && !error && (
          <div style={emptyStyle}>
            <div style={{ fontSize: 28, opacity: 0.4, marginBottom: 8 }}>&#x2699;</div>
            <div style={{ marginBottom: 8 }}>No extraction standards defined yet.</div>
            <div style={{ fontSize: 11, color: '#9ca3c7', marginBottom: 12 }}>
              Create custom rules to flag anomalies during document extraction.
            </div>
            <button
              type="button"
              onClick={() => setEditorMode('create')}
              style={addButtonStyle}
            >
              + Create First Rule
            </button>
          </div>
        )}

        {/* Standards table */}
        {standards.length > 0 && (
          <section style={{ marginTop: 16 }}>
            <div style={tableShellStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Doc Type</th>
                    <th style={thStyle}>Rule Type</th>
                    <th style={{ ...thStyle, minWidth: 180 }}>Config</th>
                    <th style={thStyle}>Severity</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Enabled</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {standards.map((s) => {
                    const sevStyle = SEVERITY_STYLES[s.severity];
                    return (
                      <tr key={s.id}>
                        <td style={tdStyle}>{DOC_TYPE_LABELS[s.documentType] ?? s.documentType}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>
                          {RULE_TYPE_LABELS[s.ruleType] ?? s.ruleType}
                        </td>
                        <td style={{ ...tdStyle, fontSize: 11 }}>
                          {summariseConfig(s.ruleType, s.config)}
                        </td>
                        <td style={tdStyle}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 999,
                              fontSize: 10,
                              fontWeight: 600,
                              letterSpacing: 0.5,
                              background: sevStyle.bg,
                              color: sevStyle.color,
                              border: `1px solid ${sevStyle.border}`,
                            }}
                          >
                            {s.severity.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleToggle(s)}
                            disabled={toggling === s.id}
                            style={{
                              ...toggleBtnStyle,
                              background: s.enabled
                                ? 'rgba(34, 197, 94, 0.2)'
                                : 'rgba(148, 163, 184, 0.1)',
                              color: s.enabled ? '#86efac' : '#9ca3c7',
                              border: s.enabled
                                ? '1px solid rgba(34, 197, 94, 0.4)'
                                : '1px solid rgba(148, 163, 184, 0.3)',
                            }}
                          >
                            {toggling === s.id ? '...' : s.enabled ? 'ON' : 'OFF'}
                          </button>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <button
                            type="button"
                            style={actionBtnStyle}
                            onClick={() => setEditorMode(s)}
                            title="Edit rule"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            style={{ ...actionBtnStyle, color: '#fca5a5', borderColor: 'rgba(239,68,68,0.3)' }}
                            onClick={() => {
                              if (deleting === s.id) return;
                              if (window.confirm(`Delete this ${s.ruleType} rule for ${DOC_TYPE_LABELS[s.documentType]}?`)) {
                                handleDelete(s.id);
                              }
                            }}
                            disabled={deleting === s.id}
                            title="Delete rule"
                          >
                            {deleting === s.id ? '...' : 'Delete'}
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

      {/* Standard Rule Editor Modal */}
      {editorMode !== null && workspaceId && (
        <StandardRuleEditor
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
  maxWidth: 1000,
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
  maxWidth: 460,
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

const toggleBtnStyle: CSSProperties = {
  padding: '2px 10px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.5,
  cursor: 'pointer',
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
