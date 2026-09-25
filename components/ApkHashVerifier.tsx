'use client';

/**
 * Phase 11 — Direct APK integrity verifier (client-side).
 *
 * For apps with authoritative release evidence only. The user selects the
 * APK file they downloaded; its SHA-256 is computed LOCALLY in the browser
 * (Web Crypto — no upload, no server round-trip) and compared against the
 * canonical release SHA-256 + file size from the catalog record.
 *
 * The canonical values are read-only here: this component can never modify
 * the APK, the record or the published checksum.
 */

import React, { useRef, useState } from 'react';
import { ShieldCheck, ShieldX, FileSearch, CheckCircle2, Loader2 } from 'lucide-react';
import { AppItem } from '@/data/apps';
import { hasAuthoritativeApkRelease } from '@/lib/distribution';

type Result =
  | { state: 'idle' }
  | { state: 'hashing'; fileName: string }
  | {
      state: 'done';
      fileName: string;
      localSha: string;
      match: boolean;
      localSize: number;
      sizeMatch: boolean;
    }
  | { state: 'error'; message: string };

function formatBytes(n: number): string {
  return `${(n / 1024).toFixed(1)} KB`;
}

export function ApkHashVerifier({ app }: { app: AppItem }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<Result>({ state: 'idle' });

  if (!hasAuthoritativeApkRelease(app) || !app.apk?.sha256) return null;

  const expectedSha = app.apk.sha256;
  const expectedSize = app.apk.fileSizeBytes;

  const handleFile = async (file: File) => {
    if (!file) return;
    setResult({ state: 'hashing', fileName: file.name });
    try {
      // Web Crypto digest of the full buffer. Released APKs are a few hundred
      // KB, well within memory; hashing stays entirely on the client.
      const buffer = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      const localSha = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      setResult({
        state: 'done',
        fileName: file.name,
        localSha,
        match: localSha === expectedSha,
        localSize: file.size,
        sizeMatch: expectedSize ? file.size === expectedSize : true,
      });
    } catch {
      setResult({ state: 'error', message: 'Could not read or hash the selected file.' });
    }
  };

  return (
    <section aria-labelledby="apk-verify-heading" className="rounded-2xl bg-card border border-line overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3.5 bg-page border-b border-line">
        <ShieldCheck className="w-4 h-4 text-[#16A765]" aria-hidden />
        <h3 id="apk-verify-heading" className="text-sm font-bold text-ink">
          Verify APK integrity
        </h3>
        <span className="ml-auto text-[9px] font-black uppercase tracking-wider text-mut border border-line rounded-full px-2 py-0.5">
          Runs in your browser
        </span>
      </div>

      <div className="p-4">
        <p className="text-xs text-mut leading-relaxed">
          Already downloaded <strong className="text-ink">{app.apk.fileName || 'the APK'}</strong>? Select the file on
          this device and it will be hashed locally and compared against the official release checksum. Your file is
          never uploaded anywhere.
        </p>

        {/* Expected (read-only) release evidence */}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] rounded-xl bg-page border border-line p-3">
          <div>
            <dt className="text-mut font-bold uppercase tracking-wider text-[9px]">Expected SHA-256</dt>
            <dd className="font-mono break-all text-ink mt-0.5">{expectedSha.slice(0, 24)}…</dd>
          </div>
          <div>
            <dt className="text-mut font-bold uppercase tracking-wider text-[9px]">Expected size</dt>
            <dd className="text-ink mt-0.5">{expectedSize ? `${expectedSize.toLocaleString()} bytes (${formatBytes(expectedSize)})` : 'Not specified'}</dd>
          </div>
          {app.apk.versionName || app.version ? (
            <div>
              <dt className="text-mut font-bold uppercase tracking-wider text-[9px]">Version</dt>
              <dd className="text-ink mt-0.5">v{app.apk.versionName || app.version}</dd>
            </div>
          ) : null}
          {app.apk.versionCode ? (
            <div>
              <dt className="text-mut font-bold uppercase tracking-wider text-[9px]">Version code</dt>
              <dd className="text-ink mt-0.5">{app.apk.versionCode}</dd>
            </div>
          ) : null}
          {app.apk.packageId ? (
            <div className="col-span-2">
              <dt className="text-mut font-bold uppercase tracking-wider text-[9px]">Package</dt>
              <dd className="font-mono text-ink mt-0.5">{app.apk.packageId}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".apk,application/vnd.android.package-archive"
            className="sr-only"
            id="apk-verify-file"
            aria-label="Select the downloaded APK file to verify"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.currentTarget.value = '';
            }}
          />
          <label
            htmlFor="apk-verify-file"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-inkbg text-white text-xs font-bold hover:bg-[#E52B32] transition-colors cursor-pointer"
          >
            <FileSearch className="w-4 h-4" aria-hidden />
            Select APK file
          </label>
          {result.state === 'hashing' && (
            <span className="flex items-center gap-1.5 text-xs text-mut" role="status">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              Hashing {result.fileName}…
            </span>
          )}
        </div>

        {result.state === 'done' && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-3 rounded-xl border p-3.5 ${
              result.match && result.sizeMatch
                ? 'bg-[#16A765]/10 border-[#16A765]/40'
                : 'bg-[#E52B32]/10 border-[#E52B32]/40'
            }`}
          >
            <p className="flex items-center gap-2 text-sm font-black">
              {result.match && result.sizeMatch ? (
                <>
                  <ShieldCheck className="w-4.5 h-4.5 text-[#16A765]" aria-hidden />
                  <span className="text-[#16A765]">MATCH — authentic {app.name} release</span>
                </>
              ) : (
                <>
                  <ShieldX className="w-4.5 h-4.5 text-[#E52B32]" aria-hidden />
                  <span className="text-[#E52B32]">
                    {result.match ? 'SIZE MISMATCH' : 'MISMATCH'}
                  </span>
                </>
              )}
            </p>
            <p className="mt-1.5 text-[11px] text-mut">
              Local SHA-256: <span className="font-mono break-all text-ink">{result.localSha}</span>
            </p>
            <p className="mt-1 text-[11px] text-mut">
              Local size: {result.localSize.toLocaleString()} bytes
              {!result.sizeMatch && expectedSize ? (
                <span className="text-[#E52B32] font-bold">
                  {' '}(expected {expectedSize.toLocaleString()})
                </span>
              ) : (
                <CheckCircle2 className="inline w-3 h-3 ml-1 text-[#16A765]" aria-label="size matches" />
              )}
            </p>
            {!result.match && (
              <p className="mt-1.5 text-[11px] text-mut">
                The file does not match the official release checksum. Do not install it — download again from the
                official release page.
              </p>
            )}
          </div>
        )}

        {result.state === 'error' && (
          <p role="alert" className="mt-3 rounded-xl bg-[#E52B32]/10 border border-[#E52B32]/40 p-3 text-xs text-ink">
            {result.message}
          </p>
        )}
      </div>
    </section>
  );
}
