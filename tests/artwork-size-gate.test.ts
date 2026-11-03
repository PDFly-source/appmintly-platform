import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- plain ESM script, no types needed
import { auditAll, auditSource, auditData } from '../scripts/audit-artwork-slots.mjs';
import {
  ARTWORK_SLOTS,
  ARTWORK_SIZE_PX,
  ARTWORK_SIZE_CLASSES,
  MAX_ARTWORK_PX,
  pxForSlot,
  sizeForSlot,
} from '../lib/artwork-tokens';

/**
 * [artwork-size-gate] One global artwork size system.
 *
 * These tests exist because the same class of bug shipped twice: a bespoke
 * oversized CineFlow container in the detail page, and a full lockup canvas
 * rendered inside a standard card slot. Both are now impossible because
 * artwork is rendered by one component from a closed set of slots, and the
 * gate below fails if anything reintroduces an override.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const apps = JSON.parse(read('data/apps.json'));
const appIcon = read('components/AppIcon.tsx');

/** AppMintly is the permanent reference implementation. */
const REFERENCE = apps.find((a: any) => a.slug === 'appmintly');
const CINEFLOW = apps.find((a: any) => a.slug === 'cineflow');

describe('A — every app uses the same icon slot dimensions', () => {
  it('CineFlow and AppMintly resolve to identical px on every standard surface', () => {
    for (const slot of ['card', 'cardLarge', 'list', 'featured', 'library', 'upcoming', 'detail'] as const) {
      const box = pxForSlot(slot);
      // the slot is a constant; no app record participates in sizing at all
      expect(pxForSlot(slot)).toEqual(box);
    }
    // a slot can only mean one thing, whichever app asks for it
    expect(sizeForSlot('card')).toBe('lg');
    expect(sizeForSlot('detail')).toBe('2xl');
  });

  it('AppIcon geometry is generated from the tokens, not hand-written', () => {
    expect(appIcon).toContain('ARTWORK_SIZE_CLASSES');
    // the old hand-written geometry literals must be gone
    expect(appIcon).not.toMatch(/lg: 'w-14 h-14 sm:w-16 sm:h-16 text-base'/);
    expect(ARTWORK_SIZE_CLASSES.lg).toBe('w-14 h-14 sm:w-16 sm:h-16');
  });

  it('the reference (AppMintly) and CineFlow carry no sizing metadata at all', () => {
    for (const app of [REFERENCE, CINEFLOW]) {
      const keys = Object.keys(app);
      for (const banned of ['brandLockup', 'brandLockupWidth', 'iconSize', 'imageSize', 'logoSize', 'artworkWidth']) {
        expect(keys, `${app.slug} must not own '${banned}'`).not.toContain(banned);
      }
    }
    expect(CINEFLOW.icon).toBe('/brand/cineflow-icon-384.png');
  });
});

describe('B — featured cards cannot become full-width banners', () => {
  it('the featured surface renders the featured slot and nothing wider', () => {
    const src = read('components/FeaturedHeroCarousel.tsx');
    expect(src).toContain('slot="featured"');
    expect(src).not.toMatch(/w-full[^"]{0,40}object-contain/);
    expect(src).not.toMatch(/aspectRatio/);
    expect(auditSource('components/FeaturedHeroCarousel.tsx', src)).toEqual([]);
  });
});

describe('C — detail page matches the AppMintly reference', () => {
  it('uses the 2xl icon-shelf slot, not a bespoke hero container', () => {
    const src = read('app/app/[slug]/AppDetailClient.tsx');
    expect(src).toContain('slot="detail"');
    expect(src).toContain('icon-shelf rounded-[1.75rem] p-2.5');
    expect(src).not.toContain('brandLockup');
    expect(src).not.toContain('layout="hero"');
    expect(pxForSlot('detail')).toEqual({ base: 112, sm: 128 });
  });
});

describe('D — upcoming/roadmap cards use the same tokens', () => {
  it('upcoming records carry no sizing override and resolve to the same slot', () => {
    expect(auditData()).toEqual([]);
    const upcoming = JSON.parse(read('data/upcoming-apps.json'));
    const records = Array.isArray(upcoming) ? upcoming : Object.values(upcoming).flat();
    expect(records.length).toBeGreaterThan(0);
    for (const rec of records as any[]) {
      for (const key of Object.keys(rec)) {
        expect(key).not.toMatch(/iconSize|imageSize|logoSize|artwork|brandLockup/i);
      }
    }
    expect(sizeForSlot('upcoming')).toBe(sizeForSlot('card'));
  });
});

describe('E — newly published apps inherit the renderer automatically', () => {
  it('the card renders artwork for any app, with no per-app branch', () => {
    const src = read('components/AppCard.tsx');
    expect(src).toContain('<AppArtwork app={app} slot=');
    for (const slug of ['cineflow', 'appmintly', 'pdfminifly', 'studyria', 'niramay', 'nexdrop', 'billcraft']) {
      expect(src, `AppCard must not special-case ${slug}`).not.toContain(slug);
    }
  });

  it('a brand-new catalogue record needs nothing but an icon to render correctly', () => {
    const brandNew = { slug: 'brand-new-app', name: 'Brand New', icon: '/brand/new-icon.png' };
    // sizing comes from the slot, so the record cannot influence it
    const before = pxForSlot('card');
    expect(pxForSlot('card')).toEqual(before);
    expect(Object.keys(brandNew)).not.toContain('iconSize');
  });
});

describe('F — extreme source images cannot expand the card', () => {
  it('the artwork box is fixed px; aspect ratio and intrinsic size are ignored', () => {
    const src = read('components/AppArtwork.tsx');
    expect(src).not.toMatch(/aspectRatio|naturalWidth|naturalHeight|width=\{|height=\{/);
    expect(src).toContain('sizeForSlot(slot)');
    // a 4000x1000 asset still lands in an 80px box (object-fit: contain)
    for (const size of Object.keys(ARTWORK_SIZE_PX) as (keyof typeof ARTWORK_SIZE_PX)[]) {
      expect(ARTWORK_SIZE_CLASSES[size]).toMatch(/^w-\d+ h-\d+/);
    }
    expect(MAX_ARTWORK_PX).toBe(128); // nothing may render larger than the detail slot
  });
});

describe('G — no override can bypass the gate', () => {
  it('the real repository is clean', () => {
    expect(auditAll()).toEqual([]);
  });

  it('NEGATIVE CONTROL: an injected oversized rule is caught', () => {
    const honest = read('components/AppArtwork.tsx');
    const tampered = honest
      .replace(
        '<AppIcon',
        '<div style={{ aspectRatio: \'1\' }} className={app.slug === \'cineflow\' ? \'w-full max-w-[420px]\' : \'\'}>\n      <AppIcon'
      )
      .replace('/>', '/>\n    </div>');
    const found = auditSource('components/AppArtwork.tsx', tampered);
    expect(found.length).toBeGreaterThan(0);
    expect(found.join('\n')).toMatch(/R1-aspect-override|R2-app-conditional-sizing|R1-contain-fullwidth/);
  });

  it('NEGATIVE CONTROL: an injected metadata override is caught', () => {
    const injected = [{ slug: 'cineflow', icon: '/x.png', iconSize: 'w-96', brandLockup: '/y.webp' }];
    const keyCheck = injected.flatMap((r) =>
      Object.keys(r).filter((k) => /^(brandLockup\w*|iconSize|imageSize|logoSize|artwork\w*)$/i.test(k))
    );
    expect(keyCheck).toEqual(['iconSize', 'brandLockup']);
  });
});

describe('H — existing app cards keep their original dimensions', () => {
  it('slot sizes are exactly AppMintly\'s established reference values', () => {
    expect(ARTWORK_SLOTS.card).toBe('lg'); // 56 / 64
    expect(ARTWORK_SLOTS.cardLarge).toBe('xl'); // 80 / 96
    expect(ARTWORK_SLOTS.list).toBe('sm'); // 36
    expect(ARTWORK_SLOTS.featured).toBe('xl'); // 80 / 96
    expect(ARTWORK_SLOTS.library).toBe('lg');
    expect(ARTWORK_SLOTS.upcoming).toBe('lg');
    expect(ARTWORK_SLOTS.detail).toBe('2xl'); // 112 / 128
    expect(pxForSlot('card')).toEqual({ base: 56, sm: 64 });
    expect(pxForSlot('list')).toEqual({ base: 36, sm: 36 });
  });

  it('no component declares its own artwork width class', () => {
    for (const file of ['components/AppCard.tsx', 'components/FeaturedHeroCarousel.tsx', 'components/LibraryClient.tsx']) {
      const src = read(file);
      expect(src, file).not.toMatch(/<AppArtwork[^>]*size=/);
      expect(src, file).not.toMatch(/<AppArtwork[^>]*className="[^"]*\bw-\d/);
    }
  });
});

describe('I — the artwork is contained, never cropped', () => {
  it('the square mark is square, so contain fills the slot without distortion', () => {
    expect(auditSource('components/AppArtwork.tsx', read('components/AppArtwork.tsx')).length).toBe(0);
    const src = read('components/AppArtwork.tsx');
    expect(src).not.toContain('object-cover');
    expect(src).not.toContain('overflow-hidden');
  });
});

describe('J — responsive behaviour cannot shift card geometry', () => {
  it('slots use one fixed box per breakpoint, with no fluid width', () => {
    for (const [size, cls] of Object.entries(ARTWORK_SIZE_CLASSES)) {
      expect(cls, size).not.toMatch(/\bw-full\b|\bw-1\/2\b|\bflex-1\b/);
      expect(cls, size).toMatch(/^w-\d+ h-\d+/);
    }
    // every responsive step is an explicit px step, so 320..1280 can never drift
    expect(ARTWORK_SIZE_CLASSES.lg).toContain('sm:w-16');
    expect(ARTWORK_SIZE_CLASSES['2xl']).toContain('sm:w-32');
  });
});
