import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy - AppMintly',
  description:
    'How AppMintly handles data: no account required, no third-party trackers, library data stored locally on your device.',
  alternates: {
    canonical: 'https://pdfly-source.github.io/appmintly-platform/privacy',
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-page text-ink">
      <div className="px-4 sm:px-6 max-w-3xl mx-auto py-12">
        <div className="flex items-center gap-2.5 mb-2">
          <ShieldCheck className="w-6 h-6 text-[#16A765]" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Privacy Policy</h1>
        </div>
        <p className="text-xs text-mut mb-8">Last updated: September 24, 2026</p>

        <div className="space-y-6 text-sm text-ink/85 leading-relaxed">
          <section aria-labelledby="privacy-accounts">
            <h2 id="privacy-accounts" className="text-base font-black mb-2">No Accounts Required</h2>
            <p>
              AppMintly does not require registration or sign-in. Browsing, searching, and
              downloading applications from the catalog does not create an account.
            </p>
          </section>

          <section aria-labelledby="privacy-local">
            <h2 id="privacy-local" className="text-base font-black mb-2">Data Stored on Your Device</h2>
            <p>
              Your saved library (favorites) and usage history are stored locally in your
              browser on your own device. This information never leaves your device and is
              not transmitted to AppMintly or any third party.
            </p>
          </section>

          <section aria-labelledby="privacy-trackers">
            <h2 id="privacy-trackers" className="text-base font-black mb-2">No Third-Party Trackers</h2>
            <p>
              AppMintly does not embed advertising networks, analytics trackers, or
              cross-site tracking scripts. The marketplace runs as a static site served over
              GitHub Pages.
            </p>
          </section>

          <section aria-labelledby="privacy-downloads">
            <h2 id="privacy-downloads" className="text-base font-black mb-2">App Downloads</h2>
            <p>
              Downloading an application takes you directly to the publisher&apos;s official
              release page (for example, a GitHub Release asset). Those downloads are governed
              by the publisher&apos;s own terms and infrastructure.
            </p>
          </section>

          <section aria-labelledby="privacy-external">
            <h2 id="privacy-external" className="text-base font-black mb-2">External Applications</h2>
            <p>
              Applications listed in the catalog are published by third parties. AppMintly
              verifies publisher identity and release metadata at listing time, but the
              applications themselves are the responsibility of their publishers.
            </p>
          </section>

          <section aria-labelledby="privacy-changes">
            <h2 id="privacy-changes" className="text-base font-black mb-2">Changes to This Policy</h2>
            <p>
              If this policy changes, the updated version will be published on this page with a
              revised date.
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
