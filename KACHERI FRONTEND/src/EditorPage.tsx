import {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import CommandPalette, {
  usePaletteHotkey,
} from "./components/CommandPalette";
import type { Command } from "./components/CommandPalette";
import DiffModal from "./components/DiffModal";
import PDFImportModal from "./components/PDFImportModal";
import { DocsAPI, AiAPI, EvidenceAPI } from "./api";
import Editor, { type EditorApi } from "./Editor";
import ImageInsertDialog from "./components/ImageInsertDialog";
import DocPickerModal from "./components/DocPickerModal";
import ProofsPanel from "./ProofsPanel";
import { CommentsPanel } from "./components/CommentsPanel";
import { VersionsPanel } from "./components/VersionsPanel";
import { SuggestionsPanel } from "./components/SuggestionsPanel";
import BacklinksPanel from "./components/BacklinksPanel";
import type { Suggestion } from "./api/suggestions";
import PromptDialog from "./components/PromptDialog";
import {
  useWorkspaceSocket,
  type WsEvent,
} from "./hooks/useWorkspaceSocket";
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
import { NotificationBell } from "./components/notifications";
import ProofHealthBadge from "./components/ProofHealthBadge";
import ComposeDeterminismIndicator from "./components/ComposeDeterminismIndicator";
import AIHeatmapToggle from "./components/AIHeatmapToggle";
import ProofOnboardingModal, { shouldShowOnboarding } from "./components/ProofOnboardingModal";

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
  const { events } = useWorkspaceSocket(workspaceId, { userId, displayName: userId });

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

  // ---- Drawer state (Calm/Pro Layout) ----
  const [leftDrawerOpen, setLeftDrawerOpen] = useState<boolean>(() => {
    return localStorage.getItem("kacheri:leftDrawerOpen") === "1";
  });
  const [rightDrawerOpen, setRightDrawerOpen] = useState<boolean>(() => {
    return localStorage.getItem("kacheri:rightDrawerOpen") === "1";
  });
  const [rightDrawerTab, setRightDrawerTab] = useState<
    "proofs" | "comments" | "versions" | "suggestions" | "backlinks"
  >("proofs");
  const [composeInput, setComposeInput] = useState("");

  // ---- Connection status for realtime badge ----
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  // Poll connection status from editor ref (updates when connection changes)
  useEffect(() => {
    const checkConnection = () => {
      const connected = editorApiRef.current?.isConnected?.() ?? false;
      setRealtimeConnected(connected);
    };
    checkConnection();
    const interval = setInterval(checkConnection, 1000);
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

  return (
    <div className="editor-layout">
      {/* ============================================================
          TOP BAR: Compose/Prompt Bar
          Navigation, Compose input, Document title, Page Setup, Share
          ============================================================ */}
      <div className="editor-topbar">
        <button
          className="button ghost sm"
          onClick={() => navigate("/")}
          style={{ fontSize: 13, flexShrink: 0 }}
        >
          ← Docs
        </button>

        <input
          className="editor-topbar-input"
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
          className="button primary sm"
          onClick={handleComposeSubmit}
          disabled={!composeInput.trim()}
          style={{ fontSize: 13, flexShrink: 0 }}
        >
          Compose
        </button>

        <div className="spacer" />

        {/* Document title */}
        <input
          className="input sm"
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
        <ProofHealthBadge docId={docId} size="md" />

        {/* Compose Determinism Indicator - Phase 5 P1.4 */}
        <ComposeDeterminismIndicator docId={docId} compact />

        <button
          className="button subtle sm"
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
      <div className="toolbar">
        <div
          className="toolbar-inner"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 20px",
            flexWrap: "wrap",
          }}
        >
          {/* Left Drawer Toggle */}
          <button
            className={`button sm ${leftDrawerOpen ? "primary" : "subtle"}`}
            onClick={() => setLeftDrawerOpen((o) => !o)}
            title="Toggle formatting tools"
            style={{ fontSize: 12 }}
          >
            Format
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.15)", margin: "0 4px" }} />

          {/* Insert items */}
          <button
            className="button subtle sm"
            title="Insert table"
            onClick={() => editorApiRef.current?.insertTable?.({ rows: 3, cols: 3, withHeaderRow: true })}
            style={{ fontSize: 12 }}
          >
            Table
          </button>
          <button
            className="button subtle sm"
            title="Insert image"
            onClick={() => setImageDialogOpen(true)}
            style={{ fontSize: 12 }}
          >
            Image
          </button>
          <button
            className="button subtle sm"
            title="Insert doc link"
            onClick={() => setDocPickerOpen(true)}
            style={{ fontSize: 12 }}
          >
            Link
          </button>
          <button
            className="button subtle sm"
            title="Insert page break"
            onClick={() => editorApiRef.current?.insertPageBreak?.()}
            style={{ fontSize: 12 }}
          >
            Break
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.15)", margin: "0 4px" }} />

          {/* AI / Propose - VISIBLE, PROMINENT */}
          <button
            className="button primary sm"
            onClick={runCompose}
            style={{ fontSize: 12, fontWeight: 600 }}
          >
            Propose...
          </button>

          {/* AI Heatmap Toggle - Phase 5 P1.2 */}
          <AIHeatmapToggle
            docId={docId}
            editor={editorApiRef.current?.editor ?? null}
          />

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.15)", margin: "0 4px" }} />

          {/* Export */}
          <button className="button subtle sm" onClick={runExportPdf} style={{ fontSize: 12 }}>PDF</button>
          <button className="button subtle sm" onClick={queueExportDocx} style={{ fontSize: 12 }}>DOCX</button>
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

          <div className="spacer" />

          {/* Right side controls */}
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

          {/* Notification Bell */}
          <NotificationBell
            workspaceId={getWorkspaceId()}
            currentUserId={getUserId()}
          />

          {/* Right Drawer Toggle */}
          <button
            className={`button sm ${rightDrawerOpen ? "primary" : "subtle"}`}
            onClick={() => setRightDrawerOpen((o) => !o)}
            title="Toggle panels"
            style={{ fontSize: 12 }}
          >
            Panels
          </button>
        </div>
      </div>

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
        <aside className={`drawer-left ${leftDrawerOpen ? "is-open" : ""}`}>
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
        <div className="editor-center">
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
                    __html: layoutSettings.header.content || "",
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
                        __html: layoutSettings.footer.content,
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
            Realtime:{" "}
            {realtimeConnected
              ? "connected ✅"
              : "disconnected"}{" "}
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
        <aside className={`drawer-right ${rightDrawerOpen ? "is-open" : ""}`}>
          <div className="drawer-tabs">
            <button
              className={`drawer-tab ${rightDrawerTab === "proofs" ? "active" : ""}`}
              onClick={() => setRightDrawerTab("proofs")}
            >
              Proofs
            </button>
            <button
              className={`drawer-tab ${rightDrawerTab === "comments" ? "active" : ""}`}
              onClick={() => setRightDrawerTab("comments")}
            >
              Comments
            </button>
            <button
              className={`drawer-tab ${rightDrawerTab === "versions" ? "active" : ""}`}
              onClick={() => setRightDrawerTab("versions")}
            >
              Versions
            </button>
            <button
              className={`drawer-tab ${rightDrawerTab === "suggestions" ? "active" : ""}`}
              onClick={() => setRightDrawerTab("suggestions")}
            >
              Suggest
            </button>
            <button
              className={`drawer-tab ${rightDrawerTab === "backlinks" ? "active" : ""}`}
              onClick={() => setRightDrawerTab("backlinks")}
            >
              Links
            </button>
          </div>
          <div className="drawer-content" style={{ padding: 0 }}>
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
          </div>
        </aside>
      </div>

      <CommandPalette
        isOpen={isPalOpen}
        onClose={() => setPalOpen(false)}
        commands={commands}
      />

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

      {/* Proof System Onboarding Modal (Phase 5 - P3.1) */}
      <ProofOnboardingModal
        isOpen={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
        onComplete={() => setOnboardingOpen(false)}
      />
    </div>
  );
}
