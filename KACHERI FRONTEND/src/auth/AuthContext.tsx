/**
 * Auth Context
 *
 * Provides authentication state and methods to the entire app.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import {
  type AuthUser,
  type AuthStatus,
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  refreshTokens,
  getAuthStatus,
  getCurrentUser,
} from './api';

interface AuthContextValue {
  // State
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authStatus: AuthStatus | null;

  // Methods
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Token refresh interval (refresh 5 minutes before expiry)
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);

  // Save tokens to localStorage
  const saveTokens = useCallback(
    (accessToken: string, refreshToken: string, expiresAt: number) => {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('tokenExpiresAt', expiresAt.toString());
    },
    []
  );

  // Clear tokens from localStorage
  const clearTokens = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('tokenExpiresAt');
    localStorage.removeItem('user');
  }, []);

  // Save user to localStorage
  const saveUser = useCallback((user: AuthUser) => {
    localStorage.setItem('user', JSON.stringify(user));
  }, []);

  // Refresh authentication tokens
  const refreshAuth = useCallback(async (): Promise<boolean> => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      return false;
    }

    try {
      const tokens = await refreshTokens(refreshToken);
      saveTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresAt);
      return true;
    } catch {
      clearTokens();
      setUser(null);
      return false;
    }
  }, [saveTokens, clearTokens]);

  // Login
  const login = useCallback(
    async (email: string, password: string) => {
      const response = await apiLogin(email, password);
      saveTokens(response.accessToken, response.refreshToken, response.expiresAt);
      saveUser(response.user);
      setUser(response.user);
    },
    [saveTokens, saveUser]
  );

  // Register
  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const response = await apiRegister(email, password, displayName);
      saveTokens(response.accessToken, response.refreshToken, response.expiresAt);
      saveUser(response.user);
      setUser(response.user);
    },
    [saveTokens, saveUser]
  );

  // Logout
  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      await apiLogout(refreshToken || undefined);
    } finally {
      clearTokens();
      setUser(null);
    }
  }, [clearTokens]);

  // Initialize auth state on mount
  useEffect(() => {
    async function initAuth() {
      setIsLoading(true);

      try {
        // Get system status first
        const status = await getAuthStatus();
        setAuthStatus(status);

        // In dev mode with bypass, we may not need real auth
        if (status.devMode && status.devBypassEnabled) {
          // Check if we have a stored user anyway
          const storedUser = localStorage.getItem('user');
          if (storedUser) {
            try {
              setUser(JSON.parse(storedUser));
            } catch {
              // Invalid stored user, continue without
            }
          }
          setIsLoading(false);
          return;
        }

        // Check for existing tokens
        const accessToken = localStorage.getItem('accessToken');
        const storedUser = localStorage.getItem('user');
        const expiresAt = parseInt(localStorage.getItem('tokenExpiresAt') || '0', 10);

        if (!accessToken) {
          setIsLoading(false);
          return;
        }

        // Check if token is expired
        const now = Math.floor(Date.now() / 1000);
        if (expiresAt && expiresAt < now) {
          // Token expired, try to refresh
          const refreshed = await refreshAuth();
          if (!refreshed) {
            setIsLoading(false);
            return;
          }
        }

        // Try to get current user
        try {
          const { user: currentUser } = await getCurrentUser();
          setUser(currentUser);
          saveUser(currentUser);
        } catch {
          // If getting user fails, try stored user
          if (storedUser) {
            try {
              setUser(JSON.parse(storedUser));
            } catch {
              clearTokens();
            }
          } else {
            clearTokens();
          }
        }
      } catch (err) {
        console.error('[auth] Init failed:', err);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
  }, [refreshAuth, saveUser, clearTokens]);

  // Set up token refresh timer
  useEffect(() => {
    const expiresAt = parseInt(localStorage.getItem('tokenExpiresAt') || '0', 10);
    if (!expiresAt || !user) return;

    const now = Math.floor(Date.now() / 1000);
    const msUntilRefresh = (expiresAt - now) * 1000 - REFRESH_BUFFER_MS;

    if (msUntilRefresh <= 0) {
      // Already time to refresh
      refreshAuth();
      return;
    }

    const timer = setTimeout(() => {
      refreshAuth();
    }, msUntilRefresh);

    return () => clearTimeout(timer);
  }, [user, refreshAuth]);

  const value: AuthContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading,
    authStatus,
    login,
    register,
    logout,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
