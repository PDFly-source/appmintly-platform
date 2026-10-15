'use client';

/**
 * Lab wishlist — save/remove upcoming apps (AppMintly Lab), local-only.
 *
 * HONESTY RULES (mirrors lib/upcoming-votes.ts):
 *  - AppMintly has NO shared wishlist backend. A saved app is a LOCAL
 *    preference stored in THIS browser's localStorage — the same
 *    device-only scope as Lab votes, with the same honest labelling.
 *  - One saved entry per upcoming app per browser: toggling adds or
 *    removes it. No fabricated totals, no "N people saved this".
 *  - Versioned schema with safe parsing: corrupt, malformed, foreign or
 *    future-version data is discarded — never crash, never guess.
 *
 * Storage: localStorage key below, event-driven updates so every open
 * tab stays in sync.
 */

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'appmintly_upcoming_wishlist_v1';
const UPDATE_EVENT = 'appmintly_upcoming_wishlist_updated';

/** Schema version — bump + migrate on any breaking change. */
export const WISHLIST_SCHEMA_VERSION = 1;

export interface SavedRecord {
  /** When this browser saved the app (epoch ms). */
  savedAt: number;
}

export interface WishlistStore {
  schemaVersion: number;
  saved: Record<string, SavedRecord>;
}

/** The honest scope label every wishlist UI must display. */
export const WISHLIST_SCOPE_LABEL =
  'Saved on this device only — AppMintly has no shared wishlist or account.';

function emptyStore(): WishlistStore {
  return { schemaVersion: WISHLIST_SCHEMA_VERSION, saved: {} };
}

function isRecord(v: unknown): v is SavedRecord {
  if (typeof v !== 'object' || v === null) return false;
  return typeof (v as Record<string, unknown>).savedAt === 'number';
}

/**
 * Safe parse: returns an empty store for ANY malformed input (corrupt JSON,
 * wrong shape, unknown/future schema) instead of throwing or guessing.
 * Pure: no storage access, fully testable.
 */
export function parseWishlistStore(raw: string | null): WishlistStore {
  if (!raw) return emptyStore();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return emptyStore();
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion !== WISHLIST_SCHEMA_VERSION) {
      return emptyStore();
    }
    if (typeof obj.saved !== 'object' || obj.saved === null) return emptyStore();
    const saved: Record<string, SavedRecord> = {};
    for (const [id, rec] of Object.entries(obj.saved as Record<string, unknown>)) {
      if (typeof id === 'string' && id && isRecord(rec)) saved[id] = rec;
    }
    return { schemaVersion: WISHLIST_SCHEMA_VERSION, saved };
  } catch {
    return emptyStore();
  }
}

function readStore(): WishlistStore {
  if (typeof window === 'undefined') return emptyStore();
  try {
    return parseWishlistStore(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return emptyStore();
  }
}

function writeStore(store: WishlistStore): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new Event(UPDATE_EVENT));
  } catch (err) {
    console.error('upcoming-wishlist: could not persist saved app', err);
  }
}

/** Whether THIS browser has saved the upcoming app. */
export function isSaved(upcomingId: string): boolean {
  if (!upcomingId) return false;
  return Boolean(readStore().saved[upcomingId]);
}

/**
 * Toggle the local wishlist entry for an upcoming app.
 * Returns the NEW state (true = saved, false = removed).
 */
export function toggleWishlist(upcomingId: string): boolean {
  if (!upcomingId) return false;
  const store = readStore();
  if (store.saved[upcomingId]) {
    delete store.saved[upcomingId];
    writeStore(store);
    return false;
  }
  store.saved[upcomingId] = { savedAt: Date.now() };
  writeStore(store);
  return true;
}

/**
 * Remove local saved entries for ids that are no longer in the public
 * roadmap. Runs only for THIS browser's own store; returns how many
 * stale entries were removed.
 */
export function pruneOrphanWishlist(validIds: string[]): number {
  if (typeof window === 'undefined') return 0;
  const valid = new Set(validIds);
  const store = readStore();
  const stale = Object.keys(store.saved).filter((id) => !valid.has(id));
  if (stale.length === 0) return 0;
  for (const id of stale) delete store.saved[id];
  writeStore(store);
  return stale.length;
}

/** How many upcoming apps THIS browser has saved (local count only). */
export function localWishlistCount(): number {
  return Object.keys(readStore().saved).length;
}

/** Every saved app id on THIS browser (local list only). */
export function localWishlistIds(): string[] {
  return Object.keys(readStore().saved);
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(UPDATE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(UPDATE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

/** React hook: live saved-state for one upcoming app, no hydration mismatch. */
export function useWishlist(upcomingId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isSaved(upcomingId),
    () => false
  );
}
