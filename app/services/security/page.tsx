import type { Metadata } from 'next';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Security & Verification - AppMintly',
  description:
    'How AppMintly verifies releases: official GitHub release links, SHA-256 checksums, transparent versions, and what is not automated.',
  alternates: {
    canonical: `https://appmintly.pages.dev/services/security${CANONICAL_TRAILING_SLASH}`,
  },
};

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-page text-ink">
      <div className="px-4 sm:px-6 max-w-3xl mx-auto py-12">
        <div className="flex items-center gap-2.5 mb-2">
          <ShieldCheck className="w-6 h-6 text-[#16A765]" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Security &amp; Verification</h1>
        </div>
        <p className="text-xs text-mut mb-8">Last updated: September 27, 2026</p>

        <div className="space-y-6 text-sm text-ink/85 leading-relaxed">
          <section aria-labelledby="sec-what">
            <h2 id="sec-what" className="text-base font-bold mb-2">What AppMintly Verifies</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="text-ink">Official release links.</strong> Every download on an
                app detail page points to the publisher&apos;s official GitHub release, never a
                re-uploaded copy.
              </li>
              <li>
                <strong className="text-ink">SHA-256 checksums.</strong> Android releases list a
                SHA-256 checksum so you can confirm that the file you downloaded is byte-for-byte
                the published release.
              </li>
              <li>
                <strong className="text-ink">Transparent versions.</strong> Version history,
                release notes, and update times are shown on each detail page — nothing is hidden
                behind a version bump.
              </li>
              <li>
                <strong className="text-ink">Repository-verified publishers.</strong> Publisher
                identities are tied to their public repositories, and each has a{' '}
                <Link href="/publisher/pkd" className="font-bold text-[#1976F3] hover:text-[#0f55b8] transition">
                  public publisher page
                </Link>
                .
              </li>
              <li>
                <strong className="text-ink">PWA status.</strong> Web apps show an honest
                verification status (PWA Ready, PWA Metadata Found, or Web App Only) instead of a
                blanket &quot;verified&quot; badge.
              </li>
            </ul>
          </section>

          <section aria-labelledby="sec-how">
            <h2 id="sec-how" className="text-base font-bold mb-2">Verify a Download Yourself</h2>
            <p>
              On the app&apos;s detail page, copy the SHA-256 checksum, then compare it against your
              downloaded file. On Windows run{' '}
              <code className="px-1.5 py-0.5 rounded bg-page border border-line text-xs">certutil -hashfile file.apk SHA256</code>,
              on macOS/Linux{' '}
              <code className="px-1.5 py-0.5 rounded bg-page border border-line text-xs">shasum -a 256 file.apk</code>.
              If the two values match, the file is exactly the published release.
            </p>
          </section>

          <section aria-labelledby="sec-limits">
            <h2 id="sec-limits" className="text-base font-bold mb-2">Honest Limits</h2>
            <p>
              AppMintly does not run automated malware scanning, dynamic analysis, or sandbox
              testing, and it does not claim to. Verification here means traceable sources and
              reproducible checksums — where each file came from and whether your copy matches it.
              For runtime protection, keep Google Play Protect (or your device&apos;s scanner)
              enabled, and only install software you actually intended to download. See the{' '}
              <Link href="/services/install-help" className="font-bold text-[#1976F3] hover:text-[#0f55b8] transition">
                App Install Help
              </Link>{' '}
              page for practical steps, and the{' '}
              <Link href="/privacy" className="font-bold text-[#1976F3] hover:text-[#0f55b8] transition">
                Privacy Policy
              </Link>{' '}
              for data practices.
            </p>
          </section>

          <section aria-labelledby="sec-report">
            <h2 id="sec-report" className="text-base font-bold mb-2">Found Something Wrong?</h2>
            <p>
              If a checksum does not match or a link looks suspicious, report it through the{' '}
              <Link href="/services/report-issue" className="font-bold text-[#1976F3] hover:text-[#0f55b8] transition">
                Report an Issue
              </Link>{' '}
              page.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
