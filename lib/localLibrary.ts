'use client';

import { useSyncExternalStore } from 'react';

// Client-side helper for localStorage ONLY (Wishlist, Recently Opened, Recently Downloaded).
// Note: localStorage is NOT used as the main public catalog; it is strictly for local user convenience.

const WISHLIST_KEY = 'appforge_local_favorites';
const OPENED_KEY = 'appforge_local_opened';
const DOWNLOADED_KEY = 'appforge_local_downloaded';

export interface LocalHistoryItem {
  appId: string;
  timestamp: number;
}

function safeGet(key: string): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error(`Error reading ${key} from localStorage`, err);
    return [];
  }
}

function safeSet(key: string, value: any[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event('appmintly_local_updated'));
  } catch (err) {
    console.error(`Error saving ${key} to localStorage`, err);
  }
}

// Favorites / Wishlist
export function getLocalFavorites(): string[] {
  return safeGet(WISHLIST_KEY);
}

export function isLocalFavorite(appId: string): boolean {
  const list = getLocalFavorites();
  return list.includes(appId);
}

function subscribeToLocalUpdates(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('appmintly_local_updated', callback);
  return () => window.removeEventListener('appmintly_local_updated', callback);
}

/**
 * React 18/19 hook to subscribe to local favorite status without hydration mismatch or cascading renders.
 */
export function useLocalFavorite(appId: string): boolean {
  return useSyncExternalStore(
    subscribeToLocalUpdates,
    () => isLocalFavorite(appId),
    () => false
  );
}

function subscribeStandalone(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const mql = window.matchMedia('(display-mode: standalone)');
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

/**
 * React 18/19 hook to detect standalone PWA mode without hydration mismatch.
 */
export function useIsStandalone(): boolean {
  return useSyncExternalStore(
    subscribeStandalone,
    () => (typeof window !== 'undefined' ? window.matchMedia('(display-mode: standalone)').matches : false),
    () => false
  );
}

export function toggleLocalFavorite(appId: string): boolean {
  const list = getLocalFavorites();
  const exists = list.includes(appId);
  const updated = exists ? list.filter((id) => id !== appId) : [...list, appId];
  safeSet(WISHLIST_KEY, updated);
  return !exists;
}

// Recently Opened
export function getRecentlyOpened(): LocalHistoryItem[] {
  return safeGet(OPENED_KEY);
}

export function trackAppOpened(appId: string) {
  const current: LocalHistoryItem[] = safeGet(OPENED_KEY);
  const filtered = current.filter((item) => item.appId !== appId);
  const updated: LocalHistoryItem[] = [
    { appId, timestamp: Date.now() },
    ...filtered.slice(0, 19), // Keep top 20
  ];
  safeSet(OPENED_KEY, updated);
}

// Recently Downloaded
export function getRecentlyDownloaded(): LocalHistoryItem[] {
  return safeGet(DOWNLOADED_KEY);
}

export function trackAppDownloaded(appId: string) {
  const current: LocalHistoryItem[] = safeGet(DOWNLOADED_KEY);
  const filtered = current.filter((item) => item.appId !== appId);
  const updated: LocalHistoryItem[] = [
    { appId, timestamp: Date.now() },
    ...filtered.slice(0, 19),
  ];
  safeSet(DOWNLOADED_KEY, updated);
}

// Clear all local data
export function clearAllLocalData() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(WISHLIST_KEY);
    window.localStorage.removeItem(OPENED_KEY);
    window.localStorage.removeItem(DOWNLOADED_KEY);
    window.dispatchEvent(new Event('appmintly_local_updated'));
  } catch (err) {
    console.error('Error clearing local data', err);
  }
}
