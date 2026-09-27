'use client';

/**
 * Phase 19 — Premium hero visual.
 *
 * Replaces the Phase 18 HeroEcosystemVisual. Same governing rule: a
 * code-built composition (no stock/AI raster imagery), using the real
 * AppMintly mark inside a device frame, with the app's actual
 * platform/format categories (Android, Web, Games, Tools — the same
 * taxonomy used across the catalog) as floating icon badges. Purely
 * decorative — aria-hidden — real content lives in the surrounding hero
 * copy and feature indicators. Restyled for the Phase 19 dark hero card:
 * restrained emerald/blue/gold atmospheric glow instead of a themed pill
 * ring, filled icon badges instead of labeled chips. No fabricated
 * stats/counters are rendered anywhere in this visual.
 */

import React from 'react';
import { Smartphone, Globe, Gamepad2, Wrench } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { AppMintlyLogo } from './AppMintlyLogo';

const FLOATERS = [
  { Icon: Smartphone, color: '#16A765', pos: 'top-1 left-0 sm:-left-2' },
  { Icon: Globe, color: '#1565E8', pos: 'top-4 right-0 sm:-right-3' },
  { Icon: Gamepad2, color: '#E31E24', pos: 'bottom-11 left-0 sm:-left-4' },
  { Icon: Wrench, color: '#F4B400', pos: 'bottom-6 right-0 sm:-right-2' },
];

export const PremiumHeroVisual: React.FC = () => {
  const reduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className="relative w-full max-w-[150px] sm:max-w-[300px] lg:max-w-[340px] mx-auto aspect-[4/5] select-none"
    >
      {/* Atmospheric glow — restrained emerald / blue / gold, per brand accents */}
      <div
        className="absolute -top-4 -left-4 w-24 h-24 sm:w-32 sm:h-32 rounded-full opacity-40"
        style={{ background: 'radial-gradient(circle, rgba(22,167,101,0.55), transparent 70%)', filter: 'blur(24px)' }}
      />
      <div
        className="absolute top-1/3 -right-5 w-28 h-28 sm:-right-6 sm:w-36 sm:h-36 rounded-full opacity-35"
        style={{ background: 'radial-gradient(circle, rgba(21,101,232,0.5), transparent 70%)', filter: 'blur(26px)' }}
      />
      <div
        className="absolute bottom-0 left-1/4 w-28 h-16 sm:w-40 sm:h-24 rounded-full opacity-30"
        style={{ background: 'radial-gradient(circle, rgba(244,180,0,0.45), transparent 70%)', filter: 'blur(24px)' }}
      />

      {/* Restrained rotating glow ring behind the device */}
      <div
        className={`absolute inset-4 sm:inset-6 rounded-full opacity-50 ${
          reduceMotion ? '' : 'motion-safe:animate-[spin_26s_linear_infinite]'
        }`}
        style={{
          background:
            'conic-gradient(from 0deg, rgba(22,167,101,0.3), rgba(21,101,232,0.28), transparent, rgba(244,180,0,0.28), rgba(22,167,101,0.3))',
          filter: 'blur(18px)',
        }}
      />

      {/* Grounding platform shadow */}
      <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-20 sm:w-28 sm:bottom-2 h-4 rounded-full bg-black/40" style={{ filter: 'blur(6px)' }} />

      {/* Device frame with the real AppMintly mark */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-[92px] sm:w-[160px] lg:w-[176px] aspect-[9/18] rounded-[22px] sm:rounded-[28px] bg-[#0B0D10] border-[3px] border-white/15 shadow-[0_25px_70px_-12px_rgba(0,0,0,0.65)] flex items-center justify-center overflow-hidden">
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-10 h-1.5 rounded-full bg-white/15" />
          <div className="rounded-xl sm:rounded-2xl bg-white/95 p-2 sm:p-3 shadow-lg">
            <AppMintlyLogo size="lg" variant="mark" />
          </div>
        </div>
      </div>

      {/* Floating category badges — real catalog taxonomy, icon-only (no fabricated labels/counts) */}
      {FLOATERS.map(({ Icon, color, pos }, i) => (
        <div
          key={color}
          className={`absolute ${pos} flex items-center justify-center w-8 h-8 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl shadow-lg ${
            reduceMotion ? '' : 'motion-safe:animate-[float_5s_ease-in-out_infinite]'
          }`}
          style={{ backgroundColor: color, animationDelay: `${i * 0.4}s` }}
        >
          <Icon className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white" />
        </div>
      ))}

      <style jsx>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-6px);
          }
        }
      `}</style>
    </div>
  );
};
