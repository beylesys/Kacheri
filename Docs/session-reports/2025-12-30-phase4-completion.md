# Phase 4: Workspace Collaboration & Messaging Layer — Completion Tracker

**Date:** 2025-12-30
**Goal:** Complete remaining Phase 4 gaps
**Status:** COMPLETE (P1 + P2 + P3: Messaging + Notifications + Settings + @Mentions + Typing Indicators + Invites)

---

## Pre-Work Checklist

- [x] Analyzed current implementation
- [x] Identified gaps against blueprint
- [x] Prioritized work items
- [x] Complete all P1 items
- [x] Complete all P2 items
- [x] Complete all P3 items

---

## Work Scope

### P1 - CRITICAL (Must Complete)

#### 1. Persistent Messaging System
**Status:** [x] COMPLETE

**Backend Tasks:**
- [x] Create `messages` table in db.ts
- [x] Create `src/store/messages.ts` with CRUD operations
- [x] Create `src/routes/messages.ts` with endpoints:
  - `GET /workspaces/:id/messages` (paginated, limit/before)
  - `POST /workspaces/:id/messages` (create message)
  - `PATCH /messages/:id` (edit own message)
  - `DELETE /messages/:id` (soft delete)
- [x] Add `message` event type to `realtime/types.ts`
- [x] Broadcast message events via WebSocket
- [x] Register routes in `server.ts`
- [x] Update API_CONTRACT.md

**Frontend Tasks:**
- [x] Create `src/api/messages.ts` API client
- [x] Create `src/hooks/useMessages.ts` hook
- [x] Create `src/components/chat/ChatWidget.tsx` floating widget
- [x] Create `src/components/chat/ChatPanel.tsx` main panel
- [x] Create `src/components/chat/ChatMessage.tsx` message bubble
- [x] Create `src/components/chat/ChatInput.tsx` input with send
- [x] Create `src/components/chat/chatWidget.css` styles
- [x] Create `src/components/AppLayout.tsx` for shared UI
- [x] Integrate floating ChatWidget into App.tsx
- [x] Handle WebSocket message events for real-time updates

---

#### 2. Notification System
**Status:** [x] COMPLETE

**Backend Tasks:**
- [x] Create `notifications` table in db.ts
- [x] Create `src/store/notifications.ts` with operations:
  - createNotification()
  - listNotifications(userId, options)
  - markAsRead(id, userId)
  - markAllAsRead(userId, workspaceId?)
  - getUnreadCount(userId, workspaceId?)
  - deleteNotification(id, userId)
- [x] Create `src/routes/notifications.ts` with endpoints:
  - `GET /notifications` (list for current user)
  - `GET /notifications/count`
  - `POST /notifications/:id/read`
  - `POST /notifications/read-all`
  - `DELETE /notifications/:id`
- [x] Add notification triggers in existing code:
  - Comment mention → notification (comments.ts)
  - Comment reply → notification to thread author (comments.ts)
  - Doc shared with user → notification (docPermissions.ts)
- [x] Add `notification` event type to `realtime/types.ts`
- [x] Broadcast notifications via WebSocket (broadcastToUser)
- [x] Update globalHub.ts with user tracking
- [x] Update workspaceWs.ts to track user connections
- [x] Register routes in `server.ts`
- [x] Update API_CONTRACT.md

**Frontend Tasks:**
- [x] Create `src/api/notifications.ts` API client
- [x] Create `src/hooks/useNotifications.ts` hook
- [x] Create `src/components/notifications/NotificationBell.tsx` with badge
- [x] Create `src/components/notifications/NotificationPanel.tsx` dropdown
- [x] Create `src/components/notifications/NotificationItem.tsx` item
- [x] Create `src/components/notifications/notifications.css` styles
- [x] Add NotificationBell to EditorPage toolbar
- [x] Handle WebSocket notification events
- [x] Click notification → navigate to link

---

### P2 - IMPORTANT (Should Complete)

#### 3. Workspace Settings UI
**Status:** [x] COMPLETE

**Frontend Tasks:**
- [x] Create `src/components/workspace/WorkspaceSettingsModal.tsx`
  - General tab: name, description edit
  - Members tab: list members, change roles, remove
  - Danger zone: delete workspace (owner only)
- [x] Create `src/components/workspace/MemberRow.tsx` for member list
- [x] Add "Settings" button to FileManagerPage workspace header
- [x] Wire up workspace API calls (update, delete, member management)

---

#### 4. @Mentions in Chat
**Status:** [x] COMPLETE

**Backend Tasks:**
- [x] Create `message_mentions` table
- [x] Accept mentions array on message create
- [x] Insert mention records
- [x] Trigger notification on mention

**Frontend Tasks:**
- [x] Add @mention autocomplete to ChatInput
- [x] Highlight @mentions in rendered messages
- [x] Autocomplete workspace members on @ trigger

---

### P3 - NICE TO HAVE (Optional)

#### 5. Typing Indicators
**Status:** [x] COMPLETE

#### 6. Member Invite Flow
**Status:** [x] COMPLETE

---

## Progress Log

### Session 1: 2025-12-30 (Continued)

**Focus:** P1 - Persistent Messaging + Notification System

#### Completed:

**Backend:**
1. Added `messages` and `notifications` tables to db.ts with proper indexes
2. Created `store/messages.ts` with full CRUD operations
3. Created `store/notifications.ts` with full CRUD operations
4. Created `routes/messages.ts` with REST endpoints
5. Created `routes/notifications.ts` with REST endpoints
6. Updated `realtime/types.ts` with `message` and `notification` event types
7. Updated `globalHub.ts` with `broadcastToUser` function and user tracking
8. Updated `workspaceWs.ts` to track user workspace connections
9. Added notification triggers to `comments.ts` (mentions, replies)
10. Added notification triggers to `docPermissions.ts` (doc_shared)
11. Registered routes in `server.ts`

**Frontend:**
1. Created `api/messages.ts` API client
2. Created `api/notifications.ts` API client
3. Created `hooks/useMessages.ts` with state management
4. Created `hooks/useNotifications.ts` with state management
5. Created `components/chat/ChatWidget.tsx` - floating bottom-right widget
6. Created `components/chat/ChatPanel.tsx` - main chat panel
7. Created `components/chat/ChatMessage.tsx` - message bubble
8. Created `components/chat/ChatInput.tsx` - input with send button
9. Created `components/chat/chatWidget.css` - styling
10. Created `components/notifications/NotificationBell.tsx` - bell with badge
11. Created `components/notifications/NotificationPanel.tsx` - dropdown panel
12. Created `components/notifications/NotificationItem.tsx` - item component
13. Created `components/notifications/notifications.css` - styling
14. Created `components/AppLayout.tsx` - shared layout wrapper
15. Updated `App.tsx` to use AppLayout with floating ChatWidget
16. Updated `EditorPage.tsx` to include NotificationBell in toolbar
17. Updated `hooks/useWorkspaceSocket.ts` with message/notification events

**Documentation:**
1. Updated `API_CONTRACT.md` with Message Endpoints section
2. Updated `API_CONTRACT.md` with Notification Endpoints section
3. Updated `API_CONTRACT.md` WebSocket Events table and payloads

---

## Files Created

| File | Purpose |
|------|---------|
| `BACKEND/src/store/messages.ts` | Message CRUD |
| `BACKEND/src/routes/messages.ts` | Message endpoints |
| `BACKEND/src/store/notifications.ts` | Notification CRUD |
| `BACKEND/src/routes/notifications.ts` | Notification endpoints |
| `FRONTEND/src/api/messages.ts` | Messages API client |
| `FRONTEND/src/api/notifications.ts` | Notifications API client |
| `FRONTEND/src/hooks/useMessages.ts` | Messages data hook |
| `FRONTEND/src/hooks/useNotifications.ts` | Notifications data hook |
| `FRONTEND/src/components/chat/ChatWidget.tsx` | Floating chat widget |
| `FRONTEND/src/components/chat/ChatPanel.tsx` | Chat panel |
| `FRONTEND/src/components/chat/ChatMessage.tsx` | Message bubble |
| `FRONTEND/src/components/chat/ChatInput.tsx` | Chat input |
| `FRONTEND/src/components/chat/chatWidget.css` | Chat styles |
| `FRONTEND/src/components/notifications/NotificationBell.tsx` | Bell icon + badge |
| `FRONTEND/src/components/notifications/NotificationPanel.tsx` | Dropdown panel |
| `FRONTEND/src/components/notifications/NotificationItem.tsx` | Notification row |
| `FRONTEND/src/components/notifications/notifications.css` | Notification styles |
| `FRONTEND/src/components/notifications/index.ts` | Barrel export |
| `FRONTEND/src/components/AppLayout.tsx` | Shared layout wrapper |

## Files Modified

| File | Changes |
|------|---------|
| `BACKEND/src/db.ts` | Added messages, notifications tables |
| `BACKEND/src/server.ts` | Registered message, notification routes |
| `BACKEND/src/realtime/types.ts` | Added message, notification events |
| `BACKEND/src/realtime/globalHub.ts` | Added broadcastToUser, user tracking |
| `BACKEND/src/realtime/workspaceWs.ts` | Track user workspace connections |
| `BACKEND/src/routes/comments.ts` | Notification triggers for mentions/replies |
| `BACKEND/src/routes/docPermissions.ts` | Notification trigger for doc_shared |
| `FRONTEND/src/hooks/useWorkspaceSocket.ts` | Handle message, notification events |
| `FRONTEND/src/App.tsx` | Added AppLayout wrapper with ChatWidget |
| `FRONTEND/src/EditorPage.tsx` | Added NotificationBell to toolbar |
| `Docs/API_CONTRACT.md` | Documented new endpoints and WS events |

---

## Completion Criteria

Phase 4 P1 is complete when:
- [x] Users can send persistent messages in workspace chat
- [x] Chat history loads on page refresh
- [x] Users receive notifications for mentions, comments, shares
- [x] Unread notification count shows in UI
- [x] All new endpoints documented in API_CONTRACT.md

Phase 4 P2 is complete when:
- [x] Workspace settings can be managed from UI
- [x] @Mentions work in chat messages

---

## Session 2: 2025-12-30 (P2 Implementation)

**Focus:** P2 - Workspace Settings UI + @Mentions in Chat

### Completed:

**Workspace Settings UI:**
1. Created `WorkspaceSettingsModal.tsx` with three tabs (General, Members, Danger Zone)
2. Created `MemberRow.tsx` for member list with role dropdown and remove button
3. Created `workspaceSettings.css` with dark theme styling
4. Added Settings button to FileManagerPage header (purple themed)
5. Integrated modal with workspace API (update name/description, manage members, delete)

**@Mentions in Chat:**
1. Added `message_mentions` table to db.ts with indexes
2. Updated messages route to accept `mentions?: string[]` parameter
3. Added mention notification triggers (creates notification + WS broadcast)
4. Updated `ChatInput.tsx` with @mention autocomplete (popup, keyboard nav, Tab/Enter selection)
5. Updated `ChatMessage.tsx` with mention highlighting (regex-based `@userId` detection)
6. Updated `messages.ts` API client with mentions param
7. Updated `ChatPanel.tsx` and `ChatWidget.tsx` to pass workspace members for autocomplete

### Files Created:

| File | Purpose |
|------|---------|
| `FRONTEND/src/components/workspace/WorkspaceSettingsModal.tsx` | Settings modal with tabs |
| `FRONTEND/src/components/workspace/MemberRow.tsx` | Member row component |
| `FRONTEND/src/components/workspace/workspaceSettings.css` | Settings modal styles |

### Files Modified:

| File | Changes |
|------|---------|
| `BACKEND/src/db.ts` | Added message_mentions table |
| `BACKEND/src/routes/messages.ts` | Added mentions handling, notifications |
| `FRONTEND/src/FileManagerPage.tsx` | Added Settings button, modal integration |
| `FRONTEND/src/api/messages.ts` | Added mentions to CreateMessageParams |
| `FRONTEND/src/components/chat/ChatInput.tsx` | Added @mention autocomplete |
| `FRONTEND/src/components/chat/ChatMessage.tsx` | Added mention highlighting |
| `FRONTEND/src/components/chat/ChatPanel.tsx` | Pass workspaceMembers to ChatInput |
| `FRONTEND/src/components/chat/ChatWidget.tsx` | Fetch members, pass to ChatPanel |
| `FRONTEND/src/components/chat/chatWidget.css` | Added chat mention popup styles |

---

## Architecture Notes

### Chat Widget Approach
- Floating widget in bottom-right corner (fixed position)
- Persistent across all pages via AppLayout wrapper
- State (open/closed) persisted to localStorage
- Real-time updates via WebSocket integration

### Notification Delivery
- Notifications created server-side on trigger events
- WebSocket broadcasts to specific users via `broadcastToUser`
- User workspace connections tracked in globalHub.ts
- Frontend refetches on notification event when panel is open

### WebSocket User Tracking
- `trackUserWorkspace(userId, workspaceId)` called on WS join
- `untrackUserWorkspace(userId, workspaceId)` called on WS leave
- `broadcastToUser(userId, msg)` iterates tracked workspaces to find user connections

---

## Session 3: 2025-12-30 (P3 Implementation)

**Focus:** P3 - Typing Indicators + Member Invite Flow

### Completed:

**Typing Indicators:**
1. Added `typing` event type to `realtime/types.ts` (both client and server events)
2. Updated `workspaceWs.ts` to handle typing broadcast (excludes sender)
3. Updated `useWorkspaceSocket.ts` with typing user tracking and auto-expire (3s timeout)
4. Created `TypingIndicator.tsx` component with animated dots
5. Updated `ChatInput.tsx` with debounced typing detection (500ms idle stops typing)
6. Updated `ChatPanel.tsx` and `ChatWidget.tsx` to pass typing state
7. Added CSS for typing indicator animation in `chatWidget.css`

**Member Invite Flow:**
1. Added `workspace_invites` table to db.ts with token, email, role, expiry tracking
2. Created `workspace/inviteStore.ts` with CRUD operations (create, accept, revoke, list)
3. Created `routes/invites.ts` with REST endpoints for invite management
4. Registered invite routes in `server.ts`
5. Created `api/invites.ts` API client for frontend
6. Created `InviteSection.tsx` for Settings modal (email input, role select, pending list)
7. Created `InviteAcceptPage.tsx` with invite validation and accept flow
8. Updated `WorkspaceSettingsModal.tsx` to add "Invites" tab (admin+ only)
9. Updated `App.tsx` to add `/invite/:token` route

### Files Created:

| File | Purpose |
|------|---------|
| `FRONTEND/src/components/chat/TypingIndicator.tsx` | Typing indicator UI |
| `BACKEND/src/workspace/inviteStore.ts` | Invite CRUD operations |
| `BACKEND/src/routes/invites.ts` | Invite REST endpoints |
| `FRONTEND/src/api/invites.ts` | Invite API client |
| `FRONTEND/src/components/workspace/InviteSection.tsx` | Invite form + list |
| `FRONTEND/src/pages/InviteAcceptPage.tsx` | Accept invite page |
| `FRONTEND/src/pages/InviteAcceptPage.css` | Accept page styles |

### Files Modified:

| File | Changes |
|------|---------|
| `BACKEND/src/realtime/types.ts` | Added typing event types |
| `BACKEND/src/realtime/workspaceWs.ts` | Handle typing broadcast |
| `BACKEND/src/db.ts` | Added workspace_invites table |
| `BACKEND/src/server.ts` | Registered invite routes |
| `FRONTEND/src/hooks/useWorkspaceSocket.ts` | Added typing tracking, sendTyping |
| `FRONTEND/src/components/chat/ChatInput.tsx` | Added debounced typing detection |
| `FRONTEND/src/components/chat/ChatPanel.tsx` | Added typing indicator display |
| `FRONTEND/src/components/chat/ChatWidget.tsx` | Pass typing state through |
| `FRONTEND/src/components/chat/chatWidget.css` | Added typing indicator styles |
| `FRONTEND/src/components/workspace/WorkspaceSettingsModal.tsx` | Added Invites tab |
| `FRONTEND/src/components/workspace/workspaceSettings.css` | Added invite section styles |
| `FRONTEND/src/App.tsx` | Added invite accept route |

---

## Phase 4 P3 Completion Criteria

- [x] Users see typing indicator when others type in chat
- [x] Indicator disappears after user stops typing (3s timeout)
- [x] Multiple typing users shown correctly
- [x] Admin can generate invite links from Settings > Invites
- [x] Invite links contain unique tokens (32 chars, URL-safe)
- [x] Invites expire after 7 days
- [x] Users can accept invites via `/invite/:token` page
- [x] Email validation on accept (if available)
- [x] Admin can revoke pending invites

---

## Phase 4 Complete

All P1, P2, and P3 items have been implemented:

**P1 - Critical:**
- [x] Persistent Messaging System (chat with history)
- [x] Notification System (mentions, replies, shares)

**P2 - Important:**
- [x] Workspace Settings UI (General, Members, Danger Zone)
- [x] @Mentions in Chat (autocomplete, highlight, notifications)

**P3 - Nice to Have:**
- [x] Typing Indicators (real-time via WebSocket)
- [x] Member Invite Flow (token-based, 7-day expiry)

---

## Post-Implementation Bug Fixes

### Bug 1: Frontend `notifications.ts` Import Error

**Error:**
```
Failed to resolve import "./auth" from "src/api/notifications.ts". Does the file exist?
```

**Cause:** The `notifications.ts` API client was importing auth helpers from a non-existent `./auth` module.

**Fix:** Added `authHeader()` and `devUserHeader()` functions inline in `notifications.ts`:
```typescript
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
      (typeof localStorage !== 'undefined' && localStorage.getItem('devUser')) || '';
    return u ? { 'X-Dev-User': u } : {};
  } catch {
    return {};
  }
}
```

---

### Bug 2: Backend `inviteStore.ts` Module Not Found

**Error:**
```
Cannot find module '../store/workspace'
Require stack:
- KACHERI BACKEND\src\workspace\inviteStore.ts
```

**Cause:** Wrong import path - workspace store is located at `./store.ts`, not `../store/workspace`.

**Fix:** Changed import to use the correct path and factory pattern:
```typescript
import { db } from '../db';
import { createWorkspaceStore } from './store';

const workspaceStore = createWorkspaceStore(db);
```

---

### Bug 3: Backend `routes/invites.ts` Import Errors

**Errors:**
- `Cannot find module '../workspace/store'` (wrong path)
- `getUserIdFromRequest is not a function` (wrong function name)

**Cause:**
1. Import path was incorrect for workspace store
2. Auth function name was `getUserId`, not `getUserIdFromRequest`

**Fix:** Corrected imports in `routes/invites.ts`:
```typescript
import { createWorkspaceStore, type WorkspaceStore } from '../workspace/store';
import { getUserId } from '../workspace/middleware';
import { db } from '../db';

const workspaceStore: WorkspaceStore = createWorkspaceStore(db);
```

Also replaced all calls from `getUserIdFromRequest(request)` to `getUserId(request)`.
