// KACHERI FRONTEND/src/components/studio/PresentationMode.tsx
// Fullscreen presentation overlay for Design Studio canvases.
// Renders frames via sandboxed iframes with CSS transitions (fade/slide/zoom),
// keyboard + touch navigation, BroadcastChannel sync with PresenterView,
// and black/white screen overlays.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 4, Slice C5

import { useState, useEffect, useRef, useCallback } from 'react';
import type { CanvasFrame } from '../../types/canvas';
import { FrameRenderer } from './FrameRenderer';
import { useFrameRenderer } from '../../hooks/useFrameRenderer';
import { buildPresenterViewHTML } from './PresenterView';

/** Cache-buster token — see useFrameRenderer.ts for rationale */
const KCL_CACHE_BUSTER = Date.now();

type ScreenOverlay = 'none' | 'black' | 'white';

type NavigationDirection = 'next' | 'prev';

type PresentationMessage =
  | { type: 'frame_change'; frameIndex: number; totalFrames: number }
  | { type: 'presentation_end' }
  | { type: 'navigate'; direction: NavigationDirection }
  | { type: 'navigate_end' };

interface PresentationModeProps {
  /** All frames sorted by sortOrder. */
  sortedFrames: CanvasFrame[];
  /** Index in sortedFrames to start presenting from. */
  startIndex: number;
  /** KCL version for frame rendering. */
  kclVersion: string;
  /** Called when presentation exits. */
  onExit: () => void;
  /** E7: Effective embed whitelist domains for per-frame CSP */
  embedWhitelist?: string[];
}

const CHANNEL_NAME = 'beyle-presenter';
const CONTROLS_HIDE_DELAY = 3000;
const TRANSITION_DURATION = 280;
const SWIPE_THRESHOLD = 50;

/**
 * Build srcdoc HTML for a frame. Duplicated from useFrameRenderer to avoid
 * modifying the C3 hook. Used only for presenter view frame previews.
 */
function buildSrcdoc(frameCode: string, kclVersion: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${origin}/kcl/${kclVersion}/kcl.css?_cb=${KCL_CACHE_BUSTER}">
  <style>*, *::before, *::after { box-sizing: border-box; } html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; } kcl-slide { display: block; width: 100%; height: 100%; overflow: hidden; } .kcl-slide-container { height: 100%; }</style>
  <script src="${origin}/kcl/${kclVersion}/kcl.js?_cb=${KCL_CACHE_BUSTER}"><\/script>
</head>
<body>${frameCode}</body>
</html>`;
}

export function PresentationMode({
  sortedFrames,
  startIndex,
  kclVersion,
  onExit,
  embedWhitelist,
}: PresentationModeProps) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [screenOverlay, setScreenOverlay] = useState<ScreenOverlay>('none');
  const [showControls, setShowControls] = useState(true);
  const [exitingFrame, setExitingFrame] = useState<{
    index: number;
    direction: NavigationDirection;
  } | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const presenterWindowRef = useRef<Window | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const controlsTimerRef = useRef<number>(0);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);

  const currentFrame = sortedFrames[currentIndex];
  const exitingFrameData = exitingFrame ? sortedFrames[exitingFrame.index] : null;

  // Active frame rendering via existing hook
  const { srcdoc, renderError, isLoading, iframeRef, clearError } =
    useFrameRenderer({
      frameCode: currentFrame?.code || '',
      kclVersion,
      embedWhitelist,
    });

  // Exiting frame srcdoc (for transition animation)
  const exitingSrcdoc = exitingFrameData
    ? buildSrcdoc(exitingFrameData.code, kclVersion)
    : '';

  // Transition type from the entering frame
  const transitionType = currentFrame?.transition || 'none';

  // ── BroadcastChannel setup ──

  const broadcastFrameChange = useCallback(
    (index: number) => {
      channelRef.current?.postMessage({
        type: 'frame_change',
        frameIndex: index,
        totalFrames: sortedFrames.length,
      } as PresentationMessage);
    },
    [sortedFrames.length],
  );

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<PresentationMessage>) => {
      const msg = event.data;
      if (msg.type === 'navigate') {
        if (msg.direction === 'next') goNext();
        else if (msg.direction === 'prev') goPrev();
      } else if (msg.type === 'navigate_end') {
        onExit();
      }
    };

    // Send initial state
    channel.postMessage({
      type: 'frame_change',
      frameIndex: startIndex,
      totalFrames: sortedFrames.length,
    } as PresentationMessage);

    return () => {
      channel.postMessage({ type: 'presentation_end' } as PresentationMessage);
      channel.close();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Body overflow + fullscreen ──

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Attempt fullscreen (best-effort)
    document.documentElement.requestFullscreen?.().catch(() => {
      // Fullscreen denied — presentation works without it
    });

    return () => {
      document.body.style.overflow = prev;
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    };
  }, []);

  // ── Controls auto-hide ──

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    window.clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, CONTROLS_HIDE_DELAY);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => window.clearTimeout(controlsTimerRef.current);
  }, [resetControlsTimer]);

  // ── Navigation ──

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev >= sortedFrames.length - 1) return prev;
      const next = prev + 1;
      setScreenOverlay('none');
      setExitingFrame({ index: prev, direction: 'next' });
      broadcastFrameChange(next);
      resetControlsTimer();
      return next;
    });
  }, [sortedFrames.length, broadcastFrameChange, resetControlsTimer]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev <= 0) return prev;
      const next = prev - 1;
      setScreenOverlay('none');
      setExitingFrame({ index: prev, direction: 'prev' });
      broadcastFrameChange(next);
      resetControlsTimer();
      return next;
    });
  }, [broadcastFrameChange, resetControlsTimer]);

  // Clear exiting frame after transition duration
  useEffect(() => {
    if (!exitingFrame) return;
    const timer = setTimeout(() => {
      setExitingFrame(null);
    }, TRANSITION_DURATION);
    return () => clearTimeout(timer);
  }, [exitingFrame]);

  // ── Presenter view ──

  const openPresenterView = useCallback(() => {
    if (
      presenterWindowRef.current &&
      !presenterWindowRef.current.closed
    ) {
      presenterWindowRef.current.focus();
      return;
    }

    const frames = sortedFrames.map((f, i) => ({
      index: i,
      title: f.title ?? null,
      speakerNotes: f.speakerNotes,
      srcdoc: buildSrcdoc(f.code, kclVersion),
    }));

    const html = buildPresenterViewHTML({
      frames,
      currentIndex,
      totalFrames: sortedFrames.length,
    });

    const win = window.open(
      '',
      'beyle-presenter-view',
      'width=900,height=600',
    );
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
      presenterWindowRef.current = win;
    }
  }, [sortedFrames, currentIndex, kclVersion]);

  // Close presenter window on unmount
  useEffect(() => {
    return () => {
      if (
        presenterWindowRef.current &&
        !presenterWindowRef.current.closed
      ) {
        presenterWindowRef.current.close();
      }
    };
  }, []);

  // ── Fullscreen toggle ──

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, []);

  // ── Keyboard handler ──

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowRight':
        case ' ':
        case 'Enter':
          e.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
        case 'Backspace':
          e.preventDefault();
          goPrev();
          break;
        case 'Escape':
          e.preventDefault();
          onExit();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          openPresenterView();
          break;
        case 'b':
        case 'B':
          e.preventDefault();
          setScreenOverlay((prev) =>
            prev === 'black' ? 'none' : 'black',
          );
          break;
        case 'w':
        case 'W':
          e.preventDefault();
          setScreenOverlay((prev) =>
            prev === 'white' ? 'none' : 'white',
          );
          break;
        default:
          // Any other key resets controls timer
          resetControlsTimer();
          return;
      }
      resetControlsTimer();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, onExit, toggleFullscreen, openPresenterView, resetControlsTimer]);

  // ── Mouse movement shows controls ──

  useEffect(() => {
    function handleMouseMove() {
      resetControlsTimer();
    }
    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [resetControlsTimer]);

  // ── Touch swipe navigation ──

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    function handleTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
    }

    function handleTouchMove(e: TouchEvent) {
      // Prevent scrolling during presentation
      e.preventDefault();
    }

    function handleTouchEnd(e: TouchEvent) {
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - touchStartXRef.current;
      const dy = touch.clientY - touchStartYRef.current;

      // Only horizontal swipes above threshold
      if (
        Math.abs(dx) < SWIPE_THRESHOLD ||
        Math.abs(dx) < Math.abs(dy)
      ) {
        return;
      }

      if (dx < 0) {
        goNext();
      } else {
        goPrev();
      }
    }

    stage.addEventListener('touchstart', handleTouchStart, {
      passive: true,
    });
    stage.addEventListener('touchmove', handleTouchMove, {
      passive: false,
    });
    stage.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      stage.removeEventListener('touchstart', handleTouchStart);
      stage.removeEventListener('touchmove', handleTouchMove);
      stage.removeEventListener('touchend', handleTouchEnd);
    };
  }, [goNext, goPrev]);

  // Click to advance
  const handleStageClick = useCallback(() => {
    goNext();
  }, [goNext]);

  // ── Transition class helpers ──

  function getEnterClass(): string {
    if (transitionType === 'none' || !exitingFrame) return '';
    if (transitionType === 'fade') return 'presentation-frame--fade-enter';
    if (transitionType === 'zoom') return 'presentation-frame--zoom-enter';
    if (transitionType === 'slide') {
      return exitingFrame.direction === 'next'
        ? 'presentation-frame--slide-enter-next'
        : 'presentation-frame--slide-enter-prev';
    }
    return '';
  }

  function getExitClass(): string {
    if (!exitingFrame) return '';
    if (transitionType === 'none') return 'presentation-frame--none-exit';
    if (transitionType === 'fade') return 'presentation-frame--fade-exit';
    if (transitionType === 'zoom') return 'presentation-frame--zoom-exit';
    if (transitionType === 'slide') {
      return exitingFrame.direction === 'next'
        ? 'presentation-frame--slide-exit-next'
        : 'presentation-frame--slide-exit-prev';
    }
    return '';
  }

  // ── Progress ──

  const progressPercent =
    sortedFrames.length > 1
      ? ((currentIndex + 1) / sortedFrames.length) * 100
      : 100;

  if (!currentFrame) return null;

  return (
    <div
      className={
        'presentation-mode' +
        (showControls ? ' presentation-mode--show-controls' : '')
      }
      role="dialog"
      aria-modal="true"
      aria-label="Presentation mode"
    >
      {/* ── Stage ── */}
      <div
        className="presentation-stage"
        ref={stageRef}
        onClick={handleStageClick}
      >
        {/* Exiting frame (during transition) */}
        {exitingFrame && exitingFrameData && (
          <div
            className={'presentation-frame ' + getExitClass()}
            aria-hidden="true"
          >
            <iframe
              srcDoc={exitingSrcdoc}
              sandbox="allow-scripts"
              title="Previous frame"
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          </div>
        )}

        {/* Current frame */}
        <div className={'presentation-frame ' + getEnterClass()}>
          <FrameRenderer
            frameCode={currentFrame.code}
            kclVersion={kclVersion}
          />
        </div>

        {/* Screen overlay (B/W) */}
        {screenOverlay !== 'none' && (
          <div
            className={
              'presentation-overlay presentation-overlay--' + screenOverlay
            }
            aria-hidden="true"
          />
        )}
      </div>

      {/* ── Progress bar ── */}
      <div
        className={
          'presentation-progress' +
          (!showControls ? ' presentation-progress--hidden' : '')
        }
      >
        <span
          className="presentation-progress-text"
          aria-live="polite"
        >
          Frame {currentIndex + 1} / {sortedFrames.length}
        </span>
        <div
          className="presentation-progress-bar"
          style={{ width: `${progressPercent}%` }}
          role="progressbar"
          aria-valuenow={currentIndex + 1}
          aria-valuemin={1}
          aria-valuemax={sortedFrames.length}
        />
      </div>
    </div>
  );
}
