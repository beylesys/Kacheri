/**
 * Product Card — Slice S2
 *
 * Reusable product tile for the universal homepage grid.
 * Displays icon, name, description, availability state, and optional
 * platform-specific capability badge.
 */

import type { ReactNode, KeyboardEvent } from 'react';
import type { ProductId } from '../modules/registry';

export interface ProductCardProps {
  /** Product identifier — 'file-manager' is always-on (not in product registry) */
  productId: ProductId | 'file-manager';
  /** Display name */
  name: string;
  /** Short description (1-2 lines) */
  description: string;
  /** SVG icon element */
  icon: ReactNode;
  /** Whether this product is enabled in the current deployment */
  enabled: boolean;
  /** Whether routes exist for this product (false = "Coming Soon") */
  available: boolean;
  /** Click handler — called only when the card is actionable */
  onClick: () => void;
  /** Optional platform-specific capability badge text */
  capabilityBadge?: string;
  /** Optional accent color for the card icon area gradient */
  accentColor?: string;
}

export function ProductCard({
  name,
  description,
  icon,
  enabled,
  available,
  onClick,
  capabilityBadge,
  accentColor = 'rgba(124, 92, 255, 0.3)',
}: ProductCardProps) {
  const isClickable = enabled && available;

  const handleClick = () => {
    if (isClickable) onClick();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  const label = `${name}${!enabled ? ' (not enabled)' : !available ? ' (coming soon)' : ''}`;

  return (
    <div
      className={`product-card${!isClickable ? ' product-card--disabled' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={isClickable ? 0 : -1}
      aria-disabled={!isClickable}
      aria-label={label}
    >
      <div
        className="product-card-icon"
        style={{
          background: `linear-gradient(135deg, ${accentColor}, rgba(15, 23, 42, 0.6))`,
        }}
      >
        {icon}
      </div>

      <div className="product-card-content">
        <div className="product-card-name">{name}</div>
        <div className="product-card-description">{description}</div>
      </div>

      <div className="product-card-footer">
        {!enabled && (
          <span className="product-card-badge product-card-badge--disabled">
            Not Enabled
          </span>
        )}
        {enabled && !available && (
          <span className="product-card-badge product-card-badge--coming-soon">
            Coming Soon
          </span>
        )}
        {capabilityBadge && enabled && (
          <span className="product-card-badge product-card-badge--capability">
            {capabilityBadge}
          </span>
        )}
      </div>
    </div>
  );
}
