'use client';

import React, { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

/**
 * /search is a friendly alias for the canonical catalog search at /explore.
 * Static GitHub Pages hosting has no server redirects, so this client page
 * forwards the query string to /explore?q=... immediately on mount.
 */
export default function SearchAliasPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] bg-page text-ink flex items-center justify-center px-4">
          <div className="text-center">
            <Search className="w-10 h-10 mx-auto text-line mb-3" aria-hidden="true" />
            <p className="text-sm font-semibold text-mut">Loading AppMintly search…</p>
          </div>
        </div>
      }
    >
      <SearchAliasRedirect />
    </Suspense>
  );
}

function SearchAliasRedirect() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const q = searchParams.get('q') || '';
  const [redirected, setRedirected] = React.useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setRedirected(true);
      router.replace(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore');
    }, 50);
    return () => clearTimeout(t);
  }, [q, router]);

  return (
    <div className="min-h-[60vh] bg-page text-ink flex items-center justify-center px-4">
      <div className="text-center">
        <Search className="w-10 h-10 mx-auto text-line mb-3" aria-hidden="true" />
        <p className="text-sm font-semibold text-mut">
          {redirected ? 'Opening search results…' : 'Loading AppMintly search…'}
        </p>
        <p className="text-xs text-mut mt-1">
          You will be taken to the catalog explorer{q ? ` for “${q}”` : ''}.
        </p>
      </div>
    </div>
  );
}
