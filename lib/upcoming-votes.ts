'use client';

/**
 * Phase 1B — Upcoming App votes (AppMintly Lab), local-only.
 *
 * HONESTY RULES:
 *  - AppMintly has NO shared vote backend. A vote is a LOCAL preference
 *    stored in THIS browser's localStorage. It is never presented as a
 *    global count, and the UI must always label it as local-only.
 *  - One vote per upcoming app per browser: toggling adds or removes it.
 *    No fabricated totals, no seeded counts, no "people also voted".
 *  - Versioned schema with safe parsing: corrupt, malformed, foreign or
 *    future-version data is discarded — never crash, never guess.
 *
 * Storage: localStorage key below, event-driven updates so every open tab
 * stays in sync (mirrors lib/app-installs.ts).
 */

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'appmintly_upcoming_votes_v1';
const UPDATE_EVENT = 'appmintly_upcoming_votes_updated';

/** Schema version — bump + migrate on any breaking change. */
export const VOTES_SCHEMA_VERSION = 1;

export interface VoteRecord {
  /** When this browser voted for the app (epoch ms). */
  votedAt: number;
}

export interface VoteStore {
  schemaVersion: number;
  votes: Record<string, VoteRecord>;
}

function emptyStore(): VoteStore {
  return { schemaVersion: VOTES_SCHEMA_VERSION, votes: {} };
}

function isRecord(v: unknown): v is VoteRecord {
  if (typeof v !== 'object' || v === null) return false;
  return typeof (v as Record<string, unknown>).votedAt === 'number';
}

/**
 * Safe parse: returns an empty store for ANY malformed input (corrupt JSON,
 * wrong shape, unknown/future schema) instead of throwing or guessing.
 * Pure: no storage access, fully testable.
 */
export function parseVoteStore(raw: string | null): VoteStore {
  if (!raw) return emptyStore();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return emptyStore();
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion !== VOTES_SCHEMA_VERSION) {
      return emptyStore();
    }
    if (typeof obj.votes !== 'object' || obj.votes === null) return emptyStore();
    const votes: Record<string, VoteRecord> = {};
    for (const [id, rec] of Object.entries(obj.votes)) {
      if (typeof id === 'string' && id && isRecord(rec)) votes[id] = rec;
    }
    return { schemaVersion: VOTES_SCHEMA_VERSION, votes };
  } catch {
    return emptyStore();
  }
}

function readStore(): VoteStore {
  if (typeof window === 'undefined') return emptyStore();
  try {
    return parseVoteStore(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return emptyStore();
  }
}

function writeStore(store: VoteStore): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new Event(UPDATE_EVENT));
  } catch (err) {
    console.error('upcoming-votes: could not persist vote', err);
  }
}

/** Whether THIS browser has voted for the upcoming app. */
export function hasVoted(upcomingId: string): boolean {
  if (!upcomingId) return false;
  return Boolean(readStore().votes[upcomingId]);
}

/**
 * Toggle the local vote for an upcoming app.
 * Returns the NEW state (true = voted, false = vote removed).
 */
export function toggleVote(upcomingId: string): boolean {
  if (!upcomingId) return false;
  const store = readStore();
  if (store.votes[upcomingId]) {
    delete store.votes[upcomingId];
    writeStore(store);
    return false;
  }
  store.votes[upcomingId] = { votedAt: Date.now() };
  writeStore(store);
  return true;
}

/**
 * Remove local votes for ids that are no longer in the public roadmap
 * (e.g. catalog entries retired from the Lab). Runs only for THIS
 * browser's own store; returns how many stale votes were removed.
 * Never touches votes for apps that still exist.
 */
export function pruneOrphanVotes(validIds: string[]): number {
  if (typeof window === 'undefined') return 0;
  const valid = new Set(validIds);
  const store = readStore();
  const stale = Object.keys(store.votes).filter((id) => !valid.has(id));
  if (stale.length === 0) return 0;
  for (const id of stale) delete store.votes[id];
  writeStore(store);
  return stale.length;
}

/**
 * How many upcoming apps THIS browser has voted for. Local count only —
 * it describes this device's interests, never a global tally.
 */
export function localVoteCount(): number {
  return Object.keys(readStore().votes).length;
}

/** The honest scope label every vote UI must display. */
export const VOTE_SCOPE_LABEL =
  'Local vote — no account needed. Saved on this device only; AppMintly has no shared vote totals.';

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(UPDATE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(UPDATE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

/** React hook: live voted-state for one upcoming app, no hydration mismatch. */
export function useUpcomingVote(upcomingId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hasVoted(upcomingId),
    () => false
  );
}
