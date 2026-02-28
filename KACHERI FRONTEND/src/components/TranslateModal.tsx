// TranslateModal.tsx — Modal for AI-powered text translation
// Supports both selection and full-document translation with preview

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AiAPI } from '../api';
import { useFocusTrap } from '../hooks/useFocusTrap';
import './translateModal.css';

interface TranslateModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceText: string;
  isFullDocument: boolean;
  onApply: (action: 'replace' | 'insert' | 'copy', translatedText: string) => void;
  docId: string;
}

const LANGUAGES = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ru', label: 'Russian' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'tr', label: 'Turkish' },
];

// Target languages exclude 'auto'
const TARGET_LANGUAGES = LANGUAGES.filter(l => l.code !== 'auto');

export function TranslateModal({
  isOpen,
  onClose,
  sourceText,
  isFullDocument,
  onApply,
  docId,
}: TranslateModalProps) {
  const [sourceLanguage, setSourceLanguage] = useState('auto');
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [translatedText, setTranslatedText] = useState('');
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Truncate preview for display
  const sourcePreview = sourceText.length > 500
    ? sourceText.slice(0, 500) + '...'
    : sourceText;

  const handleTranslate = useCallback(async () => {
    if (!sourceText.trim()) {
      setError('No text to translate');
      return;
    }

    if (sourceLanguage !== 'auto' && sourceLanguage === targetLanguage) {
      setError('Source and target languages cannot be the same');
      return;
    }

    setLoading(true);
    setError(null);
    setTranslatedText('');

    try {
      const result = await AiAPI.translate(docId, {
        text: sourceText,
        targetLanguage,
        sourceLanguage: sourceLanguage === 'auto' ? undefined : sourceLanguage,
      });

      setTranslatedText(result.translatedText);

      // Show detected language if auto-detect was used
      if (sourceLanguage === 'auto' && result.sourceLanguage !== 'auto') {
        setDetectedLanguage(result.sourceLanguage);
      }
    } catch (err: any) {
      setError(err.message || 'Translation failed');
    } finally {
      setLoading(false);
    }
  }, [sourceText, sourceLanguage, targetLanguage, docId]);

  const handleApply = useCallback((action: 'replace' | 'insert' | 'copy') => {
    if (!translatedText.trim()) return;
    onApply(action, translatedText);
    // Reset state
    setTranslatedText('');
    setDetectedLanguage(null);
    setError(null);
  }, [translatedText, onApply]);

  const handleClose = useCallback(() => {
    setTranslatedText('');
    setDetectedLanguage(null);
    setError(null);
    setLoading(false);
    onClose();
  }, [onClose]);

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isOpen);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); handleClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const getLanguageLabel = (code: string) => {
    const lang = LANGUAGES.find(l => l.code === code);
    return lang?.label || code;
  };

  return (
    <div className="translate-modal-overlay" onClick={handleClose} role="dialog" aria-modal="true" aria-labelledby="translate-title" ref={dialogRef}>
      <div className="translate-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="translate-header">
          <h2 className="translate-title" id="translate-title">
            Translate {isFullDocument ? 'Document' : 'Selection'}
          </h2>
          <button className="translate-close" onClick={handleClose} title="Close">
            ×
          </button>
        </div>

        {/* Error display */}
        {error && (
          <div className="translate-error">{error}</div>
        )}

        {/* Language selection */}
        <div className="translate-languages">
          <div className="translate-lang-group">
            <label>From:</label>
            <select
              value={sourceLanguage}
              onChange={e => setSourceLanguage(e.target.value)}
              disabled={loading}
              className="translate-select"
            >
              {LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          <span className="translate-arrow">→</span>

          <div className="translate-lang-group">
            <label>To:</label>
            <select
              value={targetLanguage}
              onChange={e => setTargetLanguage(e.target.value)}
              disabled={loading}
              className="translate-select"
            >
              {TARGET_LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Source text preview */}
        <div className="translate-section">
          <div className="translate-section-header">
            <span className="translate-section-label">Original</span>
            <span className="translate-char-count">{sourceText.length} chars</span>
          </div>
          <div className="translate-preview source">
            {sourcePreview}
          </div>
        </div>

        {/* Translation result */}
        <div className="translate-section">
          <div className="translate-section-header">
            <span className="translate-section-label">Translation</span>
            {detectedLanguage && (
              <span className="translate-detected">
                Detected: {getLanguageLabel(detectedLanguage)}
              </span>
            )}
          </div>
          <div className={`translate-preview result ${loading ? 'loading' : ''}`}>
            {loading ? (
              <span className="translate-loading">Translating...</span>
            ) : translatedText ? (
              translatedText
            ) : (
              <span className="translate-placeholder">
                Click "Translate" to see the result
              </span>
            )}
          </div>
        </div>

        {/* Translate button */}
        <div className="translate-action-row">
          <button
            className="translate-btn primary"
            onClick={handleTranslate}
            disabled={loading || !sourceText.trim()}
          >
            {loading ? 'Translating...' : 'Translate'}
          </button>
        </div>

        {/* Apply actions */}
        {translatedText && (
          <div className="translate-apply-row">
            <button
              className="translate-btn"
              onClick={() => handleApply('replace')}
              title={isFullDocument ? 'Replace entire document' : 'Replace selection'}
            >
              Replace Original
            </button>
            <button
              className="translate-btn"
              onClick={() => handleApply('insert')}
              title="Insert translation below the original"
            >
              Insert Below
            </button>
            <button
              className="translate-btn"
              onClick={() => handleApply('copy')}
              title="Copy translation to clipboard"
            >
              Copy
            </button>
            <button
              className="translate-btn subtle"
              onClick={handleClose}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
