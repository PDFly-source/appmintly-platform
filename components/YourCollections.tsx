'use client';

/**
 * Item 10 / Batch 4 — "Your collections" surface.
 *
 * Shared by /library/ and /collections/ so the personal block looks the same in
 * both places. Personal collections are clearly labelled as local and are kept
 * visually separate from the public, catalog-derived collections.
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { FolderPlus, Pencil, Trash2, X, Check, ArrowRight } from 'lucide-react';
import { AppIcon } from '@/components/AppIcon';
import { useCatalog } from '@/lib/CatalogContext';
import { useToast } from '@/lib/ToastContext';
import {
  COLLECTION_LIMITS,
  createCollection,
  deleteCollection,
  renameCollection,
  resolveCollections,
} from '@/lib/personalization/collections';
import { usePersonalization } from '@/lib/personalization/usePersonalization';

interface Props {
  /** 'library' shows the create form inline; 'hub' keeps it to a link. */
  surface?: 'library' | 'hub';
}

export function YourCollections({ surface = 'library' }: Props) {
  const { publishedApps } = useCatalog();
  const { toast } = useToast();
  const { ready, state, update } = usePersonalization();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const collections = useMemo(() => resolveCollections(state, publishedApps), [state, publishedApps]);

  if (!ready) return null;

  const submitCreate = () => {
    const result = createCollection(state, { name, description });
    if (!result.changed) {
      toast(result.error ?? 'That collection could not be created.', 'error');
      return;
    }
    update(() => result.state);
    toast(`Created “${name.trim()}”.`, 'success');
    setName('');
    setDescription('');
    setCreating(false);
  };

  const submitRename = (id: string) => {
    const result = renameCollection(state, id, renameValue);
    if (!result.changed && result.error) {
      toast(result.error, 'error');
      return;
    }
    if (result.changed) {
      update(() => result.state);
      toast('Collection renamed.', 'success');
    }
    setRenaming(null);
    setRenameValue('');
  };

  const remove = (id: string) => {
    const result = deleteCollection(state, id);
    if (!result.changed) {
      toast(result.error ?? 'That collection could not be removed.', 'error');
      return;
    }
    update(() => result.state);
    toast('Collection deleted.', 'info');
    setConfirmDelete(null);
  };

  return (
    <section
      className="rounded-2xl border border-line bg-card p-4 space-y-3"
      aria-labelledby="your-collections"
      data-testid="your-collections"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="your-collections" className="text-sm font-bold text-ink flex items-center gap-1.5">
            <FolderPlus aria-hidden="true" className="w-4 h-4 text-link-text" />
            Your collections
          </h2>
          <p className="text-[11px] text-mut mt-0.5">
            Private to this browser. Nobody else can see them, and nothing is uploaded.
          </p>
        </div>
        {surface === 'library' ? (
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="min-h-[44px] shrink-0 inline-flex items-center gap-1.5 rounded-full border border-line bg-page px-4 text-xs font-bold text-ink hover:border-mut/40 transition"
          >
            <FolderPlus aria-hidden="true" className="w-3.5 h-3.5" />
            New
          </button>
        ) : (
          <Link
            href="/library/"
            className="min-h-[44px] shrink-0 inline-flex items-center gap-1.5 rounded-full border border-line bg-page px-4 text-xs font-bold text-ink hover:border-mut/40 transition"
          >
            Manage
            <ArrowRight aria-hidden="true" className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      {creating && (
        <div className="rounded-xl border border-line bg-page p-3 space-y-2">
          <label htmlFor="collection-name" className="block text-xs font-bold text-ink">
            Collection name
          </label>
          <input
            id="collection-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={COLLECTION_LIMITS.name}
            placeholder="Weekend tools"
            className="w-full min-h-[44px] rounded-xl border border-line bg-card px-3 text-sm text-ink placeholder:text-mut focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={COLLECTION_LIMITS.description}
            placeholder="Optional description"
            className="w-full min-h-[44px] rounded-xl border border-line bg-card px-3 text-sm text-ink placeholder:text-mut focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="min-h-[44px] flex-1 rounded-xl border border-line bg-card text-xs font-bold text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitCreate}
              disabled={name.trim().length === 0}
              className="min-h-[44px] flex-1 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {collections.length === 0 ? (
        <p className="text-xs text-mut">
          No collections yet. Create one here, or use “Add to collection” on any published app.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {collections.map((collection) => (
            <li key={collection.id} className="rounded-xl border border-line bg-page p-3 space-y-2">
              {renaming === collection.id ? (
                <div className="space-y-2">
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    maxLength={COLLECTION_LIMITS.name}
                    aria-label={`New name for ${collection.name}`}
                    className="w-full min-h-[44px] rounded-xl border border-line bg-card px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRenaming(null)}
                      className="min-h-[44px] flex-1 rounded-xl border border-line bg-card text-xs font-bold text-ink"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => submitRename(collection.id)}
                      className="min-h-[44px] flex-1 rounded-xl bg-primary text-primary-foreground text-xs font-bold"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <Link
                    href={`/library/collections/?id=${encodeURIComponent(collection.id)}`}
                    className="block min-w-0"
                  >
                    <span className="block truncate text-sm font-bold text-ink">{collection.name}</span>
                    <span className="block text-[11px] text-mut">
                      {collection.apps.length} {collection.apps.length === 1 ? 'app' : 'apps'}
                      {collection.hidden > 0 ? ` · ${collection.hidden} unavailable` : ''}
                    </span>
                    {collection.description && (
                      <span className="mt-1 block text-[11px] text-mut line-clamp-2">
                        {collection.description}
                      </span>
                    )}
                  </Link>

                  {collection.apps.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      {collection.apps.slice(0, 3).map((entry) => {
                        const record = publishedApps.find(
                          (candidate) => candidate.slug.toLowerCase() === entry.slug.toLowerCase()
                        );
                        if (!record) return null;
                        return (
                          <AppIcon
                            key={entry.slug}
                            src={record.icon}
                            name={record.name}
                            size="sm"
                            category={record.category}
                          />
                        );
                      })}
                      {collection.apps.length > 3 && (
                        <span className="text-[10px] font-bold text-mut">
                          +{collection.apps.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {confirmDelete === collection.id ? (
                    <div className="rounded-lg border border-forge-red/30 bg-forge-red/10 p-2 space-y-2">
                      <p className="text-[11px] font-bold text-ink">
                        Delete “{collection.name}”? This cannot be undone.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className="min-h-[44px] flex-1 rounded-lg border border-line bg-card text-[11px] font-bold text-ink"
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(collection.id)}
                          className="min-h-[44px] flex-1 rounded-lg bg-forge-red text-on-brand text-[11px] font-bold"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRenaming(collection.id);
                          setRenameValue(collection.name);
                        }}
                        aria-label={`Rename ${collection.name}`}
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-line bg-card text-mut hover:text-ink transition"
                      >
                        <Pencil aria-hidden="true" className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(collection.id)}
                        aria-label={`Delete ${collection.name}`}
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-line bg-card text-mut hover:text-accent-text transition"
                      >
                        <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
                      </button>
                      <Link
                        href={`/library/collections/?id=${encodeURIComponent(collection.id)}`}
                        className="min-h-[44px] flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-line bg-card text-[11px] font-bold text-ink hover:border-mut/40 transition"
                      >
                        Open
                        <ArrowRight aria-hidden="true" className="w-3 h-3" />
                      </Link>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] text-mut">
        Removing all personalization in{' '}
        <Link href="/library/settings/" className="font-semibold text-link-text hover:underline">
          Library settings
        </Link>{' '}
        also deletes your collections. Saved apps are unaffected.
      </p>
    </section>
  );
}

export default YourCollections;
