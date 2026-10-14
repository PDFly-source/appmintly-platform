/**
 * Phase 1B — regression tests for lib/app-reactions.ts (Quick Reactions).
 *
 * Covers the honest local-only reaction contract:
 *  - fixed reaction vocabulary: unknown values in storage are dropped,
 *    never rendered or guessed
 *  - versioned schema with safe parsing (corrupt JSON, wrong shape,
 *    foreign schemaVersion degrade to an empty store)
 *  - one reaction per app per browser: toggle removes, switch replaces
 *  - the scope label is exported for every reaction UI to render
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  parseReactionStore,
  getReaction,
  toggleReaction,
  useReaction,
  isReactionType,
  REACTION_TYPES,
  REACTION_SCOPE_LABEL,
  REACTIONS_SCHEMA_VERSION,
} from '../lib/app-reactions';

describe('reaction vocabulary — fixed and validated', () => {
  it('has exactly the four Phase 1B reactions', () => {
    expect(REACTION_TYPES).toEqual(['like', 'love', 'celebrate', 'insightful']);
  });

  it('accepts the known reactions, rejects everything else', () => {
    for (const r of REACTION_TYPES) expect(isReactionType(r)).toBe(true);
    expect(isReactionType('clap')).toBe(false);
    expect(isReactionType('')).toBe(false);
    expect(isReactionType(42)).toBe(false);
    expect(isReactionType(null)).toBe(false);
  });
});

describe('parseReactionStore — safe, versioned parsing', () => {
  it('empty/null input yields an empty store', () => {
    expect(parseReactionStore(null)).toEqual({ schemaVersion: REACTIONS_SCHEMA_VERSION, apps: {} });
    expect(parseReactionStore('')).toEqual({ schemaVersion: REACTIONS_SCHEMA_VERSION, apps: {} });
  });

  it('parses a valid store', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      apps: { appmintly: { reaction: 'like', reactedAt: 1700000000000 } },
    });
    const store = parseReactionStore(raw);
    expect(store.apps['appmintly'].reaction).toBe('like');
  });

  it('corrupt JSON degrades to an empty store', () => {
    expect(parseReactionStore('not json at all')).toEqual({ schemaVersion: 1, apps: {} });
  });

  it('wrong root shape degrades to an empty store', () => {
    expect(parseReactionStore('42')).toEqual({ schemaVersion: 1, apps: {} });
    expect(parseReactionStore('{"apps":{}}')).toEqual({ schemaVersion: 1, apps: {} });
  });

  it('foreign/future schemaVersion degrades to an empty store (no guessing)', () => {
    expect(
      parseReactionStore(
        JSON.stringify({ schemaVersion: 99, apps: { a: { reaction: 'like', reactedAt: 1 } } })
      )
    ).toEqual({ schemaVersion: 1, apps: {} });
  });

  it('unknown reaction values in storage are dropped — never guessed', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      apps: {
        good: { reaction: 'love', reactedAt: 1 },
        unknown: { reaction: 'clap', reactedAt: 1 },
        malformed: { reaction: 'like', reactedAt: 'nope' },
      },
    });
    const store = parseReactionStore(raw);
    expect(Object.keys(store.apps)).toEqual(['good']);
  });
});

describe('reaction toggling (stubbed localStorage)', () => {
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

  it('starts with no reaction', () => {
    expect(getReaction('appmintly')).toBe(null);
  });

  it('selecting, toggling off, and switching work as one-reaction-per-app', () => {
    // select
    expect(toggleReaction('appmintly', 'like')).toBe('like');
    expect(getReaction('appmintly')).toBe('like');

    // switch to another
    expect(toggleReaction('appmintly', 'celebrate')).toBe('celebrate');
    expect(getReaction('appmintly')).toBe('celebrate');

    // toggle the selected one off
    expect(toggleReaction('appmintly', 'celebrate')).toBe(null);
    expect(getReaction('appmintly')).toBe(null);
  });

  it('invalid reaction ids never mutate the store', () => {
    expect(toggleReaction('appmintly', 'clap' as never)).toBe(null);
    expect(getReaction('appmintly')).toBe(null);
  });

  it('reactions are independent per app', () => {
    toggleReaction('appmintly', 'love');
    toggleReaction('niramay', 'insightful');
    expect(getReaction('appmintly')).toBe('love');
    expect(getReaction('niramay')).toBe('insightful');
    toggleReaction('appmintly', 'love');
    expect(getReaction('niramay')).toBe('insightful');
    expect(getReaction('appmintly')).toBe(null);
  });

  it('the honest scope label is exported and mentions local-only', () => {
    expect(REACTION_SCOPE_LABEL).toContain('this device only');
    expect(REACTION_SCOPE_LABEL.toLowerCase()).toContain('no global totals');
  });

  it('exports a React hook surface', () => {
    expect(typeof useReaction).toBe('function');
  });
});
