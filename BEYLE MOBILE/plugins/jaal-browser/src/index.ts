// BEYLE MOBILE/plugins/jaal-browser/src/index.ts
// Slice S19: JS bridge registration for the JAAL Browser Capacitor plugin.
//
// The 'JaalBrowser' name must match the @CapacitorPlugin(name = "JaalBrowser")
// annotation on the Android (JaalBrowserPlugin.java) and iOS (future S20) sides.

import { registerPlugin } from '@capacitor/core';

import type { JaalBrowserPlugin } from './definitions';

const JaalBrowser = registerPlugin<JaalBrowserPlugin>('JaalBrowser');

export * from './definitions';
export { JaalBrowser };
