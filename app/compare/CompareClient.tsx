'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Columns3, Plus, Trash2, X } from 'lucide-react';
import { APPS } from '@/data/apps';
import { AppIcon } from '@/components/AppIcon';
import { MAX_COMPARE, buildComparison, type ComparableApp } from '@/lib/compare';
import { useCompareActions } from '@/lib/useCompare';

const apps = APPS as unknown as ComparableApp[];

export default function CompareClient() {
  const { ids, remove, clear } = useCompareActions();
  const { apps: selected, rows } = buildComparison(apps, ids);
  const ready = selected.length >= 2;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-10">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <Link
            href="/explore"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-mut transition hover:text-cta"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to Explore
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Compare apps</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-mut">
            Side-by-side, using only published catalog fields. Missing information reads
            &ldquo;Not specified&rdquo; — we never fill gaps with estimates or scores.
          </p>
        </div>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-line bg-card px-4 text-xs font-bold text-ink transition hover:border-ink/25 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Clear
          </button>
        )}
      </div>

      {/* Selection status */}
      <p className="mb-4 text-xs font-semibold text-mut" data-testid="compare-status">
        {selected.length}/{MAX_COMPARE} selected
        {selected.length === 1 ? ' · add one more to compare' : ''}
        {selected.length === 0 ? ' · pick two or three apps in Explore' : ''}
      </p>

      {selected.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card px-6 py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-page text-mut">
            <Columns3 className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold text-ink">Nothing to compare yet</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-mut">
            Open Explore and tap the compare icon on two or three apps. Your selection stays on this
            device.
          </p>
          <Link
            href="/explore"
            className="btn-cta mt-6 inline-flex h-11 items-center justify-center rounded-full px-6 text-xs font-bold"
          >
            Browse apps
          </Link>
        </div>
      ) : (
        <>
          {!ready && (
            <div className="mb-4 rounded-xl border border-line bg-card px-4 py-3 text-xs font-semibold text-ink">
              Select one more app to see a comparison.
            </div>
          )}

          {/* Mobile: stacked per-app cards, no horizontal scrolling */}
          <div className="space-y-3 lg:hidden" data-testid="compare-mobile">
            {selected.map((app) => {
              const key = app.id ?? app.slug;
              return (
                <section key={key} className="rounded-2xl border border-line bg-card p-4">
                  <div className="flex items-start gap-3">
                    <AppIcon src={app.icon} name={app.name} size="md" category={app.category} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/app/${app.slug}`} className="block truncate text-sm font-bold text-ink">
                        {app.name}
                      </Link>
                      <span className="block truncate text-xs text-mut">{app.category}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(key)}
                      aria-label={`Remove ${app.name} from comparison`}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-mut transition hover:text-ink cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <dl className="mt-3 divide-y divide-line/60 border-t border-line/60">
                    {rows.map((row) => (
                      <div key={row.key} className="grid grid-cols-2 gap-3 py-2">
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-mut">{row.label}</dt>
                        <dd className="text-xs leading-relaxed text-ink break-words">{row.values[key]}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
          </div>

          {/* Desktop: comparison table */}
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-card lg:block" data-testid="compare-desktop">
            <table className="w-full border-collapse text-left align-top">
              <caption className="sr-only">Comparison of {selected.length} selected AppMintly apps</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-48 border-b border-line p-4 text-[11px] font-bold uppercase tracking-wide text-mut">
                    Attribute
                  </th>
                  {selected.map((app) => {
                    const key = app.id ?? app.slug;
                    return (
                      <th key={key} scope="col" className="border-b border-l border-line p-4">
                        <div className="flex items-start gap-3">
                          <AppIcon src={app.icon} name={app.name} size="md" category={app.category} />
                          <div className="min-w-0 flex-1">
                            <Link href={`/app/${app.slug}`} className="block truncate text-sm font-bold text-ink hover:text-cta">
                              {app.name}
                            </Link>
                            <span className="block truncate text-xs text-mut">{app.category}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => remove(key)}
                            aria-label={`Remove ${app.name} from comparison`}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-mut transition hover:text-ink cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50"
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="odd:bg-page/40">
                    <th scope="row" className="border-b border-line p-4 align-top text-xs font-bold text-mut">
                      {row.label}
                    </th>
                    {selected.map((app) => (
                      <td
                        key={app.id ?? app.slug}
                        className="border-b border-l border-line p-4 align-top text-xs leading-relaxed text-ink break-words"
                      >
                        {row.values[app.id ?? app.slug]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected.length < MAX_COMPARE && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link
                href="/explore"
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-line bg-card px-4 text-xs font-bold text-ink transition hover:border-cta/50 hover:text-cta"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add another app
              </Link>
              <span className="text-xs text-mut">
                {MAX_COMPARE - selected.length} slot{MAX_COMPARE - selected.length === 1 ? '' : 's'} left
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
