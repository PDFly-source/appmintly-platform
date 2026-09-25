'use client';

/**
 * Phase 11.6 Parts J & S — Publisher-facing "APK Security Check".
 *
 * Displays the MANDATORY pre-publish security gate. The gate itself runs
 * centrally inside the release pipeline (GitHub Actions) using ONE
 * validator (lib/apk-validator.ts); this panel renders the authoritative
 * evidence that validator stored with the release. There is no second
 * security system, and no console path can skip or bypass the gate —
 * Featured, Original, Verified Publisher, Draft, Preview, Edit, Re-upload
 * or manual publish all run the exact same central checks.
 *
 * Honest wording only: "Play Protect-ready build checks passed" means the
 * AppMintly pipeline's technical checks passed. It does NOT mean Google has
 * pre-approved or certified the APK. No "Google Play Protect Certified",
 * "Google Approved" or "guaranteed" claims are ever shown.
 */
import React from 'react';
import { ShieldCheck, ShieldAlert, CheckCircle2, CircleDashed, Loader2 } from 'lucide-react';
import { AppItem } from '@/data/apps';

interface ApkSecurityCheckPanelProps {
  apk: AppItem['apk'];
  /** True while a production build is running through the central gate. */
  isBuilding: boolean;
}

const CHECKS: Array<{ key: string; label: string }> = [
  { key: 'target', label: 'Modern Android Target' },
  { key: 'signing', label: 'Production Signed' },
  { key: 'release', label: 'Release Build' },
  { key: 'flags', label: 'No Debug/Test Flags' },
  { key: 'perms', label: 'Permission Check' },
  { key: 'secrets', label: 'Secret Scan' },
  { key: 'devurls', label: 'Development URL Scan' },
  { key: 'integrity', label: 'APK Integrity' },
  { key: 'sha', label: 'SHA-256 Generated' },
  { key: 'code', label: 'Version Code Valid' },
  { key: 'identity', label: 'Package Identity Verified' },
];

export function ApkSecurityCheckPanel({ apk, isBuilding }: ApkSecurityCheckPanelProps) {
  const evidence = apk?.securityCheckStatus === 'passed';
  const blocked = apk?.securityCheckStatus === 'failed';
  const pending = !evidence && !blocked;

  const checklist = CHECKS.map(({ key, label }) => {
    if (evidence) return { key, label, state: 'pass' as const };
    if (blocked) return { key, label, state: 'fail' as const };
    return { key, label, state: 'pending' as const };
  });

  return (
    <div className="rounded-2xl border border-line bg-page p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {evidence ? (
            <ShieldCheck className="w-4 h-4 text-[#16A765]" />
          ) : (
            <ShieldAlert className={`w-4 h-4 ${blocked ? 'text-[#E52B32]' : 'text-mut'}`} />
          )}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-ink">
              Pre-Publish Security Scan — APK Security Check
            </h4>
            <p className="text-[11px] text-mut mt-0.5">
              Mandatory fail-closed gate. Every production build (including this one) runs the
              single central validator before release; publishing stops on any failed check.
            </p>
          </div>
        </div>
        {isBuilding && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Security gate running…
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mt-3">
        {checklist.map(({ key, label, state }) => (
          <div key={key} className="flex items-center gap-2 text-[11px]">
            {state === 'pass' && <CheckCircle2 className="w-3.5 h-3.5 text-[#16A765] shrink-0" />}
            {state === 'fail' && <ShieldAlert className="w-3.5 h-3.5 text-[#E52B32] shrink-0" />}
            {state === 'pending' && <CircleDashed className="w-3.5 h-3.5 text-mut shrink-0" />}
            <span
              className={
                state === 'pass'
                  ? 'text-ink font-semibold'
                  : state === 'fail'
                    ? 'text-[#E52B32] font-semibold'
                    : 'text-mut'
              }
            >
              {label}
            </span>
            {state === 'pending' && <span className="text-mut">— awaits validated build</span>}
          </div>
        ))}
      </div>

      {evidence && (
        <div className="mt-3 pt-3 border-t border-line text-[11px] text-mut space-y-1">
          <div>
            <span className="font-bold text-[#16A765]">✓ Ready for Secure Distribution</span> —
            Play Protect-ready build checks passed (validator v{apk?.validatorVersion || '1'}).
          </div>
          <div className="font-mono break-all">
            targetSdk {apk?.targetSdk} · minSdk {apk?.minSdk} · cert CN={apk?.certificateSubject} ·
            signed v1/v2/v3 · scanned {apk?.securityCheckTimestamp}
          </div>
          <div className="italic">
            &quot;Play Protect-ready build checks passed&quot; means AppMintly&apos;s pipeline checks
            passed — it does not mean Google pre-approved this APK. No Featured, Original or
            Verified Publisher status bypasses this gate.
          </div>
        </div>
      )}

      {blocked && (
        <div className="mt-3 pt-3 border-t border-line text-[11px] font-bold text-[#E52B32]">
          ✕ Blocked — Security Check Failed. The release pipeline refused to publish this APK;
          resolve the failed checks above before distributing.
        </div>
      )}

      {pending && (
        <div className="mt-3 pt-3 border-t border-line text-[11px] text-mut">
          Security evidence appears here automatically after the first build passes the central
          gate. The gate cannot be skipped through Featured, Draft, Preview, Manual Publish, Edit,
          Re-upload or Release Manager.
        </div>
      )}
    </div>
  );
}
