/**
 * Phase 1A — regression tests for lib/app-installs.ts (smart version tracking).
 *
 * Covers the Phase 1A A2 honesty + robustness contract:
 *  - versioned localStorage schema with safe parsing (corrupt JSON, wrong
 *    shape, foreign schemaVersion, malformed records all degrade to an
 *    empty store — never a crash, never a guess)
 *  - record/download/verify/dismiss state transitions
 *  - update detection: newer catalog version => available; same/older =>
 *    not available; no local record => not available (never fabricates an
 *    "installed" version)
 *  - dismissal is per-version (a new release re-shows the notice)
 *  - verified beats downloaded as the best-known version
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseStore,
  computeUpdateInfo,
  knownLocalVersion,
  recordDownloadedVersion,
  recordVerifiedVersion,
  dismissUpdateFor,
  getInstallRecord,
  INSTALLS_SCHEMA_VERSION,
  type InstallRecord,
} from '../lib/app-installs';

describe('parseStore — safe, versioned parsing', () => {
  it('empty/null input yields an empty store', () => {
    expect(parseStore(null)).toEqual({ schemaVersion: INSTALLS_SCHEMA_VERSION, apps: {} });
    expect(parseStore('')).toEqual({ schemaVersion: INSTALLS_SCHEMA_VERSION, apps: {} });
  });
  it('parses a valid store', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      apps: { appmintly: { downloadedVersion: '1.0.9', verifiedVersion: '1.0.9' } },
    });
    const store = parseStore(raw);
    expect(store.apps['appmintly'].downloadedVersion).toBe('1.0.9');
  });
  it('corrupt JSON degrades to an empty store', () => {
    expect(parseStore('{not json')).toEqual({ schemaVersion: 1, apps: {} });
  });
  it('wrong root shape degrades to an empty store', () => {
    expect(parseStore('[1,2,3]')).toEqual({ schemaVersion: 1, apps: {} });
    expect(parseStore('{"apps":{}}')).toEqual({ schemaVersion: 1, apps: {} });
  });
  it('foreign/future schemaVersion degrades to an empty store (no guessing)', () => {
    expect(parseStore(JSON.stringify({ schemaVersion: 2, apps: { x: { downloadedVersion: '1' } } }))).toEqual({
      schemaVersion: 1,
      apps: {},
    });
  });
  it('malformed individual records are dropped, valid ones kept', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      apps: {
        good: { downloadedVersion: '1.0.0' },
        bad: { downloadedVersion: 123 },
        alsoBad: 'nope',
      },
    });
    const store = parseStore(raw);
    expect(Object.keys(store.apps)).toEqual(['good']);
  });
});

describe('computeUpdateInfo — honest update detection', () => {
  it('no local record => no update available (never invents an installed version)', () => {
    expect(computeUpdateInfo(null, '2.0.0')).toEqual({
      available: false,
      previousVersion: '',
      latestVersion: '2.0.0',
      dismissed: false,
    });
  });
  it('newer catalog version => update available', () => {
    const rec: InstallRecord = { downloadedVersion: '1.0.9' };
    const info = computeUpdateInfo(rec, '1.0.10');
    expect(info.available).toBe(true);
    expect(info.previousVersion).toBe('1.0.9');
    expect(info.latestVersion).toBe('1.0.10');
    expect(info.dismissed).toBe(false);
  });
  it('same version => not available', () => {
    expect(computeUpdateInfo({ downloadedVersion: '1.0.9' }, '1.0.9').available).toBe(false);
  });
  it('older catalog version (rollback) => not available', () => {
    expect(computeUpdateInfo({ downloadedVersion: '1.0.9' }, '1.0.8').available).toBe(false);
  });
  it('numeric comparison, not string comparison (1.0.10 > 1.0.9)', () => {
    expect(computeUpdateInfo({ downloadedVersion: '1.0.9' }, '1.0.10').available).toBe(true);
    // string comparison would say "1.0.10" < "1.0.9" — must NOT happen
  });
  it('dismissed is per-version and a new release clears it', () => {
    const rec: InstallRecord = { downloadedVersion: '1.0.9', dismissedForVersion: '1.0.10' };
    expect(computeUpdateInfo(rec, '1.0.10').dismissed).toBe(true);
    expect(computeUpdateInfo(rec, '1.0.11').dismissed).toBe(false);
  });
  it('verified version beats downloaded as previous', () => {
    const rec: InstallRecord = { downloadedVersion: '1.0.8', verifiedVersion: '1.0.9' };
    expect(computeUpdateInfo(rec, '1.0.10').previousVersion).toBe('1.0.9');
    expect(knownLocalVersion(rec)).toBe('1.0.9');
  });
  it('empty latest version => never available', () => {
    expect(computeUpdateInfo({ downloadedVersion: '1.0.9' }, '').available).toBe(false);
  });
});

describe('storage round-trip (stubbed localStorage)', () => {
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
    vi.restoreAllMocks();
  });

  it('record -> read -> verify -> dismiss full lifecycle', () => {
    recordDownloadedVersion('appmintly', '1.0.9');
    let rec = getInstallRecord('appmintly');
    expect(rec?.downloadedVersion).toBe('1.0.9');
    expect(rec?.verifiedVersion).toBeUndefined();

    recordVerifiedVersion('appmintly', '1.0.9', 'ab'.repeat(32));
    rec = getInstallRecord('appmintly');
    expect(rec?.verifiedVersion).toBe('1.0.9');
    expect(rec?.verifiedSha256).toBe('ab'.repeat(32));

    dismissUpdateFor('appmintly', '1.0.10');
    rec = getInstallRecord('appmintly');
    expect(rec?.dismissedForVersion).toBe('1.0.10');
    // earlier fields survive each mutation
    expect(rec?.downloadedVersion).toBe('1.0.9');
    expect(rec?.verifiedVersion).toBe('1.0.9');

    // survives a reload (persisted JSON parses back)
    const raw = storage.get('appmintly_installs_v1') ?? null;
    expect(parseStore(raw).apps['appmintly'].verifiedVersion).toBe('1.0.9');
  });

  it('ignores empty identifiers (never writes junk records)', () => {
    recordDownloadedVersion('', '1.0.0');
    recordDownloadedVersion('x', '');
    recordVerifiedVersion('x', '', 'sha');
    dismissUpdateFor('', '1.0.0');
    expect(getInstallRecord('x')).toBeNull();
    expect(getInstallRecord('')).toBeNull();
  });

  it('each browser store is isolated per app id', () => {
    recordDownloadedVersion('appmintly', '1.0.9');
    recordDownloadedVersion('niramay', '2.1.0');
    expect(getInstallRecord('appmintly')?.downloadedVersion).toBe('1.0.9');
    expect(getInstallRecord('niramay')?.downloadedVersion).toBe('2.1.0');
  });
});
