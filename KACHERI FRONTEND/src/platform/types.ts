/**
 * Platform deployment types — Slice S1
 *
 * Type definitions for the deployment context detection module.
 * Used across all topology-aware components.
 */

/** Runtime platform the app is executing in */
export type DeploymentPlatform = 'web' | 'electron' | 'capacitor';

/** Value provided by the DeploymentContext */
export interface DeploymentContextValue {
  /** Current runtime platform */
  platform: DeploymentPlatform;
  /** True when running inside Electron desktop shell */
  isDesktop: boolean;
  /** True when running inside Capacitor mobile shell */
  isMobile: boolean;
  /** True when running in standard browser (SaaS) */
  isWeb: boolean;
}
