'use client';

/**
 * Item 10 / Batch 2 — hydration-safe Recently Viewed hook.
 *
 * The server render and the first client render both use an empty history, so
 * the markup always matches. Stored history is loaded in an effect, then kept
 * in sync through the personalization store's own event and the cross-tab
 * `storage` listener, which means a visit in another tab updates this page.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CatalogAppLike, PersonalizationState } from './model';
import { emptyPersonalization } from './model';
import { loadPersonalization, subscribePersonalization } from './store';
import {
  clearRecentlyViewed,
  forgetVisit,
  resolveVisibleRecent,
  setRecentRecording,
  type VisibleRecent,
} from './visits';

export interface UseRecentlyViewedResult<T extends CatalogAppLike> {
  /** False during SSR and the first client render; true once storage was read. */
  ready: boolean;
  /** Published history only, newest first. */
  items: VisibleRecent<T>[];
  /** Stored entries hidden because the app is unpublished or gone. */
  hidden: number;
  enabled: boolean;
  /** Number of stored entries, including hidden ones. */
  storedCount: number;
  clear: () => void;
  remove: (slug: string) => void;
  setEnabled: (enabled: boolean) => void;
}

export function useRecentlyViewed<T extends CatalogAppLike>(
  catalog: T[]
): UseRecentlyViewedResult<T> {
  const [state, setState] = useState<PersonalizationState>(emptyPersonalization);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Deferred one tick (same pattern as the Library's mount guard) so the
    // first client render matches the server HTML exactly.
    const timer = setTimeout(() => {
      setState(loadPersonalization());
      setReady(true);
    }, 0);
    const unsubscribe = subscribePersonalization(() => setState(loadPersonalization()));
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  const visible = useMemo(() => resolveVisibleRecent(catalog, state), [catalog, state]);

  const clear = useCallback(() => setState(clearRecentlyViewed()), []);
  const remove = useCallback((slug: string) => setState(forgetVisit(slug)), []);
  const setEnabled = useCallback((enabled: boolean) => setState(setRecentRecording(enabled)), []);

  return {
    ready,
    items: visible.items,
    hidden: visible.hidden,
    enabled: state.preferences.recentEnabled,
    storedCount: state.recent.length,
    clear,
    remove,
    setEnabled,
  };
}
