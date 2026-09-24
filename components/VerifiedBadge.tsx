import React from 'react';
import { BadgeCheck } from 'lucide-react';

/**
 * "Verified Publisher" badge.
 *
 * Shown ONLY when the app resolves to a publisher identity whose
 * repository-controlled `verified` flag is explicitly true
 * (data/publishers.json). This is an AppMintly marketplace
 * verification, not a government identity or external certification.
 */
interface VerifiedBadgeProps {
  size?: 'xs' | 'sm' | 'md';
  withLabel?: boolean;
  className?: string;
}

const iconSizes = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
};

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  size = 'sm',
  withLabel = false,
  className = '',
}) => (
  <span
    className={`inline-flex items-center gap-1 align-middle ${className}`}
    title="Verified Publisher — confirmed by the AppMintly marketplace catalog"
  >
    <BadgeCheck
      className={`${iconSizes[size]} text-[#1976F3]`}
      aria-hidden="true"
    />
    {withLabel && (
      <span className="text-xs font-semibold text-[#1976F3]">Verified Publisher</span>
    )}
    <span className="sr-only">Verified Publisher</span>
  </span>
);
