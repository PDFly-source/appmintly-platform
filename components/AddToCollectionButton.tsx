'use client';

/**
 * Item 10 / Batch 4 — "Add to collection" control.
 *
 * Used on Explore cards and on app detail pages. Everything it writes goes
 * through the pure collections engine into the existing personalization store.
 * Only published catalog apps can be added, and the same app can never appear
 * twice in one collection.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, FolderPlus, Plus, X } from 'lucide-react';
import { useCatalog } from '@/lib/CatalogContext';
import { useToast } from '@/lib/ToastContext';
import {
  COLLECTION_LIMITS,
  addAppToCollection,
  createCollection,
  resolveCollections,
} from '@/lib/personalization/collections';
import { usePersonalization } from '@/lib/personalization/usePersonalization';

interface Props {
  slug: string;
  name?: string;
  variant?: 'icon' | 'full';
}

export function AddToCollectionButton({ slug, name, variant = 'icon' }: Props) {
  const { publishedApps } = useCatalog();
  const { toast } = useToast();
  const { ready, state, update } = usePersonalization();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const collections = useMemo(() => resolveCollections(state, publishedApps), [state, publishedApps]);
  const published = useMemo(
    () => publishedApps.some((app) => app.slug.toLowerCase() === slug.toLowerCase()),
    [publishedApps, slug]
  );

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!ready || !published) return null;

  const addTo = (id: string, collectionName: string) => {
    const result = addAppToCollection(state, id, slug, publishedApps);
    if (!result.changed) {
      toast(result.error ?? 'That app could not be added.', 'error');
      return;
    }
    update(() => result.state);
    toast(`Added ${name ?? 'app'} to “${collectionName}”.`, 'success');
    close();
  };

  const createAndAdd = () => {
    const created = createCollection(state, { name: newName, description: newDescription });
    if (!created.changed || !created.id) {
      toast(created.error ?? 'That collection could not be created.', 'error');
      return;
    }
    const added = addAppToCollection(created.state, created.id, slug, publishedApps);
    update(() => (added.changed ? added.state : created.state));
    if (!added.changed) {
      toast(added.error ?? 'Collection created, but the app was not added.', 'error');
    } else {
      toast(`Created “${newName}” and added ${name ?? 'app'}.`, 'success');
    }
    setNewName('');
    setNewDescription('');
    close();
  };

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Add ${name ?? 'app'} to a collection`}
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full border border-line bg-card text-mut hover:text-ink hover:border-mut/40 transition"
        >
          <FolderPlus aria-hidden="true" className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-[44px] inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-4 text-xs font-bold text-mut hover:text-ink transition"
        >
          <FolderPlus aria-hidden="true" className="w-4 h-4" />
          Add to collection
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Add to collection"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-line bg-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-ink">Add to collection</h2>
                <p className="text-[11px] text-mut mt-0.5">
                  {name ? `${name} · ` : ''}collections stay in this browser.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-line text-mut hover:text-ink"
              >
                <X aria-hidden="true" className="w-4 h-4" />
              </button>
            </div>

            {collections.length === 0 ? (
              <p className="rounded-xl border border-line bg-page p-3 text-xs text-mut">
                No collections yet. Create your first one below.
              </p>
            ) : (
              <ul className="space-y-2">
                {collections.map((collection) => {
                  const already = collection.apps.some(
                    (app) => app.slug.toLowerCase() === slug.toLowerCase()
                  );
                  return (
                    <li key={collection.id}>
                      <button
                        type="button"
                        disabled={already}
                        onClick={() => addTo(collection.id, collection.name)}
                        className="min-h-[52px] w-full rounded-xl border border-line bg-page px-3 text-left transition hover:border-mut/40 disabled:opacity-60 flex items-center justify-between gap-3"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-ink">{collection.name}</span>
                          <span className="block text-[11px] text-mut">
                            {collection.apps.length} {collection.apps.length === 1 ? 'app' : 'apps'}
                          </span>
                        </span>
                        {already ? (
                          <Check aria-hidden="true" className="w-4 h-4 shrink-0 text-success-text" />
                        ) : (
                          <Plus aria-hidden="true" className="w-4 h-4 shrink-0 text-mut" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="border-t border-line pt-3 space-y-2">
              <label htmlFor="new-collection-name" className="block text-xs font-bold text-ink">
                New collection
              </label>
              <input
                id="new-collection-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={COLLECTION_LIMITS.name}
                placeholder="Weekend tools"
                className="w-full min-h-[44px] rounded-xl border border-line bg-page px-3 text-sm text-ink placeholder:text-mut focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                maxLength={COLLECTION_LIMITS.description}
                placeholder="Optional description"
                className="w-full min-h-[44px] rounded-xl border border-line bg-page px-3 text-sm text-ink placeholder:text-mut focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={createAndAdd}
                disabled={newName.trim().length === 0}
                className="min-h-[44px] w-full rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50"
              >
                Create and add
              </button>
              <p className="text-[10px] text-mut">
                Up to {COLLECTION_LIMITS.collections} collections, {COLLECTION_LIMITS.apps} apps each.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default AddToCollectionButton;
