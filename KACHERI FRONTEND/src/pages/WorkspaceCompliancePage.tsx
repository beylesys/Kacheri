// KACHERI FRONTEND/src/pages/WorkspaceCompliancePage.tsx
// Workspace Compliance Policies management page.
// Admin-only: allows creating, editing, deleting, and toggling compliance policies.
// Includes template browser for quick policy creation from built-in templates.
//
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md — Slice A11

import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../workspace/WorkspaceContext';
import { compliancePoliciesApi } from '../api/compliance';
import type {
  CompliancePolicy,
  PolicyCategory,
  PolicyRuleType,
  PolicySeverity,
} from '../types/compliance';
import { PolicyEditor } from '../components/compliance';

/* ---------- Helpers ---------- */

const CATEGORY_LABELS: Record<PolicyCategory, string> = {
  general: 'General',
  legal: 'Legal',
  financial: 'Financial',
  privacy: 'Privacy',
  custom: 'Custom',
};

const RULE_TYPE_LABELS: Record<PolicyRuleType, string> = {
  text_match: 'Text Match',
  regex_pattern: 'Regex Pattern',
  required_section: 'Required Section',
  forbidden_term: 'Forbidden Term',
  numeric_constraint: 'Numeric Constraint',
  ai_check: 'AI Check',
};

const SEVERITY_STYLES: Record<PolicySeverity, { bg: string; color: string; border: string }> = {
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

function summariseConfig(ruleType: PolicyRuleType, config: Record<string, unknown>): string {
  switch (ruleType) {
    case 'text_match':
      return `${config.matchType ?? 'contains'}: "${config.pattern ?? '—'}"`;
    case 'regex_pattern':
      return `/${config.pattern ?? '—'}/${config.flags ?? ''}`;
    case 'required_section':
      return `Heading: "${config.heading ?? '—'}"${config.minWords ? ` (${config.minWords}+ words)` : ''}`;
    case 'forbidden_term': {
      const terms = Array.isArray(config.terms) ? config.terms as string[] : [];
      return terms.length > 0 ? terms.slice(0, 3).join(', ') + (terms.length > 3 ? '...' : '') : '—';
    }
    case 'numeric_constraint':
      return `${config.fieldPath ?? '?'} ${config.operator ?? '?'} ${config.value ?? '?'}`;
    case 'ai_check': {
      const instr = typeof config.instruction === 'string' ? config.instruction : '';
      return instr.length > 50 ? instr.slice(0, 50) + '...' : instr || '—';
    }
    default:
      return '—';
  }
}

function isAdmin(role?: string): boolean {
  return role === 'owner' || role === 'admin';
}

/* ---------- Page Component ---------- */

export default function WorkspaceCompliancePage() {
  const navigate = useNavigate();
  const { currentWorkspace, workspaceId } = useWorkspace();

  const [policies, setPolicies] = useState<CompliancePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PolicyCategory | 'all'>('all');

  // Editor modal state: null = closed, 'create' = new, CompliancePolicy = edit
  const [editorMode, setEditorMode] = useState<null | 'create' | CompliancePolicy>(null);

  // Delete confirmation
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Toggling enabled
  const [toggling, setToggling] = useState<string | null>(null);

  // Load policies
  const fetchPolicies = async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const opts = filter !== 'all' ? { category: filter as PolicyCategory } : undefined;
      const res = await compliancePoliciesApi.list(workspaceId, opts);
      setPolicies(res.policies);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load policies';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, filter]);

  // Toggle enabled/disabled
  const handleToggle = async (policy: CompliancePolicy) => {
    if (!workspaceId) return;
    setToggling(policy.id);
    try {
      await compliancePoliciesApi.update(workspaceId, policy.id, {
        enabled: !policy.enabled,
      });
      await fetchPolicies();
    } catch (err: unknown) {
      console.error('[compliance] Toggle failed:', err);
    } finally {
      setToggling(null);
    }
  };

  // Delete policy
  const handleDelete = async (policyId: string) => {
    if (!workspaceId) return;
    setDeleting(policyId);
    setDeleteError(null);
    try {
      await compliancePoliciesApi.delete(workspaceId, policyId);
      await fetchPolicies();
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
    fetchPolicies();
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
              <div style={eyebrowStyle}>COMPLIANCE POLICIES</div>
              <h1 style={titleStyle}>Admin Access Required</h1>
              <p style={subtitleStyle}>
                Only workspace owners and admins can manage compliance policies.
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
            <div style={eyebrowStyle}>COMPLIANCE POLICIES</div>
            <h1 style={titleStyle}>{currentWorkspace.name}</h1>
            <p style={subtitleStyle}>
              Define policy rules that documents are checked against.
              Violations are flagged in the Compliance panel during editing and before export.
            </p>
          </div>
          <div style={headerRightStyle}>
            <button
              type="button"
              onClick={() => setEditorMode('create')}
              style={addButtonStyle}
            >
              + Add Policy
            </button>
            <button type="button" onClick={() => navigate('/')} style={backButtonStyle}>
              Back to Files
            </button>
          </div>
        </header>

        {/* Filter bar */}
        <section style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 12, color: '#9ca3c7' }}>Filter by category:</label>
          <select
            style={filterSelectStyle}
            value={filter}
            onChange={(e) => setFilter(e.target.value as PolicyCategory | 'all')}
          >
            <option value="all">All Categories</option>
            <option value="general">General</option>
            <option value="legal">Legal</option>
            <option value="financial">Financial</option>
            <option value="privacy">Privacy</option>
            <option value="custom">Custom</option>
          </select>
          <span style={{ fontSize: 11, color: '#9ca3c7' }}>
            {policies.length} polic{policies.length !== 1 ? 'ies' : 'y'}
          </span>
        </section>

        {/* Error */}
        {error && (
          <div style={errorBannerStyle}>
            {error}
            <button
              type="button"
              onClick={fetchPolicies}
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
        {loading && !policies.length && (
          <div style={{ marginTop: 20, color: '#9ca3c7', fontSize: 13 }}>
            Loading policies...
          </div>
        )}

        {/* Empty state */}
        {!loading && policies.length === 0 && !error && (
          <div style={emptyStyle}>
            <div style={{ fontSize: 28, opacity: 0.4, marginBottom: 8 }}>&#x1F6E1;</div>
            <div style={{ marginBottom: 8 }}>No compliance policies defined yet.</div>
            <div style={{ fontSize: 11, color: '#9ca3c7', marginBottom: 12 }}>
              Create policies to check documents against your workspace's business rules.
              Start from a built-in template or define your own.
            </div>
            <button
              type="button"
              onClick={() => setEditorMode('create')}
              style={addButtonStyle}
            >
              + Create First Policy
            </button>
          </div>
        )}

        {/* Policies table */}
        {policies.length > 0 && (
          <section style={{ marginTop: 16 }}>
            <div style={tableShellStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, minWidth: 150 }}>Name</th>
                    <th style={thStyle}>Category</th>
                    <th style={thStyle}>Rule Type</th>
                    <th style={{ ...thStyle, minWidth: 160 }}>Config</th>
                    <th style={thStyle}>Severity</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Enabled</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Auto</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((p) => {
                    const sevStyle = SEVERITY_STYLES[p.severity];
                    return (
                      <tr key={p.id}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{p.name}</div>
                          {p.description && (
                            <div style={{ fontSize: 10, color: '#9ca3c7', marginTop: 2 }}>
                              {p.description.length > 60 ? p.description.slice(0, 60) + '...' : p.description}
                            </div>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <span style={categoryBadgeStyle}>
                            {CATEGORY_LABELS[p.category] ?? p.category}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>
                          {RULE_TYPE_LABELS[p.ruleType] ?? p.ruleType}
                        </td>
                        <td style={{ ...tdStyle, fontSize: 11 }}>
                          {summariseConfig(p.ruleType, p.ruleConfig)}
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
                            {p.severity.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleToggle(p)}
                            disabled={toggling === p.id}
                            style={{
                              ...toggleBtnStyle,
                              background: p.enabled
                                ? 'rgba(34, 197, 94, 0.2)'
                                : 'rgba(148, 163, 184, 0.1)',
                              color: p.enabled ? '#86efac' : '#9ca3c7',
                              border: p.enabled
                                ? '1px solid rgba(34, 197, 94, 0.4)'
                                : '1px solid rgba(148, 163, 184, 0.3)',
                            }}
                          >
                            {toggling === p.id ? '...' : p.enabled ? 'ON' : 'OFF'}
                          </button>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 500,
                            color: p.autoCheck ? '#86efac' : '#9ca3c7',
                          }}>
                            {p.autoCheck ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <button
                            type="button"
                            style={actionBtnStyle}
                            onClick={() => setEditorMode(p)}
                            title="Edit policy"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            style={{ ...actionBtnStyle, color: '#fca5a5', borderColor: 'rgba(239,68,68,0.3)' }}
                            onClick={() => {
                              if (deleting === p.id) return;
                              if (window.confirm(`Delete policy "${p.name}"?`)) {
                                handleDelete(p.id);
                              }
                            }}
                            disabled={deleting === p.id}
                            title="Delete policy"
                          >
                            {deleting === p.id ? '...' : 'Delete'}
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

      {/* Policy Editor Modal */}
      {editorMode !== null && workspaceId && (
        <PolicyEditor
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

const categoryBadgeStyle: CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 500,
  background: 'rgba(139, 92, 246, 0.12)',
  color: '#c4b5fd',
  textTransform: 'capitalize',
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
