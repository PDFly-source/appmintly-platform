'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles, Compass, Grid, Bookmark } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const pathname = usePathname();

  // The PKD 3D publisher profile supplies its own navigation.
  if (pathname && pathname.replace(/\/$/, '') === '/publisher/pkd') {
    return null;
  }

  const navItems = [
    { label: 'Home', href: '/', icon: Sparkles },
    { label: 'Explore', href: '/explore', icon: Compass },
    { label: 'Categories', href: '/categories', icon: Grid },
    { label: 'Library', href: '/library', icon: Bookmark },
  ];

  return (
    <nav
      id="mobile-bottom-navigation"
      aria-label="Mobile navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-line px-2 py-1.5 shadow-lg"
    >
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center min-h-[44px] py-1 px-2.5 rounded-xl transition-all ${
                isActive
                  ? 'text-[#E52B32] font-bold scale-105'
                  : 'text-mut hover:text-ink font-semibold'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#E52B32]" />
                )}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
