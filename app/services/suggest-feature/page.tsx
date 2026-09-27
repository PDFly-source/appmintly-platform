import type { Metadata } from 'next';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import Link from 'next/link';
import { Lightbulb } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Suggest a Feature - AppMintly',
  description:
    'Share an idea for the AppMintly marketplace: how feature suggestions are collected and what happens to them.',
  alternates: {
    canonical: `https://pdfly-source.github.io/appmintly-platform/services/suggest-feature${CANONICAL_TRAILING_SLASH}`,
  },
};

export default function SuggestFeaturePage() {
  return (
    <div className="min-h-screen bg-page text-ink">
      <div className="px-4 sm:px-6 max-w-3xl mx-auto py-12">
        <div className="flex items-center gap-2.5 mb-2">
          <Lightbulb className="w-6 h-6 text-[#16A765]" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Suggest a Feature</h1>
        </div>
        <p className="text-xs text-mut mb-8">Last updated: September 27, 2026</p>

        <div className="space-y-6 text-sm text-ink/85 leading-relaxed">
          <section aria-labelledby="sug-how">
            <h2 id="sug-how" className="text-base font-black mb-2">Share an Idea</h2>
            <p>
              The marketplace is developed in a public GitHub repository, and that is where ideas for
              AppMintly itself are collected. Suggestions are read and discussed in the open —
              there is no hidden suggestion box.
            </p>
            <p className="mt-2">
              <a
                href="https://github.com/PDFly-source/appmintly-platform/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[#1976F3] hover:text-[#0f55b8] transition"
              >
                Post your idea on GitHub →
              </a>
            </p>
          </section>

          <section aria-labelledby="sug-what">
            <h2 id="sug-what" className="text-base font-black mb-2">What Helps</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>The problem you are trying to solve, not just the feature name.</li>
              <li>Where in the marketplace you would expect it (browsing, library, detail pages...).</li>
              <li>Anything you have seen elsewhere that does it well.</li>
            </ul>
          </section>

          <section aria-labelledby="sug-scope">
            <h2 id="sug-scope" className="text-base font-black mb-2">Scope</h2>
            <p>
              This channel is for the AppMintly marketplace — its pages, catalog, and library. Ideas
              for individual apps (Studyria, PDFMiniFly) are best raised on those apps&apos; own
              pages or via the{' '}
              <Link href="/contact" className="font-bold text-[#1976F3] hover:text-[#0f55b8] transition">
                Contact
              </Link>{' '}
              page. There is no commitment timeline; accepted ideas are simply picked up when the
              marketplace work on them begins.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
