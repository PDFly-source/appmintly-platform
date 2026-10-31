/**
 * Item 10 — personalization storage (browser side of the pure model).
 *
 * Mirrors the conventions already used by lib/app-installs.ts and
 * lib/compare.ts: one versioned key, a safe reader that can never throw,
 * a writer that validates before persisting, a same-tab event and a
 * cross-tab 'storage' listener.
 *
 * Guarantees:
 *  - Reading never throws and never half-applies a corrupt payload: it parses,
 *    sanitizes, and falls back to a clean empty state with a logged reason.
 *  - Writing always sanitizes first, so a caller cannot persist an out-of-range
 *    or malformed state even by accident.
 *  - Clearing touches only `appmintly.personalization.v1`. Favourites, Lab
 *    wishlist, compare, update watch, installs, reactions and notification
 *    state are separate keys and are never touched here.
 */

import {
  PERSONALIZATION_EVENT,
  PERSONALIZATION_SCHEMA_VERSION,
  PERSONALIZATION_STORAGE_KEY,
  type PersonalizationState,
  type SanitizeResult,
  emptyPersonalization,
  parsePersonalization,
  sanitizePersonalization,
  serializePersonalization,
} from './model';

export { PERSONALIZATION_EVENT, PERSONALIZATION_STORAGE_KEY, PERSONALIZATION_SCHEMA_VERSION };

interface CacheEntry {
  raw: string | null;
  result: SanitizeResult;
}

let cache: CacheEntry | null = null;

function hasWindow(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/** True when this browser can persist personalization at all. */
export function isPersonalizationAvailable(): boolean {
  if (!hasWindow()) return false;
  try {
    const probe = '__appmintly_personalization_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** Read the raw stored string without parsing (used by tests and diagnostics). */
export function readPersonalizationRaw(): string | null {
  if (!hasWindow()) return null;
  try {
    return window.localStorage.getItem(PERSONALIZATION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export interface LoadResult extends SanitizeResult {
  /** True when a stored payload existed but could not be used as-is. */
  recovered: boolean;
}

/**
 * Load the current state. Never throws. A payload that is corrupt, from a
 * future version, or full of invalid values yields a usable state and reports
 * what happened in `dropped` / `reset` / `reason`.
 */
export function loadPersonalizationDetailed(now: number = Date.now()): LoadResult {
  if (!hasWindow()) {
    return { state: emptyPersonalization(), dropped: 0, reset: false, reason: null, recovered: false };
  }
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(PERSONALIZATION_STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (cache && cache.raw === raw && cache.result.state.version === PERSONALIZATION_SCHEMA_VERSION) {
    return { ...cache.result, recovered: cache.result.reset || cache.result.dropped > 0 };
  }
  const result = parsePersonalization(raw, now);
  cache = { raw, result };
  if (result.reset) {
    console.warn(
      `appmintly-personalization: stored state was reset (${result.reason ?? 'unknown'}). ` +
        'Existing data is left on disk until the next successful write.'
    );
  }
  return { ...result, recovered: result.reset || result.dropped > 0 };
}

/** Convenience reader used by UI code. */
export function loadPersonalization(now: number = Date.now()): PersonalizationState {
  return loadPersonalizationDetailed(now).state;
}

function emit(): void {
  if (!hasWindow()) return;
  try {
    window.dispatchEvent(new Event(PERSONALIZATION_EVENT));
  } catch {
    /* dispatching must never break a write */
  }
}

/** Persist a state. Sanitizes first; returns false when storage is unavailable. */
export function savePersonalization(state: PersonalizationState): boolean {
  if (!hasWindow()) return false;
  const safe = sanitizePersonalization(state).state;
  const raw = serializePersonalization(safe);
  try {
    window.localStorage.setItem(PERSONALIZATION_STORAGE_KEY, raw);
    cache = { raw, result: { state: safe, dropped: 0, reset: false, reason: null } };
    emit();
    return true;
  } catch (err) {
    console.error('appmintly-personalization: could not persist state', err);
    return false;
  }
}

/**
 * Apply a pure reducer to the stored state and persist the result. The reducer
 * receives a freshly sanitized state, so it can never see garbage.
 */
export function updatePersonalization(
  mutate: (state: PersonalizationState) => PersonalizationState,
  now: number = Date.now()
): PersonalizationState {
  const current = loadPersonalization(now);
  const next = mutate(current);
  if (next === current) return current;
  savePersonalization(next);
  return sanitizePersonalization(next).state;
}

/** Explicit user action only: remove this key. No other key is touched. */
export function clearPersonalization(): boolean {
  if (!hasWindow()) return false;
  try {
    window.localStorage.removeItem(PERSONALIZATION_STORAGE_KEY);
    cache = { raw: null, result: { state: emptyPersonalization(), dropped: 0, reset: false, reason: null } };
    emit();
    return true;
  } catch (err) {
    console.error('appmintly-personalization: could not clear state', err);
    return false;
  }
}

/**
 * Subscribe to personalization changes: same-tab writes (custom event) and
 * writes from another tab (`storage` event for this key only).
 */
export function subscribePersonalization(callback: () => void): () => void {
  if (!hasWindow()) return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== PERSONALIZATION_STORAGE_KEY) return;
    cache = null;
    callback();
  };
  const onLocal = () => {
    cache = null;
    callback();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(PERSONALIZATION_EVENT, onLocal);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(PERSONALIZATION_EVENT, onLocal);
  };
}
