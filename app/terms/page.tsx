import type { Metadata } from 'next';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import Link from 'next/link';
import { FileCheck2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms of Service - AppMintly',
  description:
    'The terms that apply when you use the AppMintly marketplace: catalog content, publisher responsibility, and application usage.',
  alternates: {
    canonical: `https://pdfly-source.github.io/appmintly-platform/terms${CANONICAL_TRAILING_SLASH}`,
  },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-page text-ink">
      <div className="px-4 sm:px-6 max-w-3xl mx-auto py-12">
        <div className="flex items-center gap-2.5 mb-2">
          <FileCheck2 className="w-6 h-6 text-[#1976F3]" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Terms of Service</h1>
        </div>
        <p className="text-xs text-mut mb-8">Last updated: September 24, 2026</p>

        <div className="space-y-6 text-sm text-ink/85 leading-relaxed">
          <section aria-labelledby="terms-use">
            <h2 id="terms-use" className="text-base font-black mb-2">Using AppMintly</h2>
            <p>
              AppMintly is a catalog and marketplace for discovering applications, web apps,
              games, tools, and websites. You may browse and use the marketplace for personal,
              non-commercial purposes.
            </p>
          </section>

          <section aria-labelledby="terms-content">
            <h2 id="terms-content" className="text-base font-black mb-2">Catalog Content</h2>
            <p>
              Catalog listings, descriptions, screenshots, and release metadata are supplied by
              publishers. AppMintly verifies publisher identity and the integrity metadata of
              published release assets (such as APK checksums), but does not warrant the
              functionality or fitness of any listed application.
            </p>
          </section>

          <section aria-labelledby="terms-publisher">
            <h2 id="terms-publisher" className="text-base font-black mb-2">Publisher Responsibility</h2>
            <p>
              Publishers are responsible for the applications they publish, including legality,
              licensing, content, and behavior. Applications that violate these terms may be
              removed from the catalog.
            </p>
          </section>

          <section aria-labelledby="terms-downloads">
            <h2 id="terms-downloads" className="text-base font-black mb-2">Downloads &amp; Installations</h2>
            <p>
              Downloads are delivered directly from the publisher&apos;s official release
              infrastructure. Install Android packages only from sources you trust, and verify
              the published SHA-256 checksum when possible.
            </p>
          </section>

          <section aria-labelledby="terms-liability">
            <h2 id="terms-liability" className="text-base font-black mb-2">No Warranty</h2>
            <p>
              The marketplace is provided &ldquo;as is&rdquo; without warranties of any kind.
              AppMintly is not liable for damages arising from the use of third-party
              applications discovered through the catalog.
            </p>
          </section>

          <section aria-labelledby="terms-changes">
            <h2 id="terms-changes" className="text-base font-black mb-2">Changes to These Terms</h2>
            <p>
              If these terms change, the updated version will be published on this page with a
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
