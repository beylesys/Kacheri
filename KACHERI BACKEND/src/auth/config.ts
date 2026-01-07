/**
 * Auth Configuration
 *
 * Centralizes all auth-related configuration with sensible defaults.
 * Supports three modes: production, development, maintenance.
 */

export type AuthMode = 'production' | 'development' | 'maintenance';

export interface AuthConfig {
  mode: AuthMode;

  // JWT settings
  jwtSecret: string;
  accessTokenExpiry: number;  // seconds
  refreshTokenExpiry: number; // seconds

  // Mode flags
  maintenanceMode: boolean;
  devBypassAuth: boolean;
  devAutoSeed: boolean;

  // Password settings
  bcryptRounds: number;

  // Session settings
  maxSessionsPerUser: number;
}

function env(name: string, fallback?: string): string {
  return (process.env[name] ?? fallback ?? '').toString();
}

function envBool(name: string, fallback: boolean): boolean {
  const val = env(name, '').toLowerCase();
  if (val === 'true' || val === '1') return true;
  if (val === 'false' || val === '0') return false;
  return fallback;
}

function envInt(name: string, fallback: number): number {
  const val = parseInt(env(name, ''), 10);
  return Number.isNaN(val) ? fallback : val;
}

function resolveMode(): AuthMode {
  if (envBool('MAINTENANCE_MODE', false)) {
    return 'maintenance';
  }
  const nodeEnv = env('NODE_ENV', 'development');
  return nodeEnv === 'production' ? 'production' : 'development';
}

function resolveJwtSecret(mode: AuthMode): string {
  const secret = env('JWT_SECRET', '');

  if (mode === 'production' && !secret) {
    throw new Error('JWT_SECRET is required in production mode');
  }

  // In development, use a default secret (insecure but convenient)
  return secret || 'dev-jwt-secret-do-not-use-in-production';
}

export function loadAuthConfig(): AuthConfig {
  const mode = resolveMode();

  return {
    mode,

    // JWT
    jwtSecret: resolveJwtSecret(mode),
    accessTokenExpiry: envInt('JWT_ACCESS_EXPIRY', 3600),        // 1 hour
    refreshTokenExpiry: envInt('JWT_REFRESH_EXPIRY', 604800),    // 7 days

    // Mode flags
    maintenanceMode: mode === 'maintenance',
    devBypassAuth: mode === 'development' && envBool('DEV_BYPASS_AUTH', true),
    devAutoSeed: mode === 'development' && envBool('DEV_AUTO_SEED', true),

    // Password
    bcryptRounds: envInt('BCRYPT_ROUNDS', 12),

    // Sessions
    maxSessionsPerUser: envInt('MAX_SESSIONS_PER_USER', 10),
  };
}

// Singleton instance
let _config: AuthConfig | null = null;

export function getAuthConfig(): AuthConfig {
  if (!_config) {
    _config = loadAuthConfig();
  }
  return _config;
}

// For testing: reset config
export function resetAuthConfig(): void {
  _config = null;
}
