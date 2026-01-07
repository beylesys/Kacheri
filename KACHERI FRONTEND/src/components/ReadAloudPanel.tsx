// ReadAloudPanel.tsx - Floating control panel for TTS playback
// Provides play/pause/stop, voice selection, speed control, and progress display

import React from 'react';
import type { TTSState, TTSActions } from '../hooks/useTTS';
import './readAloudPanel.css';

interface ReadAloudPanelProps {
  ttsState: TTSState;
  ttsActions: TTSActions;
  text: string;
  onClose: () => void;
}

const SPEED_OPTIONS = [
  { value: 0.5, label: '0.5x' },
  { value: 0.75, label: '0.75x' },
  { value: 1, label: '1x' },
  { value: 1.25, label: '1.25x' },
  { value: 1.5, label: '1.5x' },
  { value: 2, label: '2x' },
];

export function ReadAloudPanel({ ttsState, ttsActions, text, onClose }: ReadAloudPanelProps) {
  const { status, progress, availableVoices, currentVoice, rate, error, isSupported } = ttsState;
  const { speak, pause, resume, stop, setVoice, setRate } = ttsActions;

  // Format progress as time estimate (rough based on avg reading speed)
  const formatTime = (progressPercent: number, textLength: number) => {
    // Rough estimate: ~150 words per minute at 1x speed, avg 5 chars per word
    const wordsPerMinute = 150 * rate;
    const totalWords = textLength / 5;
    const totalSeconds = (totalWords / wordsPerMinute) * 60;
    const currentSeconds = (progressPercent / 100) * totalSeconds;

    const formatSec = (s: number) => {
      const mins = Math.floor(s / 60);
      const secs = Math.floor(s % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return `${formatSec(currentSeconds)} / ${formatSec(totalSeconds)}`;
  };

  const handlePlayPause = () => {
    if (status === 'idle') {
      speak(text);
    } else if (status === 'speaking') {
      pause();
    } else if (status === 'paused') {
      resume();
    }
  };

  const handleStop = () => {
    stop();
  };

  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const voice = availableVoices.find(v => v.name === e.target.value);
    if (voice) {
      setVoice(voice);
      // If currently playing, restart with new voice
      if (status === 'speaking' || status === 'paused') {
        stop();
        setTimeout(() => speak(text), 100);
      }
    }
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRate = parseFloat(e.target.value);
    setRate(newRate);
    // If currently playing, restart with new rate
    if (status === 'speaking' || status === 'paused') {
      stop();
      setTimeout(() => speak(text), 100);
    }
  };

  // Group voices by language for better UX
  const groupedVoices = availableVoices.reduce((acc, voice) => {
    const lang = voice.lang.split('-')[0];
    if (!acc[lang]) acc[lang] = [];
    acc[lang].push(voice);
    return acc;
  }, {} as Record<string, SpeechSynthesisVoice[]>);

  const truncatedText = text.length > 100 ? text.slice(0, 100) + '...' : text;

  if (!isSupported) {
    return (
      <div className="read-aloud-panel">
        <div className="read-aloud-header">
          <span className="read-aloud-title">Read Aloud</span>
          <button className="read-aloud-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="read-aloud-error">
          Text-to-speech is not supported in this browser.
        </div>
      </div>
    );
  }

  return (
    <div className="read-aloud-panel">
      <div className="read-aloud-header">
        <span className="read-aloud-title">Read Aloud</span>
        <button className="read-aloud-close" onClick={onClose} title="Close">
          ×
        </button>
      </div>

      {error && (
        <div className="read-aloud-error">{error}</div>
      )}

      <div className="read-aloud-controls">
        <button
          className={`read-aloud-btn ${status === 'speaking' ? 'active' : ''}`}
          onClick={handlePlayPause}
          title={status === 'speaking' ? 'Pause' : status === 'paused' ? 'Resume' : 'Play'}
        >
          {status === 'speaking' ? '⏸' : '▶'}
        </button>
        <button
          className="read-aloud-btn"
          onClick={handleStop}
          disabled={status === 'idle'}
          title="Stop"
        >
          ◼
        </button>

        <div className="read-aloud-progress-container">
          <div className="read-aloud-progress-bar">
            <div
              className="read-aloud-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="read-aloud-time">
            {formatTime(progress, text.length)}
          </span>
        </div>
      </div>

      <div className="read-aloud-settings">
        <div className="read-aloud-setting">
          <label>Voice:</label>
          <select
            value={currentVoice?.name || ''}
            onChange={handleVoiceChange}
            className="read-aloud-select"
          >
            {Object.entries(groupedVoices).map(([lang, voices]) => (
              <optgroup key={lang} label={lang.toUpperCase()}>
                {voices.map(voice => (
                  <option key={voice.name} value={voice.name}>
                    {voice.name} {voice.default ? '(Default)' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="read-aloud-setting">
          <label>Speed:</label>
          <select
            value={rate}
            onChange={handleSpeedChange}
            className="read-aloud-select read-aloud-select-sm"
          >
            {SPEED_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="read-aloud-preview">
        <span className="read-aloud-preview-label">Reading:</span>
        <span className="read-aloud-preview-text">"{truncatedText}"</span>
      </div>

      <div className="read-aloud-status">
        {status === 'idle' && 'Ready'}
        {status === 'speaking' && 'Speaking...'}
        {status === 'paused' && 'Paused'}
        {text.length > 0 && ` • ${text.split(/\s+/).length} words`}
      </div>
    </div>
  );
}
