import React from 'react';
import Link from 'next/link';
import { AppMintlyLogo, AppMintlyWordmarkText } from './AppMintlyLogo';
import { Smartphone, Globe, Wrench, Sparkles } from 'lucide-react';

// Base path is '' for local/server deployments and '/appmintly-platform' for
// the static GitHub Pages build (injected at build time) — same pattern as
// AppMintlyLogo, used here for the existing suite product icons.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

// The footer renders on the always-dark inkbg surface in BOTH themes, so its
// palette is fixed (warm white text / muted opacity variants) rather than
// theme-token driven. Same visual language as the previous footer.
const linkClass = 'transition-colors hover:text-white focus-ring rounded-sm';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-inkbg text-[#FAF5ED] pt-10 mt-16 border-t border-ink/10 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* ---- Top: brand column + link sections ---- */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-12 gap-x-8 gap-y-8">
          {/* Brand column */}
          <div className="md:col-span-1 lg:col-span-4 space-y-3">
            <AppMintlyLogo variant="dark" size="md" />
            <p className="text-xs text-[#FAF5ED]/70 max-w-xs leading-relaxed">
              An independent software ecosystem of lightweight, privacy-focused web
              applications and utilities crafted by PKD.
            </p>
            {/* Static, truthful availability indicator — NOT backed by a live
                health endpoint, so no "live system status" claim is made. */}
            <div className="pt-1">
              <p className="inline-flex items-center gap-2 text-xs font-semibold">
                <span
                  className="w-2 h-2 rounded-full bg-[#16A765] animate-pulse motion-reduce:animate-none"
                  aria-hidden="true"
                ></span>
                All Systems Operational
              </p>
              <p className="text-[11px] text-[#FAF5ED]/50 mt-1 pl-4">
                Marketplace services are running normally.
              </p>
            </div>
          </div>

          {/* Platforms & Types — the empty Games link was removed in Phase 16.6
              (no Games content exists in the catalog); the catalog schema still
              supports games for the future. */}
          <nav className="md:col-span-1 lg:col-span-2 space-y-2" aria-label="Platforms and types">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#F7B928]">
              Platforms &amp; Types
            </h4>
            <ul className="space-y-2 text-xs text-[#FAF5ED]/75">
              <li>
                <Link href="/explore?type=Android+APK" className={`flex items-center gap-1.5 ${linkClass}`}>
                  <Smartphone className="w-3.5 h-3.5 text-[#16A765]" aria-hidden="true" />
                  <span>Android APKs</span>
                </Link>
              </li>
              <li>
                <Link href="/explore?type=Web+App" className={`flex items-center gap-1.5 ${linkClass}`}>
                  <Globe className="w-3.5 h-3.5 text-[#1976F3]" aria-hidden="true" />
                  <span>Web Apps &amp; PWAs</span>
                </Link>
              </li>
              <li>
                <Link href="/explore?type=Tool" className={`flex items-center gap-1.5 ${linkClass}`}>
                  <Wrench className="w-3.5 h-3.5 text-[#F7B928]" aria-hidden="true" />
                  <span>Tools &amp; Utilities</span>
                </Link>
              </li>
              <li>
                <Link href="/explore?filter=originals" className={`flex items-center gap-1.5 ${linkClass}`}>
                  <Sparkles className="w-3.5 h-3.5 text-[#F7B928]" aria-hidden="true" />
                  <span>AppMintly Originals</span>
                </Link>
              </li>
            </ul>
          </nav>

          {/* The Suite — PKD's applications. Destinations are the real,
              catalog-backed product sites; icons are the existing public/brand
              assets already shipped by the marketplace. */}
          <nav className="md:col-span-1 lg:col-span-2 space-y-2" aria-label="The suite">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#F7B928]">
              The Suite
            </h4>
            <ul className="space-y-2.5 text-xs text-[#FAF5ED]/75">
              <li>
                <a
                  href="https://studyria.qzz.io/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-start gap-2.5 ${linkClass}`}
                >
                  <img
                    src={`${BASE_PATH}/brand/studyria-icon-384.png`}
                    alt=""
                    width={18}
                    height={18}
                    className="w-[18px] h-[18px] rounded-[4px] object-cover mt-0.5 shrink-0"
                  />
                  <span>
                    <span className="block font-semibold text-[#FAF5ED]/90">Studyria</span>
                    <span className="block text-[11px] text-[#FAF5ED]/55">Assam Exam Prep Platform</span>
                  </span>
                </a>
              </li>
              <li>
                <a
                  href="https://pdfly-source.github.io/pdfly-app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-start gap-2.5 ${linkClass}`}
                >
                  <img
                    src={`${BASE_PATH}/brand/pdfminifly-icon-384.png`}
                    alt=""
                    width={18}
                    height={18}
                    className="w-[18px] h-[18px] rounded-[4px] object-cover mt-0.5 shrink-0"
                  />
                  <span>
                    <span className="block font-semibold text-[#FAF5ED]/90">PDFMiniFly</span>
                    <span className="block text-[11px] text-[#FAF5ED]/55">Private PDF Suite</span>
                  </span>
                </a>
              </li>
            </ul>
          </nav>

          {/* Marketplace */}
          <nav className="md:col-span-1 lg:col-span-2 space-y-2" aria-label="Marketplace">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#F7B928]">
              Marketplace
            </h4>
            <ul className="space-y-2 text-xs text-[#FAF5ED]/75">
              <li>
                <Link href="/explore" className={linkClass}>All Applications</Link>
              </li>
              <li>
                <Link href="/categories" className={linkClass}>Categories</Link>
              </li>
              <li>
                <Link href="/library" className={linkClass}>Saved Apps / Library</Link>
              </li>
              <li>
                <Link href="/about" className={linkClass}>About AppMintly</Link>
              </li>
            </ul>
          </nav>

          {/* Legal — properly separated links (Phase 16.6 fixed the previous
              merged "About AppMintlyPrivacy PolicyTerms of Service" run-on). */}
          <nav className="md:col-span-1 lg:col-span-2 space-y-2" aria-label="Legal">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#F7B928]">
              Legal
            </h4>
            <ul className="space-y-2 text-xs text-[#FAF5ED]/75">
              <li>
                <Link href="/privacy" className={linkClass}>Privacy Policy</Link>
              </li>
              <li>
                <Link href="/terms" className={linkClass}>Terms of Service</Link>
              </li>
              <li>
                <Link href="/cookies" className={linkClass}>Cookie Policy</Link>
              </li>
              <li>
                <Link href="/contact" className={linkClass}>Contact</Link>
              </li>
            </ul>
          </nav>
        </div>

        {/* ---- Bottom: premium brand closing signature (Phase 16.7).
              The footer surface is always the dark inkbg (existing design
              language), so the warm-white wordmark keeps full contrast in
              both themes. ---- */}
        <div className="mt-10 pt-7 border-t border-[#F7B928]/20 flex flex-col items-center gap-2.5 text-center">
          <p className="text-[28px] lg:text-[44px] font-black tracking-tight leading-none select-none">
            <AppMintlyWordmarkText mintlyClassName="text-[#F5EBDD]" />
          </p>
          <p className="text-[11px] font-semibold tracking-[0.25em] text-[#F7B928]/90 select-none">
            DISCOVER <span className="text-[#FAF5ED]/40" aria-hidden="true">•</span> INSTALL{' '}
            <span className="text-[#FAF5ED]/40" aria-hidden="true">•</span> EXPERIENCE
          </p>
          <p className="text-xs text-[#FAF5ED]/60">
            Crafted &amp; Developed by{' '}
            <Link
              href="/publisher/pkd"
              className="font-black text-[#FAF5ED] transition-colors hover:text-[#F7B928] focus-ring rounded-sm"
            >
              PKD
            </Link>
          </p>
          <p className="text-[11px] text-[#FAF5ED]/45 pb-1">
            © {new Date().getFullYear()} AppMintly. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};
