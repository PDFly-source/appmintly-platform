'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Bookmark, Menu, X, Sparkles, ArrowRight, Sun, Moon, MonitorSmartphone, LayoutGrid, Clock, Star, Wrench, Smartphone, Globe, Gamepad2, ExternalLink, Info, Mail } from 'lucide-react';
import { CommandPaletteTrigger } from '@/components/CommandPalette';
import { useTheme } from '@/lib/theme-context';
import { AppMintlyLogo, AppMintlyWordmarkText } from './AppMintlyLogo';
import { AppIcon } from '@/components/AppIcon';
import { getLocalFavorites } from '@/lib/localLibrary';


interface MenuRowProps {
  href: string;
  label: string;
  icon?: React.ElementType;
  iconSrc?: string;
  desc?: string;
  external?: boolean;
  onNavigate?: () => void;
}

/**
 * Phase 16.10: premium full-width menu row.
 * One accessible interactive element per row — real link semantics,
 * 44px+ practical touch target, hover/pressed/focus/reduced-motion states.
 */
const MenuRow: React.FC<MenuRowProps> = ({ href, label, icon: Icon, iconSrc, desc, external, onNavigate }) => {
  const shared =
    'group flex items-center gap-3 w-full min-h-[44px] px-3 py-2 rounded-xl bg-page/60 border border-transparent hover:border-line hover:bg-line/40 active:bg-line/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976F3]/40';
  const labelBlock = (
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-bold text-ink">{label}</span>
      {desc && <span className="block text-[11px] text-mut leading-snug">{desc}</span>}
    </span>
  );
  const arrow = external ? (
    <ExternalLink aria-hidden="true" className="w-3.5 h-3.5 text-mut shrink-0" />
  ) : (
    <ArrowRight
      aria-hidden="true"
      className="w-3.5 h-3.5 text-mut shrink-0 transition-transform motion-reduce:transition-none motion-safe:group-hover:translate-x-0.5"
    />
  );
  const leading = iconSrc ? (
    <AppIcon src={iconSrc} name={label} size="xs" className="shrink-0" />
  ) : Icon ? (
    <Icon aria-hidden="true" className="w-4 h-4 text-mut shrink-0" />
  ) : null;

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        className={shared}
      >
        {leading}
        {labelBlock}
        {arrow}
      </a>
    );
  }
  return (
    <Link href={href} onClick={onNavigate} className={shared}>
      {leading}
      {labelBlock}
      {arrow}
    </Link>
  );
};

/** Section label — same gold accent family as the footer headings. */
const MenuSectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11px] font-black uppercase tracking-wider text-[#F7B928] mb-1.5">{children}</p>
);

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
          {/* Phase 16.8: two-tone brand wordmark (App emerald / Mintly cream)
              beside the compact mark — 18px/900, still safely narrower than the
              overflowing md horizontal lockup at 360px. */}
          <span className="sm:hidden inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-flex items-center">
              <AppMintlyLogo size="sm" variant="mark" />
            </span>
            <AppMintlyWordmarkText className="font-black tracking-tight leading-none select-none text-[18px]" />
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

      {/* Mobile Drawer Menu — Phase 16.10 Menu Experience 2.0 */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-card border-b border-line px-4 pt-4 pb-5 space-y-5 animate-in fade-in slide-in-from-top-2 motion-reduce:animate-none">
          {/* Brand area */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-1.5 min-h-[44px] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976F3]/40"
              >
                <span aria-hidden="true" className="inline-flex items-center">
                  <AppMintlyLogo size="sm" variant="mark" />
                </span>
                <AppMintlyWordmarkText className="font-black tracking-tight leading-none select-none text-[18px]" />
              </Link>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-mut shrink-0">
                <span
                  aria-hidden="true"
                  className="w-2 h-2 rounded-full bg-[#16A765] animate-pulse motion-reduce:animate-none"
                ></span>
                Marketplace Online
              </span>
            </div>
            <p className="text-xs text-mut pl-0.5">Your digital software marketplace</p>
          </div>

          {/* Discover */}
          <nav aria-label="Discover">
            <MenuSectionLabel>Discover</MenuSectionLabel>
            <ul className="space-y-1">
              <li>
                <form onSubmit={handleSearchSubmit} className="relative flex items-center min-h-[44px]">
                  <Search
                    aria-hidden="true"
                    className="w-4 h-4 text-mut absolute left-3 pointer-events-none"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search apps, APKs, PWAs, tools..."
                    aria-label="Search apps, APKs, PWAs, tools"
                    className="w-full rounded-xl bg-page border border-line pl-9 pr-10 py-2.5 text-sm text-ink placeholder-mut focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                  />
                  <button
                    type="submit"
                    aria-label="Run search"
                    className="absolute right-2 w-7 h-7 rounded-lg flex items-center justify-center text-mut hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976F3]/40"
                  >
                    <ArrowRight aria-hidden="true" className="w-4 h-4" />
                  </button>
                </form>
              </li>
              <li>
                <MenuRow href="/explore" label="Explore" icon={Sparkles} onNavigate={() => setMobileMenuOpen(false)} />
              </li>
              <li>
                <MenuRow href="/categories" label="Categories" icon={LayoutGrid} onNavigate={() => setMobileMenuOpen(false)} />
              </li>
              <li>
                <MenuRow href="/explore?sort=latest" label="Latest Apps" icon={Clock} onNavigate={() => setMobileMenuOpen(false)} />
              </li>
            </ul>
          </nav>

          {/* Collections */}
          <nav aria-label="Collections">
            <MenuSectionLabel>Collections</MenuSectionLabel>
            <ul className="space-y-1">
              <li>
                <MenuRow href="/explore?filter=originals" label="AppMintly Originals" icon={Star} onNavigate={() => setMobileMenuOpen(false)} />
              </li>
              <li>
                <MenuRow href="/explore?category=tools" label="Tools & Utilities" icon={Wrench} onNavigate={() => setMobileMenuOpen(false)} />
              </li>
              <li>
                <MenuRow href="/explore?type=Android+APK" label="Android Apps" icon={Smartphone} onNavigate={() => setMobileMenuOpen(false)} />
              </li>
              <li>
                <MenuRow href="/explore?type=Web+App" label="Web Apps & PWAs" icon={Globe} onNavigate={() => setMobileMenuOpen(false)} />
              </li>
              <li>
                <MenuRow href="/explore?category=games" label="Games" icon={Gamepad2} onNavigate={() => setMobileMenuOpen(false)} />
              </li>
            </ul>
          </nav>

          {/* Your Library */}
          <nav aria-label="Your library">
            <MenuSectionLabel>Your Library</MenuSectionLabel>
            <ul className="space-y-1">
              <li>
                <MenuRow
                  href="/library"
                  label="Saved Apps"
                  icon={Bookmark}
                  desc={favCount > 0 ? `${favCount} saved` : 'Your bookmarked apps'}
                  onNavigate={() => setMobileMenuOpen(false)}
                />
              </li>
            </ul>
          </nav>

          {/* The Suite */}
          <nav aria-label="The suite">
            <MenuSectionLabel>The Suite</MenuSectionLabel>
            <ul className="space-y-1">
              <li>
                <MenuRow
                  href="https://studyria.qzz.io/"
                  label="Studyria"
                  iconSrc="/brand/studyria-icon-384.png"
                  desc="Assam Exam Prep Platform"
                  external
                  onNavigate={() => setMobileMenuOpen(false)}
                />
              </li>
              <li>
                <MenuRow
                  href="https://pdfly-source.github.io/pdfly-app/"
                  label="PDFMiniFly"
                  iconSrc="/brand/pdfminifly-icon-384.png"
                  desc="Private PDF Suite"
                  external
                  onNavigate={() => setMobileMenuOpen(false)}
                />
              </li>
            </ul>
          </nav>

          {/* About */}
          <nav aria-label="About">
            <MenuSectionLabel>About</MenuSectionLabel>
            <ul className="space-y-1">
              <li>
                <MenuRow href="/about" label="About AppMintly" icon={Info} onNavigate={() => setMobileMenuOpen(false)} />
              </li>
              <li>
                <MenuRow href="/contact" label="Contact" icon={Mail} onNavigate={() => setMobileMenuOpen(false)} />
              </li>
            </ul>
          </nav>

          {/* Legal — visually secondary */}
          <nav aria-label="Legal" className="pt-2 border-t border-line/60">
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <li>
                <Link href="/privacy" onClick={() => setMobileMenuOpen(false)} className="inline-flex items-center min-h-[44px] text-xs font-medium text-mut hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976F3]/40 rounded px-1">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" onClick={() => setMobileMenuOpen(false)} className="text-xs font-medium text-mut hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976F3]/40 rounded px-1 py-1.5">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/cookies" onClick={() => setMobileMenuOpen(false)} className="text-xs font-medium text-mut hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976F3]/40 rounded px-1 py-1.5">
                  Cookie Policy
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      )}
    </header>
  );
};
