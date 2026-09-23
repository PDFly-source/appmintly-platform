import React from 'react';

interface AppForgeLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'horizontal' | 'mark' | 'dark';
  showTagline?: boolean;
  className?: string;
}

export const AppForgeLogo: React.FC<AppForgeLogoProps> = ({
  size = 'md',
  variant = 'horizontal',
  showTagline = false,
  className = ''
}) => {
  // Height and scale mappings
  const scaleMap = {
    xs: { mark: 26, textH: 14, textW: 96, gap: 'gap-1.5' },
    sm: { mark: 34, textH: 18, textW: 120, gap: 'gap-2' },
    md: { mark: 42, textH: 22, textW: 144, gap: 'gap-2.5' },
    lg: { mark: 58, textH: 28, textW: 180, gap: 'gap-3' },
    xl: { mark: 84, textH: 38, textW: 240, gap: 'gap-4' }
  };

  const current = scaleMap[size];

  // The 3D Emblem Mark (Ribbon 'A' + 3 Shopping Bags + Golden Orbit & Star)
  const EmblemMark = (
    <svg
      viewBox="0 0 200 200"
      width={current.mark}
      height={current.mark}
      className="shrink-0 drop-shadow-sm transition-transform hover:scale-105 duration-300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="APPFORGE Emblem"
    >
      <defs>
        {/* Emerald Green Ribbon Gradient */}
        <linearGradient id="greenRibbon" x1="40" y1="140" x2="95" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0E7846" />
          <stop offset="50%" stopColor="#16A765" />
          <stop offset="100%" stopColor="#25D366" />
        </linearGradient>

        {/* Royal Blue Ribbon Gradient */}
        <linearGradient id="blueRibbon" x1="90" y1="20" x2="160" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0B4FC0" />
          <stop offset="45%" stopColor="#1976F3" />
          <stop offset="100%" stopColor="#4DACF9" />
        </linearGradient>

        {/* Crimson Red Lower Wing Gradient */}
        <linearGradient id="redRibbon" x1="120" y1="90" x2="165" y2="155" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#B31A21" />
          <stop offset="50%" stopColor="#E52B32" />
          <stop offset="100%" stopColor="#FF4F56" />
        </linearGradient>

        {/* Golden Orbit Gradient */}
        <linearGradient id="goldOrbit" x1="50" y1="145" x2="170" y2="55" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D89A25" />
          <stop offset="40%" stopColor="#F7B928" />
          <stop offset="80%" stopColor="#FFE066" />
          <stop offset="100%" stopColor="#D89A25" />
        </linearGradient>

        {/* Shopping Bags Gradients */}
        <linearGradient id="bagBlue" x1="68" y1="80" x2="88" y2="135" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2C8BFC" />
          <stop offset="100%" stopColor="#1055C4" />
        </linearGradient>

        <linearGradient id="bagYellow" x1="82" y1="65" x2="118" y2="135" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFDF59" />
          <stop offset="70%" stopColor="#F7B928" />
          <stop offset="100%" stopColor="#D89A25" />
        </linearGradient>

        <linearGradient id="bagRed" x1="115" y1="85" x2="135" y2="135" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF4A50" />
          <stop offset="100%" stopColor="#C4151C" />
        </linearGradient>

        <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.18" />
        </filter>
      </defs>

      {/* Main Stylized "A" Left Arch (Green) */}
      <path
        d="M98 25 C75 45 42 98 40 142 C39 146 44 148 50 144 C62 135 78 112 92 78 Z"
        fill="url(#greenRibbon)"
        filter="url(#softShadow)"
      />

      {/* Main Stylized "A" Right Descent (Blue) */}
      <path
        d="M96 24 C106 20 115 28 122 45 C136 78 152 110 162 145 C163 150 157 154 152 150 C140 140 128 112 115 78 Z"
        fill="url(#blueRibbon)"
        filter="url(#softShadow)"
      />

      {/* Stylized Lower Red Sweep */}
      <path
        d="M115 88 C128 108 145 132 165 150 C167 152 165 156 161 155 C142 152 125 138 112 115 Z"
        fill="url(#redRibbon)"
      />

      {/* 3D Bags Group */}
      {/* 1. Left Blue Bag */}
      <rect x="70" y="86" width="18" height="34" rx="2.5" fill="url(#bagBlue)" transform="rotate(-8 79 103)" />
      <path d="M75 85 C75 79 83 79 83 85" stroke="#17191C" strokeWidth="2" fill="none" transform="rotate(-8 79 103)" />

      {/* 2. Right Red Bag */}
      <rect x="114" y="86" width="18" height="34" rx="2.5" fill="url(#bagRed)" transform="rotate(7 123 103)" />
      <path d="M119 85 C119 79 127 79 127 85" stroke="#17191C" strokeWidth="2" fill="none" transform="rotate(7 123 103)" />

      {/* 3. Center Yellow Hero Bag */}
      <rect x="83" y="74" width="34" height="48" rx="4" fill="url(#bagYellow)" filter="url(#softShadow)" />
      <path d="M93 74 C93 63 107 63 107 74" stroke="#17191C" strokeWidth="2.5" fill="none" />

      {/* Golden Orbital Ring Loop */}
      <path
        d="M45 135 C65 142 120 135 168 85 C176 76 172 70 162 76 C124 105 78 122 45 125 Z"
        fill="url(#goldOrbit)"
        filter="url(#softShadow)"
      />

      {/* Golden Sparkle Star */}
      <path
        d="M158 52 Q158 43 162 38 Q167 43 167 52 Q167 61 162 66 Q158 61 158 52 Z"
        fill="#F7B928"
        transform="rotate(15 162 52)"
      />
      <circle cx="162" cy="52" r="2.5" fill="#FFFDF8" />
    </svg>
  );

  // The Exact Multicolor Typography: A P P (Black) F (Green) O (Blue + Gold Star) R (Red) G (Yellow) E (Blue)
  const TextMark = (
    <div className="flex flex-col select-none">
      <div className="flex items-baseline font-black tracking-tight" style={{ fontSize: current.textH * 1.05 }}>
        {/* A P P */}
        <span className={variant === 'dark' ? 'text-white' : 'text-[#17191C]'}>APP</span>
        {/* F (Green) */}
        <span className="text-[#16A765] ml-0.5">F</span>
        {/* O (Blue with embedded 4-pt star) */}
        <span className="relative inline-flex items-center justify-center text-[#1976F3]">
          O
          <span className="absolute inset-0 flex items-center justify-center text-[#F7B928] text-[0.45em] leading-none pointer-events-none">
            ✦
          </span>
        </span>
        {/* R (Red) */}
        <span className="text-[#E52B32]">R</span>
        {/* G (Yellow/Gold) */}
        <span className="text-[#F7B928]">G</span>
        {/* E (Blue) */}
        <span className="text-[#1976F3]">E</span>
      </div>

      {(showTagline || variant === 'full') && (
        <div className="flex items-center gap-1 text-[11px] font-medium tracking-wide mt-0.5 text-[#6F6F6F]">
          <span>Discover</span>
          <span className="text-[#16A765] font-black">•</span>
          <span>Install</span>
          <span className="text-[#E52B32] font-black">•</span>
          <span>Experience</span>
        </div>
      )}
    </div>
  );

  if (variant === 'mark') {
    return <div className={`inline-flex items-center ${className}`}>{EmblemMark}</div>;
  }

  if (variant === 'full') {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        {EmblemMark}
        <div className="mt-2">{TextMark}</div>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center ${current.gap} ${className}`}>
      {EmblemMark}
      {TextMark}
    </div>
  );
};
