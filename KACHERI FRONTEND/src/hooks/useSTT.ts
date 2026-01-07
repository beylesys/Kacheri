// useSTT.ts — Web Speech API hook for Speech-to-Text (Dictation)
// Provides recording controls, live transcription, and language selection

import { useState, useEffect, useRef, useCallback } from 'react';

// Extend Window interface for webkit prefix
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

export interface STTState {
  status: 'idle' | 'recording' | 'paused' | 'processing';
  transcript: string;           // Accumulated final text
  interimTranscript: string;    // Real-time preview (not yet final)
  language: string;             // e.g., "en-US"
  confidence: number;           // 0-1 average confidence
  error: string | null;
  isSupported: boolean;
  startTime: number | null;
  duration: number;             // milliseconds
}

export interface STTActions {
  startRecording: (language?: string) => void;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  clearTranscript: () => void;
  setLanguage: (lang: string) => void;
}

export interface STTCallbacks {
  onStart?: () => void;
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onEnd?: (finalTranscript: string, duration: number) => void;
  onStop?: (partialTranscript: string, duration: number) => void;
  onError?: (error: string) => void;
}

// Get SpeechRecognition constructor (handles webkit prefix)
const getSpeechRecognition = (): typeof SpeechRecognition | null => {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

const DEFAULT_STATE: STTState = {
  status: 'idle',
  transcript: '',
  interimTranscript: '',
  language: 'en-US',
  confidence: 0,
  error: null,
  isSupported: !!getSpeechRecognition(),
  startTime: null,
  duration: 0,
};

export function useSTT(callbacks?: STTCallbacks): [STTState, STTActions] {
  const [state, setState] = useState<STTState>(DEFAULT_STATE);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptRef = useRef<string>('');
  const confidenceScoresRef = useRef<number[]>([]);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  // Start duration timer
  const startDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }
    durationIntervalRef.current = setInterval(() => {
      setState(prev => {
        if (prev.startTime) {
          return { ...prev, duration: Date.now() - prev.startTime };
        }
        return prev;
      });
    }, 100);
  }, []);

  // Stop duration timer
  const stopDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  // Start recording
  const startRecording = useCallback((language?: string) => {
    const SpeechRecognitionClass = getSpeechRecognition();

    if (!SpeechRecognitionClass) {
      const errorMsg = 'Speech recognition not supported in this browser';
      setState(prev => ({ ...prev, error: errorMsg }));
      callbacks?.onError?.(errorMsg);
      return;
    }

    // Stop any existing recognition
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    const recognition = new SpeechRecognitionClass();
    recognitionRef.current = recognition;

    // Configure recognition
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language || state.language;

    // Reset state
    transcriptRef.current = '';
    confidenceScoresRef.current = [];

    // Event handlers
    recognition.onstart = () => {
      setState(prev => ({
        ...prev,
        status: 'recording',
        transcript: '',
        interimTranscript: '',
        error: null,
        startTime: Date.now(),
        duration: 0,
        confidence: 0,
      }));
      startDurationTimer();
      callbacks?.onStart?.();
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        const confidence = result[0].confidence;

        if (result.isFinal) {
          finalText += transcript;
          if (confidence) {
            confidenceScoresRef.current.push(confidence);
          }
        } else {
          interim += transcript;
        }
      }

      // Append final text to accumulated transcript
      if (finalText) {
        transcriptRef.current += finalText;
        callbacks?.onTranscript?.(finalText, true);
      }

      // Calculate average confidence
      const avgConfidence = confidenceScoresRef.current.length > 0
        ? confidenceScoresRef.current.reduce((a, b) => a + b, 0) / confidenceScoresRef.current.length
        : 0;

      setState(prev => ({
        ...prev,
        transcript: transcriptRef.current,
        interimTranscript: interim,
        confidence: avgConfidence,
      }));

      if (interim) {
        callbacks?.onTranscript?.(interim, false);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // Handle specific error types
      let errorMsg = '';
      switch (event.error) {
        case 'no-speech':
          errorMsg = 'No speech detected. Please try again.';
          break;
        case 'audio-capture':
          errorMsg = 'No microphone found. Please check your microphone.';
          break;
        case 'not-allowed':
          errorMsg = 'Microphone permission denied. Please allow microphone access.';
          break;
        case 'network':
          errorMsg = 'Network error. Speech recognition requires internet.';
          break;
        case 'aborted':
          // User aborted, not really an error
          return;
        default:
          errorMsg = `Speech recognition error: ${event.error}`;
      }

      setState(prev => ({ ...prev, error: errorMsg, status: 'idle' }));
      stopDurationTimer();
      callbacks?.onError?.(errorMsg);
    };

    recognition.onend = () => {
      const duration = state.startTime ? Date.now() - state.startTime : 0;
      const finalTranscript = transcriptRef.current;

      stopDurationTimer();

      setState(prev => ({
        ...prev,
        status: 'idle',
        duration,
        startTime: null,
      }));

      // Only call onEnd if we have text and it wasn't stopped manually
      if (finalTranscript.trim()) {
        callbacks?.onEnd?.(finalTranscript, duration);
      }
    };

    // Start recognition
    try {
      recognition.start();
    } catch (err) {
      const errorMsg = 'Failed to start speech recognition';
      setState(prev => ({ ...prev, error: errorMsg }));
      callbacks?.onError?.(errorMsg);
    }
  }, [state.language, state.startTime, callbacks, startDurationTimer, stopDurationTimer]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      const duration = state.startTime ? Date.now() - state.startTime : 0;
      const partialTranscript = transcriptRef.current;

      stopDurationTimer();

      // Stop gracefully (will trigger onend with final results)
      recognitionRef.current.stop();

      setState(prev => ({
        ...prev,
        status: 'processing',
      }));

      // If we have partial transcript, call onStop
      if (partialTranscript.trim()) {
        callbacks?.onStop?.(partialTranscript, duration);
      }
    }
  }, [state.startTime, callbacks, stopDurationTimer]);

  // Pause recording (abort without triggering onEnd)
  const pauseRecording = useCallback(() => {
    if (recognitionRef.current && state.status === 'recording') {
      recognitionRef.current.abort();
      stopDurationTimer();
      setState(prev => ({ ...prev, status: 'paused' }));
    }
  }, [state.status, stopDurationTimer]);

  // Resume recording
  const resumeRecording = useCallback(() => {
    if (state.status === 'paused') {
      // Re-start recognition (keeping existing transcript)
      const SpeechRecognitionClass = getSpeechRecognition();
      if (!SpeechRecognitionClass) return;

      const recognition = new SpeechRecognitionClass();
      recognitionRef.current = recognition;

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = state.language;

      recognition.onstart = () => {
        setState(prev => ({
          ...prev,
          status: 'recording',
          error: null,
          startTime: Date.now(),
        }));
        startDurationTimer();
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalText += result[0].transcript;
            if (result[0].confidence) {
              confidenceScoresRef.current.push(result[0].confidence);
            }
          } else {
            interim += result[0].transcript;
          }
        }

        if (finalText) {
          transcriptRef.current += finalText;
        }

        const avgConfidence = confidenceScoresRef.current.length > 0
          ? confidenceScoresRef.current.reduce((a, b) => a + b, 0) / confidenceScoresRef.current.length
          : 0;

        setState(prev => ({
          ...prev,
          transcript: transcriptRef.current,
          interimTranscript: interim,
          confidence: avgConfidence,
        }));
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error !== 'aborted') {
          setState(prev => ({ ...prev, error: `Error: ${event.error}`, status: 'idle' }));
          stopDurationTimer();
        }
      };

      recognition.onend = () => {
        stopDurationTimer();
        setState(prev => ({ ...prev, status: 'idle', startTime: null }));
      };

      try {
        recognition.start();
      } catch (err) {
        setState(prev => ({ ...prev, error: 'Failed to resume recording' }));
      }
    }
  }, [state.status, state.language, startDurationTimer, stopDurationTimer]);

  // Clear transcript
  const clearTranscript = useCallback(() => {
    transcriptRef.current = '';
    confidenceScoresRef.current = [];
    setState(prev => ({
      ...prev,
      transcript: '',
      interimTranscript: '',
      confidence: 0,
    }));
  }, []);

  // Set language
  const setLanguage = useCallback((lang: string) => {
    setState(prev => ({ ...prev, language: lang }));
  }, []);

  const actions: STTActions = {
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    clearTranscript,
    setLanguage,
  };

  return [state, actions];
}
