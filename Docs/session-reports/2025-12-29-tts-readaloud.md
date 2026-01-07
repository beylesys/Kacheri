# Kacheri Session Report - December 29, 2025

## Session: TTS Read Aloud for Auditory Verification

**Date:** 2025-12-29
**Status:** Complete

---

## Documents Read

| Document | Status |
|----------|--------|
| `CLAUDE.md` | Read - Engineering guardrails understood |
| `Docs/blueprint/architecture blueprint.md` | Read - Voice (STT/TTS) in Proof & Export Layer |
| `Docs/Roadmap/docs roadmap.md` | Read - Phase 3 Voice Multilingual scope |
| `Docs/remaining-pilot-scope.md` | Read - Pilot scope complete, extending to Phase 3 |

---

## Session Goal

Implement TTS (Text-to-Speech) Read Aloud feature for auditory document verification using the Web Speech API. This is a Phase 3 feature per the roadmap, aligned with the blueprint's "TTS playback verification" and "Auditory Verification" capabilities.

**Key Deliverables:**
1. Custom `useTTS` hook encapsulating Web Speech API
2. `ReadAloudPanel` component with playback controls
3. Toolbar integration with "Read" button
4. Proof recording for TTS actions (audit trail)
5. ProofsPanel filter for `tts:read_aloud` events

---

## Roadmap Alignment

- **Blueprint Section:** Multilingual & Auditory Verification - TTS playback verification
- **Architecture Layer:** Proof & Export Layer - Voice (STT/TTS)
- **Phase:** Phase 3 - Voice Multilingual (beyond pilot scope)

This is a frontend-only implementation using browser-native Web Speech API. No backend changes required. Proof recording uses existing `/docs/:id/provenance` endpoint.

---

## Files Created

| File | Purpose |
|------|---------|
| `src/hooks/useTTS.ts` | Web Speech API hook with state management |
| `src/components/ReadAloudPanel.tsx` | Floating control panel UI |
| `src/components/readAloudPanel.css` | Panel styling |

---

## Files Modified

| File | Changes |
|------|---------|
| `src/EditorPage.tsx` | Added TTS state, button, panel, proof recording |
| `src/ProofsPanel.tsx` | Added `tts:read_aloud` filter and `formatAction` helper |

---

## Implementation Details

### useTTS Hook
- Wraps `window.speechSynthesis` API
- Manages state: status, progress, voices, rate, errors
- Provides actions: speak, pause, resume, stop, setVoice, setRate
- Callbacks: onStart, onEnd, onStop, onError for proof recording
- Progress tracking via `onboundary` event

### ReadAloudPanel Component
- Floating panel at top-right (z-index 2000)
- Play/Pause/Stop buttons
- Voice dropdown (grouped by language)
- Speed selector (0.5x to 2x)
- Progress bar with time estimate
- Text preview

### EditorPage Integration
- "Read" button in toolbar (after PDF/DOCX exports)
- Selection-aware: reads selected text or full document
- Auto-starts speaking when panel opens
- Records proof on TTS completion or stop

### Proof Recording
- Action type: `tts:read_aloud`
- Details: textLength, duration, voice, rate, completed/progressPercent
- Uses existing `EvidenceAPI.appendProvenance()` pattern

---

## Technical Decisions

1. **Client-side TTS:** Using browser-native Web Speech API (no backend synthesis)
   - Pro: Zero latency, no API costs, works offline
   - Con: Voice quality varies by browser/OS

2. **Proof on completion/stop:** Recording happens when TTS ends or user stops
   - Minimum 500ms threshold for stop events (avoid noise)
   - Includes progress percentage for partial reads

3. **Voice persistence:** Not persisted between sessions (system default used)
   - Could add localStorage persistence in future if needed

---

## Browser Compatibility

| Browser | Support |
|---------|---------|
| Chrome | Full - best voice selection |
| Edge | Full - good Windows voices |
| Firefox | Good - limited voices |
| Safari | Good - macOS voices |
| Mobile | Varies - may need user gesture |

Fallback: Shows "TTS not supported" message if `!window.speechSynthesis`

---

## Testing Notes

1. Open any document in editor
2. Click "Read" button in toolbar
3. Panel appears, TTS starts automatically
4. Use controls to pause/resume/stop
5. Change voice/speed and observe restart
6. Check Proofs panel for `Read Aloud` entries

---

## Risks & Considerations

- **Long documents:** May have browser limits on utterance length
- **Voice availability:** Varies significantly by OS/browser
- **Progress accuracy:** `onboundary` events may not fire consistently

---

## Follow-up Work (Future Sessions)

1. Add keyboard shortcut (Ctrl/Cmd + Shift + R) for Read Aloud
2. Implement voice preference persistence
3. Add language detection for auto-voice selection
4. Consider chunking for very long documents
5. STT (Speech-to-Text) for dictation (Phase 3 roadmap)

---

## Validation

```bash
# TypeScript check passed
cd "KACHERI FRONTEND" && npx tsc --noEmit
# No errors
```

---

## Session Outcome

TTS Read Aloud feature successfully implemented. All 5 planned slices completed:
1. useTTS hook
2. ReadAloudPanel component
3. ReadAloudPanel CSS
4. EditorPage integration
5. ProofsPanel filter update

Feature is ready for testing. Extends Kacheri Docs beyond pilot scope into Phase 3 Voice Multilingual capabilities.
