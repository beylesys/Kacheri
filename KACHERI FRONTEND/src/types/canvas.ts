// KACHERI FRONTEND/src/types/canvas.ts
// Design Studio: TypeScript types for canvases, frames, conversations,
// versions, exports, assets, and permissions.
//
// These types mirror the backend schemas defined in:
//   - KACHERI BACKEND/src/store/canvases.ts
//   - KACHERI BACKEND/src/store/canvasFrames.ts
//   - KACHERI BACKEND/src/store/canvasConversations.ts
//   - KACHERI BACKEND/src/store/canvasVersions.ts
//   - KACHERI BACKEND/src/store/canvasExports.ts
//   - KACHERI BACKEND/src/store/canvasAssets.ts
//   - KACHERI BACKEND/src/store/canvasPermissions.ts
//
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 4, Slice C1

/* ============= Enums (Union Literal Types) ============= */

export type CompositionMode = 'deck' | 'page' | 'notebook' | 'widget';

export type CanvasTransition = 'none' | 'fade' | 'slide' | 'zoom';

export type ConversationRole = 'user' | 'assistant' | 'system';

export type ActionType = 'generate' | 'edit' | 'style' | 'content' | 'compose';

export type ExportFormat =
  | 'pdf'
  | 'pptx'
  | 'html_bundle'
  | 'html_standalone'
  | 'png'
  | 'svg'
  | 'embed'
  | 'mp4';

export type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type AssetType = 'image' | 'font' | 'icon' | 'video' | 'audio' | 'other';

export type AssetSource = 'upload' | 'ai_generated' | 'external';

export type CanvasRole = 'owner' | 'editor' | 'viewer';

/* ============= Domain Types ============= */

/** Top-level canvas container */
export type Canvas = {
  id: string;
  title: string;
  description: string | null;
  workspaceId: string;
  createdBy: string;
  compositionMode: CompositionMode;
  themeJson: Record<string, unknown> | null;
  kclVersion: string;
  isLocked: boolean;
  lockedBy: string | null;
  lockedAt: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  workspaceAccess: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

/** A single frame within a canvas */
export type CanvasFrame = {
  id: string;
  canvasId: string;
  title: string | null;
  code: string;
  codeHash: string | null;
  sortOrder: number;
  speakerNotes: string | null;
  thumbnailUrl: string | null;
  durationMs: number;
  transition: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

/** A conversation message in the AI chat */
export type ConversationMessage = {
  id: string;
  canvasId: string;
  frameId: string | null;
  role: ConversationRole;
  content: string;
  actionType: ActionType | null;
  docRefs: DocRef[] | null;
  proofId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

/** A named version snapshot (summary — no snapshot payload) */
export type CanvasVersion = {
  id: string;
  canvasId: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
};

/** An export job record */
export type CanvasExport = {
  id: string;
  canvasId: string;
  format: ExportFormat;
  status: ExportStatus;
  filePath: string | null;
  fileSize: number | null;
  proofId: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
};

/** A canvas asset (image, font, etc.) */
export type CanvasAsset = {
  id: string;
  canvasId: string;
  workspaceId: string;
  assetType: AssetType;
  name: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  source: AssetSource;
  proofId: string | null;
  metadata: Record<string, unknown> | null;
  createdBy: string;
  createdAt: string;
};

/** A reusable frame template */
export type CanvasTemplate = {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
  code: string;
  thumbnailUrl: string | null;
  tags: string[];
  compositionMode: CompositionMode | null;
  isPublic: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/** Per-canvas permission override */
export type CanvasPermissionMeta = {
  canvasId: string;
  userId: string;
  role: CanvasRole;
  grantedBy: string;
  grantedAt: string;
};

/** Canvas with its frames (GET /canvases/:cid response) */
export type CanvasWithFrames = Canvas & { frames: CanvasFrame[] };

/** A document reference used in AI generation */
export type DocRef = {
  docId: string;
  section?: string;
  textUsed?: string;
  textHash?: string;
  sourceType?: string;
};

/* ============= API Request Types ============= */

export type CreateCanvasParams = {
  title?: string;
  description?: string;
  compositionMode?: CompositionMode;
};

export type ListCanvasesParams = {
  limit?: number;
  offset?: number;
  sortBy?: 'updated_at' | 'created_at' | 'title';
  sortDir?: 'asc' | 'desc';
};

export type UpdateCanvasParams = {
  title?: string;
  description?: string | null;
  compositionMode?: CompositionMode;
  themeJson?: Record<string, unknown> | null;
  kclVersion?: string;
};

export type GenerateFrameParams = {
  prompt: string;
  frameContext?: string;
  docRefs?: string[];
  compositionMode?: CompositionMode;
  provider?: string;
  model?: string;
  includeMemoryContext?: boolean;
};

export type EditFrameParams = {
  prompt: string;
  frameId: string;
  provider?: string;
  model?: string;
};

export type StyleFrameParams = {
  prompt: string;
  frameIds: string[];
  provider?: string;
  model?: string;
};

export type GenerateImageParams = {
  prompt: string;
  size?: '1024x1024' | '1024x1792' | '1792x1024';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
};

export type CreateVersionParams = {
  name: string;
  description?: string;
};

export type TriggerExportParams = {
  format: ExportFormat;
  metadata?: Record<string, unknown>;
};

export type GetConversationParams = {
  limit?: number;
  offset?: number;
};

export type CreateTemplateParams = {
  title: string;
  code: string;
  description?: string;
  tags?: string[];
  compositionMode?: CompositionMode;
  thumbnailUrl?: string;
};

export type UpdateTemplateParams = {
  title?: string;
  description?: string | null;
  tags?: string[];
  compositionMode?: CompositionMode | null;
  thumbnailUrl?: string | null;
};

export type ListTemplatesParams = {
  limit?: number;
  offset?: number;
  tag?: string;
  compositionMode?: CompositionMode;
};

/* ============= API Response Types ============= */

/** Response from GET /workspaces/:wid/canvases */
export type ListCanvasesResponse = {
  workspaceId: string;
  canvases: Canvas[];
  total: number;
  limit: number;
  offset: number;
};

/** Response from GET /workspaces/:wid/canvases/search */
export type SearchCanvasesResponse = {
  workspaceId: string;
  canvases: Canvas[];
  total: number;
  query: string;
};

/** Response from POST /canvases/:cid/ai/generate, edit, style */
export type GenerateFrameResponse = {
  conversationId: string;
  frames: CanvasFrame[];
  docRefs?: DocRef[];
  proofId?: string;
  provider: string;
  model: string;
  validation: {
    valid: boolean;
    warnings: number;
  };
  memoryContextUsed: boolean;
  memoryEntityCount: number;
  /** Clarification message from AI (present when AI asks questions instead of generating) */
  message?: string;
  /** True when the AI responded with clarifying questions instead of code */
  isClarification?: boolean;
  /** True when the response is a structured slide outline (subset of clarification) */
  isOutline?: boolean;
};

/** Response from GET /canvases/:cid/conversation */
export type ConversationResponse = {
  canvasId: string;
  messages: ConversationMessage[];
  total: number;
  limit: number;
  offset: number;
};

/** Response from POST /canvases/:cid/ai/image */
export type GenerateImageResponse = {
  assetId: string;
  url: string;
  filename: string;
  hash: string;
  bytes: number;
  mimeType: string;
  width: number;
  height: number;
  revisedPrompt: string;
  proofId: string;
  provider: string;
  model: string;
  creditsRemaining: number;
  conversationId: string;
};

/** Response from POST /canvases/:cid/versions/:vid/restore */
export type RestoreVersionResponse = CanvasWithFrames & {
  restoredFrom: {
    versionId: string;
    versionName: string;
  };
};

/** Response from GET /canvases/:cid/versions */
export type ListVersionsResponse = {
  canvasId: string;
  versions: CanvasVersion[];
  total: number;
  limit: number;
  offset: number;
};

/** Response from GET /canvases/:cid/permissions */
export type ListPermissionsResponse = {
  canvasId: string;
  permissions: CanvasPermissionMeta[];
};

/** Response from GET /workspaces/:wid/templates */
export type ListTemplatesResponse = {
  workspaceId: string;
  templates: CanvasTemplate[];
  total: number;
  limit: number;
  offset: number;
};

/** Response from GET /workspaces/:wid/templates/tags */
export type ListTagsResponse = {
  workspaceId: string;
  tags: string[];
};

/** E7: Workspace embed whitelist response */
export type EmbedWhitelistResponse = {
  defaults: string[];
  custom: string[];
  effective: string[];
};
