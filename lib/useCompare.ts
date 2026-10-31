'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { APPS } from '@/data/apps';
import {
  MAX_COMPARE,
  loadSelection,
  remainingSlots,
  saveSelection,
  toggleSelection,
  type ComparableApp,
  type ToggleAction,
} from '@/lib/compare';

/**
 * Local comparison selection (browser only). Kept separate from the wishlist
 * storage in lib/localLibrary.ts so the two features can never overwrite each
 * other: different key, different event, different payload shape.
 */
const EVENT = 'appmintly_compare_updated';

const apps = APPS as unknown as ComparableApp[];

const subscribe = (callback: () => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener('storage', callback);
  };
};

const readIds = (): string => {
  if (typeof window === 'undefined') return '[]';
  try {
    const stored = loadSelection(window.localStorage, apps).ids;
    return JSON.stringify(stored);
  } catch {
    return '[]';
  }
};

/** Selected app ids, shared across cards, the tray and the compare page. */
export function useCompareIds(): string[] {
  const snapshot = useSyncExternalStore(
    subscribe,
    readIds,
    () => '[]' // SSR: always empty, hydration-safe
  );
  try {
    return JSON.parse(snapshot) as string[];
  } catch {
    return [];
  }
}

/** True when this specific app is selected for comparison. */
export function useIsComparing(appId: string): boolean {
  return useCompareIds().includes(appId);
}

export function useCompareActions() {
  const ids = useCompareIds();
  const [lastAction, setLastAction] = useState<ToggleAction | null>(null);

  const write = useCallback((next: string[]) => {
    saveSelection(window.localStorage, next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  /* Read the persisted selection at call time rather than the render snapshot:
     two quick taps on different cards happen before React re-renders, and a
     snapshot base silently drops the first tap. */
  const currentIds = useCallback((): string[] => {
    try {
      return loadSelection(window.localStorage, apps).ids;
    } catch {
      return ids;
    }
  }, [ids]);

  const toggle = useCallback(
    (appId: string): ToggleAction => {
      const { ids: next, action } = toggleSelection(currentIds(), appId, apps, MAX_COMPARE);
      if (action === 'added' || action === 'removed') write(next);
      setLastAction(action);
      return action;
    },
    [currentIds, write]
  );

  const remove = useCallback(
    (appId: string) => write(currentIds().filter((id) => id !== appId)),
    [currentIds, write]
  );
  const clear = useCallback(() => write([]), [write]);
  // Repairs stale ids left by an older catalog (unpublished or renamed apps).
  const heal = useCallback(() => {
    const healed = loadSelection(window.localStorage, apps).ids;
    if (JSON.stringify(healed) !== JSON.stringify(ids)) write(healed);
  }, [ids, write]);

  useEffect(() => {
    heal();
    // Run once on mount: a saved selection from a previous catalog is repaired
    // before it can be rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ids, toggle, remove, clear, remaining: remainingSlots(ids, MAX_COMPARE), lastAction };
}
