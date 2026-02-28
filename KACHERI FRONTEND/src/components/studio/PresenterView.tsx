// KACHERI FRONTEND/src/components/studio/PresenterView.tsx
// Builds a self-contained HTML page for the presenter view popup window.
// NOT a React component — exports a pure function that returns an HTML string.
// Syncs with PresentationMode via BroadcastChannel('beyle-presenter').
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 4, Slice C5

/** Frame data passed to the presenter view builder. */
export interface PresenterViewFrame {
  index: number;
  title: string | null;
  speakerNotes: string | null;
  srcdoc: string;
}

/**
 * Build a complete self-contained HTML string for the presenter view window.
 * The returned HTML contains inline CSS, inline JS, and embedded frame data.
 * It communicates with the main presentation via BroadcastChannel.
 */
export function buildPresenterViewHTML(data: {
  frames: PresenterViewFrame[];
  currentIndex: number;
  totalFrames: number;
}): string {
  // Serialize frame data for embedding in the page's script block.
  // Escape closing script tags in frame srcdoc content.
  const framesJson = JSON.stringify(data.frames).replace(/<\/script/gi, '<\\/script');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Presenter View — Beyle Design Studio</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: #0b0f16; color: #e2e8f0; display: flex; flex-direction: column; }

    .presenter-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 16px; background: #141a24; border-bottom: 1px solid #1e293b;
      font-size: 13px; color: #94a3b8; flex-shrink: 0;
    }
    .presenter-header-title { font-weight: 600; color: #e2e8f0; }

    .presenter-body { flex: 1; display: flex; overflow: hidden; }

    .presenter-main { flex: 1; display: flex; flex-direction: column; padding: 12px; gap: 8px; min-width: 0; }
    .presenter-sidebar { width: 320px; flex-shrink: 0; display: flex; flex-direction: column; border-left: 1px solid #1e293b; overflow: hidden; }

    .presenter-frame-label { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; padding-bottom: 4px; }
    .presenter-current { flex: 3; border: 2px solid #6366f1; border-radius: 6px; overflow: hidden; position: relative; min-height: 0; }
    .presenter-next { flex: 2; border: 1px solid #1e293b; border-radius: 6px; overflow: hidden; position: relative; min-height: 0; }
    .presenter-current iframe, .presenter-next iframe { width: 100%; height: 100%; border: none; }
    .presenter-no-next { display: flex; align-items: center; justify-content: center; font-size: 13px; color: #475569; flex: 2; border: 1px dashed #1e293b; border-radius: 6px; }

    .presenter-notes { flex: 1; padding: 16px; overflow-y: auto; font-size: 14px; line-height: 1.6; color: #cbd5e1; white-space: pre-wrap; }
    .presenter-notes-empty { color: #475569; font-style: italic; }

    .presenter-meta { padding: 12px 16px; border-top: 1px solid #1e293b; display: flex; flex-direction: column; gap: 8px; }
    .presenter-timer { font-size: 28px; font-weight: 700; color: #e2e8f0; text-align: center; font-variant-numeric: tabular-nums; }
    .presenter-counter { font-size: 13px; color: #94a3b8; text-align: center; }

    .presenter-controls { padding: 12px 16px; border-top: 1px solid #1e293b; display: flex; gap: 8px; }
    .presenter-btn {
      flex: 1; padding: 8px 12px; border-radius: 6px; border: 1px solid #1e293b;
      background: #141a24; color: #e2e8f0; font-size: 13px; font-weight: 500;
      cursor: pointer; text-align: center; transition: background 0.15s ease;
    }
    .presenter-btn:hover { background: #1e293b; }
    .presenter-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .presenter-btn--end { border-color: #ef4444; color: #ef4444; }
    .presenter-btn--end:hover { background: rgba(239, 68, 68, 0.15); }

    .presenter-ended { display: none; position: absolute; inset: 0; background: #0b0f16; align-items: center; justify-content: center; flex-direction: column; gap: 12px; }
    .presenter-ended.visible { display: flex; }
    .presenter-ended-text { font-size: 18px; color: #94a3b8; }

    @media (max-width: 700px) {
      .presenter-body { flex-direction: column; }
      .presenter-sidebar { width: 100%; border-left: none; border-top: 1px solid #1e293b; max-height: 40%; }
      .presenter-main { min-height: 60%; }
    }
  </style>
</head>
<body>
  <div class="presenter-header">
    <span class="presenter-header-title">Presenter View</span>
    <span id="headerCounter"></span>
  </div>

  <div class="presenter-body">
    <div class="presenter-main">
      <div class="presenter-frame-label">Current Frame</div>
      <div class="presenter-current" id="currentContainer">
        <iframe id="currentFrame" sandbox="allow-scripts" title="Current frame"></iframe>
      </div>
      <div class="presenter-frame-label">Next Frame</div>
      <div class="presenter-next" id="nextContainer">
        <iframe id="nextFrame" sandbox="allow-scripts" title="Next frame"></iframe>
      </div>
      <div class="presenter-no-next" id="noNext" style="display:none;">End of presentation</div>
    </div>

    <div class="presenter-sidebar">
      <div class="presenter-notes" id="notes"></div>
      <div class="presenter-meta">
        <div class="presenter-timer" id="timer">00:00</div>
        <div class="presenter-counter" id="counter"></div>
      </div>
      <div class="presenter-controls">
        <button class="presenter-btn" id="btnPrev" title="Previous frame">Prev</button>
        <button class="presenter-btn" id="btnNext" title="Next frame">Next</button>
        <button class="presenter-btn presenter-btn--end" id="btnEnd" title="End presentation">End</button>
      </div>
    </div>
  </div>

  <div class="presenter-ended" id="endedOverlay">
    <div class="presenter-ended-text">Presentation ended</div>
    <div style="font-size:13px;color:#475569;">This window will close shortly.</div>
  </div>

  <script>
    var frames = ${framesJson};
    var currentIndex = ${data.currentIndex};
    var totalFrames = ${data.totalFrames};
    var startTime = Date.now();
    var channel = null;

    // DOM refs
    var currentFrameEl = document.getElementById('currentFrame');
    var nextFrameEl = document.getElementById('nextFrame');
    var nextContainer = document.getElementById('nextContainer');
    var noNextEl = document.getElementById('noNext');
    var notesEl = document.getElementById('notes');
    var timerEl = document.getElementById('timer');
    var counterEl = document.getElementById('counter');
    var headerCounterEl = document.getElementById('headerCounter');
    var btnPrev = document.getElementById('btnPrev');
    var btnNext = document.getElementById('btnNext');
    var btnEnd = document.getElementById('btnEnd');
    var endedOverlay = document.getElementById('endedOverlay');

    function updateView(idx, total) {
      currentIndex = idx;
      totalFrames = total;
      var frame = frames[idx];

      // Current frame
      if (frame) {
        currentFrameEl.srcdoc = frame.srcdoc;
      }

      // Next frame
      var nextIdx = idx + 1;
      if (nextIdx < frames.length) {
        nextContainer.style.display = '';
        noNextEl.style.display = 'none';
        nextFrameEl.srcdoc = frames[nextIdx].srcdoc;
      } else {
        nextContainer.style.display = 'none';
        noNextEl.style.display = '';
      }

      // Speaker notes
      if (frame && frame.speakerNotes) {
        notesEl.textContent = frame.speakerNotes;
        notesEl.classList.remove('presenter-notes-empty');
      } else {
        notesEl.textContent = 'No speaker notes for this frame.';
        notesEl.classList.add('presenter-notes-empty');
      }

      // Counter
      var label = 'Frame ' + (idx + 1) + ' / ' + total;
      counterEl.textContent = label;
      headerCounterEl.textContent = label;

      // Button states
      btnPrev.disabled = idx <= 0;
      btnNext.disabled = idx >= totalFrames - 1;
    }

    function formatTime(ms) {
      var s = Math.floor(ms / 1000);
      var m = Math.floor(s / 60);
      s = s % 60;
      return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    // Timer
    setInterval(function() {
      timerEl.textContent = formatTime(Date.now() - startTime);
    }, 1000);

    // BroadcastChannel
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('beyle-presenter');
      channel.onmessage = function(event) {
        var msg = event.data;
        if (msg.type === 'frame_change') {
          updateView(msg.frameIndex, msg.totalFrames);
        } else if (msg.type === 'presentation_end') {
          endedOverlay.classList.add('visible');
          setTimeout(function() { window.close(); }, 3000);
        }
      };
    }

    // Navigation buttons
    btnPrev.addEventListener('click', function() {
      if (channel) channel.postMessage({ type: 'navigate', direction: 'prev' });
    });
    btnNext.addEventListener('click', function() {
      if (channel) channel.postMessage({ type: 'navigate', direction: 'next' });
    });
    btnEnd.addEventListener('click', function() {
      if (channel) channel.postMessage({ type: 'navigate_end' });
      endedOverlay.classList.add('visible');
      setTimeout(function() { window.close(); }, 2000);
    });

    // Keyboard shortcuts in presenter view
    document.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        if (channel) channel.postMessage({ type: 'navigate', direction: 'next' });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (channel) channel.postMessage({ type: 'navigate', direction: 'prev' });
      }
    });

    // Initial render
    updateView(currentIndex, totalFrames);
  <\/script>
</body>
</html>`;
}
