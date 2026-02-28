'use strict';

/**
 * BEYLE Platform — Embedded Backend Manager (Slice S8)
 *
 * Manages the KACHERI Backend as a child process within the Electron app.
 * In local mode, the backend runs as a subprocess with its own Node.js
 * event loop. Electron owns the lifecycle: start, monitor, restart, kill.
 *
 * The backend communicates its bound port via Node IPC
 * ({ type: 'backend:ready', port: <number> }).
 *
 * Database and storage paths are routed to Electron's userData directory
 * so local data persists across sessions.
 */

const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

/** Maximum time (ms) to wait for the backend to signal readiness. */
const STARTUP_TIMEOUT_MS = 15_000;

/** Interval (ms) between health poll requests. */
const HEALTH_POLL_INTERVAL_MS = 10_000;

/** Timeout (ms) for each health poll HTTP request. */
const HEALTH_REQUEST_TIMEOUT_MS = 5_000;

/** Consecutive health failures before declaring unhealthy. */
const UNHEALTHY_THRESHOLD = 3;

/** Maximum automatic restarts before giving up. */
const MAX_RESTART_ATTEMPTS = 3;

/** Time (ms) to wait for graceful shutdown before SIGKILL. */
const SHUTDOWN_GRACE_MS = 5_000;

/* ================================================================== */
/*  Backend Entry Point Resolution                                     */
/* ================================================================== */

/**
 * Determine how to run the backend.
 *
 * Prefers compiled output for performance and reliability.
 * Checks `dist/server.js` first (flat outDir), then `dist/src/server.js`
 * (when tsconfig has no rootDir and preserves the src/ subfolder).
 * Falls back to running the TypeScript source via tsx or ts-node
 * if no compiled output exists (development convenience).
 *
 * @param {string} backendDir — Absolute path to `KACHERI BACKEND/`
 * @returns {{ entryPath: string, execArgv: string[] }}
 */
function resolveBackendEntry(backendDir) {
  // Check both possible compiled output locations
  const distFlat = path.join(backendDir, 'dist', 'server.js');
  const distNested = path.join(backendDir, 'dist', 'src', 'server.js');
  const distEntry = fs.existsSync(distFlat) ? distFlat : distNested;
  if (fs.existsSync(distEntry)) {
    return { entryPath: distEntry, execArgv: [] };
  }

  // Fallback: run TypeScript source via tsx (must be installed in backend)
  const srcEntry = path.join(backendDir, 'src', 'server.ts');
  if (fs.existsSync(srcEntry)) {
    // Locate tsx or ts-node in the backend's node_modules
    const tsxBin = path.join(backendDir, 'node_modules', '.bin', 'tsx');
    const tsNodeBin = path.join(
      backendDir,
      'node_modules',
      '.bin',
      'ts-node'
    );

    // Use --loader approach for tsx, or --require for ts-node
    if (fs.existsSync(tsxBin + '.cmd') || fs.existsSync(tsxBin)) {
      // tsx uses --import for ESM or --loader for CJS
      return {
        entryPath: srcEntry,
        execArgv: ['--require', path.join(backendDir, 'node_modules', 'tsx', 'dist', 'register.js')],
      };
    }

    if (fs.existsSync(tsNodeBin + '.cmd') || fs.existsSync(tsNodeBin)) {
      return {
        entryPath: srcEntry,
        execArgv: [
          '--require',
          'ts-node/register/transpile-only',
        ],
      };
    }

    // Last resort: try npx tsx via spawn (not fork)
    // This is less clean but works for development
    throw new Error(
      'TypeScript backend found but no tsx or ts-node available. ' +
        'Run "npm run build" in KACHERI BACKEND to compile, or install tsx/ts-node.'
    );
  }

  throw new Error(
    `Backend entry point not found. Expected:\n` +
      `  Compiled: ${distEntry}\n` +
      `  Source:   ${srcEntry}\n` +
      `Run "npm run build" in KACHERI BACKEND first.`
  );
}

/* ================================================================== */
/*  Directory Initialization                                           */
/* ================================================================== */

/**
 * Ensure userData subdirectories exist for database and storage.
 * @param {string} userDataPath — Electron app.getPath('userData')
 */
function ensureDataDirectories(userDataPath) {
  const dirs = [
    path.join(userDataPath, 'data'),
    path.join(userDataPath, 'storage'),
    path.join(userDataPath, 'storage', 'proofs'),
    path.join(userDataPath, 'storage', 'exports'),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/* ================================================================== */
/*  Start Backend                                                      */
/* ================================================================== */

/**
 * Start the KACHERI Backend as a managed child process.
 *
 * @param {object} options
 * @param {string} options.userDataPath — Electron app.getPath('userData')
 * @param {string} options.backendDir  — Absolute path to KACHERI BACKEND/
 * @param {string} [options.authMode]  — AUTH_MODE env var (default: 'dev')
 * @param {string[]} [options.enabledProducts] — ENABLED_PRODUCTS env var
 * @returns {Promise<{ port: number, child: import('child_process').ChildProcess }>}
 */
function startEmbeddedBackend(options) {
  return new Promise((resolve, reject) => {
    const { userDataPath, backendDir, authMode, enabledProducts } = options;

    // Ensure data directories
    ensureDataDirectories(userDataPath);

    // Resolve entry point
    let entry;
    try {
      entry = resolveBackendEntry(backendDir);
    } catch (err) {
      return reject(err);
    }

    const dbPath = path.join(userDataPath, 'data', 'kacheri.db');
    const storagePath = path.join(userDataPath, 'storage');

    // Generate a per-session JWT secret for local mode.
    // Auth config requires JWT_SECRET in production NODE_ENV.
    const jwtSecret = crypto.randomBytes(32).toString('hex');

    // Build environment for the child process
    const childEnv = {
      ...process.env,
      PORT: '0', // auto-assign port
      KACHERI_DB_PATH: dbPath,
      STORAGE_ROOT: storagePath,
      NODE_ENV: 'production',
      AUTH_MODE: authMode || 'dev',
      JWT_SECRET: jwtSecret,
      // Note: BEYLE_EMBEDDED is NOT set. In subprocess mode, the server
      // should auto-start normally. startServer() sends the IPC port
      // signal via process.send() which is available through fork()'s
      // IPC channel. BEYLE_EMBEDDED is only needed for true in-process
      // import (not used in this architecture).
    };

    if (enabledProducts && enabledProducts.length > 0) {
      childEnv.ENABLED_PRODUCTS = enabledProducts.join(',');
    }

    // When running inside Electron, fork() uses Electron's bundled Node.js
    // by default. Native modules (e.g. better-sqlite3) compiled for the
    // system Node.js will fail with ABI mismatch. Use execPath: 'node' to
    // ensure the child uses the system Node.js from PATH.
    const isElectron = !!(process.versions && process.versions.electron);
    const forkOptions = {
      cwd: backendDir,
      env: childEnv,
      execArgv: entry.execArgv,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      silent: true,
    };
    if (isElectron) {
      forkOptions.execPath = 'node';
      // Remove ELECTRON_RUN_AS_NODE from child env — not needed and may
      // confuse the child if it tries to detect Electron.
      delete childEnv.ELECTRON_RUN_AS_NODE;
    }

    console.log('[EmbeddedBackend] Starting backend subprocess...');
    console.log('[EmbeddedBackend] Entry:', entry.entryPath);
    console.log('[EmbeddedBackend] CWD:', backendDir);
    console.log('[EmbeddedBackend] DB:', dbPath);
    console.log('[EmbeddedBackend] Storage:', storagePath);
    if (isElectron) {
      console.log('[EmbeddedBackend] Using system Node.js (execPath: node)');
    }

    const child = fork(entry.entryPath, [], forkOptions);

    let settled = false;

    // Timeout: if backend doesn't signal readiness in time
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGTERM');
        reject(
          new Error(
            `Backend did not start within ${STARTUP_TIMEOUT_MS / 1000}s. ` +
              'Check backend logs for errors.'
          )
        );
      }
    }, STARTUP_TIMEOUT_MS);

    // Listen for IPC message with the bound port
    child.on('message', (msg) => {
      if (
        msg &&
        typeof msg === 'object' &&
        msg.type === 'backend:ready' &&
        typeof msg.port === 'number'
      ) {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          console.log(
            `[EmbeddedBackend] Backend ready on port ${msg.port}`
          );
          resolve({ port: msg.port, child });
        }
      }
    });

    // Forward stdout/stderr to console for debugging
    if (child.stdout) {
      child.stdout.on('data', (data) => {
        const lines = data.toString().trim();
        if (lines) console.log('[Backend]', lines);
      });
    }
    if (child.stderr) {
      child.stderr.on('data', (data) => {
        const lines = data.toString().trim();
        if (lines) console.error('[Backend:err]', lines);
      });
    }

    // Handle early exit (crash before readiness)
    child.on('exit', (code, signal) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(
          new Error(
            `Backend exited before becoming ready. ` +
              `Code: ${code}, Signal: ${signal}`
          )
        );
      }
    });

    // Handle fork errors
    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`Failed to start backend: ${err.message}`));
      }
    });
  });
}

/* ================================================================== */
/*  Stop Backend                                                       */
/* ================================================================== */

/**
 * Gracefully stop the backend subprocess.
 * Sends SIGTERM, waits up to 5 seconds, then SIGKILL if still alive.
 *
 * @param {import('child_process').ChildProcess} child
 * @returns {Promise<void>}
 */
function stopEmbeddedBackend(child) {
  return new Promise((resolve) => {
    if (!child || child.killed || child.exitCode !== null) {
      resolve();
      return;
    }

    console.log('[EmbeddedBackend] Stopping backend...');

    let resolved = false;

    const forceKill = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn(
          '[EmbeddedBackend] Backend did not exit gracefully, sending SIGKILL'
        );
        try {
          child.kill('SIGKILL');
        } catch (_err) {
          // Already dead
        }
        resolve();
      }
    }, SHUTDOWN_GRACE_MS);

    child.on('exit', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(forceKill);
        console.log('[EmbeddedBackend] Backend stopped');
        resolve();
      }
    });

    try {
      child.kill('SIGTERM');
    } catch (_err) {
      // Process already gone
      if (!resolved) {
        resolved = true;
        clearTimeout(forceKill);
        resolve();
      }
    }
  });
}

/* ================================================================== */
/*  Health Monitoring                                                   */
/* ================================================================== */

/**
 * Start polling the backend's /health endpoint.
 *
 * @param {number} port — Backend port
 * @param {() => void} onUnhealthy — Called after UNHEALTHY_THRESHOLD consecutive failures
 * @param {() => void} onHealthy — Called when health recovers after being unhealthy
 * @returns {{ interval: NodeJS.Timeout, stop: () => void }}
 */
function monitorHealth(port, onUnhealthy, onHealthy) {
  let consecutiveFailures = 0;
  let wasUnhealthy = false;

  function checkHealth() {
    const req = http.get(
      `http://localhost:${port}/health`,
      { timeout: HEALTH_REQUEST_TIMEOUT_MS },
      (res) => {
        // Consume response body
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 400) {
          if (consecutiveFailures > 0 || wasUnhealthy) {
            console.log('[EmbeddedBackend] Health recovered');
          }
          consecutiveFailures = 0;
          if (wasUnhealthy) {
            wasUnhealthy = false;
            onHealthy();
          }
        } else {
          consecutiveFailures++;
          if (
            consecutiveFailures >= UNHEALTHY_THRESHOLD &&
            !wasUnhealthy
          ) {
            wasUnhealthy = true;
            console.warn(
              `[EmbeddedBackend] Backend unhealthy (${consecutiveFailures} consecutive failures)`
            );
            onUnhealthy();
          }
        }
      }
    );

    req.on('error', () => {
      consecutiveFailures++;
      if (
        consecutiveFailures >= UNHEALTHY_THRESHOLD &&
        !wasUnhealthy
      ) {
        wasUnhealthy = true;
        console.warn(
          `[EmbeddedBackend] Backend unreachable (${consecutiveFailures} consecutive failures)`
        );
        onUnhealthy();
      }
    });

    req.on('timeout', () => {
      req.destroy();
      consecutiveFailures++;
      if (
        consecutiveFailures >= UNHEALTHY_THRESHOLD &&
        !wasUnhealthy
      ) {
        wasUnhealthy = true;
        console.warn(
          `[EmbeddedBackend] Backend health timeout (${consecutiveFailures} consecutive failures)`
        );
        onUnhealthy();
      }
    });
  }

  const interval = setInterval(checkHealth, HEALTH_POLL_INTERVAL_MS);

  return {
    interval,
    stop: () => clearInterval(interval),
  };
}

/* ================================================================== */
/*  Auto-Restart Wrapper                                               */
/* ================================================================== */

/**
 * Start the backend with automatic restart on crash.
 * Retries up to MAX_RESTART_ATTEMPTS times with exponential backoff.
 *
 * @param {object} options — Same options as startEmbeddedBackend
 * @param {(port: number, child: import('child_process').ChildProcess) => void} onPortReady — Called each time backend starts with its port and child process
 * @param {(error: Error) => void} onFatalError — Called when max restarts exceeded
 * @param {(attempt: number, maxAttempts: number) => void} [onRestarting] — Called when a restart attempt begins (before backoff delay)
 * @returns {Promise<{ port: number, child: import('child_process').ChildProcess }>}
 */
async function startWithAutoRestart(options, onPortReady, onFatalError, onRestarting) {
  let restartCount = 0;

  async function attempt() {
    const result = await startEmbeddedBackend(options);

    if (onPortReady) onPortReady(result.port, result.child);

    // Watch for unexpected exits and auto-restart
    result.child.on('exit', (code, signal) => {
      // Only restart on non-zero exit (crash), not on intentional kill
      if (code !== 0 && code !== null && restartCount < MAX_RESTART_ATTEMPTS) {
        restartCount++;
        const delay = Math.pow(2, restartCount - 1) * 1000; // 1s, 2s, 4s
        console.warn(
          `[EmbeddedBackend] Backend crashed (code ${code}). ` +
            `Restarting in ${delay / 1000}s (attempt ${restartCount}/${MAX_RESTART_ATTEMPTS})...`
        );

        // Notify caller that a restart is beginning
        if (onRestarting) onRestarting(restartCount, MAX_RESTART_ATTEMPTS);

        setTimeout(async () => {
          try {
            await attempt();
          } catch (err) {
            console.error(
              '[EmbeddedBackend] Restart failed:',
              err.message
            );
            if (onFatalError) onFatalError(err);
          }
        }, delay);
      } else if (
        code !== 0 &&
        code !== null &&
        restartCount >= MAX_RESTART_ATTEMPTS
      ) {
        const err = new Error(
          `Backend crashed ${MAX_RESTART_ATTEMPTS} times. ` +
            `Last exit code: ${code}, signal: ${signal}. Giving up.`
        );
        console.error('[EmbeddedBackend]', err.message);
        if (onFatalError) onFatalError(err);
      }
    });

    return result;
  }

  return attempt();
}

/* ================================================================== */
/*  Module Exports                                                     */
/* ================================================================== */

module.exports = {
  startEmbeddedBackend,
  stopEmbeddedBackend,
  monitorHealth,
  startWithAutoRestart,
  STARTUP_TIMEOUT_MS,
  HEALTH_POLL_INTERVAL_MS,
  MAX_RESTART_ATTEMPTS,
};
