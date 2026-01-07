/**
 * Protected Route
 *
 * Wrapper component that redirects to login if user is not authenticated.
 * In dev mode with bypass enabled, allows access without auth.
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, authStatus } = useAuth();
  const location = useLocation();

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-spinner" />
      </div>
    );
  }

  // In dev mode with bypass enabled, allow access without auth
  if (authStatus?.devMode && authStatus?.devBypassEnabled) {
    return <>{children}</>;
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
