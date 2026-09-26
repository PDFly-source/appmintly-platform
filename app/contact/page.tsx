import type { Metadata } from 'next';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import Link from 'next/link';
import { MailQuestion } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contact - AppMintly',
  description:
    'How to reach the AppMintly marketplace and the PKD publisher: app support, publisher pages, and the public GitHub repository.',
  alternates: {
    canonical: `https://pdfly-source.github.io/appmintly-platform/contact${CANONICAL_TRAILING_SLASH}`,
  },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-page text-ink">
      <div className="px-4 sm:px-6 max-w-3xl mx-auto py-12">
        <div className="flex items-center gap-2.5 mb-2">
          <MailQuestion className="w-6 h-6 text-[#16A765]" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Contact</h1>
        </div>
        <p className="text-xs text-mut mb-8">Last updated: September 26, 2026</p>

        <div className="space-y-6 text-sm text-ink/85 leading-relaxed">
          <section aria-labelledby="contact-no-accounts">
            <h2 id="contact-no-accounts" className="text-base font-black mb-2">No Accounts, No Mailbox</h2>
            <p>
              AppMintly does not require registration and does not collect personal
              information, so there is no contact form or mailbox attached to the
              marketplace itself. See the{' '}
              <Link href="/privacy" className="font-bold text-[#1976F3] hover:text-[#0f55b8] transition">
                Privacy Policy
              </Link>{' '}
              for the full details.
            </p>
          </section>

          <section aria-labelledby="contact-apps">
            <h2 id="contact-apps" className="text-base font-black mb-2">App Support</h2>
            <p>
              Each application in the catalog has a detail page with release notes and
              download options. Applications published by PKD are listed together on the{' '}
              <Link href="/publisher/pkd" className="font-bold text-[#1976F3] hover:text-[#0f55b8] transition">
                PKD publisher page
              </Link>
              .
            </p>
          </section>

          <section aria-labelledby="contact-repo">
            <h2 id="contact-repo" className="text-base font-black mb-2">Marketplace Source</h2>
            <p>
              The AppMintly marketplace is developed in a public GitHub repository. Technical
              issues with the site itself can be reported there:
            </p>
            <p className="mt-2">
              <a
                href="https://github.com/PDFly-source/appmintly-platform"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-bold text-[#1976F3] hover:text-[#0f55b8] transition"
              >
                github.com/PDFly-source/appmintly-platform
              </a>
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
