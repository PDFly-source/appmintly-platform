'use client';

/**
 * Phase 16.2 — Restrained viewport entrance animation.
 *
 * Premium, subtle: opacity + small translateY, plays ONCE when the
 * element enters the viewport. Honors prefers-reduced-motion by
 * rendering a plain wrapper with no animation. Uses the existing
 * `motion` dependency (no new packages).
 */

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface RevealProps {
  children: React.ReactNode;
  /** Per-item stagger delay in seconds (e.g. index * 0.06). */
  delay?: number;
  /** Vertical entrance distance in px (12–20 per design spec). */
  y?: number;
  /** Duration in ms (400–600 per design spec). */
  duration?: number;
  className?: string;
}

export function Reveal({
  children,
  delay = 0,
  y = 16,
  duration = 0.5,
  className,
}: RevealProps) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -48px 0px' }}
      transition={{ duration, delay, ease: [0.2, 0.7, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
