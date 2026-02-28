// KACHERI FRONTEND/src/utils/benchmarkDocGenerator.ts
// Dev-only utility for generating large benchmark documents and measuring performance.
// Not imported by any production code — tree-shaked in production builds.
// Usage: import from browser console or dev-only code paths.

export interface BenchmarkDocOptions {
  pages: number;
  imagesPerPage?: number;
  tablesPerPage?: number;
  listsPerPage?: number;
}

const LOREM = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
  "Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris. Integer in mauris eu nibh euismod gravida.",
  "Praesent blandit laoreet nibh. Fusce convallis metus id felis luctus adipiscing. Pellentesque egestas, neque sit amet convallis pulvinar, justo nulla eleifend augue, ac auctor orci leo non est.",
  "Quisque id odio. Quisque rutrum. Donec sodales sagittis magna. Sed consequat, leo eget bibendum sodales, augue velit cursus nunc, quis gravida magna mi a libero. Fusce vulputate eleifend sapien.",
];

// Tiny inline SVG placeholder (~200 bytes) — no network request
const PLACEHOLDER_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'%3E%3Crect fill='%23e5e7eb' width='600' height='400'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-family='system-ui' font-size='24'%3EBenchmark Image%3C/text%3E%3C/svg%3E`;

function generateTable(rows: number, cols: number): string {
  let html = '<table class="kacheri-table"><thead><tr>';
  for (let c = 0; c < cols; c++) {
    html += `<th>Header ${c + 1}</th>`;
  }
  html += "</tr></thead><tbody>";
  for (let r = 0; r < rows; r++) {
    html += "<tr>";
    for (let c = 0; c < cols; c++) {
      html += `<td>Cell ${r + 1}-${c + 1}</td>`;
    }
    html += "</tr>";
  }
  html += "</tbody></table>";
  return html;
}

function generateList(items: number): string {
  let html = '<ol class="legal-numbering">';
  for (let i = 0; i < items; i++) {
    html += `<li>List item ${i + 1}: ${LOREM[i % LOREM.length].slice(0, 80)}</li>`;
  }
  html += "</ol>";
  return html;
}

function generateImage(): string {
  return `<figure class="kacheri-image" data-align="center"><img src="${PLACEHOLDER_SVG}" alt="Benchmark placeholder" style="width: 60%"></figure>`;
}

export function generateBenchmarkDoc(opts: BenchmarkDocOptions): string {
  const {
    pages,
    imagesPerPage = 1,
    tablesPerPage = 0.2,
    listsPerPage = 0.5,
  } = opts;

  const parts: string[] = [];

  for (let p = 0; p < pages; p++) {
    // Heading
    parts.push(`<h2>Page ${p + 1} of ${pages}</h2>`);

    // 4-5 paragraphs (~250 words, approximately one printed page)
    for (let para = 0; para < 5; para++) {
      parts.push(`<p>${LOREM[para % LOREM.length]}</p>`);
    }

    // Conditionally insert images
    if (imagesPerPage >= 1) {
      for (let i = 0; i < Math.floor(imagesPerPage); i++) {
        parts.push(generateImage());
      }
    } else if (imagesPerPage > 0 && p % Math.round(1 / imagesPerPage) === 0) {
      parts.push(generateImage());
    }

    // Conditionally insert tables
    if (tablesPerPage >= 1) {
      for (let t = 0; t < Math.floor(tablesPerPage); t++) {
        parts.push(generateTable(4, 3));
      }
    } else if (tablesPerPage > 0 && p % Math.round(1 / tablesPerPage) === 0) {
      parts.push(generateTable(4, 3));
    }

    // Conditionally insert lists
    if (listsPerPage >= 1) {
      for (let l = 0; l < Math.floor(listsPerPage); l++) {
        parts.push(generateList(5));
      }
    } else if (listsPerPage > 0 && p % Math.round(1 / listsPerPage) === 0) {
      parts.push(generateList(5));
    }
  }

  return parts.join("\n");
}

export function measurePerformance(label: string): { stop: () => number } {
  const start = performance.now();
  return {
    stop() {
      const elapsed = performance.now() - start;
      console.log(`[Benchmark] ${label}: ${elapsed.toFixed(1)}ms`);
      return elapsed;
    },
  };
}

export function measureScrollFPS(
  durationMs = 5000,
  scrollContainer = ".editor-shell"
): Promise<{ avgFps: number; minFps: number; frames: number }> {
  return new Promise((resolve) => {
    const el = document.querySelector(scrollContainer) as HTMLElement | null;
    if (!el) {
      console.warn("[Benchmark] Scroll container not found:", scrollContainer);
      resolve({ avgFps: 0, minFps: 0, frames: 0 });
      return;
    }

    const frameTimes: number[] = [];
    let lastTime = performance.now();
    let running = true;

    // Scroll down gradually
    const scrollStep = el.scrollHeight / (durationMs / 16);

    function tick() {
      if (!running) return;
      const now = performance.now();
      frameTimes.push(now - lastTime);
      lastTime = now;

      el!.scrollTop += scrollStep;
      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);

    setTimeout(() => {
      running = false;

      if (frameTimes.length < 2) {
        resolve({ avgFps: 0, minFps: 0, frames: 0 });
        return;
      }

      // Remove the first frame (often an outlier)
      const times = frameTimes.slice(1);
      const avgFrameTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxFrameTime = Math.max(...times);
      const avgFps = Math.round(1000 / avgFrameTime);
      const minFps = Math.round(1000 / maxFrameTime);

      console.log(
        `[Benchmark] Scroll FPS over ${durationMs}ms: avg=${avgFps}, min=${minFps}, frames=${times.length}`
      );
      resolve({ avgFps, minFps, frames: times.length });
    }, durationMs);
  });
}

export function measureMemory(): { usedJSHeapMB: number; totalJSHeapMB: number } | null {
  const perf = performance as any;
  if (!perf.memory) {
    console.warn("[Benchmark] performance.memory not available (Chrome only)");
    return null;
  }
  const used = Math.round(perf.memory.usedJSHeapSize / 1024 / 1024);
  const total = Math.round(perf.memory.totalJSHeapSize / 1024 / 1024);
  console.log(`[Benchmark] Memory: ${used}MB used / ${total}MB total`);
  return { usedJSHeapMB: used, totalJSHeapMB: total };
}

export function countDOMNodes(container = ".tiptap .ProseMirror"): number {
  const el = document.querySelector(container);
  if (!el) return 0;
  const count = el.querySelectorAll("*").length;
  console.log(`[Benchmark] DOM nodes in ${container}: ${count}`);
  return count;
}
