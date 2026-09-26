'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Bookmark, Menu, X, Sparkles, Shield, ArrowRight, Sun, Moon, MonitorSmartphone } from 'lucide-react';
import { CommandPaletteTrigger } from '@/components/CommandPalette';
import { useTheme } from '@/lib/theme-context';
import { AppMintlyLogo } from './AppMintlyLogo';
import { getLocalFavorites } from '@/lib/localLibrary';

export const Navbar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [favCount, setFavCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { mode, cycleMode } = useTheme();

  const themeIcon = mode === 'dark' ? Moon : mode === 'system' ? MonitorSmartphone : Sun;
  const themeLabel = `Theme: ${mode}. Tap to cycle light, dark, system.`;
  const ThemeToggle = (
    <button
      onClick={cycleMode}
      aria-label={themeLabel}
      title={themeLabel}
      className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-card border border-line text-ink hover:bg-line/60 transition cursor-pointer"
    >
      {React.createElement(themeIcon, { className: 'w-4 h-4' })}
    </button>
  );

  useEffect(() => {
    const updateFavCount = () => {
      setFavCount(getLocalFavorites().length);
    };
    updateFavCount();
    window.addEventListener('appmintly_local_updated', updateFavCount);
    return () => window.removeEventListener('appmintly_local_updated', updateFavCount);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/explore?q=${encodeURIComponent(searchQuery.trim())}`);
      setMobileMenuOpen(false);
    }
  };

  const navLinks = [
    { label: 'Explore', href: '/explore' },
    { label: 'Categories', href: '/categories' },
    { label: 'Originals', href: '/explore?filter=originals' },
    { label: 'Latest', href: '/explore?sort=latest' },
    { label: 'Tools', href: '/explore?category=tools' },
  ];

  return (
    <header className="sticky top-0 z-40 glass transition-colors motion-reduce:transition-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3 sm:gap-4">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0 group focus:outline-hidden focus:ring-2 focus:ring-[#1976F3] rounded-lg">
          {/* Phase 16.7: stronger mobile lockup — 17px/900 wordmark beside the
              compact mark (visibly bolder than the 16.5 15px label, still safely
              narrower than the overflowing md horizontal lockup at 360px). */}
          <span className="sm:hidden inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-flex items-center">
              <AppMintlyLogo size="sm" variant="mark" />
            </span>
            <span className="font-black tracking-tight text-ink leading-none select-none text-[17px]">
              AppMintly
            </span>
          </span>
          {/* Desktop lockup: md from sm, proportionally larger (lg) from xl —
              same official artwork, no h-16 header height change. */}
          <span className="hidden sm:inline-flex xl:hidden">
            <AppMintlyLogo size="md" variant="horizontal" />
          </span>
          <span className="hidden xl:inline-flex">
            <AppMintlyLogo size="lg" variant="horizontal" />
          </span>
        </Link>

        {/* Desktop Search Bar */}
        <form
          onSubmit={handleSearchSubmit}
          className="hidden md:flex flex-1 max-w-md mx-4 relative items-center"
        >
          <Search className="w-4 h-4 text-mut absolute left-3.5 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search apps, APKs, PWAs, tools..."
            className="w-full rounded-full bg-page border border-transparent hover:border-line focus:border-[#1976F3] focus:bg-white pl-10 pr-4 py-2 text-sm text-ink placeholder-mut transition focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
          />
        </form>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-1">
          {navLinks.map((link) => {
            // Trailing-slash-insensitive: static-export builds render
            // slash-terminated URLs (see next.config.ts); server builds do not.
            const normPath = pathname !== '/' && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
            const active = normPath === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                  active
                    ? 'bg-inkbg text-white shadow-xs'
                    : 'text-ink/80 hover:text-ink hover:bg-page'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          {/* Mobile search / quick-action toggle: opens the command palette */}
          <button
            onClick={() => window.dispatchEvent(new Event('appmintly:open-command-palette'))}
            className="md:hidden p-2 rounded-full text-ink hover:bg-page transition"
            aria-label="Search apps and quick actions"
          >
            <Search className="w-5 h-5" />
          </button>

          {ThemeToggle}

          {/* Library Link (Favorites & History) */}
          <Link
            href="/library"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-page hover:bg-line text-ink text-xs font-bold transition border border-line"
            title="Local Library & Saved Apps"
          >
            <Bookmark className="w-4 h-4 text-[#E52B32]" />
            <span className="hidden sm:inline">Library</span>
            {favCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#E52B32] text-white text-[10px] font-black flex items-center justify-center">
                {favCount}
              </span>
            )}
          </Link>

          {/* Desktop command palette trigger (Ctrl+K) */}
          <span className="hidden lg:inline-flex">
            <CommandPaletteTrigger />
          </span>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-full text-ink hover:bg-page transition"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-card border-b border-line px-4 pt-2 pb-5 space-y-3 animate-in fade-in slide-in-from-top-2">
          {/* Mobile Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <Search className="w-4 h-4 text-mut absolute left-3.5 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search apps, APKs, PWAs, tools..."
              className="w-full rounded-full bg-page border border-line pl-10 pr-4 py-2 text-sm text-ink placeholder-mut focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
            />
          </form>

          <div className="grid grid-cols-2 gap-2 pt-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2.5 rounded-xl bg-page text-xs font-bold text-ink hover:bg-line transition flex items-center justify-between"
              >
                <span>{link.label}</span>
                <ArrowRight className="w-3.5 h-3.5 text-mut" />
              </Link>
            ))}
          </div>

          <div className="border-t border-line pt-2 flex items-center justify-between">
            <Link
              href="/about"
              onClick={() => setMobileMenuOpen(false)}
              className="text-xs font-medium text-mut hover:text-ink"
            >
              About AppMintly
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};
