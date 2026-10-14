'use client';

/**
 * Phase 1B — Quick Reactions on app detail pages, local-only.
 *
 * HONESTY RULES:
 *  - Reactions are a LOCAL preference stored in THIS browser. There is no
 *    shared reaction backend, so the UI must never show "total reactions"
 *    or other users' reactions — only this device's selected reaction.
 *  - One reaction per app per browser. Clicking the selected reaction
 *    removes it; clicking another switches it.
 *  - The reaction vocabulary is fixed here. Unknown values in storage are
 *    discarded (never guessed, never rendered).
 *  - Versioned schema with safe parsing: corrupt, malformed, foreign or
 *    future-version data is discarded — never crash.
 *
 * Storage: localStorage, event-driven updates (mirrors lib/app-installs.ts).
 */

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'appmintly_reactions_v1';
const UPDATE_EVENT = 'appmintly_reactions_updated';

/** Schema version — bump + migrate on any breaking change. */
export const REACTIONS_SCHEMA_VERSION = 1;

/** The complete reaction vocabulary — anything else is invalid. */
export const REACTION_TYPES = ['like', 'love', 'celebrate', 'insightful'] as const;

export type ReactionType = (typeof REACTION_TYPES)[number];

export function isReactionType(v: unknown): v is ReactionType {
  return typeof v === 'string' && (REACTION_TYPES as readonly string[]).includes(v);
}

export interface ReactionRecord {
  reaction: ReactionType;
  reactedAt: number;
}

export interface ReactionStore {
  schemaVersion: number;
  apps: Record<string, ReactionRecord>;
}

function emptyStore(): ReactionStore {
  return { schemaVersion: REACTIONS_SCHEMA_VERSION, apps: {} };
}

function isRecord(v: unknown): v is ReactionRecord {
  if (typeof v !== 'object' || v === null) return false;
  return isReactionType((v as Record<string, unknown>).reaction) && typeof (v as Record<string, unknown>).reactedAt === 'number';
}

/**
 * Safe parse: empty store for ANY malformed input (corrupt JSON, wrong
 * shape, unknown reaction values, future schema). Pure + testable.
 */
export function parseReactionStore(raw: string | null): ReactionStore {
  if (!raw) return emptyStore();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return emptyStore();
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion !== REACTIONS_SCHEMA_VERSION) {
      return emptyStore();
    }
    if (typeof obj.apps !== 'object' || obj.apps === null) return emptyStore();
    const apps: Record<string, ReactionRecord> = {};
    for (const [id, rec] of Object.entries(obj.apps)) {
      if (typeof id === 'string' && id && isRecord(rec)) apps[id] = rec;
    }
    return { schemaVersion: REACTIONS_SCHEMA_VERSION, apps };
  } catch {
    return emptyStore();
  }
}

function readStore(): ReactionStore {
  if (typeof window === 'undefined') return emptyStore();
  try {
    return parseReactionStore(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return emptyStore();
  }
}

function writeStore(store: ReactionStore): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new Event(UPDATE_EVENT));
  } catch (err) {
    console.error('app-reactions: could not persist reaction', err);
  }
}

/** This browser's reaction for an app (null when none). */
export function getReaction(appId: string): ReactionType | null {
  if (!appId) return null;
  return readStore().apps[appId]?.reaction ?? null;
}

/**
 * Toggle/switch the reaction for an app.
 * Returns the NEW selection (null = no reaction on this device).
 */
export function toggleReaction(appId: string, reaction: ReactionType): ReactionType | null {
  if (!appId || !isReactionType(reaction)) return getReaction(appId);
  const store = readStore();
  const current = store.apps[appId]?.reaction;
  if (current === reaction) {
    delete store.apps[appId];
    writeStore(store);
    return null;
  }
  store.apps[appId] = { reaction, reactedAt: Date.now() };
  writeStore(store);
  return reaction;
}

/** The honest scope label every reaction UI must display. */
export const REACTION_SCOPE_LABEL =
  'Reactions are saved on this device only. AppMintly has no shared reaction backend, so no global totals are shown.';

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(UPDATE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(UPDATE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

/** React hook: this browser's reaction for an app, no hydration mismatch. */
export function useReaction(appId: string): ReactionType | null {
  return useSyncExternalStore(
    subscribe,
    () => getReaction(appId),
    () => null
  );
}
