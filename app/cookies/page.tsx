import type { Metadata } from 'next';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import Link from 'next/link';
import { Cookie } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Cookie Policy - AppMintly',
  description:
    'AppMintly uses no tracking, advertising, or analytics cookies. How the marketplace handles cookies and browser storage.',
  alternates: {
    canonical: `https://pdfly-source.github.io/appmintly-platform/cookies${CANONICAL_TRAILING_SLASH}`,
  },
};

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-page text-ink">
      <div className="px-4 sm:px-6 max-w-3xl mx-auto py-12">
        <div className="flex items-center gap-2.5 mb-2">
          <Cookie className="w-6 h-6 text-[#F7B928]" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Cookie Policy</h1>
        </div>
        <p className="text-xs text-mut mb-8">Last updated: September 26, 2026</p>

        <div className="space-y-6 text-sm text-ink/85 leading-relaxed">
          <section aria-labelledby="cookies-none">
            <h2 id="cookies-none" className="text-base font-black mb-2">No Tracking Cookies</h2>
            <p>
              AppMintly does not use cookies for tracking, advertising, or analytics. The
              marketplace is a static site hosted on GitHub Pages and sets no cookies when
              you browse the catalog.
            </p>
          </section>

          <section aria-labelledby="cookies-local">
            <h2 id="cookies-local" className="text-base font-black mb-2">Browser Storage</h2>
            <p>
              Some features store data directly in your browser&apos;s local storage instead of
              using cookies:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Your theme preference (light, dark, or system).</li>
              <li>Your saved apps library and usage history.</li>
              <li>Publisher console drafts, when you use the publisher tools.</li>
            </ul>
            <p className="mt-2">
              This information never leaves your device and is not transmitted to
              AppMintly or any third party. You can clear it at any time from your
              browser settings.
            </p>
          </section>

          <section aria-labelledby="cookies-third">
            <h2 id="cookies-third" className="text-base font-black mb-2">Third-Party Content</h2>
            <p>
              AppMintly embeds no third-party trackers, advertising networks, or social
              widgets. Downloading an APK opens a release page on GitHub, which is
              governed by GitHub&apos;s own policies.
            </p>
          </section>

          <section aria-labelledby="cookies-privacy">
            <h2 id="cookies-privacy" className="text-base font-black mb-2">Related Policy</h2>
            <p>
              For the full details of how AppMintly handles data, see the{' '}
              <Link href="/privacy" className="font-bold text-[#1976F3] hover:text-[#0f55b8] transition">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <div className="pt-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1976F3] hover:text-[#0f55b8] transition"
            >
              ← Back to AppMintly
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
