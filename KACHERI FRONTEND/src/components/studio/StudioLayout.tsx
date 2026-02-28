// KACHERI FRONTEND/src/components/studio/StudioLayout.tsx
// Three-panel layout: frame rail (left) + viewport (center) + conversation (right).
// E2 — Render mode constraint: At most 1–3 live iframes at any time.
//   - FrameRail: thumbnails (static, no iframe)
//   - FrameViewport: one live iframe (Simple/Visual mode)
//   - PowerModePreview: one live iframe (Power mode, center-right split)
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 4, Slice C2 + Phase 7, Slice E2

import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CanvasWithFrames, CanvasFrame, GenerateFrameResponse, RestoreVersionResponse } from '../../types/canvas';
import type { KCLEditableSchema, ElementBounds, GridConfig, LayerElement } from '../../kcl/types';
import type { SelectedElementInfo, ElementPositionChange } from './DragManager';
import { FrameRail } from './FrameRail';
import { FrameViewport } from './FrameViewport';
import { FrameRenderer } from './FrameRenderer';
import { ConversationPanel } from './ConversationPanel';
import { VisualCanvas } from './VisualCanvas';
import { CodeEditor } from './CodeEditor';
import { SpeakerNotesEditor } from './SpeakerNotesEditor';
import { NotebookView } from './NotebookView';
import { VersionsPanel } from './VersionsPanel';
import { TemplateGallery } from './TemplateGallery';
import { SaveTemplateDialog } from './SaveTemplateDialog';
import { EmbedDialog } from './EmbedDialog';
import { useFrameRenderer } from '../../hooks/useFrameRenderer';
import { useMemoryMonitor } from '../../hooks/useMemoryMonitor';
import { PresenceIndicator } from './PresenceIndicator';
import { FrameLockOverlay } from './FrameLockBadge';
import type { CanvasViewer, FrameLockInfo } from '../../hooks/useCanvasCollaboration';
import './studio.css';

type StudioMode = 'simple' | 'power' | 'visual';

interface StudioLayoutProps {
  canvas: CanvasWithFrames;
  activeFrameId: string | null;
  onSelectFrame: (frameId: string) => void;
  onFramesReorder: (frameIds: string[]) => void;
  onAddFrame: () => void;
  onDeleteFrame: (frameId: string) => void;
  onTitleChange: (title: string) => void;
  onFramesGenerated: (frames: CanvasFrame[], response: GenerateFrameResponse) => void;
  onFrameUpdated: (frame: CanvasFrame, response: GenerateFrameResponse) => void;
  studioMode: StudioMode;
  onModeChange: (mode: StudioMode) => void;
  /** Incremented to trigger focusing the conversation prompt input */
  focusPromptTrigger?: number;
  /** Starts presentation mode */
  onPresent: () => void;
  /** Called when user edits code directly in Power Mode editor */
  onFrameCodeChange?: (frameId: string, code: string) => void;
  /** Called when user edits speaker notes (D6) */
  onSpeakerNotesSave?: (frameId: string, notes: string) => void;
  /** Called when user restores a canvas version (D7) */
  onVersionRestored?: (data: RestoreVersionResponse) => void;
  /** KCL version for frame rendering */
  kclVersion: string;
  /** Workspace ID for template operations (D10) */
  workspaceId: string;
  /** Called when user inserts a template from the gallery (D10) */
  onInsertFromTemplate?: (code: string) => void;
  /** Edit Mode (F2): currently selected element schema */
  selectedElement?: KCLEditableSchema | null;
  /** Edit Mode (F2): called when a property value changes */
  onPropertyChange?: (property: string, value: unknown) => void;
  /** Edit Mode (F2): called when element is selected in iframe */
  onElementSelected?: (elementId: string, component: string, schema: KCLEditableSchema, bounds?: ElementBounds, isAbsolute?: boolean) => void;
  /** Edit Mode (F2): called when element is deselected */
  onElementDeselected?: () => void;
  /** Edit Mode (F2): ref to expose sendMessage to parent */
  sendMessageRef?: React.MutableRefObject<((msg: object) => void) | null>;
  /** Inline editing (F3): called when inline text editing starts */
  onInlineEditStart?: (elementId: string) => void;
  /** Inline editing (F3): called when inline text editing completes */
  onInlineEditComplete?: (elementId: string, newContent: string) => void;
  /** Inline editing (F3): called when inline text editing is cancelled */
  onInlineEditCancel?: (elementId: string) => void;
  /** Inline editing (F3): true when inline text editing is active */
  inlineEditingActive?: boolean;
  /** Notebook mode (E4): called when narrative text is saved for a frame */
  onNarrativeSave?: (frameId: string, narrativeHtml: string) => void;
  /** Embed/Widget mode (E5): called when canvas publish state is toggled */
  onPublishChange?: (published: boolean) => Promise<void>;
  /** E7: Effective embed whitelist domains for per-frame CSP */
  embedWhitelist?: string[];
  /** E8: Other users viewing this canvas */
  canvasViewers?: CanvasViewer[];
  /** E8: Frame locks keyed by frameId */
  frameLocks?: Map<string, FrameLockInfo>;
  /** E8: Frame the current user has locked */
  myLockedFrameId?: string | null;
  /** E8: Request a frame lock */
  onAcquireLock?: (frameId: string) => void;
  /** E8: Release a frame lock */
  onReleaseLock?: (frameId: string) => void;
  /** E8: Broadcast a conversation message via WebSocket */
  onBroadcastMessage?: (msg: { messageId: string; canvasId: string; role: 'user' | 'assistant'; content: string; actionType?: string; authorId: string }) => void;
  /** E9: Mobile viewport detected — force Simple Mode layout */
  isMobile?: boolean;
  /** Visual Mode (MC1): create a blank frame with given aspect preset */
  onCreateBlankFrame?: (aspectPreset: '16:9' | '4:3' | 'a4-portrait' | 'a4-landscape') => void;
  /** Visual Mode (MC1): insert an element KCL string into the active frame */
  onInsertElement?: (elementKcl: string) => void;
  /** MC2: Selected elements with bounds for DragManager */
  selectedElements?: SelectedElementInfo[];
  /** MC2: Called when element positions change via drag/resize/nudge */
  onPositionChange?: (changes: ElementPositionChange[]) => void;
  /** MC2: Called when selection changes (multi-select via marquee) */
  onSelectionChange?: (elementIds: string[]) => void;
  /** MC2: Called to deselect all elements */
  onDeselectAll?: () => void;
  /** MC2: Bounds of the first selected element (for Properties Panel) */
  selectedBounds?: ElementBounds;
  /** MC2: Called when bounds are edited via Properties Panel inputs */
  onBoundsChange?: (newBounds: ElementBounds) => void;
  /** MC3: Creates a new frame from complete layout KCL code */
  onCreateFromLayout?: (code: string) => void;
  /** MC3: Applies layout inner KCL to the active frame (replaces content) */
  onApplyLayoutToFrame?: (innerKcl: string) => void;
  /** MC4: Grid configuration for snap-to-grid */
  gridConfig?: GridConfig;
  /** MC4: Called when grid configuration changes */
  onGridConfigChange?: (config: GridConfig) => void;
  /** MC4: Locked element IDs (prevent drag/resize) */
  lockedElementIds?: Set<string>;
  /** MC4: Callback to expose all element bounds from DragManager */
  onAllBoundsUpdate?: (elements: SelectedElementInfo[]) => void;
  /** MC4: Layer elements for layer panel */
  layerElements?: LayerElement[];
  /** MC4: Selected element IDs (for layer panel highlight) */
  selectedElementIds?: string[];
  /** MC4: Called when element is selected from layer panel */
  onSelectElementById?: (elementId: string) => void;
  /** MC4: Called when z-order changes via layer panel */
  onZIndexChange?: (changes: ElementPositionChange[]) => void;
  /** MC4: Called when visibility is toggled */
  onVisibilityToggle?: (elementId: string, visible: boolean) => void;
  /** MC4: Called when lock is toggled */
  onLockToggle?: (elementId: string, locked: boolean) => void;
}

const MODE_LABELS: { mode: StudioMode; label: string; disabled: boolean }[] = [
  { mode: 'visual', label: 'Visual', disabled: false },
  { mode: 'simple', label: 'AI', disabled: false },
  { mode: 'power', label: 'Code', disabled: false },
];

const COMP_MODE_LABELS: Record<string, string> = {
  deck: 'Deck',
  page: 'Page',
  notebook: 'Notebook',
  widget: 'Widget',
};

export function StudioLayout({
  canvas,
  activeFrameId,
  onSelectFrame,
  onFramesReorder,
  onAddFrame,
  onDeleteFrame,
  onTitleChange,
  onFramesGenerated,
  onFrameUpdated,
  studioMode,
  onModeChange,
  focusPromptTrigger,
  onPresent,
  onFrameCodeChange,
  onSpeakerNotesSave,
  onVersionRestored,
  kclVersion,
  workspaceId,
  onInsertFromTemplate,
  selectedElement,
  onPropertyChange,
  onElementSelected,
  onElementDeselected,
  sendMessageRef,
  onInlineEditStart,
  onInlineEditComplete,
  onInlineEditCancel,
  inlineEditingActive,
  onNarrativeSave,
  onPublishChange,
  embedWhitelist,
  canvasViewers,
  frameLocks,
  myLockedFrameId,
  onAcquireLock,
  onReleaseLock,
  onBroadcastMessage,
  isMobile,
  onCreateBlankFrame,
  onInsertElement,
  selectedElements,
  onPositionChange,
  onSelectionChange,
  onDeselectAll,
  selectedBounds,
  onBoundsChange,
  onCreateFromLayout,
  onApplyLayoutToFrame,
  gridConfig,
  onGridConfigChange,
  lockedElementIds,
  onAllBoundsUpdate,
  layerElements,
  selectedElementIds,
  onSelectElementById,
  onZIndexChange,
  onVisibilityToggle,
  onLockToggle,
}: StudioLayoutProps) {
  const navigate = useNavigate();
  const titleRef = useRef<HTMLSpanElement>(null);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [conversationCollapsed, setConversationCollapsed] = useState(false);
  const [powerRenderOk, setPowerRenderOk] = useState(true);
  const [notesCollapsed, setNotesCollapsed] = useState(true);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);

  // E2 — Memory monitoring: detect iframe leaks and high heap usage
  const { memoryWarning, dismiss: dismissMemoryWarning } = useMemoryMonitor();
  const [saveTemplateFrameId, setSaveTemplateFrameId] = useState<string | null>(null);

  const activeFrame: CanvasFrame | undefined = canvas.frames.find(
    (f) => f.id === activeFrameId,
  );

  // E8 — Check if active frame is locked by another user
  // A frame is locked by another user if a lock exists AND it's not the frame I hold
  const activeFrameLock = activeFrameId ? frameLocks?.get(activeFrameId) : undefined;
  const isActiveFrameLockedByOther = !!activeFrameLock && activeFrameId !== myLockedFrameId;

  const sortedFrames = [...canvas.frames].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const activeIndex = activeFrame
    ? sortedFrames.findIndex((f) => f.id === activeFrame.id)
    : -1;

  const handleTitleBlur = useCallback(() => {
    const text = titleRef.current?.textContent?.trim();
    if (text && text !== canvas.title) {
      onTitleChange(text);
    } else if (titleRef.current) {
      // Revert if empty
      titleRef.current.textContent = canvas.title;
    }
  }, [canvas.title, onTitleChange]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        (e.target as HTMLElement).blur();
      }
      if (e.key === 'Escape') {
        if (titleRef.current) {
          titleRef.current.textContent = canvas.title;
        }
        (e.target as HTMLElement).blur();
      }
    },
    [canvas.title],
  );

  const handleSaveAsTemplate = useCallback((frameId: string) => {
    setSaveTemplateFrameId(frameId);
    setSaveTemplateOpen(true);
  }, []);

  const handleInsertFromTemplate = useCallback(
    (code: string) => {
      onInsertFromTemplate?.(code);
      setTemplateGalleryOpen(false);
    },
    [onInsertFromTemplate],
  );

  const saveTemplateFrame = saveTemplateFrameId
    ? canvas.frames.find((f) => f.id === saveTemplateFrameId)
    : undefined;

  return (
    <div className={'studio-layout' + (isMobile ? ' studio-layout--mobile' : '')}>
      {/* ── Header ── */}
      <header className="studio-header">
        <button
          className="studio-header-back"
          onClick={() => navigate('/files')}
          aria-label="Back to files"
          title="Back to files"
        >
          &#x2190;
        </button>

        <span
          ref={titleRef}
          className="studio-header-title"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onBlur={handleTitleBlur}
          onKeyDown={handleTitleKeyDown}
          role="textbox"
          aria-label="Canvas title"
        >
          {canvas.title}
        </span>

        <span className="studio-comp-badge">
          {COMP_MODE_LABELS[canvas.compositionMode] || canvas.compositionMode}
        </span>

        <span className="spacer" />

        {/* E8 — Canvas collaboration presence */}
        {canvasViewers && canvasViewers.length > 0 && (
          <PresenceIndicator viewers={canvasViewers} />
        )}

        {/* Mode toggle — hidden on mobile (E9) */}
        {!isMobile && (
          <div className="studio-mode-toggle" role="group" aria-label="Editing mode">
            {MODE_LABELS.map(({ mode, label, disabled }) => (
              <button
                key={mode}
                className={
                  'studio-mode-btn' + (studioMode === mode ? ' active' : '')
                }
                onClick={() => onModeChange(mode)}
                disabled={disabled}
                aria-pressed={studioMode === mode}
                title={disabled ? `${label} mode (coming soon)` : `${label} mode`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="studio-header-actions">
          {/* Desktop-only header actions — hidden on mobile (E9) */}
          {!isMobile && (
            <>
              <button
                className={'studio-notes-toggle' + (notesCollapsed ? '' : ' active')}
                disabled={!activeFrame}
                onClick={() => setNotesCollapsed((p) => !p)}
                title={notesCollapsed ? 'Show speaker notes' : 'Hide speaker notes'}
                aria-label="Toggle speaker notes"
                aria-pressed={!notesCollapsed}
              >
                Notes {notesCollapsed ? '▾' : '▴'}
              </button>
              <button
                className={'studio-notes-toggle' + (versionsOpen ? ' active' : '')}
                onClick={() => setVersionsOpen((p) => !p)}
                title={versionsOpen ? 'Hide version history' : 'Show version history'}
                aria-label="Toggle version history"
                aria-pressed={versionsOpen}
              >
                Versions {versionsOpen ? '▴' : '▾'}
              </button>
              <button
                className="studio-notes-toggle"
                onClick={() => setTemplateGalleryOpen(true)}
                title="Browse frame templates"
                aria-label="Open template gallery"
              >
                Templates
              </button>
              <button
                className="studio-notes-toggle"
                onClick={() => setEmbedOpen(true)}
                title="Generate embed code"
                aria-label="Open embed dialog"
              >
                Embed
              </button>
            </>
          )}
          <button
            className="button sm ghost"
            disabled={canvas.frames.length === 0}
            onClick={onPresent}
            title="Presentation mode (P)"
            aria-label="Start presentation"
          >
            Present
          </button>
        </div>
      </header>

      {/* E2 — Memory warning banner */}
      {memoryWarning && (
        <div className="studio-memory-warning" role="alert">
          <span className="studio-memory-warning-text">{memoryWarning}</span>
          <button
            className="studio-memory-warning-dismiss"
            onClick={dismissMemoryWarning}
            aria-label="Dismiss memory warning"
          >
            &#x2715;
          </button>
        </div>
      )}

      {/* ── Body (three panels) ── */}
      <div className="studio-body">
        {/* Left: Frame Rail */}
        <FrameRail
          frames={canvas.frames}
          activeFrameId={activeFrameId}
          onSelectFrame={onSelectFrame}
          onReorder={onFramesReorder}
          onAddFrame={onAddFrame}
          onDeleteFrame={onDeleteFrame}
          onSaveAsTemplate={handleSaveAsTemplate}
          collapsed={isMobile ? false : railCollapsed}
          onToggleCollapse={() => setRailCollapsed((p) => !p)}
          frameLocks={frameLocks}
          canvasViewers={canvasViewers}
          isMobile={isMobile}
        />

        {/* Center: Viewport (Simple) or Editor+Preview (Power) + Speaker Notes */}
        <div className="studio-center-column">
          {studioMode === 'power' && activeFrame ? (
            <div className="studio-power-center">
              {railCollapsed && (
                <button
                  className="studio-rail-toggle"
                  onClick={() => setRailCollapsed(false)}
                  aria-label="Show frame rail"
                  title="Show frames"
                >
                  &#x25B6;
                </button>
              )}

              <CodeEditor
                code={activeFrame.code}
                onCodeChange={(newCode) => onFrameCodeChange?.(activeFrame.id, newCode)}
                onSave={(formatted) => onFrameCodeChange?.(activeFrame.id, formatted)}
                readOnly={false}
                renderSuccessful={powerRenderOk}
              />

              <div className="studio-power-preview">
                <PowerModePreview
                  frameCode={activeFrame.code}
                  kclVersion={kclVersion}
                  onRenderResult={setPowerRenderOk}
                  embedWhitelist={embedWhitelist}
                />
              </div>

              {conversationCollapsed && (
                <button
                  className="studio-conversation-toggle"
                  onClick={() => setConversationCollapsed(false)}
                  aria-label="Show conversation"
                  title="Show conversation"
                >
                  &#x25C0;
                </button>
              )}
            </div>
          ) : canvas.compositionMode === 'notebook' ? (
            /* E4 — Notebook composition mode: vertical narrative + frame layout */
            <div className="studio-viewport">
              {railCollapsed && (
                <button
                  className="studio-rail-toggle"
                  onClick={() => setRailCollapsed(false)}
                  aria-label="Show frame rail"
                  title="Show frames"
                >
                  &#x25B6;
                </button>
              )}

              <NotebookView
                sortedFrames={sortedFrames}
                activeFrameId={activeFrameId}
                kclVersion={canvas.kclVersion}
                onSelectFrame={onSelectFrame}
                onNarrativeSave={onNarrativeSave ?? (() => {})}
                embedWhitelist={embedWhitelist}
              />

              {conversationCollapsed && (
                <button
                  className="studio-conversation-toggle"
                  onClick={() => setConversationCollapsed(false)}
                  aria-label="Show conversation"
                  title="Show conversation"
                >
                  &#x25C0;
                </button>
              )}
            </div>
          ) : (
            <div className="studio-viewport">
              {railCollapsed && (
                <button
                  className="studio-rail-toggle"
                  onClick={() => setRailCollapsed(false)}
                  aria-label="Show frame rail"
                  title="Show frames"
                >
                  &#x25B6;
                </button>
              )}

              {canvas.frames.length === 0 ? (
                <div className="studio-viewport-empty">
                  <div className="studio-viewport-empty-icon" aria-hidden="true">
                    &#x1F3A8;
                  </div>
                  <div className="studio-viewport-empty-title">
                    No frames yet
                  </div>
                  <div className="studio-viewport-empty-desc">
                    Use the conversation panel to generate your first frame, or click
                    "Add Frame" in the rail.
                  </div>
                </div>
              ) : activeFrame ? (
                <FrameViewport
                  activeFrame={activeFrame}
                  sortedFrames={sortedFrames}
                  activeIndex={activeIndex}
                  kclVersion={canvas.kclVersion}
                  onSelectFrame={onSelectFrame}
                  editMode={studioMode === 'visual'}
                  onElementSelected={onElementSelected}
                  onElementDeselected={onElementDeselected}
                  sendMessageRef={sendMessageRef}
                  onInlineEditStart={onInlineEditStart}
                  onInlineEditComplete={onInlineEditComplete}
                  onInlineEditCancel={onInlineEditCancel}
                  embedWhitelist={embedWhitelist}
                  isLockedByOther={isActiveFrameLockedByOther}
                  lockedByName={activeFrameLock?.displayName}
                  isMobile={isMobile}
                  selectedElements={selectedElements}
                  onPositionChange={onPositionChange}
                  onSelectionChange={onSelectionChange}
                  onDeselectAll={onDeselectAll}
                  gridConfig={gridConfig}
                  lockedElementIds={lockedElementIds}
                  onAllBoundsUpdate={onAllBoundsUpdate}
                />
              ) : (
                <div className="studio-viewport-empty">
                  <div className="studio-viewport-empty-desc">
                    Select a frame from the rail to view it.
                  </div>
                </div>
              )}

              {conversationCollapsed && (
                <button
                  className="studio-conversation-toggle"
                  onClick={() => setConversationCollapsed(false)}
                  aria-label="Show conversation"
                  title="Show conversation"
                >
                  &#x25C0;
                </button>
              )}
            </div>
          )}

          {/* Speaker Notes Pane (D6) */}
          {!notesCollapsed && activeFrame && (
            <div className="studio-notes-pane">
              <div className="studio-notes-pane-header">
                <span className="studio-notes-pane-title">Speaker Notes</span>
                <button
                  className="studio-notes-pane-close"
                  onClick={() => setNotesCollapsed(true)}
                  aria-label="Close speaker notes"
                  title="Close notes"
                >
                  &#x2715;
                </button>
              </div>
              <div className="studio-notes-pane-editor">
                <SpeakerNotesEditor
                  notes={activeFrame.speakerNotes ?? ''}
                  onSave={(notes) => onSpeakerNotesSave?.(activeFrame.id, notes)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right: Visual Canvas (Visual Mode) or Conversation Panel (AI/Code) */}
        <aside
          className={
            'studio-conversation' +
            (!isMobile && conversationCollapsed ? ' collapsed' : '')
          }
          aria-label={studioMode === 'visual' ? 'Visual tools panel' : 'Conversation panel'}
        >
          {/* E9: Hide conversation header collapse on mobile */}
          {!isMobile && (
            <div className="studio-conversation-header">
              <span className="studio-conversation-title">
                {studioMode === 'visual'
                  ? (selectedElement ? 'Properties' : 'Elements')
                  : 'Conversation'}
              </span>
              <button
                className="studio-conversation-collapse"
                onClick={() => setConversationCollapsed((p) => !p)}
                aria-label={studioMode === 'visual' ? 'Collapse visual tools panel' : 'Collapse conversation panel'}
                title="Collapse"
              >
                &#x25B6;
              </button>
            </div>
          )}
          {studioMode === 'visual' ? (
            <VisualCanvas
              selectedElement={selectedElement ?? null}
              onPropertyChange={onPropertyChange ?? (() => {})}
              inlineEditingActive={inlineEditingActive}
              onInsertElement={onInsertElement ?? (() => {})}
              onCreateBlankFrame={onCreateBlankFrame ?? (() => {})}
              hasActiveFrame={!!activeFrame}
              selectedBounds={selectedBounds}
              onBoundsChange={onBoundsChange}
              onCreateFromLayout={onCreateFromLayout}
              onApplyLayoutToFrame={onApplyLayoutToFrame}
              layerElements={layerElements}
              selectedElementIds={selectedElementIds}
              onSelectElementById={onSelectElementById}
              onZIndexChange={onZIndexChange}
              onVisibilityToggle={onVisibilityToggle}
              onLockToggle={onLockToggle}
              gridConfig={gridConfig}
              onGridConfigChange={onGridConfigChange}
            />
          ) : (
            <ConversationPanel
              canvasId={canvas.id}
              activeFrameId={activeFrameId}
              activeFrameCode={activeFrame?.code ?? null}
              sortedFrames={sortedFrames}
              compositionMode={canvas.compositionMode}
              onFramesGenerated={onFramesGenerated}
              onFrameUpdated={onFrameUpdated}
              focusPromptTrigger={focusPromptTrigger}
              onNewMessage={onBroadcastMessage}
            />
          )}
        </aside>

        {/* Right overlay: Version History Panel (Slice D7) */}
        {onVersionRestored && (
          <VersionsPanel
            canvasId={canvas.id}
            open={versionsOpen}
            onClose={() => setVersionsOpen(false)}
            onVersionRestored={(data) => {
              onVersionRestored(data);
              setVersionsOpen(false);
            }}
          />
        )}
      </div>

      {/* Template Gallery Modal (Slice D10) */}
      <TemplateGallery
        open={templateGalleryOpen}
        onClose={() => setTemplateGalleryOpen(false)}
        workspaceId={workspaceId}
        onInsertTemplate={handleInsertFromTemplate}
      />

      {/* Embed Dialog (Slice E5) */}
      <EmbedDialog
        open={embedOpen}
        onClose={() => setEmbedOpen(false)}
        canvasId={canvas.id}
        canvasTitle={canvas.title}
        isPublished={canvas.isPublished}
        frames={sortedFrames}
        onPublishToggle={async (published) => {
          if (onPublishChange) await onPublishChange(published);
        }}
      />

      {/* Save as Template Dialog (Slice D10) */}
      <SaveTemplateDialog
        open={saveTemplateOpen}
        onClose={() => {
          setSaveTemplateOpen(false);
          setSaveTemplateFrameId(null);
        }}
        workspaceId={workspaceId}
        frameCode={saveTemplateFrame?.code ?? ''}
        compositionMode={canvas.compositionMode}
        onSaved={() => {
          setSaveTemplateOpen(false);
          setSaveTemplateFrameId(null);
        }}
      />
    </div>
  );
}

// ── Power Mode Live Preview ──
// Separate component so useFrameRenderer hook is always called (Rules of Hooks).

interface PowerModePreviewProps {
  frameCode: string;
  kclVersion: string;
  onRenderResult: (success: boolean) => void;
  embedWhitelist?: string[];
}

function PowerModePreview({ frameCode, kclVersion, onRenderResult, embedWhitelist }: PowerModePreviewProps) {
  const { srcdoc, renderError, isLoading, iframeRef, clearError } = useFrameRenderer({
    frameCode,
    kclVersion,
    embedWhitelist,
  });

  useEffect(() => {
    if (!isLoading) {
      onRenderResult(!renderError);
    }
  }, [isLoading, renderError, onRenderResult]);

  return (
    <div className="studio-power-preview-inner">
      <div className="studio-power-preview-header">
        <span className="studio-power-preview-title">Live Preview</span>
        {isLoading && <span className="studio-power-preview-loading">Rendering...</span>}
      </div>
      <div className="studio-power-preview-frame">
        <FrameRenderer
          srcdoc={srcdoc}
          renderError={renderError}
          isLoading={isLoading}
          iframeRef={iframeRef}
          onClearError={clearError}
        />
      </div>
    </div>
  );
}

export default StudioLayout;
