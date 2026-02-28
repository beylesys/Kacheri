/**
 * ActivityFeed — Slice S3 (Phase A)
 *
 * Renders recent workspace activity below the product cards on the homepage.
 * Aggregates docs edits, canvas activity, entity discoveries, and JAAL research.
 * Auto-refreshes every 60 seconds.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchActivityFeed, type ActivityItem } from '../api/activityFeed';
import './activityFeed.css';

// ── Helpers ──

const REFRESH_INTERVAL_MS = 60_000;

/** Format an ISO timestamp as a relative time string. */
function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;

  // Older than a week — show short date
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/** Get the navigation path for an activity item. */
function getItemPath(item: ActivityItem): string | null {
  switch (item.itemType) {
    case 'document':
      return item.itemId ? `/doc/${item.itemId}` : null;
    case 'canvas':
      return item.itemId ? `/canvas/${item.itemId}` : null;
    case 'entity':
      return item.itemId ? `/knowledge?entity=${item.itemId}` : null;
    case 'research':
      // JAAL routes don't exist yet (S10+)
      return null;
    default:
      return null;
  }
}

// ── Skeleton loader ──

function FeedSkeleton() {
  return (
    <div className="activity-feed-skeleton" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="activity-skeleton-row">
          <div className="activity-skeleton-dot" />
          <div
            className="activity-skeleton-bar activity-skeleton-bar-wide"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
          <div
            className="activity-skeleton-bar activity-skeleton-bar-narrow"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        </div>
      ))}
    </div>
  );
}

// ── Component ──

interface ActivityFeedProps {
  workspaceId: string | null;
}

export function ActivityFeed({ workspaceId }: ActivityFeedProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFeed = useCallback(
    async (showLoader: boolean) => {
      if (!workspaceId) return;

      if (showLoader) setLoading(true);
      setError(null);

      try {
        const data = await fetchActivityFeed(workspaceId, 20);
        setItems(data.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load activity');
      } finally {
        setLoading(false);
      }
    },
    [workspaceId],
  );

  // Initial load + reload when workspace changes
  useEffect(() => {
    loadFeed(true);
  }, [loadFeed]);

  // Auto-refresh every 60 seconds (silent — no loader)
  useEffect(() => {
    if (!workspaceId) return;

    const timer = setInterval(() => {
      loadFeed(false);
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [workspaceId, loadFeed]);

  // Don't render anything until workspace is available
  if (!workspaceId) return null;

  const handleItemClick = (item: ActivityItem) => {
    const path = getItemPath(item);
    if (path) navigate(path);
  };

  const handleItemKeyDown = (e: React.KeyboardEvent, item: ActivityItem) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleItemClick(item);
    }
  };

  return (
    <section className="activity-feed" aria-label="Recent workspace activity">
      <div className="activity-feed-header">
        <h2 className="activity-feed-title">Recent Activity</h2>
      </div>

      {loading ? (
        <FeedSkeleton />
      ) : error ? (
        <div className="activity-feed-error">{error}</div>
      ) : items.length === 0 ? (
        <div className="activity-feed-empty">No recent activity</div>
      ) : (
        <div className="activity-feed-list" role="feed">
          {items.map((item) => {
            const clickable = getItemPath(item) !== null;
            return (
              <div
                key={item.id}
                className="activity-item"
                role="article"
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => handleItemClick(item) : undefined}
                onKeyDown={
                  clickable ? (e) => handleItemKeyDown(e, item) : undefined
                }
                style={clickable ? undefined : { cursor: 'default' }}
              >
                <span
                  className="activity-item-badge"
                  data-source={item.productSource}
                  aria-label={item.productSource}
                />
                <div className="activity-item-content">
                  <span className="activity-item-title">{item.title}</span>
                  <span className="activity-item-action">{item.action}</span>
                  <span className="activity-item-actor">
                    by {item.actorName}
                  </span>
                </div>
                <span className="activity-item-time">
                  {formatRelativeTime(item.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
