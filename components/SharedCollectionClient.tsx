'use client';

/**
 * Item 10 / Batch 5 — public, read-only shared collection page.
 *
 * The page is a pure function of the URL plus the authoritative published
 * catalog: it never reads the visitor's localStorage, so a shared link works in
 * a fresh browser. Payload text is sanitized by the decoder and rendered as
 * text; app cards come from catalog records only.
 */

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, FolderOpen, Share2 } from 'lucide-react';
import { AppCard } from '@/components/AppCard';
import { useCatalog } from '@/lib/CatalogContext';
import {
  SHARE_LIMITS,
  decodeSharedCollection,
  resolveSharedCollection,
  type DecodeResult,
} from '@/lib/personalization/share';

export default function SharedCollectionClient() {
  const { publishedApps } = useCatalog();
  const [raw, setRaw] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(window.location.search);
      setRaw(params.get('d'));
    };
    const timer = setTimeout(read, 0);
    window.addEventListener('popstate', read);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('popstate', read);
    };
  }, []);

  const decoded: DecodeResult | null = useMemo(
    () => (raw === undefined ? null : decodeSharedCollection(raw)),
    [raw]
  );

  const resolved = useMemo(() => {
    if (!decoded || !decoded.ok) return null;
    return resolveSharedCollection(decoded.data, publishedApps);
  }, [decoded, publishedApps]);

  if (decoded === null) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <p className="text-sm text-mut">Opening shared collection…</p>
      </div>
    );
  }

  if (!decoded.ok) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-4" data-testid="shared-invalid">
        <Link href="/collections/" className="inline-flex items-center gap-1.5 text-xs font-bold text-mut hover:text-ink">
          <ArrowLeft aria-hidden="true" className="w-4 h-4" />
          Browse collections
        </Link>
        <div className="rounded-2xl border border-line bg-card p-6 text-center space-y-2">
          <AlertTriangle aria-hidden="true" className="w-6 h-6 mx-auto text-mut" />
          <h1 className="text-base font-bold text-ink">This shared link cannot be opened</h1>
          <p className="text-xs text-mut">{decoded.message}</p>
          <p className="text-[11px] text-mut">
            Shared collections are carried entirely inside the link, so a link that was cut short or
            edited will not work. Ask the sender to share it again.
          </p>
          <Link
            href="/explore"
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground"
          >
            Browse the catalog
          </Link>
        </div>
      </div>
    );
  }

  const data = decoded.data;
  const apps = resolved?.apps ?? [];
  const missing = resolved?.missing ?? 0;
  const requested = resolved?.requested ?? data.apps.length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5" data-testid="shared-collection">
      <Link href="/collections/" className="inline-flex items-center gap-1.5 text-xs font-bold text-mut hover:text-ink">
        <ArrowLeft aria-hidden="true" className="w-4 h-4" />
        Browse collections
      </Link>

      <header className="space-y-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-line bg-card text-[10px] font-bold text-mut">
          <Share2 aria-hidden="true" className="w-3 h-3" />
          Shared collection · read-only
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink break-words">
          {data.name}
        </h1>
        {data.description && (
          <p className="text-sm text-ink/70 max-w-2xl break-words">{data.description}</p>
        )}
        <p className="text-xs text-mut">
          {apps.length} {apps.length === 1 ? 'app' : 'apps'} shown
          {missing > 0 ? ` · ${missing} no longer available` : ''}
          {requested === 0 ? ' · this collection was shared empty' : ''}
        </p>
      </header>

      <div className="rounded-xl border border-line bg-card p-3">
        <p className="text-[11px] text-mut">
          Anyone who has this link can open this collection. It is read-only: nothing here is
          editable, and it is not private or password-protected. App details below come from the
          AppMintly catalog, not from the link.
        </p>
      </div>

      {missing > 0 && apps.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-[11px] font-bold text-ink">This collection is partly available</p>
          <p className="text-[11px] text-mut mt-0.5">
            {missing} {missing === 1 ? 'app has' : 'apps have'} been unpublished or removed since
            this link was created, so {missing === 1 ? 'it is' : 'they are'} not shown. The rest of
            the collection is below.
          </p>
        </div>
      )}

      {apps.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card p-6 text-center space-y-2">
          <FolderOpen aria-hidden="true" className="w-6 h-6 mx-auto text-mut" />
          <p className="text-sm font-bold text-ink">
            {requested === 0 ? 'This shared collection is empty' : 'Nothing in this link is available'}
          </p>
          <p className="text-xs text-mut">
            {requested === 0
              ? 'The sender shared a collection that has no apps in it.'
              : 'Every app in this collection has been unpublished or removed from the catalog.'}
          </p>
          <Link
            href="/explore"
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground"
          >
            Browse the catalog
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map((app) => (
            <li key={app.id}>
              <AppCard app={app} variant="explore" />
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-mut">
        Only published catalog apps are shown. A shared link can hold up to {SHARE_LIMITS.apps} apps.
      </p>
    </div>
  );
}
