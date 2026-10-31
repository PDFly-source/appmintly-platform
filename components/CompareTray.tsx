'use client';

import Link from 'next/link';
import { Columns3, X } from 'lucide-react';
import { MAX_COMPARE } from '@/lib/compare';
import { useCompareActions } from '@/lib/useCompare';

/**
 * Sticky compare summary for the Explore surface: selection count, a single
 * primary action and a clear-all. Hidden entirely when empty so it never
 * competes with the bottom navigation.
 */
export function CompareTray() {
  const { ids, clear } = useCompareActions();
  if (ids.length === 0) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-40 px-3 sm:px-4 pointer-events-none"
      role="region"
      aria-label="Comparison selection"
    >
      <div className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border border-line bg-card/95 p-2 shadow-xl backdrop-blur-md">
        <span className="ml-1 inline-flex items-center gap-1.5 text-xs font-bold text-ink">
          <Columns3 className="h-4 w-4 text-cta" aria-hidden="true" />
          <span data-testid="compare-count">
            {ids.length}/{MAX_COMPARE}
          </span>
          <span className="hidden sm:inline text-mut font-semibold">selected</span>
        </span>
        <Link
          href="/compare"
          className="btn-cta ml-auto inline-flex h-10 items-center justify-center rounded-full px-4 text-xs font-bold"
        >
          Compare
        </Link>
        <button
          type="button"
          onClick={clear}
          aria-label="Clear comparison selection"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-mut transition hover:text-ink hover:border-ink/25 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
