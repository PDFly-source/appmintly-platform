'use client';

/**
 * Premium 3D publisher identity card (design reference: the supplied PKD
 * "Verified Developer & Publisher" page).
 *
 * - Tilt follows the pointer ONLY for fine pointers (mouse/pen) and only
 *   when the user has not requested reduced motion. Touch devices and
 *   reduced-motion users get the same card, static (CSS also forces this).
 * - Updates CSS variables on the element directly via requestAnimationFrame:
 *   no React state, so pointer movement never re-renders.
 * - All content is passed in; nothing is hardcoded here.
 */

import React from 'react';
import { VerifiedBadge } from '@/components/VerifiedBadge';

interface PublisherIdentityCardProps {
  name: string;
  verified: boolean;
  /** Muted line under the name (e.g. "5 published applications"). */
  subtitle?: string;
  /** Small gold label at the top of the card. */
  eyebrow?: string;
  /** Optional right-aligned footer facts, e.g. [{label:'Apps', value:'5'}]. */
  footer?: Array<{ label: string; value: string }>;
  /** Avatar edge in px. */
  avatarSize?: number;
  className?: string;
}

export function PublisherIdentityCard({
  name,
  verified,
  subtitle,
  eyebrow,
  footer,
  avatarSize = 72,
  className = '',
}: PublisherIdentityCardProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const raf = React.useRef<number | null>(null);

  const canTilt = React.useCallback(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }, []);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== 'mouse' || !canTilt()) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      // Max 6deg: premium, not gimmicky.
      el.style.setProperty('--p3d-ry', `${((px - 0.5) * 12).toFixed(2)}deg`);
      el.style.setProperty('--p3d-rx', `${((0.5 - py) * 12).toFixed(2)}deg`);
      el.style.setProperty('--p3d-sx', `${(px * 100).toFixed(1)}%`);
      el.style.setProperty('--p3d-sy', `${(py * 100).toFixed(1)}%`);
    });
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    el.style.setProperty('--p3d-rx', '0deg');
    el.style.setProperty('--p3d-ry', '0deg');
    el.style.setProperty('--p3d-sx', '30%');
    el.style.setProperty('--p3d-sy', '0%');
  };

  React.useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    },
    []
  );

  return (
    <div className={`p3d-persp ${className}`}>
      <div ref={ref} className="p3d-card p-5 sm:p-7" onPointerMove={onMove} onPointerLeave={onLeave}>
        {eyebrow && (
          <p className="text-[0.66rem] font-bold uppercase tracking-[0.25em] text-[#f5b50a] mb-4 relative">
            {eyebrow}
          </p>
        )}
        <div className="flex items-center gap-4 sm:gap-5 relative">
          <div
            className="p3d-avatar shrink-0"
            style={{ width: avatarSize, height: avatarSize, fontSize: avatarSize * 0.36 }}
            aria-hidden="true"
          >
            {name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#eef2fa] leading-none">
                {name}
              </h2>
              {verified && (
                <span className="p3d-badge-glow">
                  <VerifiedBadge size="md" withLabel />
                </span>
              )}
            </div>
            {subtitle && <p className="text-sm mt-2 text-[#b6c0d4]">{subtitle}</p>}
          </div>
        </div>
        {footer && footer.length > 0 && (
          <dl className="flex justify-between gap-4 mt-6 pt-4 border-t border-white/10 text-[0.72rem] tracking-wide text-[#b6c0d4] relative">
            {footer.map((f) => (
              <div key={f.label}>
                <dt className="uppercase opacity-80">{f.label}</dt>
                <dd className="font-bold text-[#eef2fa] text-sm mt-0.5">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
