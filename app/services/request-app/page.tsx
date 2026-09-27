import type { Metadata } from 'next';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import Link from 'next/link';
import { PackagePlus } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Request an App - AppMintly',
  description:
    'How to request an app for the AppMintly marketplace: what to include and where requests are reviewed.',
  alternates: {
    canonical: `https://pdfly-source.github.io/appmintly-platform/services/request-app${CANONICAL_TRAILING_SLASH}`,
  },
};

export default function RequestAppPage() {
  return (
    <div className="min-h-screen bg-page text-ink">
      <div className="px-4 sm:px-6 max-w-3xl mx-auto py-12">
        <div className="flex items-center gap-2.5 mb-2">
          <PackagePlus className="w-6 h-6 text-[#16A765]" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Request an App</h1>
        </div>
        <p className="text-xs text-mut mb-8">Last updated: September 27, 2026</p>

        <div className="space-y-6 text-sm text-ink/85 leading-relaxed">
          <section aria-labelledby="req-how">
            <h2 id="req-how" className="text-base font-black mb-2">How Requests Work</h2>
            <p>
              AppMintly has no request form or mailbox — the marketplace is developed in a public
              GitHub repository, and that is where app requests are collected and reviewed. Open a
              request in the repository&apos;s issues with the details below, and it will be
              considered alongside the publishing plans of the marketplace&apos;s publishers.
            </p>
            <p className="mt-2">
              <a
                href="https://github.com/PDFly-source/appmintly-platform/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[#1976F3] hover:text-[#0f55b8] transition"
              >
                Open a request on GitHub →
              </a>
            </p>
          </section>

          <section aria-labelledby="req-include">
            <h2 id="req-include" className="text-base font-black mb-2">What to Include</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>The app name and, if it exists elsewhere, a link to it.</li>
              <li>The type you would like it published as: Android APK, PWA, web app, or web game.</li>
              <li>What you would use it for — a short use case helps prioritize.</li>
            </ul>
          </section>

          <section aria-labelledby="req-honest">
            <h2 id="req-honest" className="text-base font-black mb-2">What to Expect</h2>
            <p>
              Requests are wishes, not orders: publishing depends on a publisher deciding to build
              and release the app, and every published app still goes through the marketplace&apos;s{' '}
              <Link href="/services/security" className="font-bold text-[#1976F3] hover:text-[#0f55b8] transition">
                verification practices
              </Link>
              . There is no queue position or delivery date, and AppMintly does not republish apps
              from other developers without their involvement.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
