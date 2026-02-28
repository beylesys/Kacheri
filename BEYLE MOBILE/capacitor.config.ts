/**
 * Capacitor Configuration — Slice S18
 *
 * Configures the BEYLE Mobile shell that wraps the KACHERI Frontend
 * React app for iOS and Android devices.
 *
 * Build workflow:
 *   1. cd "KACHERI FRONTEND" && npm run build   (produces dist/)
 *   2. cd "BEYLE MOBILE" && node scripts/inject-config.js <backendUrl>
 *   3. npx cap sync                              (copies web assets)
 *   4. npx cap run android / npx cap run ios
 */

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.beyle.app',
  appName: 'BEYLE',

  // Points to the KACHERI Frontend Vite build output.
  // The space in the directory name is safe — Capacitor resolves
  // this via Node's path module internally.
  webDir: '../KACHERI FRONTEND/dist',

  server: {
    // Use https scheme for the local web server so cookies and
    // secure-context APIs work correctly on both platforms.
    androidScheme: 'https',
    iosScheme: 'https',

    // For live-reload development, uncomment and set to your dev machine IP:
    // url: 'http://192.168.x.x:5173',
    // cleartext: true,
  },

  plugins: {
    StatusBar: {
      // Light text on dark background — matches BEYLE dark theme
      style: 'DARK',
      // Android-only: status bar background color
      backgroundColor: '#0f0f14',
    },
    SplashScreen: {
      // Auto-hide after 2 seconds
      launchShowDuration: 2000,
      launchAutoHide: true,
      // Dark background matching BEYLE theme
      backgroundColor: '#0f0f14',
      showSpinner: false,
    },
  },

  android: {
    // Allow HTTP for local dev backend; production uses HTTPS exclusively
    allowMixedContent: true,
  },

  ios: {
    // Content inset adapts to safe areas automatically
    contentInset: 'automatic',
    // Custom scheme for local file serving
    scheme: 'BEYLE',
  },
};

export default config;
