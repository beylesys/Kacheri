// KACHERI FRONTEND/src/components/AIHeatmapToggle.tsx
// Phase 5 - P1.2: Toggle button for AI heatmap visualization
//
// This component provides a toggle to show/hide AI-touched sections in the editor.
// When enabled, it fetches AI ranges and applies heatmark marks to the document.

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { AIRangesAPI, type AIRange } from "../api";
import { buildPositionMap, rangeToPositions } from "../utils/positionMapper";
import { PROOF_TOOLTIPS } from "../utils/tooltipHelpers";
import type { Editor } from "@tiptap/core";

/* ---------- Props ---------- */
export interface AIHeatmapToggleProps {
  docId: string;
  editor: Editor | null;
}

/* ---------- LocalStorage key ---------- */
const STORAGE_KEY = "kacheri:aiHeatmapEnabled";

/* ---------- Component ---------- */
export default function AIHeatmapToggle({
  docId,
  editor,
}: AIHeatmapToggleProps) {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [loading, setLoading] = useState(false);
  const [rangeCount, setRangeCount] = useState(0);

  // Persist preference
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      // Ignore storage errors
    }
  }, [enabled]);

  // Apply or remove heatmarks when toggle changes
  const applyHeatmarks = useCallback(async () => {
    if (!editor) return;

    if (!enabled) {
      // Clear all heatmarks
      if (editor.commands.clearAllAIHeatmarks) {
        editor.commands.clearAllAIHeatmarks();
      }
      setRangeCount(0);
      return;
    }

    setLoading(true);
    try {
      // Fetch AI ranges from backend
      const data = await AIRangesAPI.get(docId);
      const ranges = data.ranges || [];

      // Build position map
      const doc = editor.state.doc;
      const posMap = buildPositionMap(doc);

      // Clear existing heatmarks first
      if (editor.commands.clearAllAIHeatmarks) {
        editor.commands.clearAllAIHeatmarks();
      }

      // Apply heatmarks for each range
      let applied = 0;
      for (const range of ranges) {
        // Skip ranges that cover the full document (compose with no position)
        if (range.start === 0 && range.end === 0 && range.kind === "ai:compose") {
          continue;
        }

        // Convert plain-text range to PM positions
        const pmRange = rangeToPositions(posMap, range.start, range.end);
        if (!pmRange) continue;

        // Validate positions are within document
        if (pmRange.from < 0 || pmRange.to > doc.content.size) continue;
        if (pmRange.from >= pmRange.to) continue;

        try {
          // Apply the heatmark
          editor
            .chain()
            .setTextSelection({ from: pmRange.from, to: pmRange.to })
            .setAIHeatmark({
              kind: range.kind,
              intensity: 0.25,
              proofId: range.id,
              ts: range.ts,
            })
            .run();
          applied++;
        } catch (err) {
          console.warn("Failed to apply heatmark:", err);
        }
      }

      setRangeCount(applied);

      // Reset selection after applying marks
      editor.commands.setTextSelection(0);
    } catch (err) {
      console.error("Failed to apply AI heatmap:", err);
      setRangeCount(0);
    } finally {
      setLoading(false);
    }
  }, [docId, editor, enabled]);

  // Apply heatmarks when enabled changes or docId changes
  useEffect(() => {
    applyHeatmarks();
  }, [applyHeatmarks]);

  const handleToggle = useCallback(() => {
    setEnabled((prev) => !prev);
  }, []);

  // Build enhanced tooltip with explanation
  const buildTooltip = (): string => {
    const lines: string[] = [];
    if (enabled) {
      lines.push(`AI Heatmap ON (${rangeCount} ranges highlighted)`);
      lines.push("");
      lines.push("Click to hide AI-touched sections.");
    } else {
      lines.push("Show AI-touched sections");
    }
    lines.push("");
    lines.push(PROOF_TOOLTIPS.features.aiHeatmap);
    return lines.join("\n");
  };

  return (
    <button
      className={`button sm ${enabled ? "primary" : "subtle"}`}
      onClick={handleToggle}
      disabled={loading || !editor}
      title={buildTooltip()}
      style={buttonStyle}
    >
      {loading ? "..." : enabled ? `AI (${rangeCount})` : "AI"}
    </button>
  );
}

/* ---------- Styles ---------- */
const buttonStyle: CSSProperties = {
  fontSize: 12,
  minWidth: 40,
};
