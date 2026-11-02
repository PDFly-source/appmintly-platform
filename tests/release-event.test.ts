import { describe, it, expect, vi } from 'vitest';
import {
  decide,
  serialiseEvent,
  sign,
  expectedEventId,
  emit,
  slugFromName,
} from '../scripts/publish-release-event.mjs';

const REVISION = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const release = (over = {}) => ({
  slug: 'cineflow',
  name: 'CineFlow',
  published: true,
  apk: { packageId: 'com.appmintly.cineflow', versionName: '0.2.2', sha256: 'f'.repeat(64) },
  ...over,
});

describe('decide — a genuine release emits exactly one event', () => {
  it('emits for a published app whose catalog entry matches the released version', () => {
    const d = decide([release()], { packageId: 'com.appmintly.cineflow', appName: 'CineFlow', version: '0.2.2', revision: REVISION });
    expect(d.emit).toBe(true);
    expect(d.event!).toEqual({
      appId: 'cineflow',
      platform: 'android',
      version: '0.2.2',
      catalogRevision: REVISION,
      name: 'CineFlow',
    });
  });

  it('derives a slug from the catalog name when the entry has none', () => {
    const d = decide([release({ slug: undefined, name: 'Cine Flow' })], { packageId: 'com.appmintly.cineflow', appName: 'Cine Flow', version: '0.2.2', revision: REVISION });
    expect(d.emit).toBe(true);
    expect(d.event!.appId).toBe('cine-flow');
  });

  it('falls back to the workflow app name when the catalog has neither slug nor name', () => {
    const d = decide([release({ slug: undefined, name: undefined })], { packageId: 'com.appmintly.cineflow', appName: 'Cine Flow', version: '0.2.2', revision: REVISION });
    expect(d.emit).toBe(true);
    expect(d.event!.appId).toBe('cine-flow');
  });

  it('keeps the display name within the 64 character contract', () => {
    const d = decide([release({ name: 'A'.repeat(120) })], { packageId: 'com.appmintly.cineflow', appName: 'CineFlow', version: '0.2.2', revision: REVISION });
    expect(d.emit).toBe(true);
    expect(d.event!.name.length).toBe(64);
  });
});

describe('decide — releases that must never emit', () => {
  it('refuses a takedown (published false)', () => {
    const d = decide([release({ published: false })], { packageId: 'com.appmintly.cineflow', appName: 'CineFlow', version: '0.2.2', revision: REVISION });
    expect(d.emit).toBe(false);
    expect(d.reason).toMatch(/takedown/);
  });

  it('refuses a draft entry that never produced an APK', () => {
    const d = decide([release({ published: false, apk: undefined })], { packageId: 'com.appmintly.cineflow', appName: 'CineFlow', version: '0.2.2', revision: REVISION });
    expect(d.emit).toBe(false);
  });

  it('refuses when the catalog records a different version (preview / stale build)', () => {
    const d = decide([release()], { packageId: 'com.appmintly.cineflow', appName: 'CineFlow', version: '0.3.0', revision: REVISION });
    expect(d.emit).toBe(false);
    expect(d.reason).toMatch(/records 0\.2\.2, not 0\.3\.0/);
  });

  it('refuses a metadata-only edit where no verified APK is recorded', () => {
    const d = decide([release({ apk: { packageId: 'com.appmintly.cineflow', versionName: '0.2.2' } })], { packageId: 'com.appmintly.cineflow', appName: 'CineFlow', version: '0.2.2', revision: REVISION });
    expect(d.emit).toBe(false);
    expect(d.reason).toMatch(/no verified APK metadata/);
  });

  it('refuses an unknown package', () => {
    const d = decide([release()], { packageId: 'com.example.other', appName: 'Other', version: '0.2.2', revision: REVISION });
    expect(d.emit).toBe(false);
    expect(d.reason).toMatch(/no catalog entry/);
  });

  it('is fatal (not a silent skip) when the version cannot satisfy the contract', () => {
    const d = decide([release()], { packageId: 'com.appmintly.cineflow', appName: 'CineFlow', version: '0.2.2-beta', revision: REVISION });
    expect(d.emit).toBe(false);
    expect(d.fatal).toBe(true);
  });

  it('is fatal when the catalog revision is not a git sha', () => {
    const d = decide([release()], { packageId: 'com.appmintly.cineflow', appName: 'CineFlow', version: '0.2.2', revision: 'main' });
    expect(d.emit).toBe(false);
    expect(d.fatal).toBe(true);
  });

  it('refuses a non-array catalog', () => {
    expect(decide({ apps: [] }, { packageId: 'x', appName: 'X', version: '1.0.0', revision: REVISION }).emit).toBe(false);
  });
});

describe('signing contract', () => {
  const event = { appId: 'cineflow', platform: 'android', version: '0.2.2', catalogRevision: REVISION, ts: 1762100000000, name: 'CineFlow' };

  it('serialises the agreed fields in a fixed order', () => {
    expect(serialiseEvent(event)).toBe(
      `{"appId":"cineflow","platform":"android","version":"0.2.2","catalogRevision":"${REVISION}","ts":1762100000000,"name":"CineFlow"}`,
    );
  });

  it('produces a stable 64 hex signature and changes with the body', () => {
    const a = sign('secret-value', serialiseEvent(event));
    const b = sign('secret-value', serialiseEvent(event));
    const c = sign('secret-value', serialiseEvent({ ...event, version: '0.2.3' }));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  it('derives the same event id the Worker derives, ignoring the timestamp', () => {
    const id = expectedEventId(event);
    expect(id).toBe(expectedEventId({ ...event, ts: 1 }));
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(expectedEventId({ ...event, version: '0.2.3' })).not.toBe(id);
    expect(expectedEventId({ ...event, catalogRevision: 'b'.repeat(40) })).not.toBe(id);
  });
});

describe('emit — delivery semantics', () => {
  const event = { appId: 'cineflow', platform: 'android', version: '0.2.2', catalogRevision: REVISION, ts: 1762100000000, name: 'CineFlow' };
  const reply = (status: number, body: any) => ({ status, json: async () => body } as any);

  it('treats 201 as stored', async () => {
    const fetchImpl = vi.fn(async () => reply(201, { status: 'stored', eventId: expectedEventId(event) }));
    const r = await emit({ fetchImpl, secret: 's', event, backoffMs: [0] });
    expect(r).toMatchObject({ ok: true, status: 201, duplicate: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('treats a 200 duplicate as success without a second row', async () => {
    const fetchImpl = vi.fn(async () => reply(200, { status: 'duplicate', eventId: expectedEventId(event) }));
    const r = await emit({ fetchImpl, secret: 's', event, backoffMs: [0] });
    expect(r).toMatchObject({ ok: true, status: 200, duplicate: true });
  });

  it('does not retry a 401', async () => {
    const fetchImpl = vi.fn(async () => reply(401, { error: 'Invalid event signature.' }));
    const r = await emit({ fetchImpl, secret: 's', event, attempts: 3, backoffMs: [0] });
    expect(r).toMatchObject({ ok: false, fatal: true, status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries a 503 and succeeds when the store recovers', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(reply(503, { error: 'Event store is temporarily unavailable.' }))
      .mockResolvedValueOnce(reply(201, { status: 'stored' }));
    const r = await emit({ fetchImpl, secret: 's', event, attempts: 3, backoffMs: [0, 0] });
    expect(r.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries a network error and reports exhaustion honestly', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNRESET'); });
    const r = await emit({ fetchImpl, secret: 's', event, attempts: 2, backoffMs: [0] });
    expect(r).toMatchObject({ ok: false, fatal: false });
    expect(r.reason).toMatch(/network/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('sends the signature header over the exact body bytes', async () => {
    let captured: { url: string; init: any } | null = null;
    const fetchImpl = vi.fn(async (url: string, init: any) => {
      captured = { url, init };
      return reply(201, { status: 'stored' });
    });
    await emit({ fetchImpl, secret: 'shared-value', event, backoffMs: [0] });
    expect(captured).not.toBeNull();
    const { init } = captured as unknown as { init: any };
    expect(init.headers['x-appmintly-events-signature']).toBe(`sha256=${sign('shared-value', init.body)}`);
    expect(init.body).toBe(serialiseEvent(event));
    expect(init.redirect).toBe('error');
  });
});

describe('slugFromName', () => {
  it('produces an app-id-safe slug', () => {
    expect(slugFromName('CineFlow')).toBe('cineflow');
    expect(slugFromName('Bill Craft 2.0')).toBe('bill-craft-2-0');
  });
});
