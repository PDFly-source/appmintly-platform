'use client';

/**
 * Item 10 / Batch 4 — /library/collections/
 *
 * One static route serving both the personal-collections list and a single
 * collection, selected with `?id=`. A static export cannot enumerate ids that
 * only exist in someone's browser, so the id is read client-side instead of
 * adding a dynamic route.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FolderOpen, Pencil, Trash2, X } from 'lucide-react';
import { AppCard } from '@/components/AppCard';
import { YourCollections } from '@/components/YourCollections';
import { ShareCollectionButton } from '@/components/ShareCollectionButton';
import { useCatalog } from '@/lib/CatalogContext';
import { useToast } from '@/lib/ToastContext';
import {
  COLLECTION_LIMITS,
  deleteCollection,
  removeAppFromCollection,
  renameCollection,
  resolveCollection,
} from '@/lib/personalization/collections';
import { usePersonalization } from '@/lib/personalization/usePersonalization';

export default function CollectionDetailClient() {
  const { publishedApps } = useCatalog();
  const { toast } = useToast();
  const { ready, state, update } = usePersonalization();
  const [id, setId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(window.location.search);
      setId(params.get('id'));
    };
    const timer = setTimeout(read, 0);
    window.addEventListener('popstate', read);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('popstate', read);
    };
  }, []);

  const collection = useMemo(
    () => (id ? resolveCollection(state, publishedApps, id) : null),
    [id, state, publishedApps]
  );

  useEffect(() => {
    if (!ready || !id) return;
    const timer = setTimeout(() => setNotFound(!collection), 0);
    return () => clearTimeout(timer);
  }, [ready, id, collection]);

  const submitRename = useCallback(() => {
    if (!collection) return;
    const result = renameCollection(state, collection.id, renameValue);
    if (!result.changed && result.error) {
      toast(result.error, 'error');
      return;
    }
    if (result.changed) {
      update(() => result.state);
      toast('Collection renamed.', 'success');
    }
    setRenaming(false);
  }, [collection, state, renameValue, toast, update]);

  const removeApp = (slug: string, name: string) => {
    if (!collection) return;
    const result = removeAppFromCollection(state, collection.id, slug);
    if (!result.changed) {
      toast(result.error ?? 'That app could not be removed.', 'error');
      return;
    }
    update(() => result.state);
    toast(`Removed ${name} from “${collection.name}”.`, 'info');
  };

  const removeCollection = () => {
    if (!collection) return;
    const result = deleteCollection(state, collection.id);
    if (!result.changed) {
      toast(result.error ?? 'That collection could not be deleted.', 'error');
      return;
    }
    update(() => result.state);
    toast('Collection deleted.', 'info');
    setConfirmDelete(false);
    window.history.replaceState(null, '', '/library/collections/');
    setId(null);
  };

  if (!ready || id === null) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-sm text-mut">Loading your collections…</p>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <Link href="/library/" className="inline-flex items-center gap-1.5 text-xs font-bold text-mut hover:text-ink">
          <ArrowLeft aria-hidden="true" className="w-4 h-4" />
          Back to Library
        </Link>
        <div className="rounded-2xl border border-line bg-card p-6 text-center space-y-2">
          <FolderOpen aria-hidden="true" className="w-6 h-6 mx-auto text-mut" />
          <h1 className="text-base font-bold text-ink">
            {notFound ? 'This collection is not on this device' : 'Collection not found'}
          </h1>
          <p className="text-xs text-mut">
            Collections live only in the browser that created them. It may have been deleted, or
            you are in a different browser.
          </p>
          <Link
            href="/library/collections/"
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground"
          >
            See your collections
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
      <Link href="/library/" className="inline-flex items-center gap-1.5 text-xs font-bold text-mut hover:text-ink">
        <ArrowLeft aria-hidden="true" className="w-4 h-4" />
        Back to Library
      </Link>

      <header className="space-y-2">
        {renaming ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={COLLECTION_LIMITS.name}
              aria-label="Collection name"
              className="flex-1 min-h-[44px] rounded-xl border border-line bg-card px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRenaming(false)}
                className="min-h-[44px] flex-1 sm:flex-none rounded-xl border border-line bg-card px-4 text-xs font-bold text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitRename}
                className="min-h-[44px] flex-1 sm:flex-none rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold tracking-tight text-ink break-words">
                {collection.name}
              </h1>
              <p className="text-xs text-mut mt-1">
                {collection.apps.length} {collection.apps.length === 1 ? 'app' : 'apps'} · private to
                this browser
                {collection.hidden > 0
                  ? ` · ${collection.hidden} unavailable ${collection.hidden === 1 ? 'app' : 'apps'} hidden`
                  : ''}
              </p>
              {collection.description && (
                <p className="text-sm text-ink/70 mt-2 break-words">{collection.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setRenaming(true);
                  setRenameValue(collection.name);
                }}
                aria-label="Rename collection"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-line bg-card text-mut hover:text-ink"
              >
                <Pencil aria-hidden="true" className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete collection"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-line bg-card text-mut hover:text-forge-red"
              >
                <Trash2 aria-hidden="true" className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </header>

      <div className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-sm font-bold text-ink mb-1">Share this collection</h2>
        <p className="text-[11px] text-mut mb-3">
          Sharing does not change your collection, and it stays in this browser either way.
        </p>
        <ShareCollectionButton
          name={collection.name}
          description={collection.description}
          apps={collection.apps.map((entry) => entry.slug)}
        />
      </div>

      {confirmDelete && (
        <div className="rounded-xl border border-forge-red/30 bg-forge-red/10 p-3 space-y-2">
          <p className="text-xs font-bold text-ink">
            Delete “{collection.name}”? The collection is removed from this browser. The apps
            themselves are unaffected.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="min-h-[44px] flex-1 rounded-xl border border-line bg-card text-xs font-bold text-ink"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={removeCollection}
              className="min-h-[44px] flex-1 rounded-xl bg-forge-red text-white text-xs font-bold"
            >
              Delete collection
            </button>
          </div>
        </div>
      )}

      {collection.apps.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card p-6 text-center space-y-2">
          <FolderOpen aria-hidden="true" className="w-6 h-6 mx-auto text-mut" />
          <p className="text-sm font-bold text-ink">This collection is empty</p>
          <p className="text-xs text-mut">
            Add apps with “Add to collection” on Explore or any app page.
          </p>
          <Link
            href="/explore"
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground"
          >
            Browse apps
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {collection.apps.map((entry) => {
            const record = publishedApps.find(
              (candidate) => candidate.slug.toLowerCase() === entry.slug.toLowerCase()
            );
            if (!record) return null;
            return (
              <li key={entry.slug} className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <AppCard app={record} variant="explore" />
                </div>
                <button
                  type="button"
                  onClick={() => removeApp(entry.slug, record.name)}
                  aria-label={`Remove ${record.name} from ${collection.name}`}
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-line bg-card text-mut hover:text-forge-red"
                >
                  <X aria-hidden="true" className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <YourCollections surface="library" />
    </div>
  );
}
