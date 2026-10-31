'use client';

/**
 * Item 10 / Batch 3 — one hydration-safe read of the personalization store for
 * the Home, app detail and settings surfaces. Same storage key as Batch 1/2,
 * same-tab + cross-tab sync, and every write goes through the model reducers.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PERSONALIZATION_LIMITS,
  clearRecentHistory,
  emptyPersonalization,
  markAppsSeen,
  resetPersonalization,
  setPersonalizationOptions,
  type CatalogAppLike,
  type PersonalizationPreferences,
  type PersonalizationState,
} from './model';
import { getLocalFavorites } from '@/lib/localLibrary';
import { loadPersonalization, subscribePersonalization, updatePersonalization } from './store';
import {
  hasRecommendationSignal,
  recommendationSignals,
  setCategoriesFromCatalog,
  toggleCatalogCategory,
} from './preferences';

export interface UsePersonalizationResult {
  ready: boolean;
  state: PersonalizationState;
  savedSlugs: string[];
  signal: boolean;
  signals: { views: number; saved: number; categories: number };
  setCategories: (catalog: CatalogAppLike[], categories: unknown[]) => void;
  toggleCategory: (catalog: CatalogAppLike[], category: unknown) => void;
  setOption: (patch: Partial<Pick<PersonalizationPreferences, 'recommendations' | 'recentEnabled'>>) => void;
  clearRecent: () => void;
  markSeen: (slugs: string[]) => void;
  resetAll: () => void;
}

export function usePersonalization(): UsePersonalizationResult {
  const [state, setState] = useState<PersonalizationState>(emptyPersonalization);
  const [savedSlugs, setSavedSlugs] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setState(loadPersonalization());
      setSavedSlugs(getLocalFavorites());
    };
    // Deferred one tick so the first client render matches the server HTML.
    const timer = setTimeout(() => {
      sync();
      setReady(true);
    }, 0);
    const unsubscribe = subscribePersonalization(sync);
    window.addEventListener('appmintly_local_updated', sync);
    return () => {
      clearTimeout(timer);
      unsubscribe();
      window.removeEventListener('appmintly_local_updated', sync);
    };
  }, []);

  const setCategories = useCallback((catalog: CatalogAppLike[], categories: unknown[]) => {
    setState(updatePersonalization((s) => setCategoriesFromCatalog(s, catalog, categories)));
  }, []);
  const toggleCategory = useCallback((catalog: CatalogAppLike[], category: unknown) => {
    setState(updatePersonalization((s) => toggleCatalogCategory(s, catalog, category)));
  }, []);
  const setOption = useCallback(
    (patch: Partial<Pick<PersonalizationPreferences, 'recommendations' | 'recentEnabled'>>) => {
      setState(updatePersonalization((s) => setPersonalizationOptions(s, patch)));
    },
    []
  );
  const clearRecent = useCallback(() => {
    setState(updatePersonalization((s) => clearRecentHistory(s)));
  }, []);
  const markSeen = useCallback((slugs: string[]) => {
    setState(updatePersonalization((s) => markAppsSeen(s, slugs)));
  }, []);
  const resetAll = useCallback(() => {
    setState(updatePersonalization(() => resetPersonalization()));
  }, []);

  const signals = useMemo(() => recommendationSignals(state, savedSlugs), [state, savedSlugs]);
  const signal = useMemo(() => hasRecommendationSignal(state, savedSlugs), [state, savedSlugs]);

  return {
    ready,
    state,
    savedSlugs,
    signal,
    signals,
    setCategories,
    toggleCategory,
    setOption,
    clearRecent,
    markSeen,
    resetAll,
  };
}

export const PERSONALIZATION_LIMIT_CATEGORIES = PERSONALIZATION_LIMITS.categories;
