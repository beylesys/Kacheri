// KACHERI FRONTEND/src/hooks/useMemoryMonitor.ts
// Periodically monitors JS heap usage and iframe count to detect memory leaks
// during long Design Studio editing sessions.
// Uses performance.memory (Chrome) with iframe-count fallback for other browsers.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 7, Slice E2

import { useState, useEffect, useRef, useCallback } from 'react';

/** Sampling interval in ms */
const SAMPLE_INTERVAL = 30_000; // 30 seconds

/** Warn when heap usage exceeds this fraction of the limit */
const HEAP_WARN_THRESHOLD = 0.8;

/** Warn when heap grows faster than this (bytes per sample) — ~25MB/30s = 50MB/min */
const HEAP_GROWTH_WARN = 25 * 1024 * 1024;

/** Warn if more than this many iframes exist (should be 1-3 per E2 constraint) */
const MAX_EXPECTED_IFRAMES = 5;

export interface MemoryStats {
  /** JS heap used in bytes (Chrome only, 0 on other browsers) */
  heapUsed: number;
  /** JS heap limit in bytes (Chrome only, 0 on other browsers) */
  heapLimit: number;
  /** Number of iframes currently in the DOM */
  iframeCount: number;
  /** Session duration in ms */
  sessionDurationMs: number;
  /** Whether performance.memory API is available */
  heapApiAvailable: boolean;
}

interface UseMemoryMonitorResult {
  /** Warning message to display, or null if healthy */
  memoryWarning: string | null;
  /** Current memory stats snapshot */
  stats: MemoryStats;
  /** Dismiss the current warning */
  dismiss: () => void;
}

/** Chrome-specific performance.memory typing */
interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

function getPerformanceMemory(): PerformanceMemory | null {
  const perf = performance as typeof performance & { memory?: PerformanceMemory };
  return perf.memory ?? null;
}

function countIframes(): number {
  return document.querySelectorAll('iframe').length;
}

/**
 * Memory monitoring hook for Design Studio.
 * Samples every 30s and warns if:
 * - Heap usage > 80% of limit (Chrome)
 * - Heap growing > 50MB/min sustained over 2 samples (Chrome)
 * - More than 5 iframes in DOM (all browsers)
 */
export function useMemoryMonitor(): UseMemoryMonitorResult {
  const [warning, setWarning] = useState<string | null>(null);
  const [stats, setStats] = useState<MemoryStats>({
    heapUsed: 0,
    heapLimit: 0,
    iframeCount: 0,
    sessionDurationMs: 0,
    heapApiAvailable: false,
  });

  const sessionStartRef = useRef(Date.now());
  const prevHeapRef = useRef(0);
  const consecutiveGrowthRef = useRef(0);
  const dismissedRef = useRef(false);

  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    setWarning(null);
  }, []);

  useEffect(() => {
    function sample() {
      const mem = getPerformanceMemory();
      const iframeCount = countIframes();
      const sessionDurationMs = Date.now() - sessionStartRef.current;
      const heapApiAvailable = mem !== null;

      const heapUsed = mem?.usedJSHeapSize ?? 0;
      const heapLimit = mem?.jsHeapSizeLimit ?? 0;

      setStats({ heapUsed, heapLimit, iframeCount, sessionDurationMs, heapApiAvailable });

      // Don't re-warn after user dismissed
      if (dismissedRef.current) return;

      let newWarning: string | null = null;

      // Check 1: Heap usage threshold (Chrome only)
      if (mem && heapLimit > 0) {
        const usageRatio = heapUsed / heapLimit;
        if (usageRatio > HEAP_WARN_THRESHOLD) {
          newWarning = `High memory usage: ${Math.round(usageRatio * 100)}% of heap limit. Consider closing unused tabs or refreshing.`;
        }

        // Check 2: Sustained heap growth
        const growth = heapUsed - prevHeapRef.current;
        if (prevHeapRef.current > 0 && growth > HEAP_GROWTH_WARN) {
          consecutiveGrowthRef.current++;
          if (consecutiveGrowthRef.current >= 2) {
            newWarning = `Memory growing rapidly (~${Math.round(growth / 1024 / 1024)}MB in 30s). A memory leak may be occurring.`;
          }
        } else {
          consecutiveGrowthRef.current = 0;
        }
        prevHeapRef.current = heapUsed;
      }

      // Check 3: Too many iframes (all browsers)
      if (iframeCount > MAX_EXPECTED_IFRAMES) {
        newWarning = `${iframeCount} iframes detected (expected 1-3). This may indicate a rendering leak.`;
      }

      if (newWarning) {
        setWarning(newWarning);
      }
    }

    // Initial sample
    sample();
    const timer = setInterval(sample, SAMPLE_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  // Reset dismissed state when warning changes to a different message
  useEffect(() => {
    if (warning !== null) {
      dismissedRef.current = false;
    }
  }, [warning]);

  return { memoryWarning: warning, stats, dismiss };
}
