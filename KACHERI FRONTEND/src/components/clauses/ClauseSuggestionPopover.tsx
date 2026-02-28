// KACHERI FRONTEND/src/components/clauses/ClauseSuggestionPopover.tsx
// AI-powered clause suggestion popover that appears when user selects text >50 chars.
//
// Debounces selection changes (1500ms), calls clauseActionsApi.suggest() to find
// similar clauses, and shows a floating bar with the top match and "Replace with standard" action.
//
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md — Slice B12

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ClauseMatch } from '../../types/clause';
import { clauseActionsApi } from '../../api/clauses';
import './clauses.css';

type Props = {
  docId: string;
  workspaceId: string;
  /** Function to get current selection text from the editor */
  getSelectionText: () => string;
  /** Called when user clicks "Replace with standard" */
  onReplace: (clauseHtml: string, clauseId: string) => void;
  /** Whether the workspace has any clauses (skip API calls if not) */
  hasClausesInWorkspace: boolean;
};

/** Minimum selection length (chars) to trigger suggestion. */
const MIN_SELECTION_LENGTH = 50;
/** Debounce delay before triggering API call (ms). */
const DEBOUNCE_MS = 1500;
/** Minimum similarity score to show a suggestion (0-100). */
const MIN_SIMILARITY = 40;

export default function ClauseSuggestionPopover({
  docId,
  workspaceId,
  getSelectionText,
  onReplace,
  hasClausesInWorkspace,
}: Props) {
  // Suggestion state
  const [suggestion, setSuggestion] = useState<ClauseMatch | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [replacing, setReplacing] = useState(false);

  // Refs for debounce and dedup
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueriedTextRef = useRef<string>('');
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // --- Selection change handler ---
  const handleSelectionChange = useCallback(() => {
    // Guard: skip if no clauses in workspace
    if (!hasClausesInWorkspace) return;

    const selectedText = getSelectionText();

    // Guard: selection too short — hide any existing suggestion
    if (!selectedText || selectedText.length < MIN_SELECTION_LENGTH) {
      // Clear debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      // Don't hide mid-replacement
      if (!replacing) {
        setVisible(false);
        setSuggestion(null);
        setLoading(false);
      }
      return;
    }

    // Guard: same text as last query — don't re-query
    if (selectedText === lastQueriedTextRef.current && suggestion) {
      return;
    }

    // Clear any existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Start debounce
    debounceTimerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;

      const currentText = getSelectionText();
      if (!currentText || currentText.length < MIN_SELECTION_LENGTH) return;

      // Dedup check
      if (currentText === lastQueriedTextRef.current && suggestion) return;

      setLoading(true);
      lastQueriedTextRef.current = currentText;

      try {
        const res = await clauseActionsApi.suggest(docId, {
          text: currentText,
        });

        if (!mountedRef.current) return;

        // Check if we have a good match
        if (
          res.suggestions &&
          res.suggestions.length > 0 &&
          res.suggestions[0].similarity >= MIN_SIMILARITY
        ) {
          setSuggestion(res.suggestions[0]);
          setVisible(true);
        } else {
          setSuggestion(null);
          setVisible(false);
        }
      } catch {
        // Silent failure — suggestions are non-critical
        if (mountedRef.current) {
          setSuggestion(null);
          setVisible(false);
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);
  }, [
    hasClausesInWorkspace,
    getSelectionText,
    docId,
    suggestion,
    replacing,
  ]);

  // --- Listen for selection changes ---
  useEffect(() => {
    if (!hasClausesInWorkspace) return;

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [hasClausesInWorkspace, handleSelectionChange]);

  // --- Reset when docId changes ---
  useEffect(() => {
    setVisible(false);
    setSuggestion(null);
    setLoading(false);
    lastQueriedTextRef.current = '';
  }, [docId]);

  // --- Dismiss handler ---
  const handleDismiss = useCallback(() => {
    setVisible(false);
    setSuggestion(null);
    lastQueriedTextRef.current = '';
  }, []);

  // --- Replace handler ---
  const handleReplace = useCallback(async () => {
    if (!suggestion) return;

    setReplacing(true);
    try {
      // Track the insertion for provenance
      await clauseActionsApi.insert(docId, {
        clauseId: suggestion.clause.id,
        insertionMethod: 'ai_suggest',
      });

      // Perform the replacement via parent callback
      onReplace(suggestion.clause.contentHtml, suggestion.clause.id);

      // Hide the popover
      setVisible(false);
      setSuggestion(null);
      lastQueriedTextRef.current = '';
    } catch {
      // Silent failure — the replacement itself may have worked
    } finally {
      setReplacing(false);
    }
  }, [suggestion, docId, onReplace]);

  // --- Don't render if nothing to show ---
  if (!visible && !loading) return null;

  return (
    <div className={`clause-suggestion-popover ${visible ? 'visible' : ''}`}>
      {/* Loading indicator */}
      {loading && !visible && (
        <div className="clause-suggestion-loading">
          <span className="clause-suggestion-loading-dot" />
          <span className="clause-suggestion-loading-text">
            Checking clause library...
          </span>
        </div>
      )}

      {/* Suggestion content */}
      {visible && suggestion && (
        <div className="clause-suggestion-content">
          <div className="clause-suggestion-info">
            <span className="clause-suggestion-icon">{'\uD83D\uDCCB'}</span>
            <span className="clause-suggestion-label">
              Similar clause available:
            </span>
            <span className="clause-suggestion-title">
              {suggestion.clause.title}
            </span>
            <span className="clause-suggestion-similarity">
              {Math.round(suggestion.similarity)}% match
            </span>
            <span
              className={`clause-suggestion-category ${suggestion.clause.category}`}
            >
              {suggestion.clause.category}
            </span>
          </div>
          <div className="clause-suggestion-actions">
            <button
              className="clause-suggestion-replace-btn"
              onClick={handleReplace}
              disabled={replacing}
              title="Replace selected text with standard clause"
            >
              {replacing ? 'Replacing...' : 'Replace with standard'}
            </button>
            <button
              className="clause-suggestion-dismiss-btn"
              onClick={handleDismiss}
              title="Dismiss suggestion"
            >
              {'\u2715'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
