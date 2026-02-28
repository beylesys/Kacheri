import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  retries: 1,
  fullyParallel: false,
  reporter: [
    ["html", { open: "never" }],
    ["json", { outputFile: "perf-results/report.json" }],
  ],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    launchOptions: {
      args: [
        "--enable-precise-memory-info",
        "--js-flags=--expose-gc",
        "--disable-gpu-sandbox",
      ],
    },
  },
  projects: [
    {
      name: "perf-pr",
      testMatch: /big-doc\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "perf-nightly",
      testMatch: /big-doc\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npm run dev",
      cwd: "../KACHERI BACKEND",
      port: 4000,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: { NODE_ENV: "development" },
    },
    {
      command: "npm run dev",
      port: 5173,
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
