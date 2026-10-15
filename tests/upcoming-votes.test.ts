/**
 * Phase 1B — regression tests for lib/upcoming-votes.ts (AppMintly Lab).
 *
 * Covers the honest local-only voting contract:
 *  - versioned localStorage schema with safe parsing (corrupt JSON, wrong
 *    shape, foreign schemaVersion, malformed records degrade to an empty
 *    store — never a crash, never a guess)
 *  - one vote per app per browser: toggle adds, toggle removes
 *  - votes never claim to be global counts: the store only describes THIS
 *    device, and the scope label is exported for every vote UI to render
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  parseVoteStore,
  pruneOrphanVotes,
  hasVoted,
  toggleVote,
  localVoteCount,
  VOTE_SCOPE_LABEL,
  VOTES_SCHEMA_VERSION,
} from '../lib/upcoming-votes';

describe('parseVoteStore — safe, versioned parsing', () => {
  it('empty/null input yields an empty store', () => {
    expect(parseVoteStore(null)).toEqual({ schemaVersion: VOTES_SCHEMA_VERSION, votes: {} });
    expect(parseVoteStore('')).toEqual({ schemaVersion: VOTES_SCHEMA_VERSION, votes: {} });
  });

  it('parses a valid store', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      votes: { 'publisher-console': { votedAt: 1700000000000 } },
    });
    const store = parseVoteStore(raw);
    expect(store.votes['publisher-console'].votedAt).toBe(1700000000000);
  });

  it('corrupt JSON degrades to an empty store', () => {
    expect(parseVoteStore('{not json')).toEqual({ schemaVersion: 1, votes: {} });
  });

  it('wrong root shape degrades to an empty store', () => {
    expect(parseVoteStore('[1,2,3]')).toEqual({ schemaVersion: 1, votes: {} });
    expect(parseVoteStore('{"votes":{}}')).toEqual({ schemaVersion: 1, votes: {} });
  });

  it('foreign/future schemaVersion degrades to an empty store (no guessing)', () => {
    expect(
      parseVoteStore(JSON.stringify({ schemaVersion: 2, votes: { x: { votedAt: 1 } } }))
    ).toEqual({ schemaVersion: 1, votes: {} });
  });

  it('malformed individual records are dropped, valid ones kept', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      votes: {
        good: { votedAt: 123 },
        bad: { votedAt: 'not-a-number' },
        worse: 'not-an-object',
      },
    });
    const store = parseVoteStore(raw);
    expect(Object.keys(store.votes)).toEqual(['good']);
  });
});

describe('vote toggling (stubbed localStorage)', () => {
  let storage: Map<string, string>;
  let listeners: Array<(e: unknown) => void>;

  beforeEach(() => {
    storage = new Map();
    listeners = [];
    (globalThis as any).window = {
      localStorage: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => void storage.set(k, v),
        removeItem: (k: string) => void storage.delete(k),
      },
      addEventListener: (_: string, cb: (e: unknown) => void) => void listeners.push(cb),
      removeEventListener: () => {},
      dispatchEvent: () => listeners.forEach((cb) => cb({})),
    };
  });
  afterEach(() => {
    delete (globalThis as any).window;
  });

  it('starts unvoted', () => {
    expect(hasVoted('publisher-console')).toBe(false);
    expect(localVoteCount()).toBe(0);
  });

  it('toggle adds the vote, toggle again removes it', () => {
    expect(toggleVote('publisher-console')).toBe(true);
    expect(hasVoted('publisher-console')).toBe(true);
    expect(localVoteCount()).toBe(1);

    expect(toggleVote('publisher-console')).toBe(false);
    expect(hasVoted('publisher-console')).toBe(false);
    expect(localVoteCount()).toBe(0);
  });

  it('votes persist across store re-reads (localStorage round-trip)', () => {
    toggleVote('register');
    expect(hasVoted('register')).toBe(true);
    // A fresh read (simulating a new mount) still sees the vote.
    expect(parseVoteStore(storage.get('appmintly_upcoming_votes_v1') ?? null).votes['register']).toBeTruthy();
  });

  it('votes are independent per app', () => {
    toggleVote('publisher-console');
    toggleVote('pdfly');
    expect(hasVoted('publisher-console')).toBe(true);
    expect(hasVoted('pdfly')).toBe(true);
    expect(localVoteCount()).toBe(2);
    toggleVote('publisher-console');
    expect(hasVoted('publisher-console')).toBe(false);
    expect(hasVoted('pdfly')).toBe(true);
    expect(localVoteCount()).toBe(1);
  });

  it('empty ids are ignored', () => {
    expect(toggleVote('')).toBe(false);
    expect(hasVoted('')).toBe(false);
  });

  it('the honest scope label is exported and mentions local-only', () => {
    expect(VOTE_SCOPE_LABEL).toContain('this device only');
    expect(VOTE_SCOPE_LABEL.toLowerCase()).toContain('no shared vote totals');
  });

  it('pruneOrphanVotes removes only votes for retired roadmap ids', () => {
    toggleVote('billcraft');
    toggleVote('pdfly');           // retired entry
    toggleVote('publisher-console'); // retired entry
    toggleVote('register');
    expect(localVoteCount()).toBe(4);
    const removed = pruneOrphanVotes(['billcraft', 'cartora', 'nutrilens', 'register']);
    expect(removed).toBe(2);
    expect(localVoteCount()).toBe(2);
    expect(hasVoted('billcraft')).toBe(true);
    expect(hasVoted('register')).toBe(true);
    expect(hasVoted('pdfly')).toBe(false);
    expect(hasVoted('publisher-console')).toBe(false);
  });

  it('pruneOrphanVotes is a no-op when there are no stale votes', () => {
    toggleVote('cartora');
    expect(pruneOrphanVotes(['billcraft', 'cartora'])).toBe(0);
    expect(localVoteCount()).toBe(1);
  });
});
