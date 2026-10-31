/**
 * Item 9 — Release integrity panel.
 *
 * Shows only facts the release pipeline recorded, and states plainly what a
 * checksum proves and does not prove. Renders nothing at all unless the release
 * is authoritative (enabled + verified + checksum + official asset URL).
 *
 * It never claims an APK was scanned, is malware-free, or is "safe": the
 * checksum only matches the file against the published reference.
 */
import { FileCheck2, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { AppItem } from '@/data/apps';
import {
  CHECKSUM_DOES_NOT_PROVE,
  CHECKSUM_PROVES,
  formatIntegrityBytes,
  releaseIntegrityFacts,
} from '@/lib/trust/reports';

export function ReleaseIntegrity({ app }: { app: AppItem }) {
  const facts = releaseIntegrityFacts(app);
  if (!facts) return null;
  const size = formatIntegrityBytes(facts.sizeBytes);

  return (
    <section aria-labelledby="release-integrity-heading" className="mt-8 rounded-2xl border border-line bg-card p-4 sm:p-5">
      <h2 id="release-integrity-heading" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-mut">
        <FileCheck2 className="h-4 w-4" aria-hidden="true" /> Release integrity
      </h2>
      <p className="mt-1 max-w-xl text-[12px] text-mut">
        These are the release facts the AppMintly pipeline recorded for this app. They describe the published file, not
        your device and not whether the app is good.
      </p>

      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-line bg-canvas p-3">
          <dt className="text-[11px] font-semibold text-mut">Published version</dt>
          <dd className="text-[13px] font-bold text-ink">{facts.version || 'Not specified'}</dd>
        </div>
        <div className="min-w-0 rounded-xl border border-line bg-canvas p-3">
          <dt className="text-[11px] font-semibold text-mut">Verification status</dt>
          <dd className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
            <ShieldCheck className="h-3.5 w-3.5 text-forge-green" aria-hidden="true" /> Release record verified by the pipeline
          </dd>
        </div>
        <div className="min-w-0 rounded-xl border border-line bg-canvas p-3">
          <dt className="text-[11px] font-semibold text-mut">Release source</dt>
          <dd className="break-words text-[13px] font-bold text-ink">{facts.source}</dd>
        </div>
        <div className="min-w-0 rounded-xl border border-line bg-canvas p-3">
          <dt className="text-[11px] font-semibold text-mut">File</dt>
          <dd className="break-all text-[13px] font-bold text-ink">
            {facts.fileName || 'Not specified'}
            {size ? <span className="font-normal text-mut"> · {size}</span> : null}
          </dd>
        </div>
        <div className="min-w-0 rounded-xl border border-line bg-canvas p-3 sm:col-span-2">
          <dt className="text-[11px] font-semibold text-mut">SHA-256 checksum (published reference)</dt>
          <dd className="break-all font-mono text-[11px] leading-relaxed text-ink">{facts.sha256}</dd>
        </div>
        <div className="min-w-0 rounded-xl border border-line bg-canvas p-3">
          <dt className="text-[11px] font-semibold text-mut">Signature schemes</dt>
          <dd className="text-[13px] font-bold text-ink">
            {facts.signatureSchemes.length > 0 ? facts.signatureSchemes.join(', ') : 'Not specified'}
          </dd>
        </div>
        <div className="min-w-0 rounded-xl border border-line bg-canvas p-3">
          <dt className="text-[11px] font-semibold text-mut">Package name</dt>
          <dd className="break-all text-[13px] font-bold text-ink">{facts.packageId || 'Not specified'}</dd>
        </div>
      </dl>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-forge-green/30 bg-forge-green/10 p-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink">What the checksum proves</h3>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-[12px] text-ink">
            {CHECKSUM_PROVES.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-line bg-canvas p-3">
          <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink">
            <ShieldAlert className="h-3 w-3" aria-hidden="true" /> What it does not prove
          </h3>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-[12px] text-ink">
            {CHECKSUM_DOES_NOT_PROVE.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-mut">
        Verify the file yourself if you want to: compare the checksum above with{' '}
        <span className="font-mono">sha256sum</span> on the downloaded file. A match confirms the file is the published
        reference; it is not a safety rating.
      </p>
    </section>
  );
}
