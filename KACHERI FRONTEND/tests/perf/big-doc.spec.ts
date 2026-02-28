/**
 * Big-Doc Performance Regression Test Suite
 *
 * Measures editor performance with large documents across 4 scenarios.
 * Uses Playwright + Chrome for browser-based measurement.
 *
 * Scenarios: small (10p), medium (50p), large (100p), stress (200p)
 * Metrics: load time, scroll FPS, memory, DOM node count, Yjs sync time
 *
 * Run PR suite (medium only):   PERF_SUITE=pr npx playwright test --project=perf-pr
 * Run nightly suite (all):      npx playwright test --project=perf-nightly
 */

import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Scenario {
  name: string;
  pages: number;
  images: number;
  tables: number;
  loadTargetMs: number;
  scrollFpsTarget: number;
  memoryLeakMaxMB: number;
}

interface ScenarioResult {
  scenario: string;
  loadTimeMs: number;
  contentInjectMs: number;
  domNodes: number;
  scrollFps: { avg: number; min: number; frames: number };
  memoryBaseMB: number | null;
  memoryAfterIdleMB: number | null;
  memoryDeltaMB: number | null;
  yjsSyncTimeMs: number;
  pass: boolean;
  failures: string[];
}

// ---------------------------------------------------------------------------
// Scenario Definitions
// ---------------------------------------------------------------------------

const ALL_SCENARIOS: Scenario[] = [
  {
    name: "small",
    pages: 10,
    images: 5,
    tables: 3,
    loadTargetMs: 10_000,
    scrollFpsTarget: 30,
    memoryLeakMaxMB: 20,
  },
  {
    name: "medium",
    pages: 50,
    images: 20,
    tables: 10,
    loadTargetMs: 2_000,
    scrollFpsTarget: 30,
    memoryLeakMaxMB: 20,
  },
  {
    name: "large",
    pages: 100,
    images: 40,
    tables: 20,
    loadTargetMs: 3_000,
    scrollFpsTarget: 30,
    memoryLeakMaxMB: 20,
  },
  {
    name: "stress",
    pages: 200,
    images: 80,
    tables: 40,
    loadTargetMs: 5_000,
    scrollFpsTarget: 30,
    memoryLeakMaxMB: 20,
  },
];

/** CI assertions allow 20% headroom over targets to reduce flaky failures. */
const CI_TOLERANCE = 1.2;

function getScenarios(): Scenario[] {
  const suite = process.env.PERF_SUITE || "nightly";
  if (suite === "pr") {
    return ALL_SCENARIOS.filter((s) => s.name === "medium");
  }
  return ALL_SCENARIOS;
}

// ---------------------------------------------------------------------------
// Inlined Benchmark HTML Generator
// (Mirrors src/utils/benchmarkDocGenerator.ts — inlined to avoid
//  cross-tsconfig import issues between tests/ and src/)
// ---------------------------------------------------------------------------

const LOREM = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
  "Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris. Integer in mauris eu nibh euismod gravida.",
  "Praesent blandit laoreet nibh. Fusce convallis metus id felis luctus adipiscing. Pellentesque egestas, neque sit amet convallis pulvinar, justo nulla eleifend augue, ac auctor orci leo non est.",
  "Quisque id odio. Quisque rutrum. Donec sodales sagittis magna. Sed consequat, leo eget bibendum sodales, augue velit cursus nunc, quis gravida magna mi a libero. Fusce vulputate eleifend sapien.",
];

const PLACEHOLDER_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'%3E%3Crect fill='%23e5e7eb' width='600' height='400'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-family='system-ui' font-size='24'%3EBenchmark Image%3C/text%3E%3C/svg%3E`;

function genTable(rows: number, cols: number): string {
  let html = '<table class="kacheri-table"><thead><tr>';
  for (let c = 0; c < cols; c++) html += `<th>Header ${c + 1}</th>`;
  html += "</tr></thead><tbody>";
  for (let r = 0; r < rows; r++) {
    html += "<tr>";
    for (let c = 0; c < cols; c++) html += `<td>Cell ${r + 1}-${c + 1}</td>`;
    html += "</tr>";
  }
  html += "</tbody></table>";
  return html;
}

function genList(items: number): string {
  let html = '<ol class="legal-numbering">';
  for (let i = 0; i < items; i++) {
    html += `<li>List item ${i + 1}: ${LOREM[i % LOREM.length].slice(0, 80)}</li>`;
  }
  html += "</ol>";
  return html;
}

function genImage(): string {
  return `<figure class="kacheri-image" data-align="center"><img src="${PLACEHOLDER_SVG}" alt="Benchmark placeholder" style="width: 60%"></figure>`;
}

function generateBenchmarkHTML(
  pages: number,
  images: number,
  tables: number
): string {
  const imagesPerPage = images / pages;
  const tablesPerPage = tables / pages;
  const listsPerPage = 0.5;
  const parts: string[] = [];

  for (let p = 0; p < pages; p++) {
    parts.push(`<h2>Page ${p + 1} of ${pages}</h2>`);
    for (let para = 0; para < 5; para++) {
      parts.push(`<p>${LOREM[para % LOREM.length]}</p>`);
    }
    if (imagesPerPage >= 1) {
      for (let i = 0; i < Math.floor(imagesPerPage); i++) parts.push(genImage());
    } else if (imagesPerPage > 0 && p % Math.round(1 / imagesPerPage) === 0) {
      parts.push(genImage());
    }
    if (tablesPerPage >= 1) {
      for (let t = 0; t < Math.floor(tablesPerPage); t++) parts.push(genTable(4, 3));
    } else if (tablesPerPage > 0 && p % Math.round(1 / tablesPerPage) === 0) {
      parts.push(genTable(4, 3));
    }
    if (listsPerPage >= 1) {
      for (let l = 0; l < Math.floor(listsPerPage); l++) parts.push(genList(5));
    } else if (listsPerPage > 0 && p % Math.round(1 / listsPerPage) === 0) {
      parts.push(genList(5));
    }
  }
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Auth & Doc Helpers
// ---------------------------------------------------------------------------

async function loginAsDevUser(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(async () => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "dev@kacheri.local",
        password: "dev123",
      }),
    });
    if (!res.ok) throw new Error(`Login failed: ${res.status}`);
    const data = await res.json();
    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    localStorage.setItem("tokenExpiresAt", String(data.expiresAt));
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("workspaceId", "default");
    localStorage.setItem("userId", data.user.id);
  });
}

async function createDoc(page: Page, title: string): Promise<string> {
  return page.evaluate(async (docTitle: string) => {
    const token = localStorage.getItem("accessToken");
    const res = await fetch("/api/docs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-workspace-id": localStorage.getItem("workspaceId") || "default",
        "x-user-id": localStorage.getItem("userId") || "user_dev_local",
      },
      body: JSON.stringify({ title: docTitle }),
    });
    if (!res.ok) throw new Error(`Create doc failed: ${res.status}`);
    const data = await res.json();
    return data.id as string;
  }, title);
}

// ---------------------------------------------------------------------------
// Browser-Side Measurement Helpers (run via page.evaluate)
// ---------------------------------------------------------------------------

async function waitForEditorReady(page: Page): Promise<void> {
  await page.waitForSelector(".tiptap .ProseMirror", { timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const el = document.querySelector(".realtime-status");
      return el && el.textContent?.includes("synced");
    },
    { timeout: 30_000 }
  );
}

async function injectContent(page: Page, html: string): Promise<number> {
  return page.evaluate((content: string) => {
    const start = performance.now();
    const editor = (window as any).__tiptapEditor;
    if (!editor) throw new Error("__tiptapEditor not found on window (dev mode required)");
    editor.commands.setContent(content, false);
    return performance.now() - start;
  }, html);
}

async function measureDOMNodes(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector(".tiptap .ProseMirror");
    return el ? el.querySelectorAll("*").length : 0;
  });
}

async function measureMemoryMB(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const perf = performance as any;
    if (!perf.memory) return null;
    if (typeof (window as any).gc === "function") {
      (window as any).gc();
    }
    return Math.round(perf.memory.usedJSHeapSize / 1024 / 1024);
  });
}

async function measureScrollFPS(
  page: Page,
  durationMs: number
): Promise<{ avg: number; min: number; frames: number }> {
  return page.evaluate((duration: number) => {
    return new Promise<{ avg: number; min: number; frames: number }>(
      (resolve) => {
        const el = document.querySelector(".editor-shell") as HTMLElement | null;
        if (!el) {
          resolve({ avg: 0, min: 0, frames: 0 });
          return;
        }

        const frameTimes: number[] = [];
        let lastTime = performance.now();
        let running = true;
        const scrollStep = el.scrollHeight / (duration / 16);

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
            resolve({ avg: 0, min: 0, frames: 0 });
            return;
          }
          const times = frameTimes.slice(1);
          const avgFrameTime =
            times.reduce((a, b) => a + b, 0) / times.length;
          const maxFrameTime = Math.max(...times);
          resolve({
            avg: Math.round(1000 / avgFrameTime),
            min: Math.round(1000 / maxFrameTime),
            frames: times.length,
          });
        }, duration);
      }
    );
  }, durationMs);
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe("Big-Doc Performance Regression Suite", () => {
  const results: ScenarioResult[] = [];

  for (const scenario of getScenarios()) {
    test(`${scenario.name} doc (${scenario.pages} pages, ${scenario.images} images, ${scenario.tables} tables)`, async ({
      page,
    }) => {
      // 1. Login
      await loginAsDevUser(page);

      // 2. Create doc
      const docId = await createDoc(
        page,
        `Perf Benchmark — ${scenario.name}`
      );

      // 3. Navigate and wait for editor ready
      const navStart = Date.now();
      await page.goto(`/doc/${docId}`);
      await waitForEditorReady(page);
      const editorReadyMs = Date.now() - navStart;

      // 4. Generate and inject benchmark content
      const html = generateBenchmarkHTML(
        scenario.pages,
        scenario.images,
        scenario.tables
      );
      const injectMs = await injectContent(page, html);

      // 5. Wait for Yjs sync after injection
      const yjsSyncStart = Date.now();
      await page.waitForFunction(
        () =>
          document
            .querySelector(".realtime-status")
            ?.textContent?.includes("synced"),
        { timeout: 60_000 }
      );
      const yjsSyncMs = Date.now() - yjsSyncStart;

      // 6. DOM node count
      const domNodes = await measureDOMNodes(page);

      // 7. Memory baseline
      const memBaseline = await measureMemoryMB(page);

      // 8. Scroll FPS (5 second measurement)
      const scrollFps = await measureScrollFPS(page, 5_000);

      // 9. Idle memory — wait 10s, re-measure
      await page.waitForTimeout(10_000);
      const memAfterIdle = await measureMemoryMB(page);

      // 10. Compute results
      const totalLoadMs = editorReadyMs + injectMs;
      const memDelta =
        memBaseline !== null && memAfterIdle !== null
          ? memAfterIdle - memBaseline
          : null;

      const failures: string[] = [];

      // Small doc is baseline-only — no load target assertion
      if (scenario.name !== "small" && totalLoadMs > scenario.loadTargetMs) {
        failures.push(
          `Load time ${totalLoadMs}ms exceeds target ${scenario.loadTargetMs}ms`
        );
      }
      if (scrollFps.avg > 0 && scrollFps.avg < scenario.scrollFpsTarget) {
        failures.push(
          `Scroll FPS ${scrollFps.avg} below target ${scenario.scrollFpsTarget}`
        );
      }
      if (memDelta !== null && memDelta > scenario.memoryLeakMaxMB) {
        failures.push(
          `Memory delta ${memDelta}MB exceeds max ${scenario.memoryLeakMaxMB}MB`
        );
      }

      const result: ScenarioResult = {
        scenario: scenario.name,
        loadTimeMs: totalLoadMs,
        contentInjectMs: injectMs,
        domNodes,
        scrollFps,
        memoryBaseMB: memBaseline,
        memoryAfterIdleMB: memAfterIdle,
        memoryDeltaMB: memDelta,
        yjsSyncTimeMs: yjsSyncMs,
        pass: failures.length === 0,
        failures,
      };
      results.push(result);

      // Console output for CI visibility
      console.log(`\n[Perf] ${scenario.name} doc:`);
      console.log(`  Load time: ${totalLoadMs}ms (editor ${editorReadyMs}ms + inject ${Math.round(injectMs)}ms)`);
      console.log(`  DOM nodes: ${domNodes}`);
      console.log(`  Scroll FPS: avg=${scrollFps.avg}, min=${scrollFps.min}, frames=${scrollFps.frames}`);
      console.log(`  Memory: base=${memBaseline}MB, idle=${memAfterIdle}MB, delta=${memDelta}MB`);
      console.log(`  Yjs sync: ${yjsSyncMs}ms`);
      console.log(`  Result: ${result.pass ? "PASS" : "FAIL"}`);
      if (failures.length > 0) console.log(`  Failures: ${failures.join("; ")}`);

      // Use soft assertions for stress scenario (200 pages can be flaky in CI)
      const gate = scenario.name === "stress" ? expect.soft : expect;

      // Load time assertion (skip small/baseline)
      if (scenario.name !== "small") {
        if (totalLoadMs > scenario.loadTargetMs && totalLoadMs <= scenario.loadTargetMs * CI_TOLERANCE) {
          console.warn(`⚠ ${scenario.name}: load time ${totalLoadMs}ms approaching target ${scenario.loadTargetMs}ms`);
        }
        gate(
          totalLoadMs,
          `${scenario.name}: load time`
        ).toBeLessThanOrEqual(scenario.loadTargetMs * CI_TOLERANCE);
      }

      // Scroll FPS assertion
      if (scrollFps.avg > 0) {
        const fpsFloor = scenario.scrollFpsTarget / CI_TOLERANCE;
        if (scrollFps.avg >= fpsFloor && scrollFps.avg < scenario.scrollFpsTarget) {
          console.warn(`⚠ ${scenario.name}: scroll FPS ${scrollFps.avg} approaching target ${scenario.scrollFpsTarget}`);
        }
        gate(
          scrollFps.avg,
          `${scenario.name}: scroll FPS`
        ).toBeGreaterThanOrEqual(fpsFloor);
      }

      // Memory delta assertion (Chrome-only; null when performance.memory unavailable)
      if (memDelta !== null) {
        const memCeiling = scenario.memoryLeakMaxMB * CI_TOLERANCE;
        if (memDelta > scenario.memoryLeakMaxMB && memDelta <= memCeiling) {
          console.warn(`⚠ ${scenario.name}: memory delta ${memDelta.toFixed(1)}MB approaching target ${scenario.memoryLeakMaxMB}MB`);
        }
        gate(
          memDelta,
          `${scenario.name}: memory delta`
        ).toBeLessThan(memCeiling);
      }
    });
  }

  test.afterAll(async () => {
    // Write JSON report
    const outDir = path.join(__dirname, "../../perf-results");
    fs.mkdirSync(outDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const reportPath = path.join(outDir, `big-doc-${date}.json`);
    const report = {
      timestamp: new Date().toISOString(),
      suite: process.env.PERF_SUITE || "nightly",
      scenarios: results,
      summary: {
        total: results.length,
        passed: results.filter((r) => r.pass).length,
        failed: results.filter((r) => !r.pass).length,
      },
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n[Perf Report] Written to ${reportPath}`);
    console.log(JSON.stringify(report.summary));
  });
});
