'use client';

/**
 * AppMintly — Notification settings (Automatic App Update & Smart Notifications).
 *
 * HONEST capability notes shown to the user in this UI:
 *  - Browser/PWA mode: notifications are delivered while AppMintly is open
 *    in this browser. There is no push sender in this deployment (adding
 *    one requires an approved server-side push service), so delivery while
 *    the site is CLOSED cannot be claimed.
 *  - Inside the official AppMintly Android APK (when the native bridge is
 *    present), the native six-hour background checker shares these same
 *    preferences and tracked apps.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { Bell, ShieldAlert, ShieldCheck, Smartphone, Globe2, RefreshCw, Trash2, CheckCircle2, XCircle, Circle, ListChecks } from 'lucide-react';
import { useNotifications, type PermissionState } from '@/components/NotificationsProvider';
import { describeCheck } from '@/lib/notifications/engine';

const meta = {
  title: 'Notifications — AppMintly',
  description: 'Manage AppMintly update and release notifications.',
};

export default function NotificationsPage() {
  const n = useNotifications();
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ ok: boolean; count: number; shown: number } | null>(null);

  const onEnable = async () => {
    const result = await n.enableNotifications();
    if (result === 'granted') setCheckMessage('Notification permission granted for this browser.');
    else if (result === 'denied') setCheckMessage('The browser denied notifications. You can re-enable them in the browser site settings.');
    else if (result === 'unsupported') setCheckMessage('This browser does not support notifications.');
    else setCheckMessage('A permission dialog was opened on your device. Check the AppMintly app notification settings.');
  };

  const onCheckNow = async () => {
    setCheckMessage('Checking the published catalog…');
    const result = await n.checkNow();
    setLastResult({ ok: result.ok, count: result.events.length, shown: result.shown });
    if (result.ok) {
      const status = describeCheck(result.events.length, result.shown, n.permission === 'granted');
      if (status === 'up-to-date') {
        setCheckMessage('Catalog checked — you are up to date. No new releases or updates.');
      } else if (status === 'delivered') {
        setCheckMessage(`Catalog checked — ${result.shown} notification${result.shown === 1 ? '' : 's'} delivered.`);
      } else if (status === 'waiting') {
        // Eligible events exist but none could be shown: keep them pending,
        // never claim "up to date", and never re-prompt for permission.
        setCheckMessage(`Updates are waiting. Enable notification permission to receive alerts. (${result.events.length - result.shown} waiting)`);
      } else {
        setCheckMessage(`Catalog checked — ${result.shown} delivered, ${result.events.length - result.shown} delivery failed and will retry on the next check.`);
      }
    } else {
      setCheckMessage(`Catalog check failed: ${result.error || 'unknown error'}. Your device may be offline.`);
    }
  };

  const permissionView: Record<PermissionState, { label: string; icon: React.ReactNode; tone: string; hint: string }> = {
    granted: { label: 'Granted', icon: <CheckCircle2 aria-hidden className="w-4 h-4" />, tone: 'text-[#16A765]', hint: 'This browser can show AppMintly notifications.' },
    denied: { label: 'Blocked', icon: <XCircle aria-hidden className="w-4 h-4" />, tone: 'text-[#E52B32]', hint: 'Notifications are blocked by your browser/site settings. AppMintly will not prompt again — re-enable them in the browser site permissions.' },
    default: { label: 'Not requested', icon: <Circle aria-hidden className="w-4 h-4" />, tone: 'text-mut', hint: 'Enable notifications to receive update and release alerts while AppMintly is open.' },
    unsupported: { label: 'Unsupported', icon: <XCircle aria-hidden className="w-4 h-4" />, tone: 'text-mut', hint: 'This browser does not support the Notification API.' },
  };
  const perm = permissionView[n.permission];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-8 sm:py-12">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-card">
          <Bell aria-hidden className="w-5 h-5 text-ink" />
        </span>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight leading-none">
            Notifications
          </h1>
          <p className="mt-1.5 text-sm text-mut">Update and release alerts from the AppMintly marketplace.</p>
        </div>
      </div>

      {/* Permission status */}
      <section aria-labelledby="perm-heading" className="mt-8 rounded-2xl border border-line bg-card p-5 sm:p-6">
        <h2 id="perm-heading" className="text-sm font-bold text-ink">Device notification permission</h2>
        <p className={`mt-3 inline-flex items-center gap-1.5 text-xs font-bold ${perm.tone}`} role="status">
          {perm.icon} {perm.label}
        </p>
        <p className="mt-2 text-xs text-mut leading-relaxed">{perm.hint}</p>
        <p className="mt-2 text-xs text-mut leading-relaxed">
          {n.nativeAvailable
            ? 'You are inside the official AppMintly Android app: enabling notifications grants the Android notification permission and activates the six-hour background update checker.'
            : 'Why we need it: notifications let you learn about app updates and new releases without repeatedly opening AppMintly. Nothing is sent anywhere while you are offline.'}
        </p>
        {n.permission !== 'granted' && n.permission !== 'unsupported' && (
          <button
            onClick={onEnable}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-ink px-5 text-xs font-bold text-[#FFFDF8] transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-cta/60"
          >
            <Bell aria-hidden className="w-4 h-4" /> Enable notifications
          </button>
        )}
      </section>

      {/* Preferences */}
      <section aria-labelledby="prefs-heading" className="mt-4 rounded-2xl border border-line bg-card p-5 sm:p-6">
        <h2 id="prefs-heading" className="text-sm font-bold text-ink">What you want to hear about</h2>
        <ul className="mt-4 space-y-1">
          <Toggle
            label="Master switch"
            description="Turn all AppMintly notifications on or off."
            checked={n.prefs.master}
            onChange={(v) => n.setPrefs({ master: v })}
          />
          <Toggle
            label="Updates to my tracked apps"
            description="Alerts when an app you track receives a newer published version."
            checked={n.prefs.updates}
            disabled={!n.prefs.master}
            onChange={(v) => n.setPrefs({ updates: v })}
          />
          <li className="pt-1">
            <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-mut">New releases</p>
          </li>
          <Toggle
            label="New Android apps"
            description="When a new Android application is published on AppMintly."
            icon={<Smartphone aria-hidden className="w-4 h-4" />}
            checked={n.prefs.newAndroid}
            disabled={!n.prefs.master}
            onChange={(v) => n.setPrefs({ newAndroid: v })}
          />
          <Toggle
            label="New web apps and PWAs"
            description="When a new Web App or PWA is published on AppMintly."
            icon={<Globe2 aria-hidden className="w-4 h-4" />}
            checked={n.prefs.newWeb}
            disabled={!n.prefs.master}
            onChange={(v) => n.setPrefs({ newWeb: v })}
          />
          <li className="pt-1">
            <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-mut">Important and security updates</p>
          </li>
          <Toggle
            label="Important updates"
            description="Releases the publisher classified as important."
            icon={<ShieldAlert aria-hidden className="w-4 h-4" />}
            checked={n.prefs.important}
            disabled={!n.prefs.master}
            onChange={(v) => n.setPrefs({ important: v })}
          />
          <Toggle
            label="Security updates"
            description="Security and critical fixes for apps you track."
            icon={<ShieldCheck aria-hidden className="w-4 h-4" />}
            checked={n.prefs.security}
            disabled={!n.prefs.master}
            onChange={(v) => n.setPrefs({ security: v })}
          />
        </ul>
      </section>

      {/* Tracked apps */}
      <section aria-labelledby="tracked-heading" className="mt-4 rounded-2xl border border-line bg-card p-5 sm:p-6">
        <h2 id="tracked-heading" className="text-sm font-bold text-ink">My tracked apps</h2>
        <p className="mt-2 text-xs text-mut leading-relaxed">
          Apps you track are checked for newer published versions. The version you record is treated as your installed
          version — AppMintly cannot see what is actually installed on your device.
        </p>
        {n.tracked.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-5 text-xs text-mut">
            No tracked apps yet. Open any app page and use “Update alerts” to track it.
          </p>
        ) : (
          <ul className="mt-4 space-y-1.5">
            {n.tracked.map((t) => (
              <li key={t.appId} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
                <div className="min-w-0">
                  <Link href={`/app/${t.appId}/`} className="block truncate text-sm font-bold text-ink hover:underline">
                    {t.appId}
                  </Link>
                  <p className="mt-0.5 text-[11px] text-mut">
                    Recorded version {t.version}
                    {t.packageId ? ` · ${t.packageId}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => n.untrackApp(t.appId)}
                  className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border border-line px-3 text-[11px] font-bold text-mut transition hover:text-[#E52B32] focus:outline-none focus:ring-2 focus:ring-cta/60"
                  aria-label={`Stop tracking ${t.appId}`}
                >
                  Untrack
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Check status */}
      <section aria-labelledby="check-heading" className="mt-4 rounded-2xl border border-line bg-card p-5 sm:p-6">
        <h2 id="check-heading" className="text-sm font-bold text-ink">Catalog check</h2>
        <p className="mt-2 text-xs text-mut leading-relaxed">
          {n.nativeAvailable
            ? 'Inside the Android app, the catalog is also checked automatically about every six hours in the background (Android may delay the check to save battery).'
            : 'In the browser, the catalog is checked automatically while AppMintly is open. Notifications while the site is closed are not supported in this deployment — there is no push sender, by design.'}
        </p>
        <p className="mt-3 text-xs text-mut" role="status" aria-live="polite">
          {n.lastCheck
            ? `Last check: ${new Date(n.lastCheck).toLocaleString()} — ${n.lastCheckOk ? 'succeeded' : 'failed (offline or catalog unreachable)'}.${n.lastRevision ? ` Revision ${n.lastRevision}.` : ''}`
            : 'No catalog check has run in this browser yet.'}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={onCheckNow}
            disabled={n.checking}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-ink px-5 text-xs font-bold text-[#FFFDF8] transition hover:opacity-90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-cta/60"
          >
            <RefreshCw aria-hidden className={`w-4 h-4 ${n.checking ? 'animate-spin' : ''}`} />
            {n.checking ? 'Checking…' : 'Check for updates now'}
          </button>
          <button
            onClick={() => {
              n.clearHistory();
              setCheckMessage('Notification history cleared. Preferences were reset and the next check starts fresh.');
              setLastResult(null);
            }}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-line px-5 text-xs font-bold text-mut transition hover:text-ink focus:outline-none focus:ring-2 focus:ring-cta/60"
          >
            <Trash2 aria-hidden className="w-4 h-4" /> Clear history
          </button>
        </div>
        {checkMessage && (
          <p className="mt-3 text-xs text-ink" role="status" aria-live="polite">
            {checkMessage}
          </p>
        )}
        {lastResult?.ok && (
          <p className="mt-2 text-xs text-mut">
            <ListChecks aria-hidden className="mr-1 inline w-4 h-4" />
            {lastResult.count === lastResult.shown
              ? `${lastResult.count} eligible event${lastResult.count === 1 ? '' : 's'} in this check, delivered as device notifications.`
              : `${lastResult.count} eligible event${lastResult.count === 1 ? '' : 's'} in this check; ${lastResult.shown} delivered, ${lastResult.count - lastResult.shown} pending — pending alerts retry on later checks and appear once notification permission is granted.`}
          </p>
        )}
      </section>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
  icon,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="flex w-full items-center justify-between gap-4 rounded-xl px-2 py-3 text-left transition hover:bg-page focus:outline-none focus-visible:ring-2 focus-visible:ring-cta/60 disabled:opacity-50"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
            {icon} {label}
          </span>
          <span className="mt-0.5 block text-xs text-mut leading-snug">{description}</span>
        </span>
        <span
          aria-hidden
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
            checked ? 'border-ink bg-ink' : 'border-line bg-page'
          }`}
        >
          <span
            className={`absolute h-4.5 w-4.5 rounded-full bg-[#FFFDF8] shadow-sm transition-all ${checked ? 'left-[22px]' : 'left-[3px]'}`}
            style={{ height: 18, width: 18 }}
          />
        </span>
      </button>
    </li>
  );
}
