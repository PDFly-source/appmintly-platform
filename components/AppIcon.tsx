'use client';

import React, { useState, useEffect } from 'react';

interface AppIconProps {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  category?: string;
  themeColor?: string;
  isMaskable?: boolean;
  maskShape?: 'rounded' | 'squircle' | 'circle';
  className?: string;
  priority?: boolean;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-9 h-9 text-xs',
  md: 'w-12 h-12 text-sm',
  lg: 'w-14 h-14 sm:w-16 sm:h-16 text-base',
  xl: 'w-20 h-20 sm:w-24 sm:h-24 text-xl',
  '2xl': 'w-28 h-28 sm:w-32 sm:h-32 text-2xl',
};

const maskClasses = {
  rounded: 'rounded-2xl',
  squircle: 'rounded-[28%]',
  circle: 'rounded-full',
};

// Generates consistent elegant palette based on name if no theme color
function getLettermarkColors(name: string, themeColor?: string) {
  if (themeColor && themeColor.startsWith('#') && themeColor.length >= 4) {
    return {
      bg: themeColor,
      text: '#FFFDF8',
      border: 'rgba(0,0,0,0.15)',
    };
  }

  const palettes = [
    { bg: '#17191C', text: '#FFFDF8', border: '#2A2E33' }, // Dark Slate
    { bg: '#E52B32', text: '#FFFDF8', border: '#B31B21' }, // Red
    { bg: '#1976F3', text: '#FFFDF8', border: '#0D5BBF' }, // Blue
    { bg: '#16A765', text: '#FFFDF8', border: '#0F7A4A' }, // Green
    { bg: '#F7B928', text: '#17191C', border: '#C99318' }, // Gold
    { bg: '#7A1635', text: '#FFFDF8', border: '#5A0F26' }, // Burgundy (PDFMiniFly)
    { bg: '#3D315B', text: '#FFFDF8', border: '#2B2340' }, // Deep Violet
  ];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % palettes.length;
  return palettes[index];
}

export const AppIcon: React.FC<AppIconProps> = ({
  src,
  name,
  size = 'md',
  category,
  themeColor,
  isMaskable = false,
  maskShape = 'rounded',
  className = '',
}) => {
  const [hasError, setHasError] = useState(false);
  const [prevSrc, setPrevSrc] = useState(src);

  // Clean state adjustment when src prop changes
  if (src !== prevSrc) {
    setPrevSrc(src);
    setHasError(false);
  }

  const initials = name
    ? name
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'AP';

  const shapeClass = isMaskable
    ? maskShape === 'circle'
      ? 'rounded-full'
      : 'rounded-[26%]'
    : maskClasses[maskShape] || 'rounded-2xl';

  const sizeClass = sizeClasses[size] || sizeClasses.md;
  const colors = getLettermarkColors(name || 'App', themeColor);

  if (!src || hasError) {
    return (
      <div
        className={`relative shrink-0 flex items-center justify-center font-black select-none shadow-2xs overflow-hidden transition-all duration-200 border ${sizeClass} ${shapeClass} ${className}`}
        style={{
          backgroundColor: colors.bg,
          color: colors.text,
          borderColor: colors.border,
        }}
        title={name}
        aria-label={`${name} icon`}
      >
        {/* Subtle glossy gradient highlight */}
        <div className="absolute inset-0 bg-gradient-to-tr from-black/20 via-transparent to-white/25 pointer-events-none" />
        <span className="relative z-10 tracking-wider font-mono">{initials}</span>
      </div>
    );
  }

  return (
    <div
      className={`relative shrink-0 overflow-hidden shadow-2xs border border-[#17191C]/10 bg-white ${sizeClass} ${shapeClass} ${className}`}
    >
      <img
        src={src}
        alt={`${name} icon`}
        className="w-full h-full object-cover select-none"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
      />
    </div>
  );
};
