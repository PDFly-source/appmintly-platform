import React from 'react';
import Link from 'next/link';
import {
  Sparkles,
  ShieldCheck,
  Smartphone,
  Globe,
  Download,
  CheckCircle2,
  HelpCircle,
  Layers,
  ArrowRight
} from 'lucide-react';
import { AppForgeLogo } from '@/components/AppForgeLogo';

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-14 space-y-12">
      {/* Brand Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex justify-center mb-2">
          <AppForgeLogo size="lg" variant="full" showTagline />
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-[#17191C] tracking-tight">
          An Independent Application Marketplace
        </h1>
        <p className="text-base sm:text-lg text-[#6F6F6F] max-w-2xl mx-auto leading-relaxed">
          APPFORGE is a fast, unbloated, privacy-first software platform created to distribute original apps, Android APKs, Progressive Web Apps, indie games, and developer utilities directly to you.
        </p>
      </div>

      {/* Core Principles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="p-6 rounded-3xl bg-[#FFFDF8] border border-[#E8DED0] shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-[#16A765]/10 text-[#16A765] flex items-center justify-center mb-3">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-base text-[#17191C]">Zero-Telemetry</h3>
          <p className="text-xs text-[#6F6F6F] mt-1.5 leading-relaxed">
            No mandatory signups, no invasive analytics tracking, and no third-party data brokers profiling your app usage.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-[#FFFDF8] border border-[#E8DED0] shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-[#1976F3]/10 text-[#1976F3] flex items-center justify-center mb-3">
            <Globe className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-base text-[#17191C]">Modern Web &amp; PWAs</h3>
          <p className="text-xs text-[#6F6F6F] mt-1.5 leading-relaxed">
            Experience near-native performance right in your web browser with offline capabilities and instantaneous launching.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-[#FFFDF8] border border-[#E8DED0] shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-[#E52B32]/10 text-[#E52B32] flex items-center justify-center mb-3">
            <Smartphone className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-base text-[#17191C]">Direct APK Downloads</h3>
          <p className="text-xs text-[#6F6F6F] mt-1.5 leading-relaxed">
            Directly download compiled Android application packages without forced store locks or artificial delays.
          </p>
        </div>
      </div>

      {/* Frequently Asked Questions */}
      <div className="bg-[#FFFDF8] border border-[#E8DED0] rounded-3xl p-6 sm:p-10 shadow-xs space-y-6">
        <h2 className="text-2xl font-black text-[#17191C] tracking-tight flex items-center gap-2">
          <HelpCircle className="w-6 h-6 text-[#1976F3]" />
          <span>Frequently Asked Questions</span>
        </h2>

        <div className="space-y-5 text-sm divide-y divide-[#E8DED0]/60">
          <div className="pt-3">
            <h4 className="font-bold text-[#17191C]">How do I install an Android APK file?</h4>
            <p className="text-[#6F6F6F] text-xs sm:text-sm mt-1 leading-relaxed">
              When you click &apos;Download APK&apos;, the file is saved to your device&apos;s Downloads folder. Tap the downloaded file in your notification drawer or files app. If your device displays a prompt about installing from unknown sources, tap settings and enable permission for your browser. The app will install cleanly.
            </p>
          </div>

          <div className="pt-4">
            <h4 className="font-bold text-[#17191C]">What is a Progressive Web App (PWA)?</h4>
            <p className="text-[#6F6F6F] text-xs sm:text-sm mt-1 leading-relaxed">
              A Progressive Web App is a modern web application that can be added directly to your home screen or desktop. It loads instantly, works offline, and runs without a browser navigation bar, behaving just like a native app.
            </p>
          </div>

          <div className="pt-4">
            <h4 className="font-bold text-[#17191C]">Are APPFORGE applications verified?</h4>
            <p className="text-[#6F6F6F] text-xs sm:text-sm mt-1 leading-relaxed">
              Yes. Every application listed in the APPFORGE content registry is compiled, audited, and curated by APPFORGE before publication. We never include malware, predatory advertisements, or background crypto miners.
            </p>
          </div>

          <div className="pt-4">
            <h4 className="font-bold text-[#17191C]">Why is there no sign-up or login?</h4>
            <p className="text-[#6F6F6F] text-xs sm:text-sm mt-1 leading-relaxed">
              We believe a software marketplace should be as open as downloading files from the open internet. You don&apos;t need an account to discover, open, or install apps. Your library and favorites stay stored locally on your device.
            </p>
          </div>
        </div>
      </div>

      {/* CTA Box */}
      <div className="rounded-3xl bg-[#17191C] text-white p-8 sm:p-10 text-center space-y-4">
        <h3 className="text-2xl font-black">Ready to Discover?</h3>
        <p className="text-xs sm:text-sm text-white/70 max-w-md mx-auto">
          Explore our complete catalog of verified Android APKs, Web Apps, games, and tools.
        </p>
        <div className="pt-2 flex justify-center gap-3">
          <Link
            href="/explore"
            className="px-6 py-3 rounded-full bg-[#E52B32] hover:bg-[#b81f25] text-white text-xs sm:text-sm font-bold shadow-md transition"
          >
            Explore Catalog
          </Link>
        </div>
      </div>
    </div>
  );
}
