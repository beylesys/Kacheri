#!/usr/bin/env node
'use strict';

/**
 * Post-build config injector for BEYLE Mobile — Slice S18
 *
 * Injects window.__BEYLE_CONFIG__ into the KACHERI Frontend dist/index.html
 * so the Capacitor deployment context can resolve the cloud backend URL.
 *
 * The KACHERI Frontend's getBackendUrl() (platform/context.ts lines 96-100)
 * checks window.__BEYLE_CONFIG__.backendUrl when running inside Capacitor.
 * This script injects that value into the built HTML before cap sync copies
 * the web assets into the native projects.
 *
 * Usage:
 *   node scripts/inject-config.js [backendUrl]
 *
 * Examples:
 *   node scripts/inject-config.js                          # defaults to http://localhost:4000
 *   node scripts/inject-config.js http://192.168.1.5:4000  # dev (LAN backend)
 *   node scripts/inject-config.js https://api.beyle.app    # production
 */

const fs = require('fs');
const path = require('path');

const DIST_INDEX = path.resolve(__dirname, '..', '..', 'KACHERI FRONTEND', 'dist', 'index.html');
const backendUrl = process.argv[2] || 'http://localhost:4000';

// Validate the backendUrl is a well-formed URL
try {
  new URL(backendUrl);
} catch (_) {
  console.error('ERROR: Invalid backendUrl: ' + backendUrl);
  console.error('Provide a valid URL (e.g., http://localhost:4000 or https://api.beyle.app).');
  process.exit(1);
}

// Validate the dist/index.html exists
if (!fs.existsSync(DIST_INDEX)) {
  console.error('ERROR: KACHERI FRONTEND/dist/index.html not found.');
  console.error('Run "npm run build" in KACHERI FRONTEND first.');
  process.exit(1);
}

let html = fs.readFileSync(DIST_INDEX, 'utf-8');

// Validate the HTML contains a </head> tag for injection
if (!html.includes('</head>')) {
  console.error('ERROR: </head> tag not found in ' + DIST_INDEX);
  console.error('Ensure the HTML file is well-formed.');
  process.exit(1);
}

// Build the config injection script tag using JSON.stringify to safely
// escape the backendUrl value, preventing injection via malicious input.
const configObj = JSON.stringify({ backendUrl: backendUrl });
const configScript = '<script>window.__BEYLE_CONFIG__=' + configObj + ';</script>';

if (html.includes('__BEYLE_CONFIG__')) {
  // Replace an existing injection (idempotent re-runs)
  html = html.replace(/<script>window\.__BEYLE_CONFIG__=\{[^}]*\};<\/script>/, configScript);
  console.log('Updated existing __BEYLE_CONFIG__ injection.');
} else {
  // Inject before the closing </head> tag
  html = html.replace('</head>', configScript + '\n  </head>');
  console.log('Injected __BEYLE_CONFIG__ into dist/index.html.');
}

fs.writeFileSync(DIST_INDEX, html, 'utf-8');
console.log('  backendUrl = ' + JSON.stringify(backendUrl));
console.log('  File: ' + DIST_INDEX);
