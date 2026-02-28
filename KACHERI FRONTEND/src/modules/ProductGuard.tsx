/**
 * Product Guard — Slice M2
 *
 * Route guard component that renders children only when
 * the specified product is enabled. Shows an informational
 * "not available" page when the product is disabled.
 *
 * Pattern follows: src/auth/ProtectedRoute.tsx
 */

import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { isProductEnabled, type ProductId } from './registry';

interface ProductGuardProps {
  product: ProductId;
  children: ReactNode;
}

const PRODUCT_LABELS: Record<ProductId, string> = {
  'docs': 'Kacheri Docs',
  'design-studio': 'Beyle Design Studio',
  'jaal': 'BEYLE JAAL',
};

export function ProductGuard({ product, children }: ProductGuardProps) {
  if (isProductEnabled(product)) {
    return <>{children}</>;
  }

  const label = PRODUCT_LABELS[product] ?? product;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: '2rem',
      textAlign: 'center',
      color: '#555',
      fontFamily: 'inherit',
    }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.75rem', color: '#333' }}>
        {label}
      </h2>
      <p style={{ fontSize: '1rem', marginBottom: '1.5rem', maxWidth: 420, lineHeight: 1.5 }}>
        This product is not enabled in this deployment.
      </p>
      <Link
        to="/"
        style={{
          padding: '0.5rem 1.25rem',
          borderRadius: 6,
          background: '#333',
          color: '#fff',
          textDecoration: 'none',
          fontSize: '0.875rem',
        }}
      >
        Back to Home
      </Link>
    </div>
  );
}
