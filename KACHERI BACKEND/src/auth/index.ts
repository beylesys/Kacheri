/**
 * Auth Module - Barrel Export
 *
 * Single entry point for all auth functionality.
 */

// Config
export { getAuthConfig, loadAuthConfig, resetAuthConfig } from './config';
export type { AuthConfig, AuthMode } from './config';

// JWT
export {
  signAccessToken,
  signRefreshToken,
  createTokenPair,
  verifyToken,
  decodeToken,
  extractBearerToken,
  isAccessToken,
  isRefreshToken,
} from './jwt';
export type {
  AccessTokenPayload,
  RefreshTokenPayload,
  TokenPayload,
  TokenUser,
  TokenPair,
} from './jwt';

// Passwords
export {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
} from './passwords';

// Sessions
export {
  createSessionStore,
  hashToken,
  generateSessionId,
} from './sessions';
export type { Session, SessionStore } from './sessions';

// Users
export { createUserStore, generateUserId } from './users';
export type {
  User,
  PublicUser,
  CreateUserInput,
  UserStore,
} from './users';

// Dev Mode
export {
  extractDevUser,
  hasDevUserHeader,
  seedDevUser,
  logAuthDecision,
  DEV_USER,
} from './devMode';
export type { AuthUser } from './devMode';

// Maintenance
export {
  isMaintenanceMode,
  isMaintenanceExempt,
  checkMaintenanceMode,
  getSystemStatus,
  maintenanceResponse,
} from './maintenance';

// Middleware
export {
  createAuthMiddleware,
  registerAuthMiddleware,
  requireAuth,
  getCurrentUserId,
  getCurrentUser,
} from './middleware';

// Routes
export { createAuthRoutes } from './routes';

// Personal Access Tokens
export {
  createPatStore,
  isPATToken,
  generatePATToken,
  isValidScope,
  validateScopes,
  PAT_PREFIX,
  MAX_PATS_PER_USER,
  VALID_SCOPES,
} from './pat';
export type {
  PersonalAccessToken,
  PatScope,
  CreatePatInput,
  CreatePatResult,
  PatStore,
} from './pat';
