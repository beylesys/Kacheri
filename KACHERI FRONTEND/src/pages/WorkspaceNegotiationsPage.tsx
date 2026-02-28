// KACHERI FRONTEND/src/pages/WorkspaceNegotiationsPage.tsx
// Workspace Negotiations management page.
// All workspace members (viewer+) can browse negotiations, stats, and filter.
// No create button — negotiations are created from the editor per document.
//
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md — Slice 18

import { useEffect, useState, useRef, useCallback, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../workspace/WorkspaceContext';
import { negotiationWorkspaceApi } from '../api/negotiations';
import type {
  WorkspaceNegotiationItem,
  NegotiationStats,
  NegotiationStatus,
  ListWorkspaceNegotiationsOptions,
} from '../types/negotiation';

/* ---------- Helpers ---------- */

const STATUS_LABELS: Record<NegotiationStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  awaiting_response: 'Awaiting Response',
  reviewing: 'Reviewing',
  settled: 'Settled',
  abandoned: 'Abandoned',
};

const STATUS_STYLES: Record<NegotiationStatus, { bg: string; color: string; border: string }> = {
  draft:             { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', border: 'rgba(148,163,184,0.4)' },
  active:            { bg: 'rgba(59,130,246,0.15)',  color: '#93bbfd', border: 'rgba(59,130,246,0.4)' },
  awaiting_response: { bg: 'rgba(251,146,60,0.15)',  color: '#fdba74', border: 'rgba(251,146,60,0.4)' },
  reviewing:         { bg: 'rgba(167,139,250,0.15)', color: '#c4b5fd', border: 'rgba(167,139,250,0.4)' },
  settled:           { bg: 'rgba(34,197,94,0.15)',   color: '#86efac', border: 'rgba(34,197,94,0.4)' },
  abandoned:         { bg: 'rgba(239,68,68,0.12)',   color: '#fca5a5', border: 'rgba(239,68,68,0.35)' },
};

function formatDate(ts: string): string {
  try {
    const n = Number(ts);
    const d = isNaN(n) ? new Date(ts) : new Date(n);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '\u2014';
  }
}

function formatRate(rate: number | null): string {
  if (rate === null) return '\u2014';
  return `${Math.round(rate)}%`;
}

function formatAvg(avg: number | null): string {
  if (avg === null) return '\u2014';
  return avg.toFixed(1);
}

const PAGE_SIZE = 20;

/* ---------- Page Component ---------- */

export default function WorkspaceNegotiationsPage() {
  const navigate = useNavigate();
  const { currentWorkspace, workspaceId } = useWorkspace();

  // Stats
  const [stats, setStats] = useState<NegotiationStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Negotiations list
  const [negotiations, setNegotiations] = useState<WorkspaceNegotiationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<NegotiationStatus | 'all'>('all');
  const [counterpartySearch, setCounterpartySearch] = useState('');
  const [counterpartyDebounced, setCounterpartyDebounced] = useState('');
  const [offset, setOffset] = useState(0);

  // Debounce timer ref
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce counterparty search input
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setCounterpartyDebounced(counterpartySearch);
      setOffset(0);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [counterpartySearch]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    if (!workspaceId) return;
    setStatsLoading(true);
    try {
      const res = await negotiationWorkspaceApi.stats(workspaceId);
      setStats(res.stats);
    } catch {
      // Non-fatal — list still works
    } finally {
      setStatsLoading(false);
    }
  }, [workspaceId]);

  // Fetch negotiation list
  const fetchNegotiations = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const opts: ListWorkspaceNegotiationsOptions = {
        limit: PAGE_SIZE,
        offset,
      };
      if (filterStatus !== 'all') opts.status = filterStatus;
      if (counterpartyDebounced) opts.counterparty = counterpartyDebounced;
      const res = await negotiationWorkspaceApi.list(workspaceId, opts);
      setNegotiations(res.negotiations);
      setTotal(res.total);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load negotiations';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, filterStatus, counterpartyDebounced, offset]);

  // Effects
  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    fetchNegotiations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, filterStatus, counterpartyDebounced, offset]);

  // Derived values
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  // Handlers
  const handleRowClick = (item: WorkspaceNegotiationItem) => {
    navigate(`/doc/${item.docId}`);
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

  /* ---------- Render ---------- */

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        {/* Header */}
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>NEGOTIATIONS</div>
            <h1 style={titleStyle}>{currentWorkspace.name}</h1>
            <p style={subtitleStyle}>
              Browse all negotiation sessions across your workspace documents.
            </p>
          </div>
          <div style={headerRightStyle}>
            <button type="button" style={backButtonStyle} onClick={() => navigate('/')}>
              &larr; Back
            </button>
          </div>
        </header>

        {/* Stats Bar */}
        {!statsLoading && stats && (
          <section style={statsBarStyle}>
            <div style={statCardStyle}>
              <div style={statValueStyle}>{stats.active}</div>
              <div style={statLabelStyle}>Active</div>
            </div>
            <div style={statCardStyle}>
              <div style={statValueStyle}>{stats.settledThisMonth}</div>
              <div style={statLabelStyle}>Settled This Month</div>
            </div>
            <div style={statCardStyle}>
              <div style={statValueStyle}>{formatAvg(stats.averageRounds)}</div>
              <div style={statLabelStyle}>Avg. Rounds</div>
            </div>
            <div style={statCardStyle}>
              <div style={{
                ...statValueStyle,
                color: stats.overallAcceptanceRate !== null && stats.overallAcceptanceRate >= 60
                  ? '#86efac'
                  : stats.overallAcceptanceRate !== null && stats.overallAcceptanceRate >= 40
                    ? '#fbbf24'
                    : '#e5e7ff',
              }}>
                {formatRate(stats.overallAcceptanceRate)}
              </div>
              <div style={statLabelStyle}>Acceptance Rate</div>
            </div>
          </section>
        )}

        {/* Filter Bar */}
        <section style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: '#9ca3c7' }}>Status:</label>
          <select
            style={filterSelectStyle}
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value as NegotiationStatus | 'all'); setOffset(0); }}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="awaiting_response">Awaiting Response</option>
            <option value="reviewing">Reviewing</option>
            <option value="settled">Settled</option>
            <option value="abandoned">Abandoned</option>
            <option value="draft">Draft</option>
          </select>
          <label style={{ fontSize: 12, color: '#9ca3c7' }}>Counterparty:</label>
          <input
            type="text"
            placeholder="Search counterparty..."
            value={counterpartySearch}
            onChange={(e) => setCounterpartySearch(e.target.value)}
            style={searchInputStyle}
          />
          <span style={{ fontSize: 11, color: '#9ca3c7', marginLeft: 'auto' }}>
            {total} negotiation{total !== 1 ? 's' : ''}
          </span>
        </section>

        {/* Error Banner */}
        {error && (
          <div style={errorBannerStyle}>
            {error}
            <button
              type="button"
              onClick={fetchNegotiations}
              style={{ ...retryButtonStyle, marginLeft: 10 }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div style={{ marginTop: 32, textAlign: 'center', color: '#9ca3c7', fontSize: 13 }}>
            Loading negotiations...
          </div>
        )}

        {/* Empty State */}
        {!loading && negotiations.length === 0 && !error && (
          <div style={emptyStyle}>
            <div style={{ fontSize: 28, opacity: 0.4, marginBottom: 8 }}>&#x1F91D;</div>
            {counterpartyDebounced || filterStatus !== 'all' ? (
              <>
                <div style={{ marginBottom: 8 }}>No negotiations match your filters.</div>
                <button
                  type="button"
                  onClick={() => { setCounterpartySearch(''); setFilterStatus('all'); setOffset(0); }}
                  style={retryButtonStyle}
                >
                  Clear Filters
                </button>
              </>
            ) : (
              <>
                <div style={{ marginBottom: 8 }}>No negotiations in this workspace yet.</div>
                <div style={{ fontSize: 11, color: '#9ca3c7', marginBottom: 12 }}>
                  Start a negotiation from any document&rsquo;s editor by opening the Negotiate panel.
                </div>
              </>
            )}
          </div>
        )}

        {/* Negotiations Table */}
        {!loading && negotiations.length > 0 && (
          <section style={{ marginTop: 20 }}>
            <div style={tableShellStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, minWidth: 180 }}>Document</th>
                    <th style={thStyle}>Counterparty</th>
                    <th style={thStyle}>Status</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Rounds</th>
                    <th style={thStyle}>Changes</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {negotiations.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => handleRowClick(item)}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(30,64,175,0.15)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = '';
                      }}
                    >
                      {/* Document */}
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>
                          {item.docTitle.length > 50 ? item.docTitle.slice(0, 50) + '\u2026' : item.docTitle}
                        </div>
                        <div style={{ fontSize: 10, color: '#9ca3c7', marginTop: 1 }}>{item.title}</div>
                      </td>

                      {/* Counterparty */}
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500, fontSize: 12 }}>{item.counterpartyName}</div>
                        {item.counterpartyLabel && (
                          <div style={{ fontSize: 10, color: '#9ca3c7', marginTop: 1 }}>{item.counterpartyLabel}</div>
                        )}
                      </td>

                      {/* Status */}
                      <td style={tdStyle}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: 0.5,
                          background: STATUS_STYLES[item.status].bg,
                          color: STATUS_STYLES[item.status].color,
                          border: `1px solid ${STATUS_STYLES[item.status].border}`,
                        }}>
                          {STATUS_LABELS[item.status]}
                        </span>
                      </td>

                      {/* Rounds */}
                      <td style={{ ...tdStyle, textAlign: 'center', fontSize: 11, fontWeight: 600 }}>
                        {item.currentRound}
                      </td>

                      {/* Changes */}
                      <td style={tdStyle}>
                        <span style={{ fontSize: 11 }}>
                          <span style={{ color: '#86efac' }}>{item.acceptedChanges}</span>
                          {' / '}
                          <span style={{ color: '#fca5a5' }}>{item.rejectedChanges}</span>
                          {' / '}
                          <span style={{ color: '#fbbf24' }}>{item.pendingChanges}</span>
                        </span>
                        <div style={{ fontSize: 9, color: '#9ca3c7', marginTop: 1 }}>
                          acc / rej / pend
                        </div>
                      </td>

                      {/* Last Activity */}
                      <td style={{ ...tdStyle, textAlign: 'right', fontSize: 11, color: '#9ca3c7' }}>
                        {formatDate(item.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={paginationStyle}>
            <button
              type="button"
              style={pageBtnStyle}
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Prev
            </button>
            <span style={{ fontSize: 11, color: '#9ca3c7' }}>
              Page {currentPage} of {totalPages} &middot; Showing {offset + 1}&ndash;{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <button
              type="button"
              style={pageBtnStyle}
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Styles ---------- */

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(180deg, #0f172a 0%, #0a0f1e 100%)',
  color: '#e5e7ff',
  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
};

const shellStyle: CSSProperties = {
  maxWidth: 1100,
  margin: '0 auto',
  padding: '24px 40px 60px',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 20,
};

const headerRightStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexShrink: 0,
  paddingTop: 4,
};

const eyebrowStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#818cf8',
  textTransform: 'uppercase',
  letterSpacing: 1.5,
  marginBottom: 4,
};

const titleStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  color: '#e5e7ff',
  margin: '0 0 4px',
  lineHeight: 1.2,
};

const subtitleStyle: CSSProperties = {
  fontSize: 13,
  color: '#9ca3c7',
  margin: 0,
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

const statsBarStyle: CSSProperties = {
  marginTop: 20,
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 12,
};

const statCardStyle: CSSProperties = {
  padding: '12px 16px',
  borderRadius: 10,
  border: '1px solid rgba(30,64,175,0.5)',
  background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,64,175,0.12))',
  textAlign: 'center',
};

const statValueStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  color: '#e5e7ff',
};

const statLabelStyle: CSSProperties = {
  fontSize: 10,
  color: '#9ca3c7',
  textTransform: 'uppercase',
  letterSpacing: 1,
  marginTop: 2,
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

const searchInputStyle: CSSProperties = {
  padding: '5px 10px',
  fontSize: 12,
  color: '#e5e7ff',
  background: 'rgba(15, 23, 42, 0.6)',
  border: '1px solid rgba(148,163,184,0.3)',
  borderRadius: 6,
  outline: 'none',
  minWidth: 160,
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

const paginationStyle: CSSProperties = {
  marginTop: 12,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
};

const pageBtnStyle: CSSProperties = {
  padding: '4px 12px',
  fontSize: 11,
  color: '#93c5fd',
  background: 'transparent',
  border: '1px solid rgba(59,130,246,0.3)',
  borderRadius: 4,
  cursor: 'pointer',
};
