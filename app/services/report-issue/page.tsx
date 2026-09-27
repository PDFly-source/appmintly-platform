import type { Metadata } from 'next';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import Link from 'next/link';
import { Bug } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Report an Issue - AppMintly',
  description:
    'Report broken links, incorrect information, or problems with AppMintly apps and pages.',
  alternates: {
    canonical: `https://pdfly-source.github.io/appmintly-platform/services/report-issue${CANONICAL_TRAILING_SLASH}`,
  },
};

export default function ReportIssuePage() {
  return (
    <div className="min-h-screen bg-page text-ink">
      <div className="px-4 sm:px-6 max-w-3xl mx-auto py-12">
        <div className="flex items-center gap-2.5 mb-2">
          <Bug className="w-6 h-6 text-[#16A765]" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Report an Issue</h1>
        </div>
        <p className="text-xs text-mut mb-8">Last updated: September 27, 2026</p>

        <div className="space-y-6 text-sm text-ink/85 leading-relaxed">
          <section aria-labelledby="rep-what">
            <h2 id="rep-what" className="text-base font-black mb-2">What to Report</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Broken download or release links on an app detail page.</li>
              <li>A SHA-256 checksum that does not match the downloaded file.</li>
              <li>Incorrect app information, versions, or screenshots.</li>
              <li>Anything on the site that renders incorrectly or fails to work.</li>
            </ul>
          </section>

          <section aria-labelledby="rep-how">
            <h2 id="rep-how" className="text-base font-black mb-2">How to Report</h2>
            <p>
              Technical issues with the marketplace are handled in the public GitHub repository.
              Open an issue there with the details below — reports are public and are triaged with
              the normal site work.
            </p>
            <p className="mt-2">
              <a
                href="https://github.com/PDFly-source/appmintly-platform/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[#1976F3] hover:text-[#0f55b8] transition"
              >
                Open an issue on GitHub →
              </a>
            </p>
          </section>

          <section aria-labelledby="rep-details">
            <h2 id="rep-details" className="text-base font-black mb-2">What to Include</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>The app name and version (for app issues) or the page URL.</li>
              <li>What you expected and what actually happened.</li>
              <li>Your device/browser, if it affects the behavior.</li>
            </ul>
          </section>

          <section aria-labelledby="rep-security">
            <h2 id="rep-security" className="text-base font-black mb-2">Security-Related Reports</h2>
            <p>
              If something looks like a security problem (a suspicious file, a mismatched checksum),
              say so in the title so it is seen quickly. Background on what AppMintly verifies is
              on the{' '}
              <Link href="/services/security" className="font-bold text-[#1976F3] hover:text-[#0f55b8] transition">
                Security &amp; Verification
              </Link>{' '}
              page.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
