/**
 * Auth Module - Barrel Export
 */

// Context and hooks
export { AuthProvider, useAuthContext } from './AuthContext';
export { useAuth } from './useAuth';

// Components
export { LoginPage } from './LoginPage';
export { RegisterPage } from './RegisterPage';
export { ProtectedRoute } from './ProtectedRoute';

// API
export {
  login,
  register,
  logout,
  refreshTokens,
  getAuthStatus,
  getCurrentUser,
} from './api';

// Types
export type {
  AuthUser,
  AuthTokens,
  AuthResponse,
  AuthStatus,
  AuthError,
} from './api';
