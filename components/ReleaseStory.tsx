'use client';

/**
 * Phase 1B — Release Story: a narrative timeline for the app detail page,
 * built STRICTLY from actual catalog/release metadata (lib/release-story.ts).
 *
 * Every timeline entry names the record field it was derived from. Sections
 * missing metadata simply render fewer entries — nothing is invented.
 */

import React from 'react';
import { BookOpen, ShieldCheck, Tag } from 'lucide-react';
import { buildReleaseStory } from '@/lib/release-story';
import { hasAuthoritativeApkRelease } from '@/lib/distribution';
import type { AppItem } from '@/data/apps';

export function ReleaseStory({ app }: { app: AppItem }) {
  const story = buildReleaseStory(app);

  // No metadata to narrate -> render nothing (no empty section, no fake story).
  if (story.timeline.length === 0) return null;

  return (
    <section
      className="mt-10 rounded-2xl border border-line bg-card p-5"
      aria-label={`Release story for ${app.name}`}
    >
      <h3 className="flex items-center gap-2 text-ink font-bold mb-1">
        <BookOpen className="w-4 h-4 text-accent-text" aria-hidden />
        Release Story
      </h3>
      <p className="text-xs text-mut mb-5">
        The real history of this release, told only from the verified catalog
        and release pipeline record.
      </p>

      <ol className="relative border-l border-line ml-3 space-y-5" aria-label="Release timeline">
        {story.timeline.map((entry, idx) => (
          <li key={`${entry.label}-${idx}`} className="pl-5 relative">
            <span
              className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-cta border-2 border-card"
              aria-hidden
            />
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-bold text-ink">{entry.label}</span>
              {entry.at && (
                <time className="text-[10px] font-semibold uppercase tracking-wide text-mut">
                  {new Date(entry.at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </time>
              )}
            </div>
            <p className="mt-1 text-xs text-mut leading-relaxed">{entry.detail}</p>
            <details className="mt-1 group">
              <summary className="cursor-pointer text-[10px] text-mut hover:text-mut transition-colors inline-flex items-center gap-1 list-none">
                <Tag className="w-2.5 h-2.5" aria-hidden />
                Evidence: {entry.source}
              </summary>
            </details>
          </li>
        ))}
      </ol>

      {hasAuthoritativeApkRelease(app) && (
        <p className="mt-5 flex items-center gap-1.5 text-[11px] text-mut">
          <ShieldCheck className="w-3.5 h-3.5 text-cta shrink-0" aria-hidden />
          Release evidence is written by the AppMintly release pipeline only —
          this page never edits it.
        </p>
      )}
    </section>
  );
}
