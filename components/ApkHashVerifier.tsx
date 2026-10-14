'use client';

/**
 * Phase 1A — Smart APK integrity verifier (browser-side SHA-256).
 *
 * Verifies the ACTUAL APK bytes against the trusted AppMintly release
 * metadata (never the other way round) in two ways:
 *  1. Local file mode — the user selects the APK they downloaded; it is
 *     hashed LOCALLY, streaming, chunk-by-chunk (bounded memory).
 *  2. Release-server mode — the APK is fetched from the official release
 *     asset URL and the response body is stream-hashed, with cancel,
 *     network/CORS/HTTP error handling and progress.
 *
 * Honesty rules (unchanged from Phase 11, tightened for Phase 1A):
 *  - The expected SHA-256 + size come ONLY from authoritative release
 *     evidence (lib/distribution.ts gate).
 *  - The expected hash is FORMAT-VALIDATED before any comparison; invalid
 *     metadata is reported as "Verification Failed" — never a fake match.
 *  - The success animation renders ONLY after the comparison actually
 *     passes. No animation on "verifying".
 *  - A matching checksum proves byte-identity with the official release;
 *     it is never presented as a malware-free guarantee.
 *  - The component never modifies the APK, the record or the published
 *     checksum. A successful verification is recorded in the LOCAL version
 *     history (lib/app-installs.ts) as "verified", never as "installed" —
 *     the browser cannot know the installed Android APK version.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  FileSearch,
  CheckCircle2,
  Loader2,
  CloudDownload,
  XCircle,
} from 'lucide-react';
import { AppItem } from '@/data/apps';
import { hasAuthoritativeApkRelease } from '@/lib/distribution';
import {
  isValidSha256Hex,
  sha256OfFile,
  sha256Matches,
  type Sha256Stream,
} from '@/lib/sha256';
import { recordVerifiedVersion } from '@/lib/app-installs';

/**
 * The five user-facing verification states required by the Phase 1A spec.
 *  - not-verified  : nothing verified yet (initial + after reset)
 *  - verifying     : bytes are being hashed (progress shown, cancellable)
 *  - verified      : hash matched the release metadata
 *  - mismatch      : hash did NOT match (prominent warning, never "verified")
 *  - failed        : verification could not run (metadata, network, CORS,
 *                    cancelled, unreadable file). NEVER presented as a match.
 */
type VerifyState =
  | { state: 'not-verified' }
  | {
      state: 'verifying';
      source: 'file' | 'server';
      fileName?: string;
      bytesDone: number;
      totalBytes: number | null;
    }
  | { state: 'verified'; source: 'file' | 'server'; fileName: string; localSha: string; sizeNote?: string }
  | { state: 'mismatch'; source: 'file' | 'server'; fileName: string; localSha: string }
  | { state: 'failed'; source: 'file' | 'server' | 'metadata'; message: string; cancelled?: boolean };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

const STATE_LABEL: Record<VerifyState['state'], string> = {
  'not-verified': 'Not Verified',
  verifying: 'Verifying',
  verified: 'Verified',
  mismatch: 'Hash Mismatch',
  failed: 'Verification Failed',
};

export function ApkHashVerifier({ app }: { app: AppItem }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<VerifyState>({ state: 'not-verified' });
  const abortRef = useRef<AbortController | null>(null);

  // Cancel any in-flight server verification when the page unmounts.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  if (!hasAuthoritativeApkRelease(app)) return null;

  const expectedSha = app.apk?.sha256;
  const expectedSize = app.apk?.fileSizeBytes ?? 0;
  const releaseUrl = app.apk?.apkUrl || app.apkUrl || '';

  // Guard 1 — the expected hash must be a well-formed SHA-256 before ANY
  // verification can start. Malformed metadata is a hard "Verification
  // Failed", never a silent pass or a fake match.
  if (!isValidSha256Hex(expectedSha)) {
    return (
      <section aria-labelledby="apk-verify-heading" className="rounded-2xl bg-card border border-line overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-4 py-3.5 bg-page border-b border-line">
          <ShieldAlert className="w-4 h-4 text-forge-red" aria-hidden />
          <h3 id="apk-verify-heading" className="text-sm font-bold text-ink">Verify APK integrity</h3>
        </div>
        <div className="p-4">
          <p role="alert" className="rounded-xl bg-forge-red/10 border border-forge-red/40 p-3 text-xs text-ink">
            Verification unavailable: the release metadata for this app does not contain a valid SHA-256
            checksum. The file cannot be verified against this record.
          </p>
        </div>
      </section>
    );
  }

  /** Common comparison + honest state transition after hashing completes. */
  const finishComparison = (source: 'file' | 'server', fileName: string, localSha: string, localSize: number | null) => {
    if (!sha256Matches(localSha, expectedSha)) {
      setResult({ state: 'mismatch', source, fileName, localSha });
      return;
    }
    // Hash matched → byte-identical to the official release. Record the
    // verified version LOCALLY (this browser only, never claimed global).
    recordVerifiedVersion(app.id, app.apk?.versionName || app.version || '', localSha);
    const sizeNote =
      expectedSize && localSize !== null && localSize !== expectedSize
        ? `Note: file size (${localSize.toLocaleString()} bytes) differs from the recorded release size (${expectedSize.toLocaleString()} bytes), but the hash matches exactly.`
        : undefined;
    setResult({ state: 'verified', source, fileName, localSha, sizeNote });
  };

  /** Mode 1 — hash the APK file the user already downloaded (local, no upload). */
  const handleFile = async (file: File) => {
    setResult({ state: 'verifying', source: 'file', fileName: file.name, bytesDone: 0, totalBytes: file.size });
    try {
      const localSha = await sha256OfFile(
        file,
        (done, total) => {
          setResult((prev) =>
            prev.state === 'verifying' && prev.source === 'file'
              ? { ...prev, bytesDone: done, totalBytes: total ?? prev.totalBytes }
              : prev
          );
        }
      );
      finishComparison('file', file.name, localSha, file.size);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        setResult({ state: 'failed', source: 'file', message: 'Verification cancelled.', cancelled: true });
      } else {
        setResult({ state: 'failed', source: 'file', message: 'Could not read or hash the selected file. Try selecting it again.' });
      }
    }
  };

  /** Mode 2 — fetch the official release APK and stream-hash the response. */
  const handleServerVerify = async () => {
    if (!releaseUrl) {
      setResult({ state: 'failed', source: 'metadata', message: 'No official release download URL is available for this app.' });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setResult({ state: 'verifying', source: 'server', bytesDone: 0, totalBytes: expectedSize || null });
    try {
      const res = await fetch(releaseUrl, { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) {
        setResult({
          state: 'failed',
          source: 'server',
          message: `The release server responded with HTTP ${res.status}. The APK could not be fetched for verification. You can still verify a file you already downloaded.`,
        });
        return;
      }
      const declaredSize = expectedSize || Number(res.headers.get('content-length')) || null;
      const updateProgress = (done: number) => {
        setResult((prev) =>
          prev.state === 'verifying' && prev.source === 'server'
            ? { ...prev, bytesDone: done, totalBytes: declaredSize ?? prev.totalBytes }
            : prev
        );
      };
      if (res.body && typeof res.body.getReader === 'function') {
        // Preferred: true streaming — bounded memory even for large APKs.
        const { Sha256Stream } = await import('@/lib/sha256') as typeof import('@/lib/sha256');
        const hash = new Sha256Stream();
        const reader = res.body.getReader();
        let done = 0;
        for (;;) {
          const { done: finished, value } = await reader.read();
          if (finished) break;
          if (value && value.byteLength > 0) {
            hash.update(new Uint8Array(value));
            done += value.byteLength;
            updateProgress(done);
          }
        }
        finishComparison('server', app.apk?.fileName || 'APK', hash.digest(), declaredSize);
      } else {
        // Fallback: buffered read (only where streaming is unsupported).
        const buffer = await res.arrayBuffer();
        updateProgress(buffer.byteLength);
        const digest = await crypto.subtle.digest('SHA-256', buffer);
        const localSha = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        finishComparison('server', app.apk?.fileName || 'APK', localSha, buffer.byteLength);
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError' || controller.signal.aborted) {
        setResult({ state: 'failed', source: 'server', message: 'Verification cancelled — the download was stopped.', cancelled: true });
      } else if (err instanceof TypeError) {
        setResult({
          state: 'failed',
          source: 'server',
          message: 'Could not download the APK for verification (network error, offline mode, or the server does not allow this browser to fetch it). You can still verify a file you already downloaded.',
        });
      } else {
        setResult({
          state: 'failed',
          source: 'server',
          message: 'Verification failed while reading the APK. Your connection or the release server may be unavailable. Try again or verify a downloaded file.',
        });
      }
    } finally {
      abortRef.current = null;
    }
  };

  const cancel = () => abortRef.current?.abort();

  const busy = result.state === 'verifying';
  const stateLabel = STATE_LABEL[result.state];
  const progress =
    result.state === 'verifying' && result.totalBytes
      ? Math.min(100, Math.round((result.bytesDone / result.totalBytes) * 100))
      : null;

  return (
    <section aria-labelledby="apk-verify-heading" className="rounded-2xl bg-card border border-line overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3.5 bg-page border-b border-line">
        <ShieldCheck className="w-4 h-4 text-forge-green" aria-hidden />
        <h3 id="apk-verify-heading" className="text-sm font-bold text-ink">
          Verify APK integrity
        </h3>
        <span className="ml-auto text-[9px] font-black uppercase tracking-wider text-mut border border-line rounded-full px-2 py-0.5">
          Runs in your browser
        </span>
      </div>

      <div className="p-4">
        <p className="text-xs text-mut leading-relaxed">
          Every AppMintly APK release carries a SHA-256 checksum in its release metadata. Compare the{' '}
          <strong className="text-ink">actual APK bytes</strong> against it — either by selecting the file you
          downloaded, or by letting this page fetch the official release and hash it. Your file is never uploaded.
        </p>

        {/* Expected (read-only) release evidence */}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] rounded-xl bg-page border border-line p-3">
          <div className="col-span-2">
            <dt className="text-mut font-bold uppercase tracking-wider text-[9px]">Expected SHA-256 (official release)</dt>
            <dd className="font-mono break-all text-ink mt-0.5">{expectedSha}</dd>
          </div>
          <div>
            <dt className="text-mut font-bold uppercase tracking-wider text-[9px]">Expected size</dt>
            <dd className="text-ink mt-0.5">{expectedSize ? `${expectedSize.toLocaleString()} bytes (${formatBytes(expectedSize)})` : 'Not specified'}</dd>
          </div>
          <div>
            <dt className="text-mut font-bold uppercase tracking-wider text-[9px]">Version</dt>
            <dd className="text-ink mt-0.5">v{app.apk?.versionName || app.version}</dd>
          </div>
        </dl>

        {/* Current state chip */}
        <p className="mt-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" aria-live="polite">
          {result.state === 'verified' ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-forge-green" aria-hidden />
              <span className="text-forge-green">{stateLabel}</span>
            </>
          ) : result.state === 'mismatch' ? (
            <>
              <ShieldX className="w-3.5 h-3.5 text-forge-red" aria-hidden />
              <span className="text-forge-red">{stateLabel}</span>
            </>
          ) : result.state === 'failed' ? (
            <>
              <ShieldAlert className="w-3.5 h-3.5 text-forge-red" aria-hidden />
              <span className="text-forge-red">{stateLabel}</span>
            </>
          ) : result.state === 'verifying' ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-mut" aria-hidden />
              <span className="text-mut">{stateLabel}…</span>
            </>
          ) : (
            <>
              <ShieldAlert className="w-3.5 h-3.5 text-mut" aria-hidden />
              <span className="text-mut">{stateLabel}</span>
            </>
          )}
        </p>

        {/* Actions */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".apk,application/vnd.android.package-archive"
            className="sr-only"
            id="apk-verify-file"
            aria-label="Select the downloaded APK file to verify"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.currentTarget.value = '';
            }}
          />
          <label
            htmlFor="apk-verify-file"
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              busy
                ? 'bg-page text-mut border border-line pointer-events-none'
                : 'bg-inkbg text-white hover:bg-forge-red'
            }`}
          >
            <FileSearch className="w-4 h-4" aria-hidden />
            Select downloaded APK
          </label>
          <button
            type="button"
            onClick={() => void handleServerVerify()}
            disabled={busy}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors ${
              busy
                ? 'bg-page text-mut border border-line cursor-not-allowed'
                : 'border border-line text-ink hover:bg-page cursor-pointer'
            }`}
          >
            <CloudDownload className="w-4 h-4" aria-hidden />
            Fetch &amp; verify from release server
          </button>
          {busy && result.source === 'server' && (
            <button
              type="button"
              onClick={cancel}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border border-forge-red/40 text-forge-red hover:bg-forge-red/10 transition-colors cursor-pointer"
            >
              <XCircle className="w-4 h-4" aria-hidden />
              Cancel
            </button>
          )}
        </div>

        {/* Verifying: progress (never a success visual) */}
        {result.state === 'verifying' && (
          <div role="status" aria-live="polite" className="mt-3">
            <div className="flex items-center justify-between text-[11px] text-mut mb-1">
              <span>
                Hashing {result.fileName || 'the official release'}…
              </span>
              <span>
                {formatBytes(result.bytesDone)}
                {result.totalBytes ? ` / ${formatBytes(result.totalBytes)}` : ''}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-page border border-line overflow-hidden" aria-hidden>
              <div
                className={`h-full bg-forge-red transition-[width] duration-150 ${progress === null ? 'motion-safe:animate-pulse' : ''}`}
                style={progress === null ? { width: '35%' } : { width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-mut">
              Streaming SHA-256 in bounded memory — the file is never fully loaded or uploaded.
            </p>
          </div>
        )}

        {/* Verified: success renders ONLY after a passed comparison */}
        {result.state === 'verified' && (
          <div
            role="status"
            aria-live="polite"
            className="mt-3 rounded-xl border p-3.5 bg-forge-green/10 border-forge-green/40"
          >
            <p className="flex items-center gap-2.5 text-sm font-bold text-forge-green">
              <span className="relative inline-flex">
                <CheckCircle2
                  className="w-5 h-5 text-forge-green motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-50 motion-safe:duration-500"
                  aria-hidden
                />
                <span
                  className="absolute inset-0 rounded-full border-2 border-forge-green/60 motion-safe:animate-ping motion-safe:animate-once"
                  aria-hidden
                />
              </span>
              <span className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-2 motion-safe:duration-500">
                SHA-256 Verified — AppMintly Release
              </span>
            </p>
            <p className="mt-1.5 text-[11px] text-mut">
              {result.fileName} is byte-identical to the official {app.name} v
              {app.apk?.versionName || app.version} release.
            </p>
            <p className="mt-1 text-[11px] text-mut">
              Computed SHA-256: <span className="font-mono break-all text-ink">{result.localSha}</span>
            </p>
            {result.sizeNote && <p className="mt-1 text-[11px] text-mut">{result.sizeNote}</p>}
            <p className="mt-2 text-[10px] text-mut leading-relaxed border-t border-forge-green/20 pt-2">
              A matching checksum confirms the file is identical to the official AppMintly release. It does not by
              itself prove the file is malware-free — always install from the official release page.
            </p>
          </div>
        )}

        {/* Hash mismatch: prominent warning, never labelled verified */}
        {result.state === 'mismatch' && (
          <div role="alert" className="mt-3 rounded-xl border p-3.5 bg-forge-red/10 border-forge-red/60">
            <p className="flex items-center gap-2 text-sm font-bold text-forge-red">
              <ShieldX className="w-4.5 h-4.5" aria-hidden />
              Hash mismatch — do not install this file
            </p>
            <p className="mt-1.5 text-[11px] text-mut leading-relaxed">
              {result.fileName} does NOT match the official {app.name} release checksum. It may be corrupted,
              outdated, or modified. Delete it and download again from the official release page.
            </p>
            <p className="mt-1 text-[11px] text-mut">
              Computed SHA-256: <span className="font-mono break-all text-ink">{result.localSha}</span>
            </p>
          </div>
        )}

        {/* Verification failed: honest failure, distinct from mismatch */}
        {result.state === 'failed' && (
          <div role="alert" className="mt-3 rounded-xl border p-3.5 bg-page border-forge-red/40">
            <p className="flex items-center gap-2 text-sm font-bold text-ink">
              <ShieldAlert className="w-4.5 h-4.5 text-forge-red" aria-hidden />
              Verification failed
            </p>
            <p className="mt-1.5 text-[11px] text-mut leading-relaxed">{result.message}</p>
            {!result.cancelled && (
              <button
                type="button"
                onClick={() => setResult({ state: 'not-verified' })}
                className="mt-2 text-[11px] font-bold text-forge-red hover:underline cursor-pointer"
              >
                Try again
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// Keep the unused type import meaningful for consumers of this module.
export type { Sha256Stream };
