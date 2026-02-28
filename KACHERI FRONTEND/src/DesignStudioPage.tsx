// KACHERI FRONTEND/src/DesignStudioPage.tsx
// Top-level page component for the Design Studio.
// Loads canvas data, manages active frame, and renders StudioLayout.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 4, Slice C2

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { canvasApi } from './api/canvas';
import type { CanvasWithFrames, CanvasFrame, GenerateFrameResponse, RestoreVersionResponse } from './types/canvas';
import type { KCLEditableSchema, ElementBounds, GridConfig, LayerElement } from './kcl/types';
import { StudioLayout } from './components/studio/StudioLayout';
import type { SelectedElementInfo, ElementPositionChange } from './components/studio/DragManager';
import { PresentationMode } from './components/studio/PresentationMode';
import { groupElements, ungroupElement, isGroupElement } from './components/studio/GroupManager';
import './components/studio/studio.css';
import {
  useWorkspaceSocket,
} from './hooks/useWorkspaceSocket';
import { useCanvasCollaboration } from './hooks/useCanvasCollaboration';

type StudioMode = 'simple' | 'power' | 'visual';

// ── E9 — Mobile detection hook ──
function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < breakpoint,
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

// ── HTML Code Modification (F2) ──
// Updates frame HTML source when a property changes in Edit Mode.
// Two update paths: attribute-based and data-bound.

function updateFrameCode(
  code: string,
  component: string,
  elementId: string,
  property: string,
  value: unknown,
  isAttribute: boolean,
  propertyType: string,
): string {
  if (!elementId) return code; // Cannot target without ID

  if (isAttribute) {
    return updateAttributeInCode(code, component, elementId, property, value, propertyType);
  }
  return updateDataPropertyInCode(code, elementId, property, value);
}

/** Update an attribute on a KCL element in the HTML string */
function updateAttributeInCode(
  code: string,
  component: string,
  elementId: string,
  attribute: string,
  value: unknown,
  propertyType: string,
): string {
  // Boolean attributes: present = true, absent = false
  if (propertyType === 'boolean') {
    if (value) {
      // Add boolean attribute if not present
      const hasAttr = new RegExp(
        `(<${component}\\b[^>]*\\bid="${escapeRegex(elementId)}"[^>]*)\\b${escapeRegex(attribute)}(?:="[^"]*")?`,
      ).test(code);
      if (hasAttr) return code; // Already present
      // Insert attribute before closing >
      return code.replace(
        new RegExp(`(<${component}\\b[^>]*\\bid="${escapeRegex(elementId)}"[^>]*)(>)`),
        `$1 ${attribute}$2`,
      );
    } else {
      // Remove boolean attribute
      return code.replace(
        new RegExp(`(<${component}\\b[^>]*\\bid="${escapeRegex(elementId)}"[^>]*)\\s+${escapeRegex(attribute)}(?:="[^"]*")?`),
        '$1',
      );
    }
  }

  const strValue = String(value);

  // Try to replace existing attribute value
  const existingAttrRe = new RegExp(
    `(<${component}\\b[^>]*\\bid="${escapeRegex(elementId)}"[^>]*\\b${escapeRegex(attribute)}=")([^"]*)(")`,
  );
  if (existingAttrRe.test(code)) {
    return code.replace(existingAttrRe, `$1${escapeHtml(strValue)}$3`);
  }

  // Attribute doesn't exist yet — try matching with attribute before id too
  const altAttrRe = new RegExp(
    `(<${component}\\b[^>]*\\b${escapeRegex(attribute)}=")([^"]*)("[^>]*\\bid="${escapeRegex(elementId)}"[^>]*>)`,
  );
  if (altAttrRe.test(code)) {
    return code.replace(altAttrRe, `$1${escapeHtml(strValue)}$3`);
  }

  // Insert new attribute before closing >
  return code.replace(
    new RegExp(`(<${component}\\b[^>]*\\bid="${escapeRegex(elementId)}"[^>]*)(>)`),
    `$1 ${attribute}="${escapeHtml(strValue)}"$2`,
  );
}

/** Update a data-bound property in the JSON script block */
function updateDataPropertyInCode(
  code: string,
  elementId: string,
  property: string,
  value: unknown,
): string {
  // Find <script data-for="elementId" type="application/json">...</script>
  const scriptRe = new RegExp(
    `(<script\\s+data-for="${escapeRegex(elementId)}"\\s+type="application\\/json">)([\\s\\S]*?)(<\\/script>)`,
  );
  const match = code.match(scriptRe);

  if (match) {
    // Parse existing JSON, update property, re-serialize
    try {
      const data = JSON.parse(match[2]);
      data[property] = value;
      const newJson = JSON.stringify(data, null, 2);
      return code.replace(scriptRe, `$1${newJson}$3`);
    } catch {
      // If JSON is malformed, replace entirely
      const newData = { [property]: value };
      return code.replace(scriptRe, `$1${JSON.stringify(newData, null, 2)}$3`);
    }
  }

  // Script block not found — append script block at the end of the code.
  // Simplest approach: append script block after the element's component closing tag
  // by looking for the element id in the broader HTML
  const newScript = `\n<script data-for="${elementId}" type="application/json">${JSON.stringify({ [property]: value }, null, 2)}</script>`;

  // Find the closing tag of the component that contains this element id
  // For simplicity, append the script at the end of the body content
  // The KCL runtime's connectedCallback will pick it up on next render
  return code + newScript;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── MC2: Inline Style Modification ──

/** Merge CSS inline style strings: existing props + new props (new overwrite existing). */
function mergeStyleStrings(existing: string, newProps: Record<string, string>): string {
  const map = new Map<string, string>();
  if (existing.trim()) {
    for (const decl of existing.split(';')) {
      const colonIdx = decl.indexOf(':');
      if (colonIdx < 0) continue;
      const key = decl.slice(0, colonIdx).trim();
      const val = decl.slice(colonIdx + 1).trim();
      if (key) map.set(key, val);
    }
  }
  for (const [key, val] of Object.entries(newProps)) {
    map.set(key, val);
  }
  return Array.from(map.entries())
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}

/** Update the inline style attribute of an element identified by id in the frame HTML code. */
function updateInlineStyle(
  code: string,
  elementId: string,
  styleProps: Record<string, string>,
): string {
  if (!elementId) return code;

  const idEscaped = escapeRegex(elementId);

  // Case 1: id appears before style attribute
  const idBeforeStyle = new RegExp(
    `(<[a-z-]+\\b[^>]*\\bid="${idEscaped}"[^>]*\\bstyle=")([^"]*)(")`,
  );
  if (idBeforeStyle.test(code)) {
    return code.replace(idBeforeStyle, (_match, prefix, existingStyle, suffix) => {
      return prefix + mergeStyleStrings(existingStyle, styleProps) + suffix;
    });
  }

  // Case 2: style attribute appears before id
  const styleBeforeId = new RegExp(
    `(<[a-z-]+\\b[^>]*\\bstyle=")([^"]*)("[^>]*\\bid="${idEscaped}"[^>]*>)`,
  );
  if (styleBeforeId.test(code)) {
    return code.replace(styleBeforeId, (_match, prefix, existingStyle, suffix) => {
      return prefix + mergeStyleStrings(existingStyle, styleProps) + suffix;
    });
  }

  // Case 3: No style attribute exists — insert one before the closing >
  const insertStyle = new RegExp(
    `(<[a-z-]+\\b[^>]*\\bid="${idEscaped}"[^>]*)(>)`,
  );
  const styleString = mergeStyleStrings('', styleProps);
  return code.replace(insertStyle, `$1 style="${styleString}"$2`);
}

function getWorkspaceId(): string {
  return localStorage.getItem('workspaceId') || 'default';
}

function getUserId(): string {
  return localStorage.getItem('userId') || 'user:local';
}

// ── MC2: Undo/redo entry type ──
interface UndoEntry {
  frameId: string;
  beforeCode: string;
  afterCode: string;
}
const UNDO_MAX = 50;

export default function DesignStudioPage() {
  const { id: routeWorkspaceId, cid: canvasId } = useParams<{
    id: string;
    cid: string;
  }>();
  const navigate = useNavigate();

  const workspaceId = routeWorkspaceId || getWorkspaceId();
  const userId = getUserId();

  // E9 — Mobile detection
  const isMobile = useIsMobile();

  // Real-time events
  const { sendRaw, events } = useWorkspaceSocket(workspaceId, { userId, displayName: userId });

  // E8 — Canvas collaboration (presence, frame locks, conversation sync)
  const collaboration = useCanvasCollaboration({
    canvasId: canvasId || '',
    userId,
    displayName: userId,
    sendRaw,
    events,
  });

  // Canvas state
  const [canvas, setCanvas] = useState<CanvasWithFrames | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [studioMode, setStudioMode] = useState<StudioMode>('simple');
  const [presenting, setPresenting] = useState(false);

  // ── Edit Mode state (F2) ──
  const [selectedElement, setSelectedElement] = useState<KCLEditableSchema | null>(null);
  const sendMessageRef = useRef<((msg: object) => void) | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── MC2: Undo/redo stack for position changes ──
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);

  // ── MC2: Multi-select tracking for drag/resize ──
  const [selectedElements, setSelectedElements] = useState<SelectedElementInfo[]>([]);

  // ── Inline editing state (F3) ──
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);

  // ── MC4: Grid, layer, lock/visibility state ──
  const [gridConfig, setGridConfig] = useState<GridConfig>({
    size: 16,
    visible: false,
    snapEnabled: false,
  });
  const [lockedElementIds, setLockedElementIds] = useState<Set<string>>(new Set());
  const [hiddenElementIds, setHiddenElementIds] = useState<Set<string>>(new Set());
  const [allBoundsData, setAllBoundsData] = useState<SelectedElementInfo[]>([]);

  // ── Embed whitelist (E7) ──
  const [embedWhitelist, setEmbedWhitelist] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    if (!workspaceId) return;
    canvasApi.getEmbedWhitelist(workspaceId)
      .then((res) => setEmbedWhitelist(res.effective))
      .catch(() => { /* Non-critical — frames fall back to default whitelist */ });
  }, [workspaceId]);

  // Fetch canvas on mount
  useEffect(() => {
    if (!canvasId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await canvasApi.get(workspaceId, canvasId!);
        if (cancelled) return;
        setCanvas(data);

        // Select first frame by default
        if (data.frames.length > 0) {
          const sorted = [...data.frames].sort(
            (a, b) => a.sortOrder - b.sortOrder,
          );
          setActiveFrameId(sorted[0].id);
        }
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || 'Failed to load canvas');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, canvasId]);

  // Frame selection
  const handleSelectFrame = useCallback((frameId: string) => {
    setActiveFrameId(frameId);
  }, []);

  // Frame reorder
  const handleFramesReorder = useCallback(
    (frameIds: string[]) => {
      if (!canvas) return;

      // Optimistic update: reorder frames locally
      setCanvas((prev) => {
        if (!prev) return prev;
        const frameMap = new Map(prev.frames.map((f) => [f.id, f]));
        const reordered = frameIds
          .map((id, i) => {
            const frame = frameMap.get(id);
            return frame ? { ...frame, sortOrder: i } : null;
          })
          .filter(Boolean) as typeof prev.frames;
        return { ...prev, frames: reordered };
      });

      // TODO: Persist reorder via API when endpoint is available
    },
    [canvas],
  );

  // Focus prompt trigger — incremented to signal ConversationPanel to focus input
  const [focusPromptTrigger, setFocusPromptTrigger] = useState(0);

  // ── Visual Mode: blank frame creation (MC1) ──
  const handleCreateBlankFrame = useCallback(
    (aspectPreset: '16:9' | '4:3' | 'a4-portrait' | 'a4-landscape') => {
      const tempId = `vis_${Date.now()}`;
      const aspectMap: Record<string, string> = {
        '16:9': '16/9',
        '4:3': '4/3',
        'a4-portrait': '210/297',
        'a4-landscape': '297/210',
      };
      const aspectValue = aspectMap[aspectPreset] || '16/9';
      const code = `<kcl-slide id="slide-${tempId}" background="#1a1a2e" aspect-ratio="${aspectValue}" padding="48">\n</kcl-slide>`;

      setCanvas((prev) => {
        if (!prev) return prev;
        const maxSort = prev.frames.reduce(
          (max, f) => Math.max(max, f.sortOrder),
          -1,
        );
        const newFrame: CanvasFrame = {
          id: tempId,
          canvasId: prev.id,
          title: null,
          code,
          codeHash: null,
          sortOrder: maxSort + 1,
          speakerNotes: null,
          thumbnailUrl: null,
          durationMs: 0,
          transition: 'none',
          metadata: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return { ...prev, frames: [...prev.frames, newFrame] };
      });
      setActiveFrameId(tempId);
    },
    [],
  );

  // Add frame — mode-aware: Visual Mode creates blank frame, other modes focus prompt
  const handleAddFrame = useCallback(() => {
    if (studioMode === 'visual') {
      handleCreateBlankFrame('16:9');
    } else {
      setFocusPromptTrigger((n) => n + 1);
    }
  }, [studioMode, handleCreateBlankFrame]);

  // Frames generated by AI — append to canvas and select first new frame
  const handleFramesGenerated = useCallback(
    (frames: CanvasFrame[], _response: GenerateFrameResponse) => {
      setCanvas((prev) => {
        if (!prev) return prev;
        const maxSort = prev.frames.reduce(
          (max, f) => Math.max(max, f.sortOrder),
          -1,
        );
        const newFrames = frames.map((f, i) => ({
          ...f,
          sortOrder: f.sortOrder ?? maxSort + 1 + i,
        }));
        return { ...prev, frames: [...prev.frames, ...newFrames] };
      });

      // Select the first generated frame
      if (frames.length > 0) {
        setActiveFrameId(frames[0].id);
      }
    },
    [],
  );

  // Frame updated by AI (edit/style) — replace in canvas state
  const handleFrameUpdated = useCallback(
    (frame: CanvasFrame, _response: GenerateFrameResponse) => {
      setCanvas((prev) => {
        if (!prev) return prev;
        const updated = prev.frames.map((f) =>
          f.id === frame.id ? { ...f, ...frame } : f,
        );
        return { ...prev, frames: updated };
      });
    },
    [],
  );

  // Delete frame (placeholder — backend frame delete endpoint)
  const handleDeleteFrame = useCallback(
    (frameId: string) => {
      // Optimistic removal from local state
      setCanvas((prev) => {
        if (!prev) return prev;
        const updated = prev.frames.filter((f) => f.id !== frameId);
        return { ...prev, frames: updated };
      });

      // If deleted frame was active, select next or previous
      if (frameId === activeFrameId && canvas) {
        const sorted = [...canvas.frames].sort(
          (a, b) => a.sortOrder - b.sortOrder,
        );
        const idx = sorted.findIndex((f) => f.id === frameId);
        const next = sorted[idx + 1] || sorted[idx - 1];
        setActiveFrameId(next?.id || null);
      }

      // TODO: Call backend delete API when endpoint is available
    },
    [activeFrameId, canvas],
  );

  // Title change
  const handleTitleChange = useCallback(
    async (title: string) => {
      if (!canvas) return;

      // Optimistic update
      setCanvas((prev) => (prev ? { ...prev, title } : prev));

      try {
        await canvasApi.update(workspaceId, canvas.id, { title });
      } catch (err: any) {
        // Revert on failure
        console.error('[DesignStudio] Failed to update title:', err);
        setCanvas((prev) =>
          prev ? { ...prev, title: canvas.title } : prev,
        );
      }
    },
    [canvas, workspaceId],
  );

  // Sorted frames for presentation mode
  const sortedFrames = useMemo(
    () =>
      canvas
        ? [...canvas.frames].sort((a, b) => a.sortOrder - b.sortOrder)
        : [],
    [canvas],
  );

  // Start index for presentation (based on active frame)
  const presentStartIndex = useMemo(() => {
    if (!activeFrameId) return 0;
    const idx = sortedFrames.findIndex((f) => f.id === activeFrameId);
    return idx >= 0 ? idx : 0;
  }, [activeFrameId, sortedFrames]);

  // Power Mode: direct code editing
  const handleFrameCodeChange = useCallback(
    (frameId: string, newCode: string) => {
      setCanvas((prev) => {
        if (!prev) return prev;
        const updated = prev.frames.map((f) =>
          f.id === frameId ? { ...f, code: newCode } : f,
        );
        return { ...prev, frames: updated };
      });
    },
    [],
  );

  const handleSpeakerNotesSave = useCallback(
    (frameId: string, notes: string) => {
      if (!canvasId) return;
      // Optimistic update
      setCanvas((prev) => {
        if (!prev) return prev;
        const updated = prev.frames.map((f) =>
          f.id === frameId ? { ...f, speakerNotes: notes || null } : f,
        );
        return { ...prev, frames: updated };
      });
      // Persist to backend
      canvasApi.updateFrame(canvasId, frameId, { speakerNotes: notes || null }).catch((err) => {
        console.error('[DesignStudioPage] Failed to save speaker notes:', err);
        // Revert on failure — reload canvas
        if (canvasId) {
          canvasApi.get(workspaceId, canvasId).then(setCanvas).catch(() => {});
        }
      });
    },
    [canvasId, workspaceId],
  );

  // E4 — Notebook narrative save (follows same optimistic pattern as speaker notes)
  const handleNarrativeSave = useCallback(
    (frameId: string, narrativeHtml: string) => {
      if (!canvasId) return;
      // Optimistic update: merge narrativeHtml into frame metadata
      setCanvas((prev) => {
        if (!prev) return prev;
        const updated = prev.frames.map((f) => {
          if (f.id !== frameId) return f;
          const existing = (f.metadata as Record<string, unknown>) || {};
          return {
            ...f,
            metadata: {
              ...existing,
              narrativeHtml: narrativeHtml || undefined,
            },
          };
        });
        return { ...prev, frames: updated };
      });
      // Persist to backend via PATCH metadata
      const frame = canvas?.frames.find((f) => f.id === frameId);
      const existingMeta = (frame?.metadata as Record<string, unknown>) || {};
      canvasApi
        .updateFrame(canvasId, frameId, {
          metadata: { ...existingMeta, narrativeHtml: narrativeHtml || undefined },
        })
        .catch((err) => {
          console.error('[DesignStudioPage] Failed to save narrative:', err);
          if (canvasId) {
            canvasApi.get(workspaceId, canvasId).then(setCanvas).catch(() => {});
          }
        });
    },
    [canvasId, workspaceId, canvas],
  );

  // Version restored (D7) — replace canvas state with restored version data
  const handleVersionRestored = useCallback(
    (data: RestoreVersionResponse) => {
      setCanvas(data);
      // Select first frame of the restored version
      if (data.frames.length > 0) {
        const sorted = [...data.frames].sort(
          (a, b) => a.sortOrder - b.sortOrder,
        );
        setActiveFrameId(sorted[0].id);
      } else {
        setActiveFrameId(null);
      }
    },
    [],
  );

  // Insert from template (D10) — create a local frame from template code
  const handleInsertFromTemplate = useCallback(
    (code: string) => {
      const tempId = `tpl_${Date.now()}`;
      setCanvas((prev) => {
        if (!prev) return prev;
        const maxSort = prev.frames.reduce(
          (max, f) => Math.max(max, f.sortOrder),
          -1,
        );
        const newFrame: CanvasFrame = {
          id: tempId,
          canvasId: prev.id,
          title: null,
          code,
          codeHash: null,
          sortOrder: maxSort + 1,
          speakerNotes: null,
          thumbnailUrl: null,
          durationMs: 0,
          transition: 'none',
          metadata: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return { ...prev, frames: [...prev.frames, newFrame] };
      });
      setActiveFrameId(tempId);
    },
    [],
  );

  // ── MC3: Create new frame from pre-built layout ──
  const handleCreateFromLayout = useCallback(
    (code: string) => {
      // Reuses same logic as handleInsertFromTemplate — create new frame from code
      handleInsertFromTemplate(code);
    },
    [handleInsertFromTemplate],
  );

  // ── MC3: Apply layout to active frame (replaces content) ──
  const handleApplyLayoutToFrame = useCallback(
    (innerKcl: string) => {
      if (!activeFrameId || !canvas || !canvasId) return;
      const activeFrame = canvas.frames.find((f) => f.id === activeFrameId);
      if (!activeFrame) return;

      // Extract the existing <kcl-slide ...> opening tag to preserve its attributes
      const openTagMatch = activeFrame.code.match(/^(<kcl-slide\b[^>]*>)/);
      if (!openTagMatch) return;

      const beforeCode = activeFrame.code;
      const newCode = `${openTagMatch[1]}\n${innerKcl}\n</kcl-slide>`;

      // Push to undo stack (MC2 infrastructure)
      undoStackRef.current.push({ frameId: activeFrameId, beforeCode, afterCode: newCode });
      if (undoStackRef.current.length > UNDO_MAX) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];

      // Update canvas state
      setCanvas((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          frames: prev.frames.map((f) =>
            f.id === activeFrameId ? { ...f, code: newCode } : f,
          ),
        };
      });

      // Clear selection since content is replaced
      setSelectedElement(null);
      setSelectedElements([]);

      // Debounced persist to backend
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        canvasApi.updateFrameCode(canvasId, activeFrameId, newCode).catch((err) => {
          console.error('[DesignStudioPage] Failed to persist layout apply:', err);
        });
      }, 300);
    },
    [activeFrameId, canvas, canvasId],
  );

  // ── Visual Mode: element insertion into active frame (MC1) ──
  const handleInsertElement = useCallback(
    (elementKcl: string) => {
      if (!activeFrameId || !canvas || !canvasId) return;
      const activeFrame = canvas.frames.find((f) => f.id === activeFrameId);
      if (!activeFrame) return;

      // Insert element before the closing </kcl-slide> tag
      const closingTagIdx = activeFrame.code.lastIndexOf('</kcl-slide>');
      let newCode: string;
      if (closingTagIdx >= 0) {
        const before = activeFrame.code.slice(0, closingTagIdx);
        const after = activeFrame.code.slice(closingTagIdx);
        newCode = before + '  ' + elementKcl + '\n' + after;
      } else {
        // Fallback: append the element to the code
        newCode = activeFrame.code + '\n' + elementKcl;
      }

      // Update canvas state
      setCanvas((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          frames: prev.frames.map((f) =>
            f.id === activeFrameId ? { ...f, code: newCode } : f,
          ),
        };
      });

      // Debounced persist to backend
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        canvasApi.updateFrameCode(canvasId, activeFrameId, newCode).catch((err) => {
          console.error('[DesignStudioPage] Failed to persist element insertion:', err);
        });
      }, 300);
    },
    [activeFrameId, canvas, canvasId],
  );

  // Keyboard shortcut: Ctrl+Shift+P toggles Simple <-> Power mode
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setStudioMode((prev) => (prev === 'simple' ? 'power' : 'simple'));
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── MC2: Undo/Redo keyboard handler (Visual Mode only) ──
  useEffect(() => {
    if (studioMode !== 'visual') return;

    function handleUndoRedo(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const entry = undoStackRef.current.pop();
        if (!entry) return;
        redoStackRef.current.push(entry);
        setCanvas((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            frames: prev.frames.map((f) =>
              f.id === entry.frameId ? { ...f, code: entry.beforeCode } : f,
            ),
          };
        });
        if (canvasId) {
          clearTimeout(persistTimerRef.current);
          persistTimerRef.current = setTimeout(() => {
            canvasApi.updateFrameCode(canvasId, entry.frameId, entry.beforeCode).catch((err) => {
              console.error('[DesignStudioPage] Failed to persist undo:', err);
            });
          }, 300);
        }
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        const entry = redoStackRef.current.pop();
        if (!entry) return;
        undoStackRef.current.push(entry);
        setCanvas((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            frames: prev.frames.map((f) =>
              f.id === entry.frameId ? { ...f, code: entry.afterCode } : f,
            ),
          };
        });
        if (canvasId) {
          clearTimeout(persistTimerRef.current);
          persistTimerRef.current = setTimeout(() => {
            canvasApi.updateFrameCode(canvasId, entry.frameId, entry.afterCode).catch((err) => {
              console.error('[DesignStudioPage] Failed to persist redo:', err);
            });
          }, 300);
        }
      }
    }

    window.addEventListener('keydown', handleUndoRedo);
    return () => window.removeEventListener('keydown', handleUndoRedo);
  }, [studioMode, canvasId]);

  // E9 — Force Simple Mode on mobile (Power/Edit are desktop-only)
  useEffect(() => {
    if (isMobile && studioMode !== 'simple') {
      setStudioMode('simple');
    }
  }, [isMobile, studioMode]);

  // ── Edit Mode handlers (F2) ──

  const handleElementSelected = useCallback(
    (elementId: string, component: string, schema: KCLEditableSchema, bounds?: ElementBounds, isAbsolute?: boolean) => {
      setSelectedElement(schema);
      // MC2: update multi-select tracking for DragManager
      if (bounds) {
        setSelectedElements([{
          elementId,
          component,
          bounds,
          isAbsolute: isAbsolute ?? false,
        }]);
      }
    },
    [],
  );

  const handleElementDeselected = useCallback(() => {
    setSelectedElement(null);
  }, []);

  // Mode change: handle Edit Mode transitions
  const handleModeChange = useCallback(
    (mode: StudioMode) => {
      const prevMode = studioMode;
      setStudioMode(mode);

      // Leaving Visual Mode → exit edit mode in iframe, clear selection and inline editing
      if (prevMode === 'visual' && mode !== 'visual') {
        sendMessageRef.current?.({ type: 'kcl:exit-edit-mode' });
        setSelectedElement(null);
        setInlineEditingId(null);
        setSelectedElements([]); // MC2: clear multi-select
      }
    },
    [studioMode],
  );

  // Property change handler (core F2 logic)
  const handlePropertyChange = useCallback(
    (property: string, value: unknown) => {
      if (!selectedElement || !activeFrameId || !canvas || !canvasId) return;

      // 1. Instant visual update via postMessage to iframe
      sendMessageRef.current?.({
        type: 'kcl:update-property',
        elementId: selectedElement.elementId,
        property,
        value,
      });

      // 2. Find the property schema
      const propSchema = selectedElement.properties.find((p) => p.name === property);
      if (!propSchema) return;

      // 3. Update the frame HTML code string
      const activeFrame = canvas.frames.find((f) => f.id === activeFrameId);
      if (!activeFrame) return;

      const newCode = updateFrameCode(
        activeFrame.code,
        selectedElement.component,
        selectedElement.elementId,
        property,
        value,
        propSchema.isAttribute,
        propSchema.type,
      );

      // 4. Update canvas state with modified code
      setCanvas((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          frames: prev.frames.map((f) =>
            f.id === activeFrameId ? { ...f, code: newCode } : f,
          ),
        };
      });

      // 5. Update selectedElement's currentValue to keep Properties Panel in sync
      setSelectedElement((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          properties: prev.properties.map((p) =>
            p.name === property ? { ...p, currentValue: value } : p,
          ),
        };
      });

      // 6. Debounced persist to backend (300ms)
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        canvasApi.updateFrameCode(canvasId, activeFrameId, newCode).catch((err) => {
          console.error('[DesignStudioPage] Failed to persist property change:', err);
        });
      }, 300);
    },
    [selectedElement, activeFrameId, canvas, canvasId],
  );

  // ── Inline editing handlers (F3) ──

  const handleInlineEditStart = useCallback((elementId: string) => {
    setInlineEditingId(elementId);
  }, []);

  const handleInlineEditComplete = useCallback(
    (elementId: string, newContent: string) => {
      setInlineEditingId(null);

      if (!activeFrameId || !canvas || !canvasId) return;

      // Update the content attribute on the kcl-text element in the frame code
      const activeFrame = canvas.frames.find((f) => f.id === activeFrameId);
      if (!activeFrame) return;

      const newCode = updateAttributeInCode(
        activeFrame.code,
        'kcl-text',
        elementId,
        'content',
        newContent,
        'text',
      );

      // Update canvas state
      setCanvas((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          frames: prev.frames.map((f) =>
            f.id === activeFrameId ? { ...f, code: newCode } : f,
          ),
        };
      });

      // Update selectedElement content value if this element is selected
      setSelectedElement((prev) => {
        if (!prev || prev.elementId !== elementId) return prev;
        return {
          ...prev,
          properties: prev.properties.map((p) =>
            p.name === 'content' ? { ...p, currentValue: newContent } : p,
          ),
        };
      });

      // Debounced persist to backend
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        canvasApi.updateFrameCode(canvasId, activeFrameId, newCode).catch((err) => {
          console.error('[DesignStudioPage] Failed to persist inline edit:', err);
        });
      }, 300);
    },
    [activeFrameId, canvas, canvasId],
  );

  const handleInlineEditCancel = useCallback((_elementId: string) => {
    setInlineEditingId(null);
  }, []);

  // ── MC2: Drag/resize position change handler ──
  const handlePositionChange = useCallback(
    (changes: ElementPositionChange[]) => {
      if (!activeFrameId || !canvas || !canvasId) return;

      const activeFrame = canvas.frames.find((f) => f.id === activeFrameId);
      if (!activeFrame) return;

      const beforeCode = activeFrame.code;
      let newCode = beforeCode;
      for (const change of changes) {
        newCode = updateInlineStyle(newCode, change.elementId, change.style);
      }

      if (newCode === beforeCode) return;

      // Push to undo stack
      undoStackRef.current.push({ frameId: activeFrameId, beforeCode, afterCode: newCode });
      if (undoStackRef.current.length > UNDO_MAX) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];

      // Update canvas state
      setCanvas((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          frames: prev.frames.map((f) =>
            f.id === activeFrameId ? { ...f, code: newCode } : f,
          ),
        };
      });

      // Update selected element bounds after code change
      setSelectedElements((prev) =>
        prev.map((sel) => {
          const change = changes.find((c) => c.elementId === sel.elementId);
          if (!change) return sel;
          return {
            ...sel,
            isAbsolute: true,
            bounds: {
              left: parseInt(change.style.left || '0'),
              top: parseInt(change.style.top || '0'),
              width: parseInt(change.style.width || String(sel.bounds.width)),
              height: parseInt(change.style.height || String(sel.bounds.height)),
            },
          };
        }),
      );

      // Debounced persist to backend
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        canvasApi.updateFrameCode(canvasId, activeFrameId, newCode).catch((err) => {
          console.error('[DesignStudioPage] Failed to persist position change:', err);
        });
      }, 300);
    },
    [activeFrameId, canvas, canvasId],
  );

  // MC2: Selection change (multi-select via marquee)
  const handleSelectionChange = useCallback(
    (elementIds: string[]) => {
      setSelectedElements((prev) =>
        prev.filter((s) => elementIds.includes(s.elementId)),
      );
    },
    [],
  );

  // MC2: Deselect all elements
  const handleDeselectAll = useCallback(() => {
    setSelectedElements([]);
    setSelectedElement(null);
  }, []);

  // MC2: Bounds change from Properties Panel inputs (X/Y/W/H fields)
  const handleBoundsChange = useCallback(
    (newBounds: ElementBounds) => {
      if (selectedElements.length !== 1) return;
      const sel = selectedElements[0];
      handlePositionChange([{
        elementId: sel.elementId,
        style: {
          position: 'absolute',
          left: `${Math.round(newBounds.left)}px`,
          top: `${Math.round(newBounds.top)}px`,
          width: `${Math.round(newBounds.width)}px`,
          height: `${Math.round(newBounds.height)}px`,
        },
      }]);
    },
    [selectedElements, handlePositionChange],
  );

  // ── MC4: All bounds update (from DragManager kcl:all-bounds) ──
  const handleAllBoundsUpdate = useCallback(
    (elements: SelectedElementInfo[]) => {
      setAllBoundsData(elements);
    },
    [],
  );

  // MC4: Compute layer elements from allBoundsData + lock/visibility state
  const layerElements: LayerElement[] = useMemo(
    () =>
      allBoundsData.map((el) => {
        // Extract zIndex from the element data (allBoundsData may include it from selection.ts)
        const raw = el as SelectedElementInfo & { zIndex?: number };
        return {
          elementId: el.elementId,
          component: el.component,
          bounds: el.bounds,
          isAbsolute: el.isAbsolute,
          zIndex: raw.zIndex ?? 0,
          visible: !hiddenElementIds.has(el.elementId),
          locked: lockedElementIds.has(el.elementId),
          groupId: el.elementId.startsWith('group-') ? null : null,
        };
      }),
    [allBoundsData, hiddenElementIds, lockedElementIds],
  );

  // MC4: Selected element IDs for layer panel highlight
  const selectedElementIds = useMemo(
    () => selectedElements.map((s) => s.elementId),
    [selectedElements],
  );

  // MC4: Select element by ID from layer panel (trigger selection via iframe)
  const handleSelectElementById = useCallback(
    (elementId: string) => {
      sendMessageRef.current?.({ type: 'kcl:highlight-element', elementId });
    },
    [],
  );

  // MC4: Z-index change (from layer panel drag-reorder)
  const handleZIndexChange = useCallback(
    (changes: ElementPositionChange[]) => {
      if (!activeFrameId || !canvas || !canvasId) return;
      const activeFrame = canvas.frames.find((f) => f.id === activeFrameId);
      if (!activeFrame) return;

      const beforeCode = activeFrame.code;
      let newCode = beforeCode;
      for (const change of changes) {
        newCode = updateInlineStyle(newCode, change.elementId, change.style);
      }

      if (newCode === beforeCode) return;

      undoStackRef.current.push({ frameId: activeFrameId, beforeCode, afterCode: newCode });
      if (undoStackRef.current.length > UNDO_MAX) undoStackRef.current.shift();
      redoStackRef.current = [];

      setCanvas((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          frames: prev.frames.map((f) =>
            f.id === activeFrameId ? { ...f, code: newCode } : f,
          ),
        };
      });

      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        canvasApi.updateFrameCode(canvasId, activeFrameId, newCode).catch((err) => {
          console.error('[DesignStudioPage] Failed to persist z-index change:', err);
        });
      }, 300);
    },
    [activeFrameId, canvas, canvasId],
  );

  // MC4: Visibility toggle (eye icon in layer panel)
  const handleVisibilityToggle = useCallback(
    (elementId: string, visible: boolean) => {
      setHiddenElementIds((prev) => {
        const next = new Set(prev);
        if (visible) {
          next.delete(elementId);
        } else {
          next.add(elementId);
        }
        return next;
      });

      // Apply live style to iframe for immediate visual feedback
      if (!visible) {
        sendMessageRef.current?.({
          type: 'kcl:apply-style',
          elementId,
          style: { display: 'none' },
        });
      } else {
        sendMessageRef.current?.({
          type: 'kcl:apply-style',
          elementId,
          style: { display: '' },
        });
      }
    },
    [],
  );

  // MC4: Lock toggle (lock icon in layer panel)
  const handleLockToggle = useCallback(
    (elementId: string, locked: boolean) => {
      setLockedElementIds((prev) => {
        const next = new Set(prev);
        if (locked) {
          next.add(elementId);
        } else {
          next.delete(elementId);
        }
        return next;
      });
    },
    [],
  );

  // MC4: Grid config change
  const handleGridConfigChange = useCallback(
    (config: GridConfig) => {
      setGridConfig(config);
    },
    [],
  );

  // MC4: Group selected elements (Ctrl+G)
  const handleGroup = useCallback(() => {
    if (selectedElements.length < 2) return;
    if (!activeFrameId || !canvas || !canvasId) return;
    const activeFrame = canvas.frames.find((f) => f.id === activeFrameId);
    if (!activeFrame) return;

    const elementsToGroup = selectedElements.map((sel) => ({
      elementId: sel.elementId,
      bounds: sel.bounds,
    }));

    const result = groupElements(activeFrame.code, elementsToGroup);
    if (!result) return;
    const newCode = result.newCode;

    undoStackRef.current.push({ frameId: activeFrameId, beforeCode: activeFrame.code, afterCode: newCode });
    if (undoStackRef.current.length > UNDO_MAX) undoStackRef.current.shift();
    redoStackRef.current = [];

    setCanvas((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        frames: prev.frames.map((f) =>
          f.id === activeFrameId ? { ...f, code: newCode } : f,
        ),
      };
    });

    setSelectedElements([]);
    setSelectedElement(null);

    clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      canvasApi.updateFrameCode(canvasId, activeFrameId, newCode).catch((err) => {
        console.error('[DesignStudioPage] Failed to persist group:', err);
      });
    }, 300);
  }, [selectedElements, activeFrameId, canvas, canvasId]);

  // MC4: Ungroup selected group (Ctrl+Shift+G)
  const handleUngroup = useCallback(() => {
    if (selectedElements.length !== 1) return;
    const sel = selectedElements[0];
    if (!isGroupElement(sel.elementId, sel.component)) return;
    if (!activeFrameId || !canvas || !canvasId) return;
    const activeFrame = canvas.frames.find((f) => f.id === activeFrameId);
    if (!activeFrame) return;

    const newCode = ungroupElement(activeFrame.code, sel.elementId, sel.bounds);
    if (!newCode || newCode === activeFrame.code) return;

    undoStackRef.current.push({ frameId: activeFrameId, beforeCode: activeFrame.code, afterCode: newCode });
    if (undoStackRef.current.length > UNDO_MAX) undoStackRef.current.shift();
    redoStackRef.current = [];

    setCanvas((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        frames: prev.frames.map((f) =>
          f.id === activeFrameId ? { ...f, code: newCode } : f,
        ),
      };
    });

    setSelectedElements([]);
    setSelectedElement(null);

    clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      canvasApi.updateFrameCode(canvasId, activeFrameId, newCode).catch((err) => {
        console.error('[DesignStudioPage] Failed to persist ungroup:', err);
      });
    }, 300);
  }, [selectedElements, activeFrameId, canvas, canvasId]);

  // MC4: Z-index helpers (bring forward / send backward / to front / to back)
  const handleZIndexShortcut = useCallback(
    (action: 'forward' | 'backward' | 'front' | 'back') => {
      if (selectedElements.length === 0) return;
      if (!activeFrameId || !canvas || !canvasId) return;
      const activeFrame = canvas.frames.find((f) => f.id === activeFrameId);
      if (!activeFrame) return;

      const sorted = [...allBoundsData].sort((a, b) => {
        const rawA = a as SelectedElementInfo & { zIndex?: number };
        const rawB = b as SelectedElementInfo & { zIndex?: number };
        return (rawA.zIndex ?? 0) - (rawB.zIndex ?? 0);
      });

      const maxZ = sorted.length;
      const changes: ElementPositionChange[] = [];

      if (action === 'front') {
        let z = maxZ + 1;
        for (const sel of selectedElements) {
          changes.push({ elementId: sel.elementId, style: { 'z-index': String(z++) } });
        }
      } else if (action === 'back') {
        let z = 0;
        for (const sel of selectedElements) {
          changes.push({ elementId: sel.elementId, style: { 'z-index': String(z++) } });
        }
      } else if (action === 'forward') {
        for (const sel of selectedElements) {
          const raw = sel as SelectedElementInfo & { zIndex?: number };
          const current = raw.zIndex ?? 0;
          changes.push({ elementId: sel.elementId, style: { 'z-index': String(current + 1) } });
        }
      } else if (action === 'backward') {
        for (const sel of selectedElements) {
          const raw = sel as SelectedElementInfo & { zIndex?: number };
          const current = raw.zIndex ?? 0;
          changes.push({ elementId: sel.elementId, style: { 'z-index': String(Math.max(0, current - 1)) } });
        }
      }

      if (changes.length === 0) return;

      const beforeCode = activeFrame.code;
      let newCode = beforeCode;
      for (const change of changes) {
        newCode = updateInlineStyle(newCode, change.elementId, change.style);
      }

      if (newCode === beforeCode) return;

      undoStackRef.current.push({ frameId: activeFrameId, beforeCode, afterCode: newCode });
      if (undoStackRef.current.length > UNDO_MAX) undoStackRef.current.shift();
      redoStackRef.current = [];

      setCanvas((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          frames: prev.frames.map((f) =>
            f.id === activeFrameId ? { ...f, code: newCode } : f,
          ),
        };
      });

      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        canvasApi.updateFrameCode(canvasId, activeFrameId, newCode).catch((err) => {
          console.error('[DesignStudioPage] Failed to persist z-index shortcut:', err);
        });
      }, 300);
    },
    [selectedElements, allBoundsData, activeFrameId, canvas, canvasId],
  );

  // ── MC4: Grouping and z-index keyboard shortcuts (Visual Mode only) ──
  useEffect(() => {
    if (studioMode !== 'visual') return;

    function handleMC4Keys(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Ctrl+G — Group
      if (e.key === 'g' && !e.shiftKey) {
        e.preventDefault();
        handleGroup();
        return;
      }
      // Ctrl+Shift+G — Ungroup
      if (e.key === 'G' && e.shiftKey) {
        e.preventDefault();
        handleUngroup();
        return;
      }
      // Ctrl+] — Bring forward
      if (e.key === ']' && !e.shiftKey) {
        e.preventDefault();
        handleZIndexShortcut('forward');
        return;
      }
      // Ctrl+[ — Send backward
      if (e.key === '[' && !e.shiftKey) {
        e.preventDefault();
        handleZIndexShortcut('backward');
        return;
      }
      // Ctrl+Shift+] — Bring to front
      if (e.key === '}' || (e.key === ']' && e.shiftKey)) {
        e.preventDefault();
        handleZIndexShortcut('front');
        return;
      }
      // Ctrl+Shift+[ — Send to back
      if (e.key === '{' || (e.key === '[' && e.shiftKey)) {
        e.preventDefault();
        handleZIndexShortcut('back');
        return;
      }
    }

    window.addEventListener('keydown', handleMC4Keys);
    return () => window.removeEventListener('keydown', handleMC4Keys);
  }, [studioMode, handleGroup, handleUngroup, handleZIndexShortcut]);

  // Clear selection and inline editing when active frame changes
  useEffect(() => {
    setSelectedElement(null);
    setInlineEditingId(null);
    setSelectedElements([]); // MC2: clear multi-select
    setLockedElementIds(new Set()); // MC4: reset locks per-frame
    setHiddenElementIds(new Set()); // MC4: reset visibility per-frame
  }, [activeFrameId]);

  // E8 — Update frame focus for collaboration presence
  useEffect(() => {
    collaboration.updateFrameFocus(activeFrameId);
  }, [activeFrameId, collaboration.updateFrameFocus]);

  // Cleanup persist timer on unmount
  useEffect(() => {
    return () => clearTimeout(persistTimerRef.current);
  }, []);

  // Presentation mode handlers
  const handlePresent = useCallback(() => {
    if (canvas && canvas.frames.length > 0) {
      setPresenting(true);
    }
  }, [canvas]);

  const handleExitPresentation = useCallback(() => {
    setPresenting(false);
  }, []);

  // Publish toggle handler (Slice E5)
  const handlePublishChange = useCallback(async (published: boolean) => {
    if (!canvas) return;
    const updated = await canvasApi.publish(canvas.id, published);
    setCanvas((prev) =>
      prev ? { ...prev, isPublished: updated.isPublished, publishedAt: updated.publishedAt } : prev
    );
  }, [canvas]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="studio-loading">
        <div className="panel-loading-spinner-circle" />
        <span className="panel-loading-spinner-text">Loading canvas...</span>
      </div>
    );
  }

  // ── Error state ──
  if (error || !canvas) {
    return (
      <div className="studio-error">
        <div className="studio-error-title">
          {error ? 'Failed to load canvas' : 'Canvas not found'}
        </div>
        <div className="studio-error-message">
          {error || 'The canvas you are looking for does not exist or you do not have access.'}
        </div>
        <button
          className="button ghost"
          onClick={() => navigate('/files')}
        >
          Back to Files
        </button>
      </div>
    );
  }

  // ── Loaded state ──
  return (
    <>
      <StudioLayout
        canvas={canvas}
        activeFrameId={activeFrameId}
        onSelectFrame={handleSelectFrame}
        onFramesReorder={handleFramesReorder}
        onAddFrame={handleAddFrame}
        onDeleteFrame={handleDeleteFrame}
        onTitleChange={handleTitleChange}
        onFramesGenerated={handleFramesGenerated}
        onFrameUpdated={handleFrameUpdated}
        studioMode={studioMode}
        onModeChange={handleModeChange}
        isMobile={isMobile}
        focusPromptTrigger={focusPromptTrigger}
        onPresent={handlePresent}
        onFrameCodeChange={handleFrameCodeChange}
        onSpeakerNotesSave={handleSpeakerNotesSave}
        onNarrativeSave={handleNarrativeSave}
        onVersionRestored={handleVersionRestored}
        kclVersion={canvas.kclVersion}
        workspaceId={workspaceId}
        onInsertFromTemplate={handleInsertFromTemplate}
        selectedElement={selectedElement}
        onPropertyChange={handlePropertyChange}
        onElementSelected={handleElementSelected}
        onElementDeselected={handleElementDeselected}
        sendMessageRef={sendMessageRef}
        onInlineEditStart={handleInlineEditStart}
        onInlineEditComplete={handleInlineEditComplete}
        onInlineEditCancel={handleInlineEditCancel}
        inlineEditingActive={!!inlineEditingId}
        onPublishChange={handlePublishChange}
        embedWhitelist={embedWhitelist}
        canvasViewers={collaboration.canvasViewers}
        frameLocks={collaboration.frameLocks}
        myLockedFrameId={collaboration.myLockedFrameId}
        onAcquireLock={collaboration.acquireLock}
        onReleaseLock={collaboration.releaseLock}
        onBroadcastMessage={collaboration.broadcastConversationMessage}
        onCreateBlankFrame={handleCreateBlankFrame}
        onInsertElement={handleInsertElement}
        selectedElements={selectedElements}
        onPositionChange={handlePositionChange}
        onSelectionChange={handleSelectionChange}
        onDeselectAll={handleDeselectAll}
        selectedBounds={selectedElements.length === 1 ? selectedElements[0].bounds : undefined}
        onBoundsChange={handleBoundsChange}
        onCreateFromLayout={handleCreateFromLayout}
        onApplyLayoutToFrame={handleApplyLayoutToFrame}
        gridConfig={gridConfig}
        onGridConfigChange={handleGridConfigChange}
        lockedElementIds={lockedElementIds}
        onAllBoundsUpdate={handleAllBoundsUpdate}
        layerElements={layerElements}
        selectedElementIds={selectedElementIds}
        onSelectElementById={handleSelectElementById}
        onZIndexChange={handleZIndexChange}
        onVisibilityToggle={handleVisibilityToggle}
        onLockToggle={handleLockToggle}
      />

      {presenting && (
        <PresentationMode
          sortedFrames={sortedFrames}
          startIndex={presentStartIndex}
          kclVersion={canvas.kclVersion}
          onExit={handleExitPresentation}
          embedWhitelist={embedWhitelist}
        />
      )}
    </>
  );
}
