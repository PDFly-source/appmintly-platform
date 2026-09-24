import React from 'react';
import Link from 'next/link';
import { AppMintlyLogo } from './AppMintlyLogo';
import { Smartphone, Globe, Gamepad2, Wrench, Sparkles, BookOpen, Layers } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#17191C] text-[#FAF5ED] pt-14 pb-24 md:pb-14 border-t border-[#17191C]/10 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-10">
          {/* Brand Column */}
          <div className="md:col-span-2 space-y-4">
            <AppMintlyLogo variant="horizontal" size="md" />
            <p className="text-xs text-[#FAF5ED]/70 max-w-sm leading-relaxed">
              AppMintly is an independent digital marketplace for Apps, Web Apps, Games, Tools, and Websites. Discover, install, and experience them all in one place.
            </p>
            <div className="flex items-center gap-3 text-xs text-[#FAF5ED]/50 pt-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-white font-medium">
                <span className="w-2 h-2 rounded-full bg-[#16A765] animate-pulse"></span>
                Static Catalog Ready
              </span>
              <span>“Discover. Install. Experience.”</span>
            </div>
          </div>

          {/* Platforms & Types */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#F7B928]">Platforms & Types</h4>
            <ul className="space-y-2 text-xs text-[#FAF5ED]/75">
              <li>
                <Link href="/explore?type=Android+APK" className="hover:text-white transition flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-[#16A765]" />
                  <span>Android APKs</span>
                </Link>
              </li>
              <li>
                <Link href="/explore?type=Web+App" className="hover:text-white transition flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-[#1976F3]" />
                  <span>Web Apps & PWAs</span>
                </Link>
              </li>
              <li>
                <Link href="/explore?type=Game" className="hover:text-white transition flex items-center gap-1.5">
                  <Gamepad2 className="w-3.5 h-3.5 text-[#E52B32]" />
                  <span>Games</span>
                </Link>
              </li>
              <li>
                <Link href="/explore?type=Tool" className="hover:text-white transition flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-[#F7B928]" />
                  <span>Tools & Utilities</span>
                </Link>
              </li>
              <li>
                <Link href="/explore?filter=originals" className="hover:text-white transition flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#F7B928]" />
                  <span>AppMintly Originals</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Marketplace Navigation */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#16A765]">Marketplace</h4>
            <ul className="space-y-2 text-xs text-[#FAF5ED]/75">
              <li>
                <Link href="/explore" className="hover:text-white transition">All Applications</Link>
              </li>
              <li>
                <Link href="/categories" className="hover:text-white transition">Categories Directory</Link>
              </li>
              <li>
                <Link href="/library" className="hover:text-white transition">Saved Apps & Library</Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-white transition">About AppMintly</Link>
              </li>
            </ul>
          </div>

          {/* Publishing Console */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#1976F3]">Publishing</h4>
            <ul className="space-y-2 text-xs text-[#FAF5ED]/75">
              <li>
                <Link href="/publisher" className="hover:text-white transition flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-[#F7B928]" />
                  <span>Publisher Console</span>
                </Link>
              </li>
              <li>
                <Link href="/publisher?tab=export" className="hover:text-white transition flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#16A765]" />
                  <span>Export Catalog JSON</span>
                </Link>
              </li>
              <li>
                <p className="text-[#FAF5ED]/40 text-[11px] leading-relaxed pt-1">
                  Local content management tool for preparing and testing app listings.
                </p>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#FAF5ED]/50">
          <p>© {new Date().getFullYear()} AppMintly. All rights reserved. “Discover. Install. Experience.”</p>
          <div className="flex items-center gap-4">
            <Link href="/about" className="hover:text-white transition">About</Link>
            <span>•</span>
            <Link href="/library" className="hover:text-white transition">Local Library</Link>
            <span>•</span>
            <Link href="/publisher" className="hover:text-white transition">Publisher</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
