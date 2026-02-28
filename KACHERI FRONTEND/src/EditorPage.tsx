import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
  Suspense,
} from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import CommandPalette, {
  usePaletteHotkey,
} from "./components/CommandPalette";
import type { Command } from "./components/CommandPalette";
import DiffModal from "./components/DiffModal";
import PDFImportModal from "./components/PDFImportModal";
import { DocsAPI, AiAPI, EvidenceAPI } from "./api";
import Editor, { type EditorApi, type NumberingStyle, type ColumnGap, type ColumnRule } from "./Editor";
import ImageInsertDialog from "./components/ImageInsertDialog";
import DocPickerModal from "./components/DocPickerModal";
import type { Suggestion } from "./api/suggestions";

// ── Lazy-loaded drawer panels (code-split for initial load perf) ──
const ProofsPanel = React.lazy(() => import("./ProofsPanel"));
const CommentsPanel = React.lazy(() =>
  import("./components/CommentsPanel").then(m => ({ default: m.CommentsPanel }))
);
const VersionsPanel = React.lazy(() =>
  import("./components/VersionsPanel").then(m => ({ default: m.VersionsPanel }))
);
const SuggestionsPanel = React.lazy(() =>
  import("./components/SuggestionsPanel").then(m => ({ default: m.SuggestionsPanel }))
);
const BacklinksPanel = React.lazy(() => import("./components/BacklinksPanel"));
import PromptDialog from "./components/PromptDialog";
import {
  useWorkspaceSocket,
  type WsEvent,
  type ConnectionState,
} from "./hooks/useWorkspaceSocket";
import { sanitizeHtml } from "./utils/sanitize";
import FindReplaceDialog from "./components/FindReplaceDialog";
import ShareDialog from "./components/ShareDialog";
import PageSetupDialog, { type LayoutSettings } from "./components/PageSetupDialog";
import { DEFAULT_LAYOUT_SETTINGS } from "./api";
import { buildHeadingIndex, type HeadingIndexItem } from "./headingsIndex";
import { KeyboardShortcutsModal } from "./components/KeyboardShortcutsModal";
import { ReadAloudPanel } from "./components/ReadAloudPanel";
import { useTTS } from "./hooks/useTTS";
import { DictatePanel } from "./components/DictatePanel";
import { useSTT } from "./hooks/useSTT";
import { TranslateModal } from "./components/TranslateModal";
import OriginalSourceModal from "./components/OriginalSourceModal";
import { ComplianceBadge } from "./components/compliance";
import { complianceApi } from "./api/compliance";
import type { CheckStatus } from "./types/compliance";
import { SaveClauseDialog, ClauseSuggestionPopover } from "./components/clauses";
import type { NegotiationPanelAction } from "./components/negotiation";
import { knowledgeApi } from "./api/knowledge";
import AttachmentViewer from "./components/AttachmentViewer";
import { attachmentsApi, type DocAttachment } from "./api/attachments";
import PanelLoadingSpinner from "./components/PanelLoadingSpinner";

const ExtractionPanel = React.lazy(() => import("./components/extraction/ExtractionPanel"));
const CompliancePanel = React.lazy(() => import("./components/compliance/CompliancePanel"));
const ClauseLibraryPanel = React.lazy(() => import("./components/clauses/ClauseLibraryPanel"));
const RelatedDocsPanel = React.lazy(() => import("./components/knowledge/RelatedDocsPanel"));
const NegotiationPanel = React.lazy(() => import("./components/negotiation/NegotiationPanel"));
const AttachmentPanel = React.lazy(() =>
  import("./components/AttachmentPanel").then(m => ({ default: m.AttachmentPanel }))
);
const ReviewersPanel = React.lazy(() =>
  import("./components/ReviewersPanel").then(m => ({ default: m.ReviewersPanel }))
);
import { negotiationSessionsApi } from "./api/negotiations";
import { clauseActionsApi, clausesApi } from "./api/clauses";
import { NotificationBell } from "./components/notifications";
import ProofHealthBadge from "./components/ProofHealthBadge";
import ComposeDeterminismIndicator from "./components/ComposeDeterminismIndicator";
import AIHeatmapToggle from "./components/AIHeatmapToggle";
import ProofOnboardingModal, { shouldShowOnboarding } from "./components/ProofOnboardingModal";

// Canvas frame embedding (Slice P9)
import { canvasApi } from "./api/canvas";
import type { Canvas, CanvasFrame } from "./types/canvas";
import { isProductEnabled } from "./modules/registry";

type AiAction = "summarize" | "extract_tasks" | "rewrite_for_clarity";
type ProposalKind =
  | "replace-selection"
  | "insert-below-selection"
  | "apply-fulltext";

type EditorPromptKind = "rename-doc" | "delete-doc" | "compose";
type EditorPromptState = EditorPromptKind | null;

function getWorkspaceId() {
  return localStorage.getItem("workspaceId") || "default";
}
function getUserId() {
  return localStorage.getItem("userId") || "user:local";
}

/** Read latest provider/model/seed prefs saved by ComposeBar (localStorage). */
function readAiPrefs(): {
  provider: "openai" | "anthropic" | "dev" | "ollama";
  model: string;
  seed?: string | number;
} {
  const provider = (localStorage.getItem("aiProvider") as any) || "openai";
  const model =
    localStorage.getItem("aiModel") ||
    (provider === "anthropic"
      ? "claude-sonnet-4-5-20250929"
      : "gpt-4o-mini");
  const seedStr = localStorage.getItem("aiSeed") || "";
  const seed =
    seedStr && !Number.isNaN(Number(seedStr))
      ? Number(seedStr)
      : (seedStr || undefined);
  return { provider, model, seed };
}

type PalSnap = {
  fullText: string;
  plain: { start: number; end: number };
  pos: { from: number; to: number };
  ts: number;
};

function htmlToPlainText(html: string): string {
  try {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    div
      .querySelectorAll("p, div, li, br, h1, h2, h3, h4, h5, h6")
      .forEach((n) =>
        (n as HTMLElement).insertAdjacentText("afterend", "\n")
      );
    return (div.textContent || div.innerText || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s+\n/g, "\n")
      .trim();
  } catch {
    return html || "";
  }
}

// ---- Robust import handoff helpers ----
declare global {
  interface Window {
    __kacheriImport?: Record<string, string>;
  }
}
function readImportedHtml(docId: string): string | null {
  const mem =
    (window.__kacheriImport &&
      (window.__kacheriImport[docId] ||
        window.__kacheriImport[`doc-${docId}`])) ||
    "";
  if (mem && mem.trim().length) return mem;
  const k1 = `import:${docId}:html`;
  const k2 = `import:doc-${docId}:html`;
  try {
    const s1 = sessionStorage.getItem(k1);
    if (s1 && s1.trim().length) return s1;
  } catch {}
  try {
    const s2 = sessionStorage.getItem(k2);
    if (s2 && s2.trim().length) return s2;
  } catch {}
  return null;
}
function clearImportedHtml(docId: string) {
  try {
    if (window.__kacheriImport) {
      delete window.__kacheriImport[docId];
      delete window.__kacheriImport[`doc-${docId}`];
    }
  } catch {}
  try {
    sessionStorage.removeItem(`import:${docId}:html`);
  } catch {}
  try {
    sessionStorage.removeItem(`import:doc-${docId}:html`);
  } catch {}
}

// ---- Template content helpers ----
function readTemplateContent(docId: string): object | null {
  const key = `template-content-${docId}`;
  try {
    const s = sessionStorage.getItem(key);
    if (s && s.trim().length) {
      return JSON.parse(s);
    }
  } catch {}
  return null;
}
function clearTemplateContent(docId: string) {
  try {
    sessionStorage.removeItem(`template-content-${docId}`);
  } catch {}
}

export default function EditorPage() {
  const { id: docIdParam } = useParams<{ id: string }>();
  const docId = (docIdParam || "").replace(/^doc-/, "");
  const location = useLocation();
  const navigate = useNavigate();

  // Workspace + user (local controls)
  const [workspaceId, setWorkspaceId] = useState<string>(getWorkspaceId());
  const [userId, setUserId] = useState<string>(getUserId());
  useEffect(() => {
    localStorage.setItem("workspaceId", workspaceId);
  }, [workspaceId]);
  useEffect(() => {
    localStorage.setItem("userId", userId);
  }, [userId]);

  // Workspace socket: for real-time events (proofs, AI jobs, etc.)
  const { events, connectionState, reconnectAttempts } = useWorkspaceSocket(workspaceId, { userId, displayName: userId });

  // Document title (inline rename in toolbar)
  const [docTitle, setDocTitle] = useState("Untitled");
  const [savingTitle, setSavingTitle] = useState(false);
  // Doc's actual workspaceId (may differ from user's current workspace context)
  const [docWorkspaceId, setDocWorkspaceId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const row = await DocsAPI.get(docId);
        setDocTitle(row.title || "Untitled");
        setDocWorkspaceId(row.workspaceId ?? null);
      } catch {
        /* noop */
      }
    })();
  }, [docId]);

  // Editor API
  const editorApiRef = useRef<EditorApi | null>(null);

  // Palette state
  const [isPalOpen, setPalOpen] = useState(false);
  const [palSnap, setPalSnap] = useState<PalSnap | null>(null);

  // Capture selection BEFORE opening palette (hotkey & button)
  const captureForPalette = useCallback(() => {
    const api = editorApiRef.current;
    const full = api?.getPlainText() || "";
    const plain =
      api?.getSelectionOffsetsInPlainText() || { start: 0, end: 0 };
    const pos = api?.getSelectionPositions?.() || { from: 0, to: 0 };
    setPalSnap({ fullText: full, plain, pos, ts: Date.now() });
  }, []);
  usePaletteHotkey((b) => setPalOpen(b), captureForPalette);

  // Diff modal state
  const [diffOpen, setDiffOpen] = useState(false);
  const [beforeText, setBeforeText] = useState("");
  const [afterText, setAfterText] = useState("");
  const [proposalKind, setProposalKind] =
    useState<ProposalKind>("insert-below-selection");
  const [diffTitle, setDiffTitle] = useState(
    "AI proposal — review & approve"
  );

  // Text actually applied when Accepting a proposal.
  const [applyText, setApplyText] = useState<string | null>(null);

  // Tracks whether the current diff came from an import handoff
  const [isImportProposal, setIsImportProposal] = useState(false);
  const [importHandled, setImportHandled] = useState(false);

  // Keep the raw imported HTML so we can apply it directly on Accept.
  const importedHtmlRef = useRef<string>("");

  // PDF import modal state
  const [pdfImportOpen, setPdfImportOpen] = useState(false);
  const [pdfImportData, setPdfImportData] = useState<{
    pdfUrl: string;
    html: string;
  } | null>(null);

  // Where to apply selection-scoped proposals on Accept.
  const [applyAtPos, setApplyAtPos] =
    useState<{ from: number; to: number } | null>(null);

  // -------- Evidence panel state -------
  const [proofsOpen, setProofsOpen] = useState<boolean>(() => {
    return localStorage.getItem("kacheri:proofsOpen") === "1";
  });
  useEffect(() => {
    localStorage.setItem("kacheri:proofsOpen", proofsOpen ? "1" : "0");
  }, [proofsOpen]);

  const [proofsRefreshKey, setProofsRefreshKey] = useState(0);

  // -------- Comments panel state --------
  const [commentsOpen, setCommentsOpen] = useState<boolean>(() => {
    return localStorage.getItem("kacheri:commentsOpen") === "1";
  });
  useEffect(() => {
    localStorage.setItem("kacheri:commentsOpen", commentsOpen ? "1" : "0");
  }, [commentsOpen]);

  const [commentsRefreshKey, setCommentsRefreshKey] = useState(0);
  const [commentSelection, setCommentSelection] = useState<{
    start: number;
    end: number;
    text: string;
  } | null>(null);

  // -------- Versions panel state --------
  const [versionsOpen, setVersionsOpen] = useState<boolean>(() => {
    return localStorage.getItem("kacheri:versionsOpen") === "1";
  });
  useEffect(() => {
    localStorage.setItem("kacheri:versionsOpen", versionsOpen ? "1" : "0");
  }, [versionsOpen]);

  const [versionsRefreshKey, setVersionsRefreshKey] = useState(0);

  // -------- Suggestions panel state --------
  const [suggestionsOpen, setSuggestionsOpen] = useState<boolean>(() => {
    return localStorage.getItem("kacheri:suggestionsOpen") === "1";
  });
  useEffect(() => {
    localStorage.setItem("kacheri:suggestionsOpen", suggestionsOpen ? "1" : "0");
  }, [suggestionsOpen]);

  const [suggestionsRefreshKey, setSuggestionsRefreshKey] = useState(0);
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null);

  // -------- Extraction panel state --------
  const [extractionRefreshKey, setExtractionRefreshKey] = useState(0);

  // -------- Compliance panel state --------
  const [complianceRefreshKey, setComplianceRefreshKey] = useState(0);
  const [complianceStatus, setComplianceStatus] = useState<CheckStatus | 'unchecked'>('unchecked');
  const [complianceViolations, setComplianceViolations] = useState(0);
  const [complianceWarnings, setComplianceWarnings] = useState(0);

  // Fetch latest compliance status for badge
  useEffect(() => {
    (async () => {
      try {
        const res = await complianceApi.getLatest(docId);
        setComplianceStatus(res.status as CheckStatus);
        setComplianceViolations(res.violations);
        setComplianceWarnings(res.warnings);
      } catch {
        setComplianceStatus('unchecked');
        setComplianceViolations(0);
        setComplianceWarnings(0);
      }
    })();
  }, [docId, complianceRefreshKey]);

  // -------- Clause library state --------
  const [clauseRefreshKey, setClauseRefreshKey] = useState(0);
  const [saveClauseOpen, setSaveClauseOpen] = useState(false);
  const [saveClauseHtml, setSaveClauseHtml] = useState('');
  const [saveClauseText, setSaveClauseText] = useState('');

  // -------- Clause suggestion state (B12) --------
  const [hasWorkspaceClauses, setHasWorkspaceClauses] = useState(false);

  // Check if workspace has any clauses on mount (for suggestion popover)
  useEffect(() => {
    (async () => {
      try {
        const res = await clausesApi.list(workspaceId, { limit: 1 });
        setHasWorkspaceClauses(res.total > 0);
      } catch {
        setHasWorkspaceClauses(false);
      }
    })();
  }, [workspaceId, clauseRefreshKey]);

  // -------- Related docs / Knowledge Graph state (Slice 17) --------
  const [relatedRefreshKey, setRelatedRefreshKey] = useState(0);
  const [docEntityCount, setDocEntityCount] = useState(0);

  // Fetch entity count for the current document (for toolbar badge)
  useEffect(() => {
    (async () => {
      try {
        const res = await knowledgeApi.getDocEntities(docId);
        setDocEntityCount(res.total);
      } catch {
        setDocEntityCount(0);
      }
    })();
  }, [docId, relatedRefreshKey]);

  // -------- Negotiation panel state --------
  const [negotiationRefreshKey, setNegotiationRefreshKey] = useState(0);
  const [activeNegotiationCount, setActiveNegotiationCount] = useState(0);
  const [negotiationAction, setNegotiationAction] = useState<NegotiationPanelAction>(null);
  const [negotiationSettledFlash, setNegotiationSettledFlash] = useState(false);

  // -------- Attachments panel state --------
  const [attachmentsRefreshKey, setAttachmentsRefreshKey] = useState(0);
  const [viewingAttachment, setViewingAttachment] = useState<DocAttachment | null>(null);

  // -------- Reviewers panel state (Slice 12) --------
  const [reviewersRefreshKey, setReviewersRefreshKey] = useState(0);

  // Fetch active negotiation count for toolbar badge
  useEffect(() => {
    (async () => {
      try {
        const res = await negotiationSessionsApi.list(docId);
        const active = res.sessions.filter(s => !['settled', 'abandoned'].includes(s.status));
        setActiveNegotiationCount(active.length);
      } catch {
        setActiveNegotiationCount(0);
      }
    })();
  }, [docId, negotiationRefreshKey]);

  // -------- Backlinks panel state --------
  const [backlinksOpen, setBacklinksOpen] = useState<boolean>(() => {
    return localStorage.getItem("kacheri:backlinksOpen") === "1";
  });
  useEffect(() => {
    localStorage.setItem("kacheri:backlinksOpen", backlinksOpen ? "1" : "0");
  }, [backlinksOpen]);

  // Auto-refresh Proofs, Comments, Versions, and Suggestions when the workspace broadcasts events for THIS doc
  const seenCountRef = useRef(0);
  useEffect(() => {
    if (events.length <= seenCountRef.current) return;
    for (let i = seenCountRef.current; i < events.length; i++) {
      const e = events[i];
      if (e.type === "proof_added" && e.docId === docId) {
        setProofsRefreshKey((k) => k + 1);
      }
      if (e.type === "comment" && (e as any).docId === docId) {
        setCommentsRefreshKey((k) => k + 1);
      }
      if (e.type === "version" && (e as any).docId === docId) {
        setVersionsRefreshKey((k) => k + 1);
      }
      if (e.type === "suggestion" && (e as any).docId === docId) {
        setSuggestionsRefreshKey((k) => k + 1);
      }
      if (e.type === "extraction" && (e as any).docId === docId) {
        setExtractionRefreshKey((k) => k + 1);
      }
      if (e.type === "ai_job" && (e as any).kind === "compliance_check" && (e as any).docId === docId) {
        setComplianceRefreshKey((k) => k + 1);
      }
      if (e.type === "ai_job" && (e as any).kind === "knowledge_index") {
        setRelatedRefreshKey((k) => k + 1);
      }
      if (e.type === "negotiation" || (e.type === "ai_job" && ((e as any).kind === "negotiation_import" || (e as any).kind === "negotiation_analyze" || (e as any).kind === "negotiation_counterproposal"))) {
        setNegotiationRefreshKey((k) => k + 1);
      }
      if (e.type === "attachment" && (e as any).docId === docId) {
        setAttachmentsRefreshKey((k) => k + 1);
      }
      if (e.type === "reviewer" && (e as any).docId === docId) {
        setReviewersRefreshKey((k) => k + 1);
      }
      // Settlement notification flash (Slice 16)
      if (e.type === "negotiation" && (e as any).action === "settled") {
        setNegotiationSettledFlash(true);
        setTimeout(() => setNegotiationSettledFlash(false), 5000);
      }
    }
    seenCountRef.current = events.length;
  }, [events, docId]);

  // Shared PromptDialog state (rename / delete / compose)
  const [promptKind, setPromptKind] =
    useState<EditorPromptState>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  const closePrompt = useCallback(() => {
    setPromptKind(null);
    setPromptError(null);
    setPromptLoading(false);
  }, []);

  // ---- Find/Replace dialog state ----
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);
  const [findCurrentIndex, setFindCurrentIndex] = useState<number | null>(
    null
  );
  const [findTotal, setFindTotal] = useState(0);

  // ---- Share dialog state ----
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  // ---- Page Setup dialog state ----
  const [pageSetupOpen, setPageSetupOpen] = useState(false);
  const [layoutSettings, setLayoutSettings] = useState<LayoutSettings>(DEFAULT_LAYOUT_SETTINGS);

  // ---- Image Insert dialog state ----
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [docPickerOpen, setDocPickerOpen] = useState(false);

  // ---- Canvas Frame Embed picker state (Slice P9) ----
  const [canvasPickerOpen, setCanvasPickerOpen] = useState(false);
  const [canvasPickerList, setCanvasPickerList] = useState<Canvas[]>([]);
  const [canvasPickerFrames, setCanvasPickerFrames] = useState<CanvasFrame[]>([]);
  const [canvasPickerSelectedCanvas, setCanvasPickerSelectedCanvas] = useState<string | null>(null);
  const [canvasPickerLoading, setCanvasPickerLoading] = useState(false);

  // ---- Keyboard Shortcuts modal state ----
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // ---- Proof Onboarding modal state (Phase 5 - P3.1) ----
  const [onboardingOpen, setOnboardingOpen] = useState(() => shouldShowOnboarding());

  // ---- Read Aloud (TTS) state ----
  const [readAloudOpen, setReadAloudOpen] = useState(false);
  const [ttsText, setTtsText] = useState("");

  // Initialize TTS hook with callbacks for proof recording
  const [ttsState, ttsActions] = useTTS({
    onEnd: async (duration) => {
      // Record completed TTS action to provenance
      try {
        await EvidenceAPI.appendProvenance(docId, {
          action: "tts:read_aloud",
          actor: getUserId(),
          preview: ttsText.slice(0, 300),
          details: {
            textLength: ttsText.length,
            duration,
            voice: ttsState.currentVoice?.name,
            rate: ttsState.rate,
            completed: true,
          },
        });
        setProofsRefreshKey((k) => k + 1);
      } catch (err) {
        console.error("Failed to record TTS proof:", err);
      }
    },
    onStop: async (duration, progress) => {
      // Record stopped (partial) TTS action to provenance
      if (duration > 500) {
        try {
          await EvidenceAPI.appendProvenance(docId, {
            action: "tts:read_aloud",
            actor: getUserId(),
            preview: ttsText.slice(0, 300),
            details: {
              textLength: ttsText.length,
              duration,
              voice: ttsState.currentVoice?.name,
              rate: ttsState.rate,
              completed: false,
              progressPercent: Math.round(progress),
            },
          });
          setProofsRefreshKey((k) => k + 1);
        } catch (err) {
          console.error("Failed to record TTS proof:", err);
        }
      }
    },
  });

  // Handle Read Aloud button click
  const handleReadAloud = useCallback(() => {
    const api = editorApiRef.current;
    if (!api) return;

    // Get selected text or full document
    const selectedText = api.getSelectionText?.() || "";
    const text = selectedText.trim() || (api.getPlainText?.() || "");

    if (!text.trim()) {
      alert("No text to read aloud.");
      return;
    }

    setTtsText(text);
    setReadAloudOpen(true);
    // Auto-start speaking
    setTimeout(() => ttsActions.speak(text), 100);
  }, [ttsActions]);

  // ---- Dictation (STT) state ----
  const [dictateOpen, setDictateOpen] = useState(false);
  const [dictateLanguage, setDictateLanguage] = useState("en-US");

  // Initialize STT hook with proof callbacks
  const [sttState, sttActions] = useSTT({
    onEnd: async (finalTranscript, duration) => {
      // Record completed dictation to provenance
      if (finalTranscript.trim()) {
        try {
          await EvidenceAPI.appendProvenance(docId, {
            action: "stt:dictate",
            actor: getUserId(),
            preview: finalTranscript.slice(0, 300),
            details: {
              textLength: finalTranscript.length,
              duration,
              language: dictateLanguage,
              completed: true,
            },
          });
          setProofsRefreshKey((k) => k + 1);
        } catch (err) {
          console.error("Failed to record STT proof:", err);
        }
      }
    },
    onStop: async (partialTranscript, duration) => {
      // Record stopped (partial) dictation to provenance
      if (duration > 500 && partialTranscript.trim()) {
        try {
          await EvidenceAPI.appendProvenance(docId, {
            action: "stt:dictate",
            actor: getUserId(),
            preview: partialTranscript.slice(0, 300),
            details: {
              textLength: partialTranscript.length,
              duration,
              language: dictateLanguage,
              completed: false,
            },
          });
          setProofsRefreshKey((k) => k + 1);
        } catch (err) {
          console.error("Failed to record STT proof:", err);
        }
      }
    },
  });

  // Handle Dictate button click
  const handleDictate = useCallback(() => {
    if (!sttState.isSupported) {
      alert("Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.");
      return;
    }
    // Stop TTS if playing
    if (ttsState.status !== 'idle') {
      ttsActions.stop();
    }
    setDictateOpen(true);
  }, [sttState.isSupported, ttsState.status, ttsActions]);

  // Handle inserting dictated text
  const handleInsertDictatedText = useCallback((text: string) => {
    const api = editorApiRef.current;
    if (api && text.trim()) {
      api.insertBelowSelection(text);
    }
  }, []);

  // ---- Translation state ----
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translateSource, setTranslateSource] = useState("");
  const [translateIsFullDoc, setTranslateIsFullDoc] = useState(false);

  // ---- View Original (imported source) state ----
  const [importMeta, setImportMeta] = useState<{
    docId: string;
    kind: string;
    sourceUrl: string | null;
    meta: any;
    ts: number;
  } | null>(null);
  const [originalSourceOpen, setOriginalSourceOpen] = useState(false);

  // Handle Translate button click
  const handleTranslate = useCallback(() => {
    const api = editorApiRef.current;
    const selection = api?.getSelectionText?.() || "";

    if (selection.trim()) {
      // Selection mode
      setTranslateSource(selection);
      setTranslateIsFullDoc(false);
    } else {
      // Full document mode
      const fullText = api?.getPlainText?.() || "";
      if (!fullText.trim()) {
        alert("No text to translate");
        return;
      }
      setTranslateSource(fullText);
      setTranslateIsFullDoc(true);
    }
    setTranslateOpen(true);
  }, []);

  // Handle translation apply action
  const handleTranslateApply = useCallback(
    (action: "replace" | "insert" | "copy", translatedText: string) => {
      const api = editorApiRef.current;
      if (!api) return;

      if (action === "copy") {
        navigator.clipboard.writeText(translatedText);
      } else if (action === "replace") {
        if (translateIsFullDoc) {
          api.setFullText(translatedText);
        } else {
          api.replaceSelection(translatedText);
        }
      } else if (action === "insert") {
        api.insertBelowSelection(translatedText);
      }

      setTranslateOpen(false);
      setProofsRefreshKey((k) => k + 1);
    },
    [translateIsFullDoc]
  );

  // ---- Fetch import metadata for "View Original" button ----
  useEffect(() => {
    (async () => {
      try {
        const meta = await DocsAPI.getImportMeta(docId);
        setImportMeta(meta);
      } catch {
        setImportMeta(null);
      }
    })();
  }, [docId]);

  // ---- Drawer state (Calm/Pro Layout) ----
  const [leftDrawerOpen, setLeftDrawerOpen] = useState<boolean>(() => {
    return localStorage.getItem("kacheri:leftDrawerOpen") === "1";
  });
  const [rightDrawerOpen, setRightDrawerOpen] = useState<boolean>(() => {
    return localStorage.getItem("kacheri:rightDrawerOpen") === "1";
  });
  const [rightDrawerTab, setRightDrawerTab] = useState<
    "proofs" | "comments" | "versions" | "suggestions" | "backlinks" | "extraction" | "compliance" | "clauses" | "related" | "negotiations" | "attachments" | "reviewers"
  >("proofs");
  const [composeInput, setComposeInput] = useState("");

  // ---- Mobile responsive state ----
  const [toolbarExpanded, setToolbarExpanded] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Swipe-to-dismiss for drawers (mobile bottom sheet)
  const drawerTouchStartY = useRef<number | null>(null);
  const handleDrawerTouchStart = useCallback((e: React.TouchEvent) => {
    drawerTouchStartY.current = e.touches[0].clientY;
  }, []);
  const handleDrawerTouchEnd = useCallback((e: React.TouchEvent, close: () => void) => {
    if (drawerTouchStartY.current == null) return;
    const deltaY = e.changedTouches[0].clientY - drawerTouchStartY.current;
    if (deltaY > 80) close();
    drawerTouchStartY.current = null;
  }, []);

  // ---- Connection status for realtime badge ----
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  // Poll connection status from editor ref (updates when connection changes)
  // Perf: 3000ms is sufficient — connection changes are rare events
  useEffect(() => {
    const checkConnection = () => {
      const connected = editorApiRef.current?.isConnected?.() ?? false;
      setRealtimeConnected(prev => prev === connected ? prev : connected);
    };
    checkConnection();
    const interval = setInterval(checkConnection, 3000);
    return () => clearInterval(interval);
  }, []);

  // ---- Connection status badge: auto-hide "Connected" after 3s ----
  const [badgeVisible, setBadgeVisible] = useState(true);
  const badgeTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (badgeTimerRef.current != null) window.clearTimeout(badgeTimerRef.current);
    if (connectionState === 'connected') {
      badgeTimerRef.current = window.setTimeout(() => {
        setBadgeVisible(false);
        badgeTimerRef.current = null;
      }, 3000) as unknown as number;
    } else {
      setBadgeVisible(true);
    }
    return () => {
      if (badgeTimerRef.current != null) window.clearTimeout(badgeTimerRef.current);
    };
  }, [connectionState]);

  // ---- Conflict banner: show when reconnecting after offline edits ----
  const hadOfflineEditsRef = useRef(false);
  const [showConflictBanner, setShowConflictBanner] = useState(false);
  const prevConnectionStateRef = useRef<ConnectionState>(connectionState);
  useEffect(() => {
    const prev = prevConnectionStateRef.current;
    prevConnectionStateRef.current = connectionState;
    // Track: if user was offline and now came back online, check for offline edits
    if ((prev === 'offline' || prev === 'reconnecting') && (connectionState === 'syncing' || connectionState === 'connected')) {
      if (hadOfflineEditsRef.current) {
        setShowConflictBanner(true);
        hadOfflineEditsRef.current = false;
        // Auto-dismiss after 30s
        const t = window.setTimeout(() => setShowConflictBanner(false), 30_000);
        return () => window.clearTimeout(t);
      }
    }
  }, [connectionState]);

  // Detect edits while offline via keydown on editor area
  useEffect(() => {
    if (connectionState !== 'offline') return;
    const handler = (e: KeyboardEvent) => {
      // Printable key or backspace/delete — likely an edit
      if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Enter') {
        hadOfflineEditsRef.current = true;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [connectionState]);

  // ---- Numbering style state (tracked from editor selection) ----
  const [currentNumberingStyle, setCurrentNumberingStyle] = useState<NumberingStyle>("decimal");
  const [startFromValue, setStartFromValue] = useState<number | null>(null);

  // ---- Column layout state (tracked from editor selection) ----
  const [currentColumnCount, setCurrentColumnCount] = useState<number>(0);
  const [currentColumnGap, setCurrentColumnGap] = useState<ColumnGap>("medium");
  const [currentColumnRule, setCurrentColumnRule] = useState<ColumnRule>("none");
  const [currentColumnWidths, setCurrentColumnWidths] = useState<string | null>(null);

  // Perf: 500ms poll with setState guards — React skips re-render when
  // functional updater returns the same value (avoids unnecessary renders)
  useEffect(() => {
    const check = () => {
      const editor = editorApiRef.current?.editor;
      if (!editor) return;
      // Numbering attributes
      const listAttrs = editor.getAttributes("orderedList");
      const newStyle = (listAttrs?.numberingStyle as NumberingStyle) || "decimal";
      const newStart = listAttrs?.startFrom ?? null;
      setCurrentNumberingStyle(prev => prev === newStyle ? prev : newStyle);
      setStartFromValue(prev => prev === newStart ? prev : newStart);
      // Column attributes — 0 means cursor is not inside a columnSection
      const colAttrs = editor.getAttributes("columnSection");
      const newColCount = colAttrs?.columns ?? 0;
      const newGap = (colAttrs?.columnGap as ColumnGap) || "medium";
      const newRule = (colAttrs?.columnRule as ColumnRule) || "none";
      const newWidths = colAttrs?.columnWidths ?? null;
      setCurrentColumnCount(prev => prev === newColCount ? prev : newColCount);
      setCurrentColumnGap(prev => prev === newGap ? prev : newGap);
      setCurrentColumnRule(prev => prev === newRule ? prev : newRule);
      setCurrentColumnWidths(prev => prev === newWidths ? prev : newWidths);
    };
    const interval = setInterval(check, 500);
    return () => clearInterval(interval);
  }, []);

  // Persist drawer state
  useEffect(() => {
    localStorage.setItem("kacheri:leftDrawerOpen", leftDrawerOpen ? "1" : "0");
  }, [leftDrawerOpen]);
  useEffect(() => {
    localStorage.setItem("kacheri:rightDrawerOpen", rightDrawerOpen ? "1" : "0");
  }, [rightDrawerOpen]);

  // ---- Find dialog headings navigation ----
  const [findHeadings, setFindHeadings] = useState<HeadingIndexItem[]>([]);

  // Load layout settings when doc changes
  useEffect(() => {
    (async () => {
      try {
        const layout = await DocsAPI.getLayout(docId);
        setLayoutSettings(layout);
      } catch {
        setLayoutSettings(DEFAULT_LAYOUT_SETTINGS);
      }
    })();
  }, [docId]);

  // ---- Basic actions ----
  const runCreate = useCallback(async () => {
    const d = await DocsAPI.create("Untitled");
    navigate(`/doc/${d.id}`);
  }, [navigate]);

  const runRename = useCallback(() => {
    setPromptError(null);
    setPromptKind("rename-doc");
  }, []);

  const saveTitle = useCallback(
    async (value: string) => {
      const next = value.trim() || "Untitled";
      if (next === docTitle) return;
      setSavingTitle(true);
      try {
        await DocsAPI.rename(docId, next);
        setDocTitle(next);
      } finally {
        setSavingTitle(false);
      }
    },
    [docId, docTitle]
  );

  const runDelete = useCallback(() => {
    setPromptError(null);
    setPromptKind("delete-doc");
  }, []);

  // Handle layout settings update
  const handleApplyLayout = useCallback(async (settings: LayoutSettings) => {
    await DocsAPI.updateLayout(docId, settings);
    setLayoutSettings(settings);
  }, [docId]);

  const runExportPdf = useCallback(async () => {
    const html = editorApiRef.current?.getHTML() || "<p></p>";
    await DocsAPI.exportPdf(docId, html);
    alert("PDF exported. Open Proofs to verify or check your downloads.");
  }, [docId]);

  const queueExportDocx = useCallback(
    async () => {
      try {
        const html = editorApiRef.current?.getHTML() || "<p></p>";
        await DocsAPI.exportDocx(docId, html);
        alert(
          "DOCX export requested. Check Proofs & Activity for the record."
        );
      } catch (err: any) {
        alert(`DOCX export failed: ${err?.message || String(err)}`);
      }
    },
    [docId]
  );

  // ---- AI actions (heuristics) ----
  const runAi = useCallback(
    async (action: AiAction) => {
      const api = editorApiRef.current;
      const sel = api?.getSelectionText() || "";
      if (!sel) return alert("Select some text first.");

      try {
        const pos = api?.getSelectionPositions?.() || {
          from: 0,
          to: 0,
        };
        setApplyAtPos(sel ? pos : null);

        const out = await AiAPI.runAiAction(docId, action, sel);

        const kind =
          ((out as any).proposalKind as ProposalKind) ||
          (action === "rewrite_for_clarity"
            ? "replace-selection"
            : "insert-below-selection");

        const proposalText = (out as any).proposalText || "";

        setProposalKind(kind);
        setBeforeText(sel);
        setAfterText(proposalText);
        setApplyText(proposalText);

        setDiffTitle(
          action === "summarize"
            ? "Summarize — review & approve"
            : action === "extract_tasks"
            ? "Extract tasks — review & approve"
            : "Rewrite for clarity — review & approve"
        );

        setDiffOpen(true);
      } catch (err: any) {
        alert(`AI error: ${err?.message || String(err)}`);
      }
    },
    [docId]
  );

  // ---- AI Compose via toolbar (prompt) ---
  const runCompose = useCallback(() => {
    setPromptError(null);
    setPromptKind("compose");
  }, []);

  // ---- AI Compose via topbar input ---
  const handleComposeSubmit = useCallback(async () => {
    const promptText = composeInput.trim();
    if (!promptText) return;

    const api = editorApiRef.current;
    const sel = api?.getSelectionText() || "";
    const pos = api?.getSelectionPositions?.() || { from: 0, to: 0 };

    const { provider, model, seed } = readAiPrefs();
    try {
      const data = await AiAPI.compose(docId, {
        prompt: promptText,
        provider,
        model,
        seed,
        maxTokens: 600,
      });

      const text = data?.proposalText || "";
      if (!text) {
        alert("Compose returned no text.");
        return;
      }

      const kind: ProposalKind = sel ? "replace-selection" : "insert-below-selection";
      setProposalKind(kind);
      setBeforeText(sel);
      setAfterText(text);
      setApplyText(text);
      setApplyAtPos(sel ? pos : null);
      setDiffTitle("Compose — review & approve");
      setDiffOpen(true);
      setComposeInput(""); // Clear input after submitting
    } catch (err: any) {
      alert(`Compose failed: ${err?.message || String(err)}`);
    }
  }, [composeInput, docId]);

  // ---- Palette-only rewrite actions (Selective + Constrained)
  const runSelectiveRewriteFromPalette = useCallback(
    async (instructionsArg?: string) => {
      const api = editorApiRef.current;
      const full = palSnap?.fullText ?? api?.getPlainText() ?? "";
      const selOff =
        palSnap?.plain ?? api?.getSelectionOffsetsInPlainText() ?? {
          start: 0,
          end: 0,
        };

      if (!selOff || selOff.start === selOff.end) {
        alert(
          "Select some text first, then run the Selective rewrite command."
        );
        return;
      }

      const instructions = (instructionsArg ?? "").trim();
      if (!instructions) {
        return;
      }

      try {
        const { provider, model, seed } = readAiPrefs();
        const res = await AiAPI.rewriteSelection(docId, {
          fullText: full,
          selection: { start: selOff.start, end: selOff.end },
          instructions,
          provider,
          model,
          seed,
        });

        const rewritten: string = (res as any).rewritten ?? "";
        const newFullText: string = (res as any).newFullText ?? full;

        const fallbackSpan = full.slice(selOff.start, selOff.end) || "";
        const applySpan = rewritten !== "" ? rewritten : fallbackSpan;

        const pos =
          palSnap?.pos ||
          api?.getSelectionPositions?.() ||
          null;

        // Preview full-document diff, but apply only the rewritten span.
        setProposalKind("replace-selection");
        setBeforeText(full);
        setAfterText(newFullText);
        setApplyText(applySpan);
        setDiffTitle("Selective rewrite — review & approve");
        setApplyAtPos(pos);
        setDiffOpen(true);
      } catch (err: any) {
        alert(`Selective rewrite failed: ${err?.message || String(err)}`);
      }
    },
    [docId, palSnap]
  );

  const runConstrainedRewriteFromPalette = useCallback(
    async (instructionsArg?: string) => {
      const api = editorApiRef.current;
      const full = palSnap?.fullText ?? api?.getPlainText() ?? "";
      const selOff =
        palSnap?.plain ?? api?.getSelectionOffsetsInPlainText() ?? null;
      const maybeSel =
        selOff && selOff.start !== selOff.end ? selOff : null;

      const instructions = (instructionsArg ?? "").trim();
      if (!instructions) {
        return;
      }

      try {
        const { provider, model, seed } = readAiPrefs();
        const res = await AiAPI.constrainedRewrite(docId, {
          fullText: full,
          selection: maybeSel
            ? { start: maybeSel.start, end: maybeSel.end }
            : null,
          instructions,
          provider,
          model,
          seed,
        });

        const newFullText: string = (res as any).newFullText ?? full;
        const rewritten: string | undefined = (res as any).rewritten;

        const pos =
          maybeSel
            ? palSnap?.pos ||
              api?.getSelectionPositions?.() ||
              null
            : null;

        if (maybeSel && pos && typeof rewritten === "string") {
          // Selection-scoped constrained rewrite:
          setProposalKind("replace-selection");
          setBeforeText(full);
          setAfterText(newFullText);
          setApplyText(rewritten);
          setApplyAtPos(pos);
        } else {
          // Fallback: treat as full-document rewrite.
          setProposalKind("apply-fulltext");
          setBeforeText(full);
          setAfterText(newFullText);
          setApplyText(newFullText);
          setApplyAtPos(null);
        }

        setDiffTitle("Constrained rewrite — review & approve");
        setDiffOpen(true);
      } catch (err: any) {
        alert(`Constrained rewrite failed: ${err?.message || String(err)}`);
      }
    },
    [docId, palSnap]
  );

  // ---- Find/Replace helpers ----
  const runFind = useCallback(
    (direction: "forward" | "backward" = "forward") => {
      const api = editorApiRef.current;
      if (!api) return;

      const qRaw = findQuery.trim();
      if (!qRaw) {
        setFindCurrentIndex(null);
        setFindTotal(0);
        return;
      }

      const full = api.getPlainText?.() ?? "";
      const hay = findCaseSensitive ? full : full.toLowerCase();
      const needle = findCaseSensitive ? qRaw : qRaw.toLowerCase();

      const starts: number[] = [];
      let idx = 0;
      while (true) {
        const pos = hay.indexOf(needle, idx);
        if (pos === -1) break;
        starts.push(pos);
        idx = pos + needle.length;
      }

      const total = starts.length;
      setFindTotal(total);

      if (!total) {
        setFindCurrentIndex(null);
        return;
      }

      setFindCurrentIndex((prev) => {
        let nextIdx: number;
        if (prev == null || prev < 0 || prev >= total) {
          nextIdx = direction === "forward" ? 0 : total - 1;
        } else {
          nextIdx =
            direction === "forward"
              ? (prev + 1) % total
              : (prev - 1 + total) % total;
        }

        const start = starts[nextIdx];
        const end = start + needle.length;
        api.selectPlainTextRange?.({ start, end });
        return nextIdx;
      });
    },
    [findQuery, findCaseSensitive]
  );

  const runReplaceCurrent = useCallback(() => {
    const api = editorApiRef.current;
    if (!api) return;

    const qRaw = findQuery.trim();
    if (!qRaw) return;

    if (findCurrentIndex == null) {
      runFind("forward");
      return;
    }

    const full = api.getPlainText?.() ?? "";
    const hay = findCaseSensitive ? full : full.toLowerCase();
    const needle = findCaseSensitive ? qRaw : qRaw.toLowerCase();

    const starts: number[] = [];
    let idx = 0;
    while (true) {
      const pos = hay.indexOf(needle, idx);
      if (pos === -1) break;
      starts.push(pos);
      idx = pos + needle.length;
    }

    if (!starts.length) {
      setFindCurrentIndex(null);
      setFindTotal(0);
      return;
    }

    const safeIndex =
      findCurrentIndex < 0 || findCurrentIndex >= starts.length
        ? 0
        : findCurrentIndex;

    const start = starts[safeIndex];
    const end = start + needle.length;

    api.selectPlainTextRange?.({ start, end });
    api.replaceSelection(replaceValue);

    setFindCurrentIndex(null);
    setFindTotal(0);
  }, [
    findQuery,
    findCaseSensitive,
    findCurrentIndex,
    replaceValue,
    runFind,
  ]);

  // Replace all occurrences
  const runReplaceAll = useCallback(() => {
    const api = editorApiRef.current;
    if (!api) return;

    const qRaw = findQuery.trim();
    if (!qRaw) return;

    const full = api.getPlainText?.() ?? "";
    const hay = findCaseSensitive ? full : full.toLowerCase();
    const needle = findCaseSensitive ? qRaw : qRaw.toLowerCase();

    // Find all match positions
    const starts: number[] = [];
    let idx = 0;
    while (true) {
      const pos = hay.indexOf(needle, idx);
      if (pos === -1) break;
      starts.push(pos);
      idx = pos + needle.length;
    }

    if (!starts.length) return;

    // Replace from end to start to preserve offsets
    for (const start of [...starts].reverse()) {
      api.selectPlainTextRange?.({ start, end: start + needle.length });
      api.replaceSelection(replaceValue);
    }

    // Reset state
    setFindCurrentIndex(null);
    setFindTotal(0);
  }, [findQuery, findCaseSensitive, replaceValue]);

  // Re-run search when case sensitivity changes
  useEffect(() => {
    if (findOpen && findQuery.trim()) {
      runFind("forward");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findCaseSensitive]);

  // Populate headings list when find dialog opens
  useEffect(() => {
    if (!findOpen) {
      setFindHeadings([]);
      return;
    }
    const api = editorApiRef.current;
    if (!api) return;

    const html = api.getHTML?.() || "";
    const plain = api.getPlainText?.() || "";
    setFindHeadings(buildHeadingIndex(html, plain));
  }, [findOpen]);

  // Jump to heading handler
  const handleJumpToHeading = useCallback(
    (range: { start: number; end: number }) => {
      editorApiRef.current?.selectPlainTextRange?.(range);
    },
    []
  );

  // Add comment handler - captures current selection
  const handleAddComment = useCallback(() => {
    const api = editorApiRef.current;
    if (!api) return;
    const offsets = api.getSelectionOffsetsInPlainText?.() ?? { start: 0, end: 0 };
    const text = api.getSelectionText?.() ?? '';
    if (offsets.start === offsets.end || !text) {
      alert("Select some text first to add a comment.");
      return;
    }
    setCommentSelection({ start: offsets.start, end: offsets.end, text });
    setCommentsOpen(true);
  }, []);

  // ---- Save as Clause handler (B10) ----
  const handleSaveAsClause = useCallback(() => {
    const api = editorApiRef.current;
    if (!api) return;

    const selectedText = api.getSelectionText?.() || '';
    if (!selectedText.trim()) {
      alert('Select some text first to save as a clause.');
      return;
    }

    // Wrap plain text in paragraph tags for HTML content
    const htmlContent = `<p>${selectedText.replace(/\n/g, '</p><p>')}</p>`;

    setSaveClauseHtml(htmlContent);
    setSaveClauseText(selectedText);
    setSaveClauseOpen(true);
  }, []);

  // ---- Insert Clause handler (B11) ----
  const handleInsertClause = useCallback(async (clauseId: string) => {
    const api = editorApiRef.current;
    if (!api) return;

    try {
      const res = await clauseActionsApi.insert(docId, {
        clauseId,
        insertionMethod: 'manual',
      });

      // Insert clause HTML at cursor position
      api.insertBelowSelection(res.contentHtml);

      // Refresh proofs panel (clause insertion creates a proof)
      setProofsRefreshKey(k => k + 1);

      alert(`Clause '${res.clauseTitle}' inserted (tracked)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to insert clause';
      alert(`Insert clause failed: ${msg}`);
    }
  }, [docId]);

  // ---- AI clause suggestion replace handler (B12) ----
  const handleClauseSuggestionReplace = useCallback((clauseHtml: string, _clauseId: string) => {
    const api = editorApiRef.current;
    if (!api) return;

    // Replace the selected text with the standard clause content
    api.replaceSelection(clauseHtml);

    // Refresh proofs panel (clause insertion creates a proof)
    setProofsRefreshKey(k => k + 1);
  }, []);

  // ---- Import handoff detection ----
  useEffect(() => {
    if (importHandled || !docId) return;

    const qs = new URLSearchParams(location.search || "");
    const fromImport = qs.get("from") === "import";
    if (!fromImport) return;

    const html = readImportedHtml(docId);
    if (!html || !html.trim().length) return;

    const openWhenReady = async () => {
      const api = editorApiRef.current;
      if (!api) {
        setTimeout(openWhenReady, 40);
        return;
      }

      // Check if this is a PDF import
      try {
        const meta = await DocsAPI.getImportMeta(docId);
        if (meta && meta.kind && meta.kind.toLowerCase().includes("pdf")) {
          // PDF import - show PDFImportModal
          const pdfUrl = meta.sourceUrl || `/api/docs/${docId}/import/source`;
          setPdfImportData({ pdfUrl, html });
          setPdfImportOpen(true);
          setImportHandled(true);
          clearImportedHtml(docId);
          return;
        }
      } catch {
        // If meta fetch fails, fall back to regular DiffModal
      }

      // Non-PDF import - use regular DiffModal
      const currentPlain = api.getPlainText?.() || "";
      const importedPlain = htmlToPlainText(html);

      importedHtmlRef.current = html;

      setProposalKind("apply-fulltext");
      setBeforeText(currentPlain);
      setAfterText(importedPlain);
      setApplyText(importedPlain);
      setDiffTitle("Imported content — review & approve");
      setIsImportProposal(true);
      setDiffOpen(true);
      setImportHandled(true);
      clearImportedHtml(docId);
    };

    openWhenReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, location.search, importHandled]);

  // ---- Template content loading ----
  const [templateHandled, setTemplateHandled] = useState(false);
  useEffect(() => {
    if (templateHandled || !docId) return;

    const templateContent = readTemplateContent(docId);
    if (!templateContent) return;

    const applyTemplate = () => {
      const api = editorApiRef.current;
      if (!api) {
        setTimeout(applyTemplate, 50);
        return;
      }

      // Tiptap can accept JSON content directly via setContent
      // The editor's internal command will handle JSON format
      try {
        // Get the underlying Tiptap editor and set JSON content
        const editor = (api as any).editor;
        if (editor && editor.commands && editor.commands.setContent) {
          editor.commands.setContent(templateContent, false);
          editor.commands.focus("end");
        }
      } catch (err) {
        console.error("Failed to apply template content:", err);
      }

      setTemplateHandled(true);
      clearTemplateContent(docId);
    };

    applyTemplate();
  }, [docId, templateHandled]);

  /** PromptDialog config derived from current promptKind. */
  const promptConfig = useMemo(() => {
    if (!promptKind) return null;

    if (promptKind === "rename-doc") {
      return {
        mode: "prompt" as const,
        title: "Rename document",
        description: "Update the title for this doc.",
        initialValue: docTitle,
        placeholder: "Document title",
        confirmLabel: "Rename",
      };
    }
    if (promptKind === "delete-doc") {
      return {
        mode: "confirm" as const,
        title: "Delete this document?",
        description:
          "This will delete the document and its File Manager links. This cannot be undone.",
        confirmLabel: "Delete document",
      };
    }
    return {
      mode: "prompt" as const,
      title: "Propose: what should I write?",
      description:
        "Describe what you want drafted or improved. The AI proposal will be shown in a diff for review before it applies.",
      initialValue: "",
      placeholder:
        "e.g. Draft a one‑pager summarizing our Q4 roadmap…",
      confirmLabel: "Propose",
    };
  }, [promptKind, docTitle]);

  const handlePromptConfirm = useCallback(
    async (value?: string) => {
      if (!promptKind) return;

      try {
        setPromptLoading(true);
        setPromptError(null);

        if (promptKind === "rename-doc") {
          const next = (value ?? "").trim();
          if (!next) {
            setPromptError("Title can’t be empty.");
            return;
          }
          if (next === docTitle) {
            closePrompt();
            return;
          }
          await DocsAPI.rename(docId, next);
          setDocTitle(next);
          closePrompt();
        } else if (promptKind === "delete-doc") {
          await DocsAPI.delete(docId);
          closePrompt();
          navigate("/");
        } else if (promptKind === "compose") {
          const promptText = (value ?? "").trim();
          if (!promptText) {
            setPromptError("Describe what you want drafted.");
            return;
          }

          const api = editorApiRef.current;
          const sel = api?.getSelectionText() || "";
          const pos =
            api?.getSelectionPositions?.() || {
              from: 0,
              to: 0,
            };

          const { provider, model, seed } = readAiPrefs();
          const data = await AiAPI.compose(docId, {
            prompt: promptText,
            provider,
            model,
            seed,
            maxTokens: 600,
          });

          const text = data?.proposalText || "";
          if (!text) {
            setPromptError("Propose returned no text.");
            return;
          }

          const kind: ProposalKind = sel
            ? "replace-selection"
            : "insert-below-selection";
          setProposalKind(kind);
          setBeforeText(sel);
          setAfterText(text);
          setApplyText(text);
          setApplyAtPos(sel ? pos : null);
          setDiffTitle("Compose — review & approve");
          setDiffOpen(true);
          closePrompt();
        }
      } catch (err: any) {
        setPromptError(err?.message || String(err));
      } finally {
        setPromptLoading(false);
      }
    },
    [promptKind, docId, docTitle, navigate, closePrompt]
  );

  // ---- Canvas Frame Embed helpers (Slice P9) ----
  const openCanvasPicker = useCallback(async () => {
    if (!isProductEnabled("design-studio") || !workspaceId) return;
    setCanvasPickerOpen(true);
    setCanvasPickerLoading(true);
    setCanvasPickerSelectedCanvas(null);
    setCanvasPickerFrames([]);
    try {
      const res = await canvasApi.list(workspaceId, { limit: 100 });
      setCanvasPickerList(res.canvases);
    } catch {
      setCanvasPickerList([]);
    } finally {
      setCanvasPickerLoading(false);
    }
  }, [workspaceId]);

  const selectCanvasForEmbed = useCallback(async (canvasId: string) => {
    if (!workspaceId) return;
    setCanvasPickerSelectedCanvas(canvasId);
    setCanvasPickerLoading(true);
    try {
      const canvasWithFrames = await canvasApi.get(workspaceId, canvasId);
      setCanvasPickerFrames(canvasWithFrames.frames || []);
    } catch {
      setCanvasPickerFrames([]);
    } finally {
      setCanvasPickerLoading(false);
    }
  }, [workspaceId]);

  const insertCanvasFrame = useCallback((canvasId: string, frameId: string) => {
    const ed = editorApiRef.current?.editor;
    if (!ed) return;
    ed.chain().focus().insertCanvasEmbed({ canvasId, frameId, aspectRatio: "16/9" }).run();
    setCanvasPickerOpen(false);
  }, []);

  // ---- Command Palette registry ----
  const commands: Command[] = useMemo(
    () => [
      // Docs
      {
        id: "create",
        title: "Create new Doc",
        hint: "Home → New",
        run: () => runCreate(),
      },
      {
        id: "open-home",
        title: "Open Docs Home",
        run: () => navigate("/"),
      },
      {
        id: "rename",
        title: "Rename this Doc",
        run: () => runRename(),
      },
      {
        id: "delete",
        title: "Delete this Doc",
        run: () => runDelete(),
      },
      {
        id: "export",
        title: "Export → PDF",
        run: () => runExportPdf(),
      },
      {
        id: "export-docx-queue",
        title: "Export → DOCX (queue)",
        run: () => queueExportDocx(),
      },

      // View Original (only for imported documents)
      ...(importMeta && importMeta.sourceUrl
        ? [
            {
              id: "view-original",
              title: "View Original Source",
              hint: importMeta.kind?.replace("import:", "").toUpperCase(),
              run: () => setOriginalSourceOpen(true),
            },
          ]
        : []),

      // AI (heuristics)
      {
        id: "ai-sum",
        title: "AI: Summarize selection",
        run: () => runAi("summarize"),
      },
      {
        id: "ai-tasks",
        title: "AI: Extract tasks from selection",
        run: () => runAi("extract_tasks"),
      },
      {
        id: "ai-rewrite",
        title: "AI: Rewrite selection for clarity",
        run: () => runAi("rewrite_for_clarity"),
      },

      // AI (compose)
      {
        id: "ai-compose",
        title: "AI: Propose from prompt…",
        run: () => runCompose(),
      },

      // AI (rewrite — palette-only)
      {
        id: "ai-rewrite-selective",
        title: "AI: Selective rewrite (respect selection)",
        hint: "Type instructions, then press Enter",
        needsInput: true,
        run: (input?: string) =>
          runSelectiveRewriteFromPalette(input),
      },
      {
        id: "ai-rewrite-constrained",
        title: "AI: Constrained rewrite — strict",
        hint: "Type strict constraints, then press Enter",
        needsInput: true,
        run: (input?: string) =>
          runConstrainedRewriteFromPalette(input),
      },

      // Document Intelligence
      {
        id: "extract-intelligence",
        title: "Extract Intelligence",
        hint: "Open Document Intelligence panel",
        run: () => {
          setRightDrawerTab("extraction");
          setRightDrawerOpen(true);
        },
      },

      // Compliance Checker
      {
        id: "check-compliance",
        title: "Check Compliance",
        hint: "Open Compliance Checker panel",
        run: () => {
          setRightDrawerTab("compliance");
          setRightDrawerOpen(true);
        },
      },

      // Clause Library (B10 + B11)
      {
        id: "save-as-clause",
        title: "Save as Clause",
        hint: "Save selected text to Clause Library",
        run: () => handleSaveAsClause(),
      },
      {
        id: "insert-clause",
        title: "Insert Clause",
        hint: "Open Clause Library to insert",
        run: () => {
          setRightDrawerTab("clauses");
          setRightDrawerOpen(true);
        },
      },

      // Knowledge Graph (Slice 17)
      {
        id: "find-related-docs",
        title: "Find Related Documents",
        hint: "Open Related Documents panel",
        run: () => {
          setRightDrawerTab("related");
          setRightDrawerOpen(true);
        },
      },
      {
        id: "search-knowledge",
        title: "Search Knowledge",
        hint: "Open Knowledge Explorer for semantic search",
        run: () => navigate(`/workspaces/${workspaceId}/knowledge`),
      },

      // Negotiation (Slice 16)
      {
        id: "start-negotiation",
        title: "Start Negotiation",
        hint: "Create a new negotiation session",
        run: () => {
          setNegotiationAction('create');
          setRightDrawerTab("negotiations");
          setRightDrawerOpen(true);
        },
      },
      {
        id: "import-counterparty-doc",
        title: "Import Counterparty Document",
        hint: "Import document into active negotiation",
        run: () => {
          if (activeNegotiationCount === 0) { alert("No active negotiation. Start one first."); return; }
          setNegotiationAction('import');
          setRightDrawerTab("negotiations");
          setRightDrawerOpen(true);
        },
      },
      {
        id: "view-redline",
        title: "View Redline Comparison",
        hint: "Compare negotiation rounds side-by-side",
        run: () => {
          if (activeNegotiationCount === 0) { alert("No active negotiation. Start one first."); return; }
          setNegotiationAction('redline');
          setRightDrawerTab("negotiations");
          setRightDrawerOpen(true);
        },
      },
      {
        id: "analyze-changes",
        title: "Analyze Changes",
        hint: "AI analysis on negotiation changes",
        run: () => {
          if (activeNegotiationCount === 0) { alert("No active negotiation. Start one first."); return; }
          setNegotiationAction('analyze');
          setRightDrawerTab("negotiations");
          setRightDrawerOpen(true);
        },
      },

      // Canvas Frame Embedding (Slice P9)
      ...(isProductEnabled("design-studio")
        ? [
            {
              id: "insert-canvas-frame",
              title: "Insert Canvas Frame",
              hint: "Embed a Design Studio frame",
              run: () => openCanvasPicker(),
            },
          ]
        : []),
    ],
    [
      navigate,
      runCreate,
      runRename,
      runDelete,
      runExportPdf,
      queueExportDocx,
      runAi,
      runCompose,
      runSelectiveRewriteFromPalette,
      runConstrainedRewriteFromPalette,
      importMeta,
      handleSaveAsClause,
      activeNegotiationCount,
      openCanvasPicker,
    ]
  );

  // ---- Ctrl/Cmd+F hotkey for Find ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindOpen(true);
        setTimeout(() => runFind("forward"), 0);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [runFind]);

  // ---- Ctrl/Cmd+? hotkey for Keyboard Shortcuts ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Shift + ? (which is Ctrl/Cmd + Shift + /)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "?" || e.key === "/")) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ---- Ctrl/Cmd+Shift+N hotkey for Negotiate panel (Slice 16) ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        if (rightDrawerTab === "negotiations" && rightDrawerOpen) {
          setRightDrawerOpen(false);
        } else {
          setRightDrawerTab("negotiations");
          setRightDrawerOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [rightDrawerTab, rightDrawerOpen]);

  return (
    <div className="editor-layout">
      {/* ============================================================
          TOP BAR: Compose/Prompt Bar
          Navigation, Compose input, Document title, Page Setup, Share
          ============================================================ */}
      <div className="editor-topbar">
        {/* Hamburger menu — visible only on tablet/phone via CSS */}
        <button
          className="button ghost sm mobile-hamburger"
          onClick={() => setMobileNavOpen((o) => !o)}
          title="Navigation menu"
          style={{ fontSize: 16, flexShrink: 0 }}
        >
          ☰
        </button>

        <button
          className="button ghost sm"
          onClick={() => navigate("/")}
          style={{ fontSize: 13, flexShrink: 0 }}
        >
          ← Docs
        </button>

        <input
          className="editor-topbar-input topbar-hide-tablet"
          placeholder="Type a prompt and press Enter to compose..."
          value={composeInput}
          onChange={(e) => setComposeInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleComposeSubmit();
            }
          }}
        />

        <button
          className="button primary sm topbar-hide-tablet"
          onClick={handleComposeSubmit}
          disabled={!composeInput.trim()}
          style={{ fontSize: 13, flexShrink: 0 }}
        >
          Compose
        </button>

        <div className="spacer" />

        {/* Connection status badge */}
        <div
          className={`connection-badge${connectionState === 'connected' && !badgeVisible ? ' fade-out' : ''}`}
          aria-live="polite"
          role="status"
        >
          <span
            className={`connection-dot${
              connectionState === 'connected' || connectionState === 'syncing'
                ? ' green'
                : connectionState === 'reconnecting'
                ? ' amber pulse'
                : ' red'
            }`}
          />
          <span className="connection-label">
            {connectionState === 'connected'
              ? 'Connected'
              : connectionState === 'syncing'
              ? 'Syncing...'
              : connectionState === 'reconnecting'
              ? `Reconnecting (${reconnectAttempts}/\u221E)...`
              : 'Offline \u2014 changes saved locally'}
          </span>
        </div>

        {/* Document title */}
        <input
          className="input sm topbar-doc-title"
          style={{
            width: 200,
            maxWidth: "20vw",
            fontSize: 14,
            fontWeight: 500,
          }}
          value={docTitle}
          onChange={(e) => setDocTitle(e.target.value)}
          onBlur={(e) => saveTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          title="Document title"
        />
        <span className="badge" style={{ fontSize: 11, flexShrink: 0 }}>
          {savingTitle ? "Saving…" : "Saved"}
        </span>

        {/* Proof Health Badge - Phase 5 P1.1 */}
        <span className="topbar-hide-mobile">
          <ProofHealthBadge docId={docId} size="md" />
        </span>

        {/* Compose Determinism Indicator - Phase 5 P1.4 */}
        <span className="topbar-hide-mobile">
          <ComposeDeterminismIndicator docId={docId} compact />
        </span>

        <button
          className="button subtle sm topbar-hide-phone"
          title="Page Setup"
          onClick={() => setPageSetupOpen(true)}
          style={{ fontSize: 12, flexShrink: 0 }}
        >
          ⚙
        </button>
        <button
          className="button primary sm"
          title="Share document"
          onClick={() => setShareDialogOpen(true)}
          style={{ fontSize: 12, flexShrink: 0 }}
        >
          Share
        </button>
      </div>

      {/* ============================================================
          MAIN TOOLBAR: Essential Actions Only
          Insert items, Export, Find, Command Palette
          ============================================================ */}
      <div className="toolbar" role="toolbar" aria-label="Document toolbar">
        <div
          className={`toolbar-inner${toolbarExpanded ? ' expanded' : ''}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 20px",
            flexWrap: "wrap",
          }}
        >
          {/* Overflow toggle — visible only on tablet/phone via CSS */}
          <button
            className="button subtle sm toolbar-overflow-toggle"
            onClick={() => setToolbarExpanded((o) => !o)}
            title={toolbarExpanded ? "Collapse toolbar" : "More tools"}
            aria-expanded={toolbarExpanded}
            style={{ fontSize: 14 }}
          >
            {toolbarExpanded ? "✕" : "≡"}
          </button>

          {/* PRIMARY GROUP: Always visible */}
          <div className="toolbar-group toolbar-group-primary" role="group" aria-label="Primary actions">
            <button
              className={`button sm ${leftDrawerOpen ? "primary" : "subtle"}`}
              onClick={() => setLeftDrawerOpen((o) => !o)}
              title="Toggle formatting tools"
              aria-expanded={leftDrawerOpen}
              style={{ fontSize: 12 }}
            >
              Format
            </button>
            <div className="toolbar-divider" />
            <button
              className="button subtle sm toolbar-insert-btn"
              title="Insert table"
              onClick={() => editorApiRef.current?.insertTable?.({ rows: 3, cols: 3, withHeaderRow: true })}
              style={{ fontSize: 12 }}
            >
              Table
            </button>
            <button
              className="button subtle sm toolbar-insert-btn"
              title="Insert image"
              onClick={() => setImageDialogOpen(true)}
              style={{ fontSize: 12 }}
            >
              Image
            </button>
            <button
              className="button subtle sm toolbar-insert-btn"
              title="Insert doc link"
              onClick={() => setDocPickerOpen(true)}
              style={{ fontSize: 12 }}
            >
              Link
            </button>
            <button
              className="button subtle sm toolbar-insert-btn"
              title="Insert page break"
              onClick={() => editorApiRef.current?.insertPageBreak?.()}
              style={{ fontSize: 12 }}
            >
              Break
            </button>
            <div className="toolbar-divider" />
            <button
              className="button primary sm"
              onClick={runCompose}
              style={{ fontSize: 12, fontWeight: 600 }}
            >
              Propose...
            </button>
          </div>

          {/* SECONDARY GROUP: Export, voice, translate */}
          <div className="toolbar-group toolbar-group-secondary" role="group" aria-label="Export and voice">
            <AIHeatmapToggle
              docId={docId}
              editor={editorApiRef.current?.editor ?? null}
            />
            <div className="toolbar-divider" />
            <button className="button subtle sm" onClick={runExportPdf} style={{ fontSize: 12 }}>PDF</button>
            <button className="button subtle sm" onClick={queueExportDocx} style={{ fontSize: 12 }}>DOCX</button>
            {importMeta && importMeta.sourceUrl && (
              <button
                className="button subtle sm"
                onClick={() => setOriginalSourceOpen(true)}
                title="View original imported file"
                style={{ fontSize: 12 }}
              >
                Original
              </button>
            )}
            <button
              className={`button subtle sm ${ttsState.status !== 'idle' ? 'active' : ''}`}
              onClick={handleReadAloud}
              title="Read selected text or full document aloud"
              style={{ fontSize: 12 }}
            >
              Read
            </button>
            <button
              className={`button subtle sm ${sttState.status === 'recording' ? 'active' : ''}`}
              onClick={handleDictate}
              title="Dictate text (voice input)"
              style={{ fontSize: 12 }}
            >
              Dictate
            </button>
            <button
              className="button subtle sm"
              onClick={handleTranslate}
              title="Translate selection or full document"
              style={{ fontSize: 12 }}
            >
              Translate
            </button>
          </div>

          {/* INTEL GROUP: Intelligence, compliance, clauses, related, negotiate */}
          <div className="toolbar-group toolbar-group-intel" role="group" aria-label="Intelligence">
            <button
              className={`button subtle sm ${rightDrawerTab === "extraction" && rightDrawerOpen ? "active" : ""}`}
              onClick={() => {
                setRightDrawerTab("extraction");
                setRightDrawerOpen(true);
              }}
              title="Document Intelligence"
              style={{ fontSize: 12 }}
            >
              Intel
            </button>
            <button
              className={`button subtle sm ${rightDrawerTab === "compliance" && rightDrawerOpen ? "active" : ""}`}
              onClick={() => {
                setRightDrawerTab("compliance");
                setRightDrawerOpen(true);
              }}
              title="Compliance Checker"
              style={{ fontSize: 12 }}
            >
              Comply
            </button>
            <ComplianceBadge
              status={complianceStatus}
              violations={complianceViolations}
              warnings={complianceWarnings}
            />
            <button
              className={`button subtle sm ${rightDrawerTab === "clauses" && rightDrawerOpen ? "active" : ""}`}
              onClick={() => {
                setRightDrawerTab("clauses");
                setRightDrawerOpen(true);
              }}
              title="Clause Library"
              style={{ fontSize: 12 }}
            >
              Clauses
            </button>
            <button
              className="button subtle sm"
              onClick={handleSaveAsClause}
              title="Save selected text as a clause"
              style={{ fontSize: 12 }}
            >
              Save Clause
            </button>
            <button
              className={`button subtle sm ${rightDrawerTab === "related" && rightDrawerOpen ? "active" : ""}`}
              onClick={() => {
                setRightDrawerTab("related");
                setRightDrawerOpen(true);
              }}
              title="Related Documents"
              style={{ fontSize: 12, position: 'relative' }}
            >
              Related
              {docEntityCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  background: '#6366f1', color: '#fff',
                  borderRadius: '50%', minWidth: 16, height: 16,
                  fontSize: 10, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', padding: '0 4px',
                }}>
                  {docEntityCount > 99 ? '99+' : docEntityCount}
                </span>
              )}
            </button>
            <button
              className={`button subtle sm ${rightDrawerTab === "negotiations" && rightDrawerOpen ? "active" : ""}`}
              onClick={() => {
                setRightDrawerTab("negotiations");
                setRightDrawerOpen(true);
              }}
              title="Negotiation Sessions"
              style={{ fontSize: 12, position: 'relative' }}
            >
              Negotiate
              {activeNegotiationCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  background: '#f59e0b', color: '#000',
                  borderRadius: '50%', minWidth: 16, height: 16,
                  fontSize: 10, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', padding: '0 4px',
                }}>
                  {activeNegotiationCount > 9 ? '9+' : activeNegotiationCount}
                </span>
              )}
            </button>
          </div>

          <div className="spacer" />

          {/* ACTIONS GROUP: Always visible */}
          <div className="toolbar-group toolbar-group-actions" role="group" aria-label="Utilities">
            <button
              className="button subtle sm"
              title="Add comment on selection"
              onClick={handleAddComment}
              style={{ fontSize: 12 }}
            >
              + Comment
            </button>
            <button
              className="button subtle sm"
              title="Find & replace (Ctrl/Cmd+F)"
              onClick={() => { setFindOpen(true); runFind("forward"); }}
              style={{ fontSize: 12 }}
            >
              Find
            </button>
            <button
              className="button subtle sm"
              onMouseDown={(e) => { e.preventDefault(); captureForPalette(); }}
              onClick={() => setPalOpen(true)}
              title="Command Palette (Ctrl/Cmd + K)"
              style={{ fontSize: 12 }}
            >
              ⌘K
            </button>
            <button
              className="button subtle sm"
              onClick={() => setShortcutsOpen(true)}
              title="Keyboard Shortcuts (Ctrl/Cmd + ?)"
              style={{ fontSize: 12 }}
            >
              ?
            </button>
            <NotificationBell
              workspaceId={getWorkspaceId()}
              currentUserId={getUserId()}
            />
            <button
              className={`button sm ${rightDrawerOpen ? "primary" : "subtle"}`}
              onClick={() => setRightDrawerOpen((o) => !o)}
              title="Toggle panels"
              aria-expanded={rightDrawerOpen}
              style={{ fontSize: 12 }}
            >
              Panels
            </button>
          </div>
        </div>
      </div>

      {/* Conflict banner — shown when reconnecting after offline edits */}
      {showConflictBanner && (
        <div className="editor-banner editor-banner-warning" role="alert">
          <span>Some changes may have conflicted during offline editing. Please review recent changes.</span>
        </div>
      )}

      {/* ============================================================
          MAIN AREA: Left Drawer + Document + Right Drawer
          ============================================================ */}
      <div className="editor-main">
        {/* Scrim overlay when either drawer is open */}
        <div
          className={`drawer-scrim ${leftDrawerOpen || rightDrawerOpen ? "is-visible" : ""}`}
          onClick={() => {
            setLeftDrawerOpen(false);
            setRightDrawerOpen(false);
          }}
        />

        {/* Left Drawer Toggle (side) */}
        <button
          className="drawer-toggle drawer-toggle-left"
          onClick={() => setLeftDrawerOpen((o) => !o)}
          title={leftDrawerOpen ? "Close formatting" : "Open formatting"}
        >
          {leftDrawerOpen ? "‹" : "›"}
        </button>

        {/* Left Drawer - Formatting Tools */}
        <aside
          className={`drawer-left ${leftDrawerOpen ? "is-open" : ""}`}
          onTouchStart={handleDrawerTouchStart}
          onTouchEnd={(e) => handleDrawerTouchEnd(e, () => setLeftDrawerOpen(false))}
        >
          <div className="drawer-drag-handle" />
          <div className="drawer-header">
            <span className="drawer-title">Format</span>
            <button className="drawer-close" onClick={() => setLeftDrawerOpen(false)}>×</button>
          </div>
          <div className="drawer-content">
            {/* Font Group */}
            <div className="drawer-formatting-group">
              <div className="drawer-formatting-label">Typography</div>
              <div className="drawer-formatting-row">
                <select className="input sm" style={{ width: "100%", marginBottom: 8 }} title="Font family" defaultValue="inter">
                  <option value="inter">Inter</option>
                  <option value="arial">Arial</option>
                  <option value="times">Times New Roman</option>
                  <option value="georgia">Georgia</option>
                  <option value="courier">Courier New</option>
                </select>
              </div>
              <div className="drawer-formatting-row">
                <select className="input sm" style={{ width: 80 }} title="Font size" defaultValue="16">
                  <option value="10">10</option>
                  <option value="12">12</option>
                  <option value="14">14</option>
                  <option value="16">16</option>
                  <option value="18">18</option>
                  <option value="20">20</option>
                  <option value="24">24</option>
                  <option value="28">28</option>
                  <option value="36">36</option>
                </select>
                <select className="input sm" style={{ width: 70 }} title="Line spacing" defaultValue="1.5">
                  <option value="1">1.0</option>
                  <option value="1.15">1.15</option>
                  <option value="1.5">1.5</option>
                  <option value="2">2.0</option>
                </select>
              </div>
            </div>

            {/* Text Style Group */}
            <div className="drawer-formatting-group">
              <div className="drawer-formatting-label">Style</div>
              <div className="drawer-formatting-row">
                <button className="button subtle sm" title="Bold" style={{ fontWeight: 700, minWidth: 36 }}>B</button>
                <button className="button subtle sm" title="Italic" style={{ fontStyle: "italic", minWidth: 36 }}>I</button>
                <button className="button subtle sm" title="Underline" style={{ textDecoration: "underline", minWidth: 36 }}>U</button>
                <button className="button subtle sm" title="Strikethrough" style={{ textDecoration: "line-through", minWidth: 36 }}>S</button>
              </div>
            </div>

            {/* Color Group */}
            <div className="drawer-formatting-group">
              <div className="drawer-formatting-label">Colors</div>
              <div className="drawer-formatting-row">
                <button className="button subtle sm" title="Text color" style={{ minWidth: 50 }}>A ▾</button>
                <button className="button subtle sm" title="Highlight" style={{ minWidth: 50, background: "rgba(251, 191, 36, 0.3)" }}>🖍</button>
              </div>
            </div>

            {/* Alignment Group */}
            <div className="drawer-formatting-group">
              <div className="drawer-formatting-label">Alignment</div>
              <div className="drawer-formatting-row">
                <button className="button subtle sm" title="Align left" style={{ minWidth: 36 }}>≡</button>
                <button className="button subtle sm" title="Align center" style={{ minWidth: 36 }}>≡</button>
                <button className="button subtle sm" title="Align right" style={{ minWidth: 36 }}>≡</button>
                <button className="button subtle sm" title="Justify" style={{ minWidth: 36 }}>≡</button>
              </div>
            </div>

            {/* Lists Group */}
            <div className="drawer-formatting-group">
              <div className="drawer-formatting-label">Lists</div>
              <div className="drawer-formatting-row">
                <button className="button subtle sm" title="Bullet list" onClick={() => editorApiRef.current?.toggleBulletList?.()} style={{ minWidth: 36 }}>•</button>
                <button className="button subtle sm" title="Numbered list" onClick={() => editorApiRef.current?.toggleOrderedList?.()} style={{ minWidth: 36 }}>1.</button>
                <button className="button subtle sm" title="Decrease indent" onClick={() => editorApiRef.current?.liftListItem?.()} style={{ minWidth: 36 }}>←</button>
                <button className="button subtle sm" title="Increase indent" onClick={() => editorApiRef.current?.sinkListItem?.()} style={{ minWidth: 36 }}>→</button>
              </div>
              <div className="drawer-formatting-row" style={{ marginTop: 6 }}>
                <select
                  className="input sm"
                  style={{ width: "100%" }}
                  title="Numbering style"
                  value={currentNumberingStyle}
                  onChange={(e) => {
                    editorApiRef.current?.setNumberingStyle?.(e.target.value as NumberingStyle);
                  }}
                >
                  <option value="decimal">1, 2, 3 (Decimal)</option>
                  <option value="legal">1.1, 1.1.1 (Legal)</option>
                  <option value="alpha-lower">a, b, c (Alpha)</option>
                  <option value="alpha-upper">A, B, C (Alpha Upper)</option>
                  <option value="roman-lower">i, ii, iii (Roman)</option>
                  <option value="roman-upper">I, II, III (Roman Upper)</option>
                  <option value="outline">Outline (legacy)</option>
                </select>
              </div>
              <div className="drawer-formatting-row" style={{ marginTop: 4, alignItems: "center", gap: 6 }}>
                <label style={{ fontSize: 11, whiteSpace: "nowrap" }}>Start at:</label>
                <input
                  className="input sm"
                  type="number"
                  min={1}
                  style={{ width: 60 }}
                  value={startFromValue ?? ""}
                  placeholder="Auto"
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value, 10) : null;
                    editorApiRef.current?.setStartFrom?.(val && !isNaN(val) ? val : null);
                  }}
                />
              </div>
            </div>

            {/* Layout Group */}
            <div className="drawer-formatting-group">
              <div className="drawer-formatting-label">Layout</div>
              <div className="drawer-formatting-row">
                <select
                  className="input sm"
                  style={{ width: "100%" }}
                  title="Column layout"
                  value={currentColumnCount || 0}
                  onChange={(e) => {
                    const cols = parseInt(e.target.value, 10);
                    if (cols === 0) {
                      editorApiRef.current?.unwrapColumns?.();
                    } else if (currentColumnCount === 0) {
                      editorApiRef.current?.wrapInColumns?.(cols);
                    } else {
                      editorApiRef.current?.setColumnCount?.(cols);
                    }
                  }}
                >
                  <option value={0}>No Columns</option>
                  <option value={2}>2 Columns</option>
                  <option value={3}>3 Columns</option>
                  <option value={4}>4 Columns</option>
                </select>
              </div>
              {currentColumnCount >= 2 && (
                <>
                  <div className="drawer-formatting-row" style={{ marginTop: 6, gap: 6 }}>
                    <select
                      className="input sm"
                      style={{ flex: 1 }}
                      title="Column gap"
                      value={currentColumnGap}
                      onChange={(e) => {
                        editorApiRef.current?.setColumnGap?.(e.target.value as ColumnGap);
                      }}
                    >
                      <option value="narrow">Gap: Narrow</option>
                      <option value="medium">Gap: Medium</option>
                      <option value="wide">Gap: Wide</option>
                    </select>
                    <select
                      className="input sm"
                      style={{ flex: 1 }}
                      title="Column rule"
                      value={currentColumnRule}
                      onChange={(e) => {
                        editorApiRef.current?.setColumnRule?.(e.target.value as ColumnRule);
                      }}
                    >
                      <option value="none">Rule: None</option>
                      <option value="thin">Rule: Thin</option>
                      <option value="medium">Rule: Medium</option>
                    </select>
                  </div>
                  <div className="drawer-formatting-row" style={{ marginTop: 4 }}>
                    <select
                      className="input sm"
                      style={{ width: "100%" }}
                      title="Column widths"
                      value={currentColumnWidths ?? "equal"}
                      onChange={(e) => {
                        const val = e.target.value === "equal" ? null : e.target.value;
                        editorApiRef.current?.setColumnWidths?.(val);
                      }}
                    >
                      <option value="equal">Equal widths</option>
                      {currentColumnCount === 2 && <option value="2:1">Wide + Narrow (2:1)</option>}
                      {currentColumnCount === 2 && <option value="1:2">Narrow + Wide (1:2)</option>}
                      {currentColumnCount === 3 && <option value="1:1:1">Equal (1:1:1)</option>}
                      {currentColumnCount === 3 && <option value="1:2:1">Narrow-Wide-Narrow (1:2:1)</option>}
                      {currentColumnCount === 3 && <option value="2:1:1">Wide-Narrow-Narrow (2:1:1)</option>}
                      {currentColumnCount === 4 && <option value="1:1:1:1">Equal (1:1:1:1)</option>}
                    </select>
                  </div>
                </>
              )}
              <div className="drawer-formatting-row" style={{ marginTop: 6 }}>
                <button
                  className="button subtle sm"
                  title="Insert section break"
                  onClick={() => editorApiRef.current?.insertSectionBreak?.()}
                  style={{ width: "100%" }}
                >
                  Insert Section Break
                </button>
              </div>
            </div>

            {/* Clear Formatting */}
            <div className="drawer-formatting-group">
              <button className="button subtle sm" title="Clear formatting" style={{ width: "100%" }}>
                Clear Formatting
              </button>
            </div>
          </div>
        </aside>

        {/* Center Document */}
        <div className="editor-center" id="main-content">
          <div
            className="editor-shell"
            style={{
              "--page-margin-top": `${layoutSettings.margins.top}mm`,
              "--page-margin-bottom": `${layoutSettings.margins.bottom}mm`,
              "--page-margin-left": `${layoutSettings.margins.left}mm`,
              "--page-margin-right": `${layoutSettings.margins.right}mm`,
            } as React.CSSProperties}
          >
            <div className="tiptap">
              {/* Page Header Zone */}
              {layoutSettings.header?.enabled && (
                <div
                  className="page-header"
                  style={{ height: `${layoutSettings.header.height || 15}mm` }}
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(layoutSettings.header.content || ""),
                  }}
                />
              )}

              <Editor ref={editorApiRef} docId={docId} />

              {/* Page Footer Zone */}
              {layoutSettings.footer?.enabled && (
                <div
                  className="page-footer"
                  style={{ height: `${layoutSettings.footer.height || 15}mm` }}
                >
                  {layoutSettings.footer.content && (
                    <span
                      dangerouslySetInnerHTML={{
                        __html: sanitizeHtml(layoutSettings.footer.content),
                      }}
                    />
                  )}
                  {layoutSettings.footer.showPageNumbers && (
                    <span className="page-number-placeholder">
                      — Page 1 of 1
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Realtime status badge - floating at bottom of editor area */}
          <div className="realtime-status">
            Yjs:{" "}
            {realtimeConnected
              ? "synced"
              : "offline"}{" "}
            — room <code>doc-{docId}</code>
          </div>
        </div>

        {/* Right Drawer Toggle (side) */}
        <button
          className="drawer-toggle drawer-toggle-right"
          onClick={() => setRightDrawerOpen((o) => !o)}
          title={rightDrawerOpen ? "Close panels" : "Open panels"}
        >
          {rightDrawerOpen ? "›" : "‹"}
        </button>

        {/* Right Drawer - All Panels */}
        <aside
          className={`drawer-right ${rightDrawerOpen ? "is-open" : ""}`}
          aria-label="Document panels"
          onTouchStart={handleDrawerTouchStart}
          onTouchEnd={(e) => handleDrawerTouchEnd(e, () => setRightDrawerOpen(false))}
        >
          <div className="drawer-drag-handle" />
          <div className="drawer-tabs" role="tablist" aria-label="Document panels" onKeyDown={(e) => {
            const tabs = ["proofs","comments","versions","suggestions","backlinks","extraction","compliance","clauses","related","negotiations","attachments","reviewers"] as const;
            const idx = tabs.indexOf(rightDrawerTab as typeof tabs[number]);
            if (e.key === "ArrowRight") { e.preventDefault(); setRightDrawerTab(tabs[(idx + 1) % tabs.length]); }
            if (e.key === "ArrowLeft") { e.preventDefault(); setRightDrawerTab(tabs[(idx - 1 + tabs.length) % tabs.length]); }
          }}>
            <button
              role="tab"
              aria-selected={rightDrawerTab === "proofs"}
              aria-controls="drawer-panel-proofs"
              id="drawer-tab-proofs"
              tabIndex={rightDrawerTab === "proofs" ? 0 : -1}
              className={`drawer-tab ${rightDrawerTab === "proofs" ? "active" : ""}`}
              onClick={() => setRightDrawerTab("proofs")}
            >
              Proofs
            </button>
            <button
              role="tab"
              aria-selected={rightDrawerTab === "comments"}
              aria-controls="drawer-panel-comments"
              id="drawer-tab-comments"
              tabIndex={rightDrawerTab === "comments" ? 0 : -1}
              className={`drawer-tab ${rightDrawerTab === "comments" ? "active" : ""}`}
              onClick={() => setRightDrawerTab("comments")}
            >
              Comments
            </button>
            <button
              role="tab"
              aria-selected={rightDrawerTab === "versions"}
              aria-controls="drawer-panel-versions"
              id="drawer-tab-versions"
              tabIndex={rightDrawerTab === "versions" ? 0 : -1}
              className={`drawer-tab ${rightDrawerTab === "versions" ? "active" : ""}`}
              onClick={() => setRightDrawerTab("versions")}
            >
              Versions
            </button>
            <button
              role="tab"
              aria-selected={rightDrawerTab === "suggestions"}
              aria-controls="drawer-panel-suggestions"
              id="drawer-tab-suggestions"
              tabIndex={rightDrawerTab === "suggestions" ? 0 : -1}
              className={`drawer-tab ${rightDrawerTab === "suggestions" ? "active" : ""}`}
              onClick={() => setRightDrawerTab("suggestions")}
            >
              Suggest
            </button>
            <button
              role="tab"
              aria-selected={rightDrawerTab === "backlinks"}
              aria-controls="drawer-panel-backlinks"
              id="drawer-tab-backlinks"
              tabIndex={rightDrawerTab === "backlinks" ? 0 : -1}
              className={`drawer-tab ${rightDrawerTab === "backlinks" ? "active" : ""}`}
              onClick={() => setRightDrawerTab("backlinks")}
            >
              Links
            </button>
            <button
              role="tab"
              aria-selected={rightDrawerTab === "extraction"}
              aria-controls="drawer-panel-extraction"
              id="drawer-tab-extraction"
              tabIndex={rightDrawerTab === "extraction" ? 0 : -1}
              className={`drawer-tab ${rightDrawerTab === "extraction" ? "active" : ""}`}
              onClick={() => setRightDrawerTab("extraction")}
            >
              Intel
            </button>
            <button
              role="tab"
              aria-selected={rightDrawerTab === "compliance"}
              aria-controls="drawer-panel-compliance"
              id="drawer-tab-compliance"
              tabIndex={rightDrawerTab === "compliance" ? 0 : -1}
              className={`drawer-tab ${rightDrawerTab === "compliance" ? "active" : ""}`}
              onClick={() => setRightDrawerTab("compliance")}
            >
              Comply
            </button>
            <button
              role="tab"
              aria-selected={rightDrawerTab === "clauses"}
              aria-controls="drawer-panel-clauses"
              id="drawer-tab-clauses"
              tabIndex={rightDrawerTab === "clauses" ? 0 : -1}
              className={`drawer-tab ${rightDrawerTab === "clauses" ? "active" : ""}`}
              onClick={() => setRightDrawerTab("clauses")}
            >
              Clauses
            </button>
            <button
              role="tab"
              aria-selected={rightDrawerTab === "related"}
              aria-controls="drawer-panel-related"
              id="drawer-tab-related"
              tabIndex={rightDrawerTab === "related" ? 0 : -1}
              className={`drawer-tab ${rightDrawerTab === "related" ? "active" : ""}`}
              onClick={() => setRightDrawerTab("related")}
            >
              Related
            </button>
            <button
              role="tab"
              aria-selected={rightDrawerTab === "negotiations"}
              aria-controls="drawer-panel-negotiations"
              id="drawer-tab-negotiations"
              tabIndex={rightDrawerTab === "negotiations" ? 0 : -1}
              className={`drawer-tab ${rightDrawerTab === "negotiations" ? "active" : ""}`}
              onClick={() => setRightDrawerTab("negotiations")}
            >
              Negotiate
            </button>
            <button
              role="tab"
              aria-selected={rightDrawerTab === "attachments"}
              aria-controls="drawer-panel-attachments"
              id="drawer-tab-attachments"
              tabIndex={rightDrawerTab === "attachments" ? 0 : -1}
              className={`drawer-tab ${rightDrawerTab === "attachments" ? "active" : ""}`}
              onClick={() => setRightDrawerTab("attachments")}
            >
              Attach
            </button>
            <button
              role="tab"
              aria-selected={rightDrawerTab === "reviewers"}
              aria-controls="drawer-panel-reviewers"
              id="drawer-tab-reviewers"
              tabIndex={rightDrawerTab === "reviewers" ? 0 : -1}
              className={`drawer-tab ${rightDrawerTab === "reviewers" ? "active" : ""}`}
              onClick={() => setRightDrawerTab("reviewers")}
            >
              Review
            </button>
          </div>
          <div className="drawer-content" style={{ padding: 0 }} role="tabpanel" id={`drawer-panel-${rightDrawerTab}`} aria-labelledby={`drawer-tab-${rightDrawerTab}`}>
            <Suspense fallback={<PanelLoadingSpinner />}>
            {rightDrawerTab === "proofs" && (
              <ProofsPanel
                docId={docId}
                open={true}
                onClose={() => setRightDrawerOpen(false)}
                refreshKey={proofsRefreshKey}
              />
            )}
            {rightDrawerTab === "comments" && (
              <CommentsPanel
                docId={docId}
                open={true}
                onClose={() => setRightDrawerOpen(false)}
                refreshKey={commentsRefreshKey}
                editorApi={editorApiRef.current}
                currentSelection={commentSelection}
                onCommentCreated={() => setCommentSelection(null)}
                currentUserId={userId}
              />
            )}
            {rightDrawerTab === "versions" && (
              <VersionsPanel
                docId={docId}
                open={true}
                onClose={() => setRightDrawerOpen(false)}
                refreshKey={versionsRefreshKey}
                editorApi={editorApiRef.current}
                currentUserId={userId}
              />
            )}
            {rightDrawerTab === "suggestions" && (
              <SuggestionsPanel
                docId={docId}
                open={true}
                onClose={() => setRightDrawerOpen(false)}
                refreshKey={suggestionsRefreshKey}
                currentUserId={userId}
                role="editor"
                selectedSuggestionId={selectedSuggestion?.id}
                onSelectSuggestion={setSelectedSuggestion}
              />
            )}
            {rightDrawerTab === "backlinks" && (
              <BacklinksPanel
                docId={docId}
                open={true}
                onClose={() => setRightDrawerOpen(false)}
              />
            )}
            {rightDrawerTab === "extraction" && (
              <ExtractionPanel
                docId={docId}
                open={true}
                onClose={() => setRightDrawerOpen(false)}
                refreshKey={extractionRefreshKey}
                currentUserId={userId}
                embedded
                onNavigateToProofs={() => {
                  setRightDrawerTab("proofs");
                  setProofsRefreshKey((k) => k + 1);
                }}
              />
            )}
            {rightDrawerTab === "compliance" && (
              <CompliancePanel
                docId={docId}
                open={true}
                onClose={() => setRightDrawerOpen(false)}
                refreshKey={complianceRefreshKey}
                currentUserId={userId}
                embedded
                onNavigateToProofs={() => {
                  setRightDrawerTab("proofs");
                  setProofsRefreshKey((k) => k + 1);
                }}
              />
            )}
            {rightDrawerTab === "clauses" && (
              <ClauseLibraryPanel
                docId={docId}
                workspaceId={workspaceId}
                open={true}
                onClose={() => setRightDrawerOpen(false)}
                refreshKey={clauseRefreshKey}
                embedded
                onInsert={handleInsertClause}
              />
            )}
            {rightDrawerTab === "related" && (
              <RelatedDocsPanel
                docId={docId}
                open={true}
                onClose={() => setRightDrawerOpen(false)}
                refreshKey={relatedRefreshKey}
                embedded
              />
            )}
            {rightDrawerTab === "negotiations" && (
              <NegotiationPanel
                docId={docId}
                open={true}
                onClose={() => setRightDrawerOpen(false)}
                refreshKey={negotiationRefreshKey}
                currentUserId={userId}
                embedded
                onNavigateToProofs={() => {
                  setRightDrawerTab("proofs");
                  setProofsRefreshKey((k) => k + 1);
                }}
                requestedAction={negotiationAction}
                onActionHandled={() => setNegotiationAction(null)}
              />
            )}
            {rightDrawerTab === "attachments" && (
              <AttachmentPanel
                docId={docId}
                open={true}
                onClose={() => setRightDrawerOpen(false)}
                refreshKey={attachmentsRefreshKey}
                currentUserId={userId}
                workspaceId={workspaceId}
                onViewAttachment={(att) => setViewingAttachment(att)}
              />
            )}
            {rightDrawerTab === "reviewers" && (
              <ReviewersPanel
                docId={docId}
                open={true}
                onClose={() => setRightDrawerOpen(false)}
                refreshKey={reviewersRefreshKey}
                currentUserId={userId}
                workspaceId={workspaceId}
              />
            )}
            </Suspense>
          </div>
        </aside>
      </div>

      {/* Attachment viewer modal (Slice 5) */}
      {viewingAttachment && (
        <AttachmentViewer
          open={!!viewingAttachment}
          attachment={viewingAttachment}
          fileUrl={attachmentsApi.getFileUrl(docId, viewingAttachment.id)}
          onClose={() => setViewingAttachment(null)}
        />
      )}

      <CommandPalette
        isOpen={isPalOpen}
        onClose={() => setPalOpen(false)}
        commands={commands}
      />

      {/* Negotiation settlement flash notification (Slice 16) */}
      {negotiationSettledFlash && (
        <div className="negotiation-settled-flash">
          Negotiation settled! Accepted changes are now available as suggestions.
        </div>
      )}

      {/* Mobile navigation overlay — visible only on tablet/phone via CSS */}
      {mobileNavOpen && (
        <div className="mobile-nav-overlay" onClick={() => setMobileNavOpen(false)}>
          <nav className="mobile-nav-menu" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-nav-header">
              <span className="mobile-nav-title">Kacheri Docs</span>
              <button className="button ghost sm" onClick={() => setMobileNavOpen(false)}>✕</button>
            </div>
            <button className="mobile-nav-item" onClick={() => { navigate("/"); setMobileNavOpen(false); }}>Documents</button>
            <button className="mobile-nav-item" onClick={() => { navigate("/ai-watch"); setMobileNavOpen(false); }}>AI Watch</button>
            <button className="mobile-nav-item" onClick={() => { navigate(`/workspaces/${workspaceId}/extraction-standards`); setMobileNavOpen(false); }}>Standards</button>
            <button className="mobile-nav-item" onClick={() => { navigate(`/workspaces/${workspaceId}/compliance-policies`); setMobileNavOpen(false); }}>Compliance</button>
            <button className="mobile-nav-item" onClick={() => { navigate(`/workspaces/${workspaceId}/clauses`); setMobileNavOpen(false); }}>Clauses</button>
            <button className="mobile-nav-item" onClick={() => { navigate(`/workspaces/${workspaceId}/knowledge`); setMobileNavOpen(false); }}>Knowledge</button>
            <button className="mobile-nav-item" onClick={() => { navigate(`/workspaces/${workspaceId}/negotiations`); setMobileNavOpen(false); }}>Negotiations</button>
          </nav>
        </div>
      )}

      {/* Mobile bottom tab bar — visible only on phone via CSS */}
      <nav className="mobile-bottom-tabs">
        <button className="mobile-bottom-tab" onClick={() => navigate("/")}>
          <span className="mobile-bottom-tab-icon">📄</span>
          <span className="mobile-bottom-tab-label">Documents</span>
        </button>
        <button className="mobile-bottom-tab mobile-bottom-tab-active" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <span className="mobile-bottom-tab-icon">✏️</span>
          <span className="mobile-bottom-tab-label">Editor</span>
        </button>
        <button className="mobile-bottom-tab" onClick={() => navigate("/ai-watch")}>
          <span className="mobile-bottom-tab-icon">🔍</span>
          <span className="mobile-bottom-tab-label">AI Watch</span>
        </button>
      </nav>

      {/* Find / Replace dialog */}
      <FindReplaceDialog
        open={findOpen}
        query={findQuery}
        replaceValue={replaceValue}
        caseSensitive={findCaseSensitive}
        currentIndex={findCurrentIndex}
        total={findTotal}
        onChangeQuery={(v) => {
          setFindQuery(v);
          setFindCurrentIndex(null);
          setFindTotal(0);
        }}
        onChangeReplace={setReplaceValue}
        onToggleCaseSensitive={() =>
          setFindCaseSensitive((v) => !v)
        }
        onFindNext={() => runFind("forward")}
        onFindPrev={() => runFind("backward")}
        onReplaceCurrent={runReplaceCurrent}
        onReplaceAll={runReplaceAll}
        headings={findHeadings}
        onJumpToHeading={handleJumpToHeading}
        onClose={() => setFindOpen(false)}
      />

      <DiffModal
        open={diffOpen}
        before={beforeText}
        after={afterText}
        onAccept={async () => {
          if (!editorApiRef.current) return;

          const api = editorApiRef.current;
          const textToApply = applyText ?? afterText;

          if (proposalKind === "apply-fulltext") {
            if (
              isImportProposal &&
              importedHtmlRef.current &&
              (api as any).setHTML
            ) {
              (api as any).setHTML(
                importedHtmlRef.current
              );
            } else {
              api.setFullText(textToApply);
            }
          } else if (proposalKind === "replace-selection") {
            const pos =
              applyAtPos || api.getSelectionPositions?.();
            if (pos)
              api.setSelectionPositions?.(pos);
            api.replaceSelection(textToApply);
          } else {
            api.insertBelowSelection(textToApply);
          }

          if (isImportProposal) {
            try {
              await EvidenceAPI.appendProvenance(docId, {
                action: "import:apply",
                actor: userId,
                preview: textToApply.slice(0, 300),
                details: {
                  note: "Applied imported content via DiffModal",
                },
              });
            } catch {
              /* non-fatal */
            }
            setProofsRefreshKey((k) => k + 1);
          }

          setDiffOpen(false);
          setIsImportProposal(false);
          setApplyText(null);
          setApplyAtPos(null);

          try {
            const url = new URL(window.location.href);
            if (url.searchParams.get("from") === "import") {
              url.searchParams.delete("from");
              window.history.replaceState(
                null,
                "",
                url.toString()
              );
            }
          } catch {}
        }}
        onCancel={() => {
          setDiffOpen(false);
          setIsImportProposal(false);
          setApplyText(null);
          setApplyAtPos(null);
        }}
        title={diffTitle}
      />

      {/* PDF Import Modal - side-by-side PDF + extracted text */}
      {pdfImportData && (
        <PDFImportModal
          open={pdfImportOpen}
          docId={docId}
          pdfUrl={pdfImportData.pdfUrl}
          extractedHtml={pdfImportData.html}
          onDetectFields={async () => {
            // Get plain text from the extracted HTML for field detection
            const plainText = htmlToPlainText(pdfImportData.html);
            const { provider, model } = readAiPrefs();
            const result = await AiAPI.detectFields(docId, {
              text: plainText,
              provider,
              model,
            });
            return result.fields;
          }}
          onAccept={async (html) => {
            const api = editorApiRef.current;
            if (api && (api as any).setHTML) {
              (api as any).setHTML(html);
            } else if (api) {
              api.setFullText(htmlToPlainText(html));
            }

            // Record provenance
            try {
              await EvidenceAPI.appendProvenance(docId, {
                action: "import:apply:pdf",
                actor: userId,
                preview: htmlToPlainText(html).slice(0, 300),
                details: {
                  note: "Applied imported PDF content via PDFImportModal",
                },
              });
            } catch {
              /* non-fatal */
            }
            setProofsRefreshKey((k) => k + 1);

            setPdfImportOpen(false);
            setPdfImportData(null);

            // Clean up URL query param
            try {
              const url = new URL(window.location.href);
              if (url.searchParams.get("from") === "import") {
                url.searchParams.delete("from");
                window.history.replaceState(null, "", url.toString());
              }
            } catch {}
          }}
          onCancel={() => {
            setPdfImportOpen(false);
            setPdfImportData(null);
          }}
        />
      )}

      {promptKind && promptConfig && (
        <PromptDialog
          open={true}
          mode={promptConfig.mode}
          title={promptConfig.title}
          description={promptConfig.description}
          initialValue={promptConfig.initialValue}
          placeholder={promptConfig.placeholder}
          confirmLabel={promptConfig.confirmLabel}
          cancelLabel="Cancel"
          errorMessage={promptError}
          loading={promptLoading}
          onConfirm={handlePromptConfirm}
          onCancel={closePrompt}
        />
      )}

      <ShareDialog
        open={shareDialogOpen}
        docId={docId}
        docTitle={docTitle}
        currentUserId={userId}
        workspaceId={docWorkspaceId}
        onClose={() => setShareDialogOpen(false)}
      />

      <PageSetupDialog
        open={pageSetupOpen}
        docId={docId}
        initialSettings={layoutSettings}
        onClose={() => setPageSetupOpen(false)}
        onApply={handleApplyLayout}
      />

      <ImageInsertDialog
        docId={docId}
        open={imageDialogOpen}
        onClose={() => setImageDialogOpen(false)}
        onInsert={(opts) => {
          editorApiRef.current?.insertImage?.(opts);
        }}
      />

      <DocPickerModal
        open={docPickerOpen}
        onClose={() => setDocPickerOpen(false)}
        onSelect={(doc) => {
          editorApiRef.current?.setDocLink?.({
            toDocId: doc.id,
            toDocTitle: doc.title,
          });
          setDocPickerOpen(false);
        }}
        excludeDocId={docId}
        title="Link to Document"
      />

      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      {/* Read Aloud Panel */}
      {readAloudOpen && (
        <ReadAloudPanel
          ttsState={ttsState}
          ttsActions={ttsActions}
          text={ttsText}
          onClose={() => {
            ttsActions.stop();
            setReadAloudOpen(false);
          }}
        />
      )}

      {/* Dictate Panel */}
      {dictateOpen && (
        <DictatePanel
          sttState={sttState}
          sttActions={sttActions}
          onInsertText={handleInsertDictatedText}
          onClose={() => {
            sttActions.stopRecording();
            setDictateOpen(false);
          }}
        />
      )}

      {/* Translate Modal */}
      <TranslateModal
        isOpen={translateOpen}
        onClose={() => setTranslateOpen(false)}
        sourceText={translateSource}
        isFullDocument={translateIsFullDoc}
        onApply={handleTranslateApply}
        docId={docId}
      />

      {/* Original Source Modal - view imported source files */}
      {importMeta && (
        <OriginalSourceModal
          open={originalSourceOpen}
          importMeta={importMeta}
          onClose={() => setOriginalSourceOpen(false)}
        />
      )}

      {/* Save as Clause Dialog (Slice B10) */}
      <SaveClauseDialog
        open={saveClauseOpen}
        onClose={() => setSaveClauseOpen(false)}
        onSaved={(clause) => {
          setSaveClauseOpen(false);
          setClauseRefreshKey(k => k + 1);
          alert(`Clause '${clause.title}' saved to library.`);
        }}
        workspaceId={workspaceId}
        initialContentHtml={saveClauseHtml}
        initialContentText={saveClauseText}
      />

      {/* AI Clause Suggestion Popover (Slice B12) */}
      <ClauseSuggestionPopover
        docId={docId}
        workspaceId={workspaceId}
        getSelectionText={() => editorApiRef.current?.getSelectionText?.() || ''}
        onReplace={handleClauseSuggestionReplace}
        hasClausesInWorkspace={hasWorkspaceClauses}
      />

      {/* Canvas Frame Picker (Slice P9) */}
      {canvasPickerOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setCanvasPickerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 9000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            className="canvas-picker-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: "12px",
              width: "480px",
              maxHeight: "70vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: "15px" }}>
                {canvasPickerSelectedCanvas ? "Select Frame" : "Select Canvas"}
              </span>
              <button
                type="button"
                onClick={() => setCanvasPickerOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "18px",
                  color: "#64748b",
                }}
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
              {canvasPickerLoading && (
                <div style={{ textAlign: "center", padding: "24px", color: "#64748b" }}>
                  Loading…
                </div>
              )}
              {!canvasPickerLoading && !canvasPickerSelectedCanvas && (
                <>
                  {canvasPickerList.length === 0 && (
                    <div style={{ textAlign: "center", padding: "24px", color: "#94a3b8" }}>
                      No canvases found in this workspace.
                    </div>
                  )}
                  {canvasPickerList.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectCanvasForEmbed(c.id)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 20px",
                        border: "none",
                        background: "none",
                        cursor: "pointer",
                        fontSize: "14px",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                    >
                      <div style={{ fontWeight: 500 }}>{c.title || "Untitled Canvas"}</div>
                      <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                        {c.id.slice(0, 8)}…
                      </div>
                    </button>
                  ))}
                </>
              )}
              {!canvasPickerLoading && canvasPickerSelectedCanvas && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setCanvasPickerSelectedCanvas(null);
                      setCanvasPickerFrames([]);
                    }}
                    style={{
                      display: "block",
                      padding: "8px 20px",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      fontSize: "13px",
                      color: "#6366f1",
                    }}
                  >
                    ← Back to canvases
                  </button>
                  {canvasPickerFrames.length === 0 && (
                    <div style={{ textAlign: "center", padding: "24px", color: "#94a3b8" }}>
                      No frames found in this canvas.
                    </div>
                  )}
                  {canvasPickerFrames.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => insertCanvasFrame(canvasPickerSelectedCanvas, f.id)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 20px",
                        border: "none",
                        background: "none",
                        cursor: "pointer",
                        fontSize: "14px",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                    >
                      <div style={{ fontWeight: 500 }}>{f.title || "Untitled Frame"}</div>
                      <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                        {f.id.slice(0, 8)}…
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Proof System Onboarding Modal (Phase 5 - P3.1) */}
      <ProofOnboardingModal
        isOpen={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
        onComplete={() => setOnboardingOpen(false)}
      />
    </div>
  );
}
