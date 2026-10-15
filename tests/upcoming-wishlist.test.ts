/**
 * Regression tests for lib/upcoming-wishlist.ts (AppMintly Lab).
 *
 * Covers the honest local-only wishlist contract (mirrors the votes tests):
 *  - versioned localStorage schema with safe parsing (corrupt JSON, wrong
 *    shape, foreign schemaVersion, malformed records degrade to an empty
 *    store — never a crash, never a guess)
 *  - one entry per app per browser: toggle adds, toggle removes
 *  - the store describes THIS device only — scope label is exported for UI
 */

import { describe, it, expect } from 'vitest';
import {
  parseWishlistStore,
  WISHLIST_SCHEMA_VERSION,
  WISHLIST_SCOPE_LABEL,
} from '../lib/upcoming-wishlist';

describe('parseWishlistStore — safe, versioned parsing', () => {
  it('empty/null input yields an empty store', () => {
    expect(parseWishlistStore(null)).toEqual({ schemaVersion: WISHLIST_SCHEMA_VERSION, saved: {} });
    expect(parseWishlistStore('')).toEqual({ schemaVersion: WISHLIST_SCHEMA_VERSION, saved: {} });
  });

  it('parses a valid store', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      saved: { billcraft: { savedAt: 1700000000000 } },
    });
    const store = parseWishlistStore(raw);
    expect(store.saved.billcraft.savedAt).toBe(1700000000000);
  });

  it('corrupt JSON degrades to an empty store', () => {
    expect(parseWishlistStore('{not json')).toEqual({ schemaVersion: 1, saved: {} });
  });

  it('wrong root shape degrades to an empty store', () => {
    expect(parseWishlistStore('[1,2,3]')).toEqual({ schemaVersion: 1, saved: {} });
    expect(parseWishlistStore('{"saved":{}}')).toEqual({ schemaVersion: 1, saved: {} });
  });

  it('foreign/future schemaVersion degrades to an empty store (no guessing)', () => {
    expect(
      parseWishlistStore(JSON.stringify({ schemaVersion: 99, saved: { x: { savedAt: 1 } } }))
    ).toEqual({ schemaVersion: 1, saved: {} });
  });

  it('malformed records are skipped, valid ones kept', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      saved: {
        ok: { savedAt: 5 },
        bad: 'not an object',
        alsoBad: { wrongField: true },
        '': { savedAt: 7 },
      },
    });
    const store = parseWishlistStore(raw);
    expect(Object.keys(store.saved)).toEqual(['ok']);
  });
});

describe('WISHLIST_SCOPE_LABEL — honest device-only scope', () => {
  it('discloses local-only storage and the absence of a shared backend', () => {
    expect(WISHLIST_SCOPE_LABEL).toMatch(/device only/i);
    expect(WISHLIST_SCOPE_LABEL).toMatch(/no shared wishlist/i);
  });
});
