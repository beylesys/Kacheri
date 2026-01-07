// useTTS.ts - Web Speech API hook for Text-to-Speech
// Provides play/pause/stop controls and progress tracking for auditory verification

import { useState, useEffect, useRef, useCallback } from 'react';

export interface TTSState {
  status: 'idle' | 'speaking' | 'paused';
  progress: number; // 0-100
  charIndex: number;
  currentVoice: SpeechSynthesisVoice | null;
  availableVoices: SpeechSynthesisVoice[];
  rate: number;
  error: string | null;
  isSupported: boolean;
  textLength: number;
  startTime: number | null;
}

export interface TTSActions {
  speak: (text: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setVoice: (voice: SpeechSynthesisVoice) => void;
  setRate: (rate: number) => void;
}

export interface TTSCallbacks {
  onStart?: () => void;
  onEnd?: (duration: number) => void;
  onStop?: (duration: number, progress: number) => void;
  onError?: (error: string) => void;
}

const DEFAULT_STATE: TTSState = {
  status: 'idle',
  progress: 0,
  charIndex: 0,
  currentVoice: null,
  availableVoices: [],
  rate: 1,
  error: null,
  isSupported: typeof window !== 'undefined' && 'speechSynthesis' in window,
  textLength: 0,
  startTime: null,
};

export function useTTS(callbacks?: TTSCallbacks): [TTSState, TTSActions] {
  const [state, setState] = useState<TTSState>(DEFAULT_STATE);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const textRef = useRef<string>('');

  // Initialize speech synthesis
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setState(prev => ({ ...prev, isSupported: false, error: 'Text-to-speech not supported in this browser' }));
      return;
    }

    synthRef.current = window.speechSynthesis;

    // Load voices (may be async on some browsers)
    const loadVoices = () => {
      const voices = synthRef.current?.getVoices() || [];
      if (voices.length > 0) {
        setState(prev => ({
          ...prev,
          availableVoices: voices,
          currentVoice: prev.currentVoice || voices.find(v => v.default) || voices[0],
        }));
      }
    };

    loadVoices();

    // Some browsers load voices asynchronously
    if (synthRef.current) {
      synthRef.current.onvoiceschanged = loadVoices;
    }

    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
        synthRef.current.onvoiceschanged = null;
      }
    };
  }, []);

  // Speak text
  const speak = useCallback((text: string) => {
    if (!synthRef.current || !state.isSupported) {
      setState(prev => ({ ...prev, error: 'Text-to-speech not supported' }));
      callbacks?.onError?.('Text-to-speech not supported');
      return;
    }

    // Cancel any ongoing speech
    synthRef.current.cancel();

    if (!text.trim()) {
      setState(prev => ({ ...prev, error: 'No text to read' }));
      callbacks?.onError?.('No text to read');
      return;
    }

    textRef.current = text;
    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;

    // Apply settings
    if (state.currentVoice) {
      utterance.voice = state.currentVoice;
    }
    utterance.rate = state.rate;
    utterance.pitch = 1;

    // Event handlers
    utterance.onstart = () => {
      setState(prev => ({
        ...prev,
        status: 'speaking',
        progress: 0,
        charIndex: 0,
        error: null,
        textLength: text.length,
        startTime: Date.now(),
      }));
      callbacks?.onStart?.();
    };

    utterance.onend = () => {
      const duration = state.startTime ? Date.now() - state.startTime : 0;
      setState(prev => ({
        ...prev,
        status: 'idle',
        progress: 100,
        startTime: null,
      }));
      callbacks?.onEnd?.(duration);
    };

    utterance.onpause = () => {
      setState(prev => ({ ...prev, status: 'paused' }));
    };

    utterance.onresume = () => {
      setState(prev => ({ ...prev, status: 'speaking' }));
    };

    utterance.onerror = (event) => {
      // 'canceled' is not really an error, just a stop
      if (event.error === 'canceled') return;

      const errorMsg = `Speech error: ${event.error}`;
      setState(prev => ({
        ...prev,
        status: 'idle',
        error: errorMsg,
        startTime: null,
      }));
      callbacks?.onError?.(errorMsg);
    };

    // Progress tracking via boundary events
    utterance.onboundary = (event) => {
      if (event.charIndex !== undefined && textRef.current.length > 0) {
        const progress = (event.charIndex / textRef.current.length) * 100;
        setState(prev => ({
          ...prev,
          progress: Math.min(progress, 100),
          charIndex: event.charIndex,
        }));
      }
    };

    // Start speaking
    synthRef.current.speak(utterance);
  }, [state.currentVoice, state.rate, state.isSupported, state.startTime, callbacks]);

  // Pause speech
  const pause = useCallback(() => {
    if (synthRef.current && state.status === 'speaking') {
      synthRef.current.pause();
    }
  }, [state.status]);

  // Resume speech
  const resume = useCallback(() => {
    if (synthRef.current && state.status === 'paused') {
      synthRef.current.resume();
    }
  }, [state.status]);

  // Stop speech
  const stop = useCallback(() => {
    if (synthRef.current) {
      const duration = state.startTime ? Date.now() - state.startTime : 0;
      const progress = state.progress;

      synthRef.current.cancel();

      setState(prev => ({
        ...prev,
        status: 'idle',
        startTime: null,
      }));

      if (duration > 0) {
        callbacks?.onStop?.(duration, progress);
      }
    }
  }, [state.startTime, state.progress, callbacks]);

  // Set voice
  const setVoice = useCallback((voice: SpeechSynthesisVoice) => {
    setState(prev => ({ ...prev, currentVoice: voice }));
  }, []);

  // Set rate
  const setRate = useCallback((rate: number) => {
    // Clamp rate between 0.5 and 2
    const clampedRate = Math.max(0.5, Math.min(2, rate));
    setState(prev => ({ ...prev, rate: clampedRate }));
  }, []);

  const actions: TTSActions = {
    speak,
    pause,
    resume,
    stop,
    setVoice,
    setRate,
  };

  return [state, actions];
}
