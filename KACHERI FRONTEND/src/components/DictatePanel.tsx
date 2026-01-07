// DictatePanel.tsx - Floating control panel for STT dictation
// Provides recording controls, language selection, and live transcript preview

import React, { useEffect, useState } from 'react';
import type { STTState, STTActions } from '../hooks/useSTT';
import './dictatePanel.css';

interface DictatePanelProps {
  sttState: STTState;
  sttActions: STTActions;
  onInsertText: (text: string) => void;
  onClose: () => void;
}

const LANGUAGES = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'es-ES', label: 'Spanish' },
  { code: 'fr-FR', label: 'French' },
  { code: 'de-DE', label: 'German' },
  { code: 'it-IT', label: 'Italian' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)' },
  { code: 'ja-JP', label: 'Japanese' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'ar-SA', label: 'Arabic' },
  { code: 'ko-KR', label: 'Korean' },
  { code: 'ru-RU', label: 'Russian' },
];

export function DictatePanel({ sttState, sttActions, onInsertText, onClose }: DictatePanelProps) {
  const { status, transcript, interimTranscript, language, confidence, error, isSupported, duration } = sttState;
  const { startRecording, stopRecording, pauseRecording, resumeRecording, clearTranscript, setLanguage } = sttActions;

  const [autoInsert, setAutoInsert] = useState(true);

  // Format duration as MM:SS
  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle start/stop toggle
  const handleStartStop = () => {
    if (status === 'idle' || status === 'paused') {
      startRecording(language);
    } else if (status === 'recording') {
      stopRecording();
    }
  };

  // Handle pause/resume
  const handlePauseResume = () => {
    if (status === 'recording') {
      pauseRecording();
    } else if (status === 'paused') {
      resumeRecording();
    }
  };

  // Handle insert text
  const handleInsert = () => {
    const textToInsert = transcript.trim();
    if (textToInsert) {
      onInsertText(textToInsert);
      clearTranscript();
    }
  };

  // Handle language change
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value;
    setLanguage(newLang);
    // If recording, restart with new language
    if (status === 'recording') {
      stopRecording();
      setTimeout(() => startRecording(newLang), 100);
    }
  };

  // Auto-insert when recording stops (if enabled)
  useEffect(() => {
    if (status === 'idle' && autoInsert && transcript.trim()) {
      // Small delay to let the final transcript settle
      const timer = setTimeout(() => {
        if (transcript.trim()) {
          onInsertText(transcript.trim());
          clearTranscript();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [status, autoInsert, transcript, onInsertText, clearTranscript]);

  // Combined preview text (final + interim)
  const previewText = transcript + (interimTranscript ? ` ${interimTranscript}` : '');
  const truncatedPreview = previewText.length > 200 ? previewText.slice(-200) + '...' : previewText;

  // Status text
  const getStatusText = () => {
    switch (status) {
      case 'recording': return 'Listening...';
      case 'paused': return 'Paused';
      case 'processing': return 'Processing...';
      default: return 'Ready';
    }
  };

  if (!isSupported) {
    return (
      <div className="dictate-panel">
        <div className="dictate-header">
          <span className="dictate-title">Dictate</span>
          <button className="dictate-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="dictate-error">
          Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.
        </div>
      </div>
    );
  }

  return (
    <div className="dictate-panel">
      <div className="dictate-header">
        <span className="dictate-title">Dictate</span>
        <button className="dictate-close" onClick={onClose} title="Close">
          ×
        </button>
      </div>

      {error && (
        <div className="dictate-error">{error}</div>
      )}

      <div className="dictate-controls">
        <button
          className={`dictate-btn ${status === 'recording' ? 'recording' : ''}`}
          onClick={handleStartStop}
          title={status === 'recording' ? 'Stop' : 'Start Recording'}
        >
          {status === 'recording' || status === 'processing' ? '◼' : '●'}
        </button>
        <button
          className="dictate-btn"
          onClick={handlePauseResume}
          disabled={status === 'idle' || status === 'processing'}
          title={status === 'paused' ? 'Resume' : 'Pause'}
        >
          {status === 'paused' ? '▶' : '⏸'}
        </button>
        <button
          className="dictate-btn"
          onClick={clearTranscript}
          disabled={!transcript}
          title="Clear transcript"
        >
          ✕
        </button>

        <div className="dictate-time">
          <span className={`dictate-status-dot ${status}`} />
          <span>{formatDuration(duration)}</span>
        </div>
      </div>

      <div className="dictate-settings">
        <div className="dictate-setting">
          <label>Language:</label>
          <select
            value={language}
            onChange={handleLanguageChange}
            className="dictate-select"
            disabled={status === 'recording'}
          >
            {LANGUAGES.map(lang => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        <div className="dictate-setting">
          <label>
            <input
              type="checkbox"
              checked={autoInsert}
              onChange={(e) => setAutoInsert(e.target.checked)}
            />
            Auto-insert on stop
          </label>
        </div>
      </div>

      <div className="dictate-preview">
        <span className="dictate-preview-label">
          {status === 'recording' ? 'Live:' : 'Transcript:'}
        </span>
        <div className="dictate-preview-text">
          {previewText ? (
            <>
              <span className="final-text">{transcript}</span>
              {interimTranscript && (
                <span className="interim-text">{interimTranscript}</span>
              )}
            </>
          ) : (
            <span className="placeholder">Start speaking...</span>
          )}
        </div>
      </div>

      {confidence > 0 && (
        <div className="dictate-confidence">
          Confidence: {Math.round(confidence * 100)}%
        </div>
      )}

      <div className="dictate-actions">
        <button
          className="dictate-insert-btn"
          onClick={handleInsert}
          disabled={!transcript.trim()}
        >
          Insert Text
        </button>
      </div>

      <div className="dictate-status">
        {getStatusText()}
        {transcript && ` • ${transcript.split(/\s+/).filter(Boolean).length} words`}
      </div>
    </div>
  );
}
