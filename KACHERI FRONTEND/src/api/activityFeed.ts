// KACHERI FRONTEND/src/api/activityFeed.ts
// API client for workspace activity feed. Slice S3 (Phase A).

export interface ActivityItem {
  id: string;
  productSource: string;
  itemType: string;
  itemId: string;
  title: string;
  action: string;
  timestamp: string;
  actorName: string;
}

export interface ActivityFeedResponse {
  items: ActivityItem[];
}

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  (import.meta as any).env?.VITE_API_URL ??
  '/api';

function authHeader(): Record<string, string> {
  try {
    const token =
      typeof localStorage !== 'undefined' && localStorage.getItem('accessToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function devUserHeader(): Record<string, string> {
  try {
    const u =
      (typeof localStorage !== 'undefined' && localStorage.getItem('devUser')) ||
      '';
    return u ? { 'X-Dev-User': u } : {};
  } catch {
    return {};
  }
}

/**
 * Fetch the workspace activity feed.
 *
 * @param workspaceId - The workspace to query
 * @param limit - Max items to return (default 20, max 100)
 */
export async function fetchActivityFeed(
  workspaceId: string,
  limit: number = 20,
): Promise<ActivityFeedResponse> {
  const url = `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/activity?limit=${limit}`;

  const res = await fetch(url, {
    headers: {
      ...authHeader(),
      ...devUserHeader(),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    let errorMessage = `API ${res.status}: ${text || res.statusText}`;
    try {
      const json = JSON.parse(text);
      if (json.error) errorMessage = json.error;
    } catch {
      // ignore parse failure
    }
    throw new Error(errorMessage);
  }

  return res.json() as Promise<ActivityFeedResponse>;
}
