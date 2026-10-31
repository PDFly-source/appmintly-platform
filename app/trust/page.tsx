/**
 * Item 9 — public Trust & Safety page.
 *
 * Plain language on purpose. It explains what AppMintly verifies, what a
 * checksum does and does not prove, how to report a problem, and what the
 * system cannot do. It never claims an app is virus-free, scanned or "100%
 * secure", because no malware scanning happens anywhere in this pipeline.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, FileCheck2, Flag, ShieldCheck } from 'lucide-react';
import { CHECKSUM_DOES_NOT_PROVE, CHECKSUM_PROVES, REPORT_CATEGORIES } from '@/lib/trust/reports';

const SITE_URL = 'https://appmintly.pages.dev/';

export const metadata: Metadata = {
  title: 'Trust & Safety — how AppMintly verifies apps | AppMintly',
  description:
    'How AppMintly verifies release metadata, what a SHA-256 checksum proves and does not prove, how to report a suspicious app, and the limits of what is checked.',
  alternates: { canonical: `${SITE_URL}trust/` },
  openGraph: {
    title: 'Trust & Safety — how AppMintly verifies apps',
    description: 'What AppMintly checks before you download, what it cannot check, and how to report a problem.',
    url: `${SITE_URL}trust/`,
    type: 'article',
  },
};

export default function TrustPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header>
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-mut">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Trust &amp; Safety
        </p>
        <h1 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">What AppMintly checks, and what it does not</h1>
        <p className="mt-2 text-[13px] text-mut">
          AppMintly is a small, independently run marketplace. This page explains exactly what is verified before a
          download is offered, what a checksum proves, how to report a problem, and where the limits are. It is written to
          be checkable, not reassuring.
        </p>
      </header>

      <section className="mt-6 rounded-2xl border border-line bg-card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <FileCheck2 className="h-4 w-4" aria-hidden="true" /> How release metadata is verified
        </h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[12px] text-ink">
          <li>An app is only offered as an APK when the release record was produced by the AppMintly build pipeline: enabled, verified, a recorded checksum, and a release asset URL.</li>
          <li>The pipeline records the package name, version name and code, minimum and target Android versions, file size and signature schemes it observed for that artifact.</li>
          <li>Those recorded values are what the app detail page shows. Anything the pipeline did not record is shown as “Not specified” rather than guessed.</li>
          <li>If an app has no verified release, no Android requirements are invented for it.</li>
        </ul>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
        <h2 className="text-sm font-bold text-ink">How SHA-256 checksums are used</h2>
        <p className="mt-1 text-[12px] text-mut">
          Every verified APK has a SHA-256 checksum recorded when it was published. The checksum is displayed on the app
          page so you can compare it with the file you downloaded.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-forge-green/30 bg-forge-green/10 p-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink">It proves</h3>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-[12px] text-ink">
              {CHECKSUM_PROVES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-line bg-canvas p-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink">It does not prove</h3>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-[12px] text-ink">
              {CHECKSUM_DOES_NOT_PROVE.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
        <h2 className="text-sm font-bold text-ink">How official download links work</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[12px] text-ink">
          <li>Download actions on published Android apps go through AppMintly&apos;s own tracked endpoint, which redirects to the official release asset recorded in the published catalog.</li>
          <li>Redirects are never built from user input, and a listing without a verified release cannot redirect at all.</li>
          <li>The tracked endpoint records that a download was requested. It cannot know whether a file finished downloading or was installed.</li>
          <li>Web apps open their published web address directly; nothing about a web launch is counted as an install.</li>
        </ul>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <Flag className="h-4 w-4" aria-hidden="true" /> How to report a problem
        </h2>
        <p className="mt-1 text-[12px] text-mut">
          Open any app page and choose “Report a problem”. Pick the closest category and describe what you saw. Reports
          are private: other visitors never see them, and the app listing does not change automatically.
        </p>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {REPORT_CATEGORIES.map((category) => (
            <li key={category.id} className="rounded-xl border border-line bg-canvas p-2">
              <p className="text-[12px] font-bold text-ink">{category.label}</p>
              <p className="text-[11px] text-mut">{category.hint}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
        <h2 className="text-sm font-bold text-ink">How reports are reviewed</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[12px] text-ink">
          <li>Each report goes into a private queue. The owner can mark it under review, resolve it with a reason, or reject it.</li>
          <li>Every state change is recorded in that report&apos;s history, along with any private note.</li>
          <li>Receiving a report is not an investigation. A receipt only confirms the report was received.</li>
          <li>If a listing is wrong or unsafe, the owner can unpublish it. That removes it from the public catalog and stops its download route; the underlying record is kept with an audit reason.</li>
        </ul>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Known security limitations
        </h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[12px] text-ink">
          <li>AppMintly does not scan APKs for malware and has no antivirus results to show. A checksum match is not a safety verdict.</li>
          <li>Checksum and signature metadata come from the release pipeline; AppMintly does not re-download every asset on every page view.</li>
          <li>Download counts measure requests at the tracked endpoint. Automated agents are filtered on a best-effort basis only, so counts are not installs or unique people.</li>
          <li>Browser compatibility beyond recorded PWA install support is not verified, and no device testing is claimed.</li>
          <li>Reviews and reports are submitted anonymously. AppMintly cannot verify who wrote them.</li>
        </ul>
      </section>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/explore/" className="inline-flex items-center gap-1.5 rounded-xl bg-inkbg px-3 py-2 text-[12px] font-bold text-on-ink">
          Browse the catalog <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
        <Link href="/contact/" className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-[12px] font-bold text-ink">
          Contact the owner
        </Link>
        <Link href="/services/report-issue/" className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-[12px] font-bold text-ink">
          Service issue report
        </Link>
      </div>
    </div>
  );
}
