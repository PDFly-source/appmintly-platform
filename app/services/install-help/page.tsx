import type { Metadata } from 'next';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import Link from 'next/link';
import { Package } from 'lucide-react';

export const metadata: Metadata = {
  title: 'App Install Help - AppMintly',
  description:
    'Practical guidance for installing Android APKs from AppMintly releases, understanding Play Protect prompts, and installing PWAs.',
  alternates: {
    canonical: `https://pdfly-source.github.io/appmintly-platform/services/install-help${CANONICAL_TRAILING_SLASH}`,
  },
};

export default function InstallHelpPage() {
  return (
    <div className="min-h-screen bg-page text-ink">
      <div className="px-4 sm:px-6 max-w-3xl mx-auto py-12">
        <div className="flex items-center gap-2.5 mb-2">
          <Package className="w-6 h-6 text-[#16A765]" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">App Install Help</h1>
        </div>
        <p className="text-xs text-mut mb-8">Last updated: September 27, 2026</p>

        <div className="space-y-6 text-sm text-ink/85 leading-relaxed">
          <section aria-labelledby="help-apk">
            <h2 id="help-apk" className="text-base font-black mb-2">Installing an Android APK</h2>
            <ol className="list-decimal pl-5 space-y-1.5">
              <li>Open the app&apos;s detail page and tap <strong className="text-ink">Get App / Download APK</strong>. The download always comes from the publisher&apos;s official GitHub release.</li>
              <li>
                Optionally confirm the file: compare its SHA-256 checksum with the one listed on
                the detail page (see{' '}
                <Link href="/services/security" className="font-bold text-[#1976F3] hover:text-[#0f55b8] transition">
                  Security &amp; Verification
                </Link>
                ).
              </li>
              <li>Open the downloaded file. Android will ask you to allow installs from the app you downloaded with (for example your browser) for <em>this one time</em>. Approving this is safe to do per-install; Android remembers the choice per source app.</li>
              <li>Tap <strong className="text-ink">Install</strong> and wait for the install to finish.</li>
            </ol>
          </section>

          <section aria-labelledby="help-protect">
            <h2 id="help-protect" className="text-base font-black mb-2">About Play Protect Prompts</h2>
            <p>
              Google Play Protect scans apps installed from outside the Play Store. Two common
              prompts and what they mean:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>
                <strong className="text-ink">&quot;Blocked by Play Protect&quot; / &quot;Unknown app&quot;:</strong> this
                appears for any APK not distributed through the Play Store. It is informational, not
                a detection. If you downloaded from the official release link and the checksum
                matches, you can choose <em>Install anyway</em>.
              </li>
              <li>
                <strong className="text-ink">An actual threat warning:</strong> if Play Protect names
                a specific threat, stop and double-check the source before installing. You can
                report suspected problems via the{' '}
                <Link href="/services/report-issue" className="font-bold text-[#1976F3] hover:text-[#0f55b8] transition">
                  Report an Issue
                </Link>{' '}
                page.
              </li>
            </ul>
          </section>

          <section aria-labelledby="help-pwa">
            <h2 id="help-pwa" className="text-base font-black mb-2">Installing a PWA or Web App</h2>
            <p>
              Web apps and PWAs run directly in the browser — no APK needed. To install a PWA to your
              home screen, open the app, then use your browser menu and choose{' '}
              <strong className="text-ink">Install app</strong> / <strong className="text-ink">Add to Home screen</strong>.
              An app whose detail page shows &quot;Web App Only&quot; has not published PWA install
              metadata, so it is used from the browser.
            </p>
          </section>

          <section aria-labelledby="help-stuck">
            <h2 id="help-stuck" className="text-base font-black mb-2">Still Stuck?</h2>
            <p>
              For app-specific questions, check the release notes on the app&apos;s detail page or the{' '}
              <Link href="/contact" className="font-bold text-[#1976F3] hover:text-[#0f55b8] transition">
                Contact
              </Link>{' '}
              page for how to reach the marketplace.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
