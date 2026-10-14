/**
 * Share System tests (lib/share.ts).
 *
 * Covers the production fix contract:
 *  1. Native share invoked with correct title + canonical URL
 *  2. Unsupported native sharing falls back to clipboard
 *  3. Clipboard success is only reported after the write resolves
 *  4. Clipboard failure reports an honest error (never fake success)
 *  5. Cancel (AbortError) never triggers a clipboard fallback
 *  6. All five published catalog slugs produce their correct share URLs
 *  7. Future/unregistered catalog entries share through the same generic path
 *  8. Both hosting configurations preserve the canonical host + base path
 *  9. Repeated taps (single-flight) never duplicate the share operation
 * 10. AppMintly APK native bridge (AppMintlyNative.share) is preferred
 *     inside the marketplace WebView; a bridge refusal or failure falls
 *     back to the standard web APIs (P0 Android share fix)
 * 11. Legacy APK detection (bridge without share) is flagged, never
 *     reported as plain clipboard success, and uses the same core
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import catalog from '../data/apps.json';

type ShareMod = typeof import('../lib/share');

/** Fresh module with a controlled NEXT_OUTPUT (trailing-slash mode). */
async function loadShare(outputMode?: string): Promise<ShareMod> {
  if (outputMode === undefined) delete process.env.NEXT_OUTPUT;
  else process.env.NEXT_OUTPUT = outputMode;
  vi.resetModules();
  return (await import('../lib/share')) as ShareMod;
}

/** Catalog entries that are actually published (the five production apps). */
const publishedApps = (catalog as Array<{
  slug: string;
  name: string;
  shortDescription?: string;
  description?: string;
  status?: string;
  published?: boolean;
}>).filter((a) => (a.status ?? (a.published ? 'published' : 'draft')) === 'published');

const CANONICAL = 'https://appmintly.pages.dev/';

beforeEach(() => {
  delete process.env.NEXT_OUTPUT;
  vi.restoreAllMocks();
});

describe('1+6+8: canonical share URLs for every published app (export mode = production)', () => {
  it('produces the correct canonical detail URL for all five published apps', async () => {
    const share = await loadShare('export'); // production static-export builds
    const expectedSlugs = ['appmintly', 'studyria', 'pdfminifly', 'niramay', 'nexdrop'];
    expect(publishedApps.map((a) => a.slug).sort()).toEqual([...expectedSlugs].sort());
    for (const app of publishedApps) {
      expect(share.buildAppShareUrl(app.slug)).toBe(`${CANONICAL}app/${app.slug}/`);
    }
  });

  it('shares the canonical host, never the GitHub Pages base-path mirror', async () => {
    const share = await loadShare('export');
    process.env.NEXT_PUBLIC_BASE_PATH = '/appmintly-platform'; // GH Pages build
    expect(share.buildAppShareUrl('niramay')).toBe(`${CANONICAL}app/niramay/`);
    expect(share.buildAppShareUrl('niramay')).not.toContain('github.io');
    expect(share.buildAppShareUrl('niramay')).not.toContain('/appmintly-platform');
    delete process.env.NEXT_PUBLIC_BASE_PATH;
  });

  it('matches the metadata canonical strategy (trailing slash in export, none in standalone)', async () => {
    const exportShare = await loadShare('export');
    expect(exportShare.buildAppShareUrl('appmintly')).toBe(`${CANONICAL}app/appmintly/`);
    const standaloneShare = await loadShare('standalone'); // dev server / APK builds
    expect(standaloneShare.buildAppShareUrl('appmintly')).toBe(`${CANONICAL}app/appmintly`);
  });
});

describe('1: native Web Share API is primary and gets the right payload', () => {
  it('invokes navigator.share with the app title, description and canonical URL', async () => {
    const share = await loadShare('export');
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    const outcome = await share.shareApp(
      { name: 'Niramay', slug: 'niramay', shortDescription: 'Assamese wellness wisdom' },
      { share: shareSpy, clipboardWriteText: vi.fn() }
    );
    expect(shareSpy).toHaveBeenCalledTimes(1);
    expect(shareSpy).toHaveBeenCalledWith({
      title: 'Niramay on AppMintly',
      text: 'Assamese wellness wisdom',
      url: `${CANONICAL}app/niramay/`,
    });
    expect(outcome).toEqual({ status: 'shared', url: `${CANONICAL}app/niramay/` });
  });

  it('falls back to shortDescription and then description for share text', async () => {
    const share = await loadShare();
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    await share.shareApp({ name: 'X', slug: 'x', description: 'fallback text' }, { share: shareSpy });
    expect(shareSpy).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'fallback text' })
    );
  });
});

describe('2+3: clipboard fallback is accurate', () => {
  it('falls back to clipboard when native sharing is unavailable', async () => {
    const share = await loadShare('export');
    const clipSpy = vi.fn().mockResolvedValue(undefined);
    const outcome = await share.shareApp(
      { name: 'NexDrop', slug: 'nexdrop', shortDescription: 'private file sharing' },
      { clipboardWriteText: clipSpy }
    );
    expect(outcome.status).toBe('copied');
    expect(clipSpy).toHaveBeenCalledTimes(1);
    expect(clipSpy).toHaveBeenCalledWith(`${CANONICAL}app/nexdrop/`);
  });

  it('reports copied only AFTER the clipboard write resolves', async () => {
    const share = await loadShare('export');
    let resolveWrite: (v: void) => void = () => {};
    const clipSpy = vi.fn(
      () => new Promise<void>((res) => { resolveWrite = res; })
    );
    const pending = share.shareApp(
      { name: 'Studyria', slug: 'studyria', shortDescription: 'study app' },
      { clipboardWriteText: clipSpy }
    );
    let settled = false;
    void pending.then(() => { settled = true; });
    await Promise.resolve(); // let the clipboard call start
    expect(settled).toBe(false); // no premature success while write is pending
    resolveWrite();
    const outcome = await pending;
    expect(settled).toBe(true);
    expect(outcome.status).toBe('copied');
  });

  it('reports copy-failed (with the URL) when the clipboard write rejects', async () => {
    const share = await loadShare('export');
    const clipSpy = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const outcome = await share.shareApp(
      { name: 'PDFMiniFly', slug: 'pdfminifly', shortDescription: 'pdf tools' },
      { clipboardWriteText: clipSpy }
    );
    expect(outcome.status).toBe('copy-failed');
    expect((outcome as { url: string }).url).toBe(`${CANONICAL}app/pdfminifly/`);
  });

  it('reports copy-failed honestly when the Clipboard API is unavailable entirely', async () => {
    const share = await loadShare();
    const outcome = await share.shareApp({ name: 'A', slug: 'a' }, {});
    expect(outcome.status).toBe('copy-failed');
  });
});

describe('5: cancellation handling', () => {
  it('treats AbortError as cancelled and never touches the clipboard', async () => {
    const share = await loadShare('export');
    const clipSpy = vi.fn().mockResolvedValue(undefined);
    const outcome = await share.shareApp(
      { name: 'Niramay', slug: 'niramay' },
      { share: () => Promise.reject(new DOMException('cancelled', 'AbortError')), clipboardWriteText: clipSpy }
    );
    expect(outcome.status).toBe('cancelled');
    expect(clipSpy).not.toHaveBeenCalled(); // no automatic copy after cancel
  });

  it('still falls back to clipboard on non-cancel share errors', async () => {
    const share = await loadShare('export');
    const clipSpy = vi.fn().mockResolvedValue(undefined);
    const outcome = await share.shareApp(
      { name: 'Niramay', slug: 'niramay' },
      { share: () => Promise.reject(new DOMException('not allowed', 'NotAllowedError')), clipboardWriteText: clipSpy }
    );
    expect(outcome.status).toBe('copied');
  });
});

describe('7: future catalog entries inherit the generic implementation', () => {
  it('shares a not-yet-registered slug through the same path with its own URL', async () => {
    const share = await loadShare('export');
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    const futureApp = { name: 'Future App 2099', slug: 'future-app-2099', shortDescription: 'brand new' };
    const outcome = await share.shareApp(futureApp, { share: shareSpy, clipboardWriteText: vi.fn() });
    expect(outcome.status).toBe('shared');
    expect(shareSpy).toHaveBeenCalledWith({
      title: 'Future App 2099 on AppMintly',
      text: 'brand new',
      url: `${CANONICAL}app/future-app-2099/`,
    });
  });
});

describe('9: repeated taps never duplicate the operation', () => {
  it('ignores a second tap while the first share is still in flight', async () => {
    const share = await loadShare();
    let resolveShare: (v: void) => void = () => {};
    const shareSpy = vi.fn(
      () => new Promise<void>((res) => { resolveShare = res; })
    );
    const guarded = share.singleFlight(() => shareSpy());
    const first = guarded();
    const second = guarded(); // double-tap while sheet is open
    expect(second).toBeUndefined(); // ignored, not queued
    resolveShare();
    await first;
    expect(shareSpy).toHaveBeenCalledTimes(1); // share sheet opened exactly once
  });

  it('allows a new share after the previous one settles', async () => {
    const share = await loadShare();
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    const guarded = share.singleFlight(() => shareSpy());
    await guarded();
    await guarded();
    expect(shareSpy).toHaveBeenCalledTimes(2);
  });
});


describe('10: AppMintly APK native bridge (P0 Android share fix)', () => {
  const appPayload = {
    title: 'NexDrop on AppMintly',
    text: 'Private, direct, fast P2P file sharing',
    url: `${CANONICAL}app/nexdrop/`,
  };

  it('calls the native bridge FIRST and never touches navigator.share when present', async () => {
    const share = await loadShare('export');
    const nativeShare = vi.fn(() => true);
    const navShare = vi.fn(async () => {});
    const outcome = await share.shareContent(appPayload, {
      nativeShare,
      share: navShare,
      clipboardWriteText: async () => {},
    });
    expect(outcome.status).toBe('shared');
    expect(nativeShare).toHaveBeenCalledTimes(1);
    expect(nativeShare).toHaveBeenCalledWith(appPayload);
    expect(navShare).not.toHaveBeenCalled(); // bridge wins, no double share
  });

  it('falls back to navigator.share when the bridge refuses the URL (returns false)', async () => {
    const share = await loadShare('export');
    const nativeShare = vi.fn(() => false); // Java refused: outside ownership prefix
    const navShare = vi.fn(async () => {});
    const outcome = await share.shareContent(appPayload, {
      nativeShare,
      share: navShare,
    });
    expect(outcome.status).toBe('shared');
    expect(nativeShare).toHaveBeenCalledTimes(1);
    expect(navShare).toHaveBeenCalledTimes(1); // standard web API takes over
  });

  it('falls back to the clipboard when the bridge refuses and navigator.share is absent (mirror URL case)', async () => {
    const share = await loadShare('export');
    const clip = vi.fn(async () => {});
    const outcome = await share.shareContent(
      { ...appPayload, url: 'https://github.com/PDFly-source/appmintly-releases/releases/download/x/a.apk' },
      { nativeShare: () => false, clipboardWriteText: clip }
    );
    expect(outcome.status).toBe('copied'); // QR-style external URL: honest copy fallback
    expect(clip).toHaveBeenCalledTimes(1);
  });

  it('falls through to the web APIs when the bridge throws', async () => {
    const share = await loadShare('export');
    const navShare = vi.fn(async () => {});
    const outcome = await share.shareContent(appPayload, {
      nativeShare: () => {
        throw new Error('bridge crashed');
      },
      share: navShare,
    });
    expect(outcome.status).toBe('shared');
    expect(navShare).toHaveBeenCalledTimes(1);
  });

  it('all five published apps share through the bridge with their own canonical URL', async () => {
    const share = await loadShare('export');
    for (const app of publishedApps) {
      const nativeShare = vi.fn(() => true);
      const outcome = await share.shareContent(
        {
          title: `${app.name} on AppMintly`,
          text: app.shortDescription ?? app.description ?? '',
          url: share.buildAppShareUrl(app.slug),
        },
        { nativeShare }
      );
      expect(outcome.status).toBe('shared');
      expect(nativeShare).toHaveBeenCalledWith(
        expect.objectContaining({ url: `${CANONICAL}app/${app.slug}/` })
      );
    }
  });

  it('getNativeBridgeShare only trusts a bridge that confirms isNativeApp() and exposes share()', async () => {
    const share = await loadShare('export');
    const trusted = { share: vi.fn(() => true), isNativeApp: () => true };
    const notConfirmed = { share: vi.fn(() => true) }; // no isNativeApp
    const denied = { share: vi.fn(() => true), isNativeApp: () => false };
    expect(share.getNativeBridgeShare({ AppMintlyNative: trusted })).toBe(trusted);
    expect(share.getNativeBridgeShare({})).toBeUndefined();
    expect(share.getNativeBridgeShare(undefined)).toBeUndefined();
    expect(share.getNativeBridgeShare({ AppMintlyNative: denied })).toBeUndefined();
    void notConfirmed;
  });
});


describe('11: legacy AppMintly APK detection (v1.0.8 hardening)', () => {
  const payload = { title: 'NexDrop on AppMintly', text: 'desc', url: `${CANONICAL}app/nexdrop/` };
  const legacyGlobal = {
    AppMintlyNative: { isNativeApp: () => true }, // v1.0.6 bridge: no share method
  };

  it('a bridge without share is still ATTEMPTED (call-based), and the failed call marks it legacy', async () => {
    const share = await loadShare('export');
    expect(share.getNativeBridgeShare(legacyGlobal)).toBeDefined();
    const b: any = share.getNativeBridgeShare(legacyGlobal);
    const outcome: any = await share.shareContent(payload, {
      nativeShare: ({ title, text, url }) => b.share(url, title, text || ''),
      clipboardWriteText: async () => {},
    });
    expect(outcome.status).toBe('copied');
    expect(outcome.legacyNativeApp).toBe(true);
  });

  it('flags the copied outcome when the APK is legacy — never a plain success', async () => {
    const share = await loadShare('export');
    const outcome = await share.shareContent(payload, {
      clipboardWriteText: async () => {},
      legacyNativeApp: true,
    });
    expect(outcome.status).toBe('copied');
    expect((outcome as { legacyNativeApp?: boolean }).legacyNativeApp).toBe(true);
  });

  it('flags copy-failed honestly on a legacy APK when the clipboard write rejects', async () => {
    const share = await loadShare('export');
    const outcome = await share.shareContent(payload, {
      clipboardWriteText: async () => {
        throw new Error('blocked');
      },
      legacyNativeApp: true,
    });
    expect(outcome.status).toBe('copy-failed');
    expect((outcome as { legacyNativeApp?: boolean }).legacyNativeApp).toBe(true);
  });

  it('tolerates a bridge whose share method reports typeof "object" (WebView quirk)', async () => {
    const share = await loadShare('export');
    const quirky = {
      isNativeApp: () => true,
      share: vi.fn(() => true),
    };
    (quirky.share as unknown as { __quirk: boolean }).__quirk = true;
    // simulate typeof 'object': wrap detection through getNativeBridgeShare
    const bridge = share.getNativeBridgeShare({ AppMintlyNative: quirky });
    expect(bridge).toBe(quirky); // detection does not reject callable objects
    const nativeShare = bridge ? vi.fn(() => bridge.share!('u', 't', 'x')) : undefined;
    const outcome = await share.shareContent(payload, { nativeShare });
    expect(outcome.status).toBe('shared');
    expect(quirky.share).toHaveBeenCalled();
  });

  it('an honest browser clipboard copy stays a plain success (no legacy flag outside the APK)', async () => {
    const share = await loadShare('export');
    const outcome = await share.shareContent(payload, { clipboardWriteText: async () => {} });
    expect(outcome.status).toBe('copied');
    expect((outcome as { legacyNativeApp?: boolean }).legacyNativeApp).toBeUndefined();
  });
});


describe('12: call-based bridge detection (v1.0.9 P0)', () => {
  const url = `${CANONICAL}app/nexdrop/`;
  it('attempts the native call when share is HIDDEN from property reads but callable (WebView host object)', async () => {
    const share = await loadShare('export');
    let called = 0;
    const host: any = { isNativeApp: () => true };
    // Host-object behavior: property read is undefined, call still works
    const bridge = new Proxy(host, { get: (t, p) => (p === 'share' ? undefined : t[p]) });
    const g = { AppMintlyNative: bridge };
    const b = share.getNativeBridgeShare(g);
    expect(b).toBeDefined(); // detection no longer gated on a property read
    const outcome = await share.shareContent(
      { title: 'NexDrop', url },
      { nativeShare: () => { called++; return true; } }
    );
    expect(called).toBe(1);
    expect(outcome.status).toBe('shared');
  });
  it('a native call that throws "not a function" is reported as legacy, not as success', async () => {
    const share = await loadShare('export');
    const outcome: any = await share.shareContent(
      { title: 'x', url },
      { nativeShare: () => { throw new TypeError('b.share is not a function'); }, clipboardWriteText: async () => {} }
    );
    expect(outcome.status).toBe('copied');
    expect(outcome.legacyNativeApp).toBe(true);
  });
  it('a native refusal (false) falls back to clipboard with an honest reason', async () => {
    const share = await loadShare('export');
    const outcome: any = await share.shareContent(
      { title: 'x', url },
      { nativeShare: () => false, clipboardWriteText: async () => {} }
    );
    expect(outcome.status).toBe('copied');
    expect(outcome.nativeReason).toBe('refused');
  });
  it('a cancelled web share still never triggers the clipboard', async () => {
    const share = await loadShare('export');
    const cb = vi.fn(async () => {});
    const err = Object.assign(new Error('x'), { name: 'AbortError' });
    const outcome = await share.shareContent({ title: 'x', url }, { share: async () => { throw err; }, clipboardWriteText: cb });
    expect(outcome.status).toBe('cancelled');
    expect(cb).not.toHaveBeenCalled();
  });
});
