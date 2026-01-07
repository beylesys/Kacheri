/**
 * Auth API Client
 *
 * Handles all auth-related API calls.
 */

const API_BASE = '/api';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: number;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: number;
}

export interface AuthStatus {
  mode: 'production' | 'development' | 'maintenance';
  maintenance: boolean;
  timestamp: number;
  authenticated: boolean;
  user: AuthUser | null;
  devMode: boolean;
  devBypassEnabled: boolean;
}

export interface AuthError {
  error: string;
  message: string;
}

/**
 * Check system and auth status
 */
export async function getAuthStatus(): Promise<AuthStatus> {
  const res = await fetch(`${API_BASE}/auth/status`);
  if (!res.ok) {
    throw new Error('Failed to get auth status');
  }
  return res.json();
}

/**
 * Register a new user
 */
export async function register(
  email: string,
  password: string,
  displayName: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error((data as AuthError).message || 'Registration failed');
  }

  return data as AuthResponse;
}

/**
 * Login with email and password
 */
export async function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error((data as AuthError).message || 'Login failed');
  }

  return data as AuthResponse;
}

/**
 * Logout (revoke session)
 */
export async function logout(refreshToken?: string): Promise<void> {
  const accessToken = localStorage.getItem('accessToken');

  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ refreshToken }),
  });

  // Always clear local storage, even if request fails
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

/**
 * Refresh access token
 */
export async function refreshTokens(
  refreshToken: string
): Promise<AuthTokens> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error((data as AuthError).message || 'Token refresh failed');
  }

  return data as AuthTokens;
}

/**
 * Get current user profile
 */
export async function getCurrentUser(): Promise<{ user: AuthUser }> {
  const accessToken = localStorage.getItem('accessToken');

  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error((data as AuthError).message || 'Failed to get user');
  }

  return data as { user: AuthUser };
}
