'use client';

/**
 * Phase 18 — Hero ecosystem visual.
 *
 * A code-built composition (no stock/AI imagery): the real AppMintly mark
 * inside a device frame, with the app's actual platform/format categories
 * (Android, Web, Games, Tools — the same taxonomy used across the catalog)
 * floating around it as small labeled chips, on a soft orbital glow ring.
 * Purely decorative — aria-hidden — real content lives in the surrounding
 * hero text and feature indicators.
 */

import React from 'react';
import { Smartphone, Globe, Gamepad2, Wrench } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { AppMintlyLogo } from './AppMintlyLogo';

const FLOATERS = [
  { Icon: Smartphone, color: '#16A765', label: 'Android', pos: 'top-2 left-0 sm:-left-3' },
  { Icon: Globe, color: '#1565E8', label: 'Web Apps', pos: 'top-6 right-0 sm:-right-4' },
  { Icon: Gamepad2, color: '#E31E24', label: 'Games', pos: 'bottom-16 left-0 sm:-left-6' },
  { Icon: Wrench, color: '#F4B400', label: 'Tools', pos: 'bottom-10 right-0 sm:-right-3' },
];

export const HeroEcosystemVisual: React.FC = () => {
  const reduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className="relative w-full max-w-[320px] sm:max-w-[360px] mx-auto aspect-square select-none"
    >
      {/* Orbital glow ring */}
      <div
        className={`absolute inset-0 rounded-full opacity-70 ${
          reduceMotion ? '' : 'motion-safe:animate-[spin_22s_linear_infinite]'
        }`}
        style={{
          background:
            'conic-gradient(from 0deg, rgba(8,122,91,0.35), rgba(21,101,232,0.3), rgba(227,30,36,0.25), rgba(244,180,0,0.3), rgba(8,122,91,0.35))',
          filter: 'blur(28px)',
        }}
      />
      <div className="absolute inset-6 rounded-full bg-inkbg/95 border border-white/10 shadow-2xl" />

      {/* Device frame with the real AppMintly mark */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-[136px] sm:w-[156px] aspect-[9/18] rounded-[26px] bg-[#0B0D10] border-[3px] border-white/15 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.55)] flex items-center justify-center overflow-hidden">
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-10 h-1.5 rounded-full bg-white/15" />
          <div className="rounded-2xl bg-white/95 p-3 shadow-lg">
            <AppMintlyLogo size="lg" variant="mark" />
          </div>
        </div>
      </div>

      {/* Floating category chips — real catalog taxonomy, not decoration-only */}
      {FLOATERS.map(({ Icon, color, label, pos }, i) => (
        <div
          key={label}
          className={`hidden sm:flex absolute ${pos} items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-card border border-line shadow-lg ${
            reduceMotion ? '' : 'motion-safe:animate-[float_5s_ease-in-out_infinite]'
          }`}
          style={{ animationDelay: `${i * 0.4}s` }}
        >
          <span
            className="inline-flex items-center justify-center w-6 h-6 rounded-lg shrink-0"
            style={{ backgroundColor: `${color}1F` }}
          >
            <Icon className="w-3.5 h-3.5" style={{ color }} />
          </span>
          <span className="text-[11px] font-bold text-ink whitespace-nowrap">{label}</span>
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
