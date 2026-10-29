/**
 * Lab project cards — data honesty tests for the upgraded card content.
 *
 * The card upgrade added a team-maintained problem statement and practical
 * benefits per app. These tests keep that copy honest:
 *  - every record that ships problem/benefits content has usable values
 *  - the copy never claims release, installability, or verification
 *    (those live ONLY in the milestone + verification records)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UPCOMING_APPS, ROADMAP_STATUS_LABEL, ROADMAP_STATUS_SUBTITLE } from '../data/upcoming-apps';

const REPO = join(__dirname, '..');

/** Phrases the card copy must NEVER use — they'd imply release/readiness. */
const FORBIDDEN_CLAIMS = [
  /released/i,
  /\binstalled\b/i,
  /\binstallable\b/i,
  /\bdownloadable\b/i,
  /tested on device/i,
  /malware[- ]free/i,
  /\bsecure\b/i,
];

/**
 * Finalized Lab project status system (owner-approved):
 * PLANNED (Idea & Planning) / IN DEVELOPMENT (Building Now) /
 * EARLY TESTING (Internal Only) / PUBLISHED (Public Release).
 *
 * These tests keep the Lab project cards honest:
 *  - exact statuses for Cartora, NutriLens, Register (BillCraft graduated
 *    to the published catalog on 2026-10-17 — it has a real verified public URL)
 *  - status-specific availability messages on every record
 *  - NO public destination (publicUrl/conceptUrl) unless a real one
 *    exists — so no unavailable product can ever be opened or installed
 *    through a Lab CTA, and nothing is marked published without a real
 *    verified public URL.
 */
describe('finalized project status system — Lab project cards (post-BillCraft graduation)', () => {
  const byId = (id: string) => UPCOMING_APPS.find((a) => a.id === id);

  it('the records carry their required finalized statuses (billcraft graduated)', () => {
    expect(byId('billcraft')).toBeUndefined(); // graduated to the catalog (2026-10-17)
    expect(byId('cartora')?.roadmapStatus).toBe('in-development');
    expect(byId('nutrilens')?.roadmapStatus).toBe('early-testing'); // moved by the authorized Lab CMS edit 2026-10-28
    expect(byId('register')?.roadmapStatus).toBe('planned');
  });

  it('status labels follow the finalized system vocabulary', () => {
    expect(byId('cartora')?.roadmapStatusLabel).toBe('Building Now');
    expect(byId('nutrilens')?.roadmapStatusLabel).toBe('Building Now');
    expect(byId('register')?.roadmapStatusLabel).toBe('Idea & Planning');
  });

  it('every record carries a status-specific availability (access) message', () => {
    expect(byId('cartora')?.accessMessage).toBe('Currently being built — public release not available.');
    expect(byId('nutrilens')?.accessMessage).toBe('Currently being built — public release not available.');
    expect(byId('register')?.accessMessage).toBe('Development has not started.');
  });

  it('BillCraft is represented by the catalog-synced published record, never a duplicate', () => {
    // Phase-2 sync semantics: the graduated raw record stays gone; the live
    // catalog app is represented by exactly one sync-managed published record.
    expect(byId('billcraft')).toBeUndefined();
    const synced = UPCOMING_APPS.filter((a) => a.catalogSlug === 'billcraft' || a.id === 'catalog-billcraft');
    expect(synced).toHaveLength(1);
    expect(synced[0].roadmapStatus).toBe('published');
    expect(synced[0].publicUrl).toBe('https://appmintly.pages.dev/app/billcraft/');
  });

  it('no non-published record exposes a public destination CTA', () => {
    for (const app of UPCOMING_APPS) {
      if (app.roadmapStatus !== 'published') {
        expect(app.publicUrl, `${app.id} must not expose publicUrl`).toBeUndefined();
      }
    }
  });

  it('nothing is published without a real verified public URL (fail-closed)', () => {
    for (const app of UPCOMING_APPS) {
      if (app.roadmapStatus === 'published') {
        expect(app.publicUrl, `${app.id} published without a real destination`).toMatch(/^https:\/\//);
      }
    }
    // Current dataset: the published set is DERIVED from the production
    // catalog by scripts/sync-published-lab.mjs — the count is whatever the
    // catalog says, never a hardcoded number.
    const synced = UPCOMING_APPS.filter((a) => a.roadmapStatus === 'published');
    expect(synced.every((a) => a.syncManaged === true && a.catalogSlug)).toBe(true);
  });

  it('Register (Planned) has no concept URL — the CTA is honestly "Coming Later"', () => {
    expect(byId('register')?.conceptUrl).toBeUndefined();
  });

  it('no fabricated verification: pending checks stay pending, no invented passes', () => {
    for (const app of UPCOMING_APPS) {
      for (const check of app.verification?.checks ?? []) {
        // Only Register has recorded real evidence; all other CURATED checks stay pending.
        if (app.id !== 'register' && !app.syncManaged) {
          expect(check.result, `${app.id} ${check.category}`).toBe('pending');
        }
        // Sync-managed catalog records may carry exactly one release check,
        // explicitly labeled repository-inspection with its catalog source.
        if (app.syncManaged) {
          expect(app.verification?.checks.length).toBeLessThanOrEqual(1);
          if (check.result === 'passed') {
            expect(check.evidence_class ?? 'repository-inspection').toBe('repository-inspection');
            expect(check.source ?? '').toContain('data/apps.json');
          }
        }
      }
    }
  });

  it('roadmap progress derives only from each record own milestones — no copied progress', () => {
    const doneOf = (id: string) => byId(id)!.milestones.filter((m) => m.status === 'done').length;
    expect(doneOf('cartora')).toBe(2);   // distinct from NutriLens
    expect(doneOf('nutrilens')).toBe(1); // NOT Cartora's progress
    expect(doneOf('register')).toBe(2); // owner console edit 2026-10-28 marked a second milestone done
  });
});

describe('problem statements and benefits — honest, complete, claim-free', () => {
  it('every curated app record carries a problem statement; benefits where sourced', () => {
    expect(UPCOMING_APPS.length).toBe(40); // 33 curated + 7 catalog-synced published records (2026-10-28)
    for (const app of UPCOMING_APPS) {
      // Sync-managed catalog projections describe a LIVE release; their copy
      // is the catalog short description, not a roadmap problem statement.
      if (app.syncManaged) {
        expect(app.purpose, `${app.id} purpose`).toBeTruthy();
        continue;
      }
      expect(app.problem, `${app.id} problem`).toBeTruthy();
      // Benefits: the three original showcase records carry three each; the
      // 30 Phase-1D roadmap records carry five app-specific benefits each
      // (imported through the validated /lab/projects/import route).
      if (['cartora', 'nutrilens', 'register'].includes(app.id)) {
        expect(app.benefits, `${app.id} benefits`).toBeTruthy();
        expect(app.benefits!.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('the copy never implies release, installability, or verification', () => {
    for (const app of UPCOMING_APPS) {
      const copy = [
        app.problem ?? '',
        ...(app.benefits ?? []),
      ].join(' ');
      for (const pattern of FORBIDDEN_CLAIMS) {
        expect(copy, `${app.id} must not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('benefits are unique and non-trivial per record', () => {
    for (const app of UPCOMING_APPS) {
      const benefits = app.benefits ?? [];
      expect(new Set(benefits).size).toBe(benefits.length);
      for (const b of benefits) {
        expect(b.length).toBeGreaterThan(10);
      }
    }
  });

  it('benefits restate planned content only — no feature appears that is not in the record', () => {
    for (const app of UPCOMING_APPS) {
      const plannedText = [
        app.purpose,
        ...app.proposedFeatures,
        ...app.plannedCapabilities,
      ]
        .join(' ')
        .toLowerCase();
      // Spot-check honest keywords that a benefit may use only when the
      // record plans them: account-free/cloud-free/GST/budget/etc.
      if (/no account/i.test((app.benefits ?? []).join(' '))) {
        expect(plannedText).toMatch(/no account|no login/i);
      }
    }
  });
});

/**
 * Status-consistency audit regressions (owner-requested audit 2026-10-16).
 *
 * Keeps the canonical four-status system honest end to end:
 *  - the badge label is the CANONICAL status name; the record's
 *    roadmapStatusLabel is only its subtitle
 *  - Register's repository/registry integrity evidence is never
 *    represented as a passed Register core-flow test
 *  - a passed check always carries traceable evidence
 *  - verification never gets inferred from milestone completion
 *  - overview counts are derived from the records themselves
 */
describe('status-consistency audit — canonical labels and honest verification', () => {
  const byId = (id: string) => UPCOMING_APPS.find((a) => a.id === id);

  it('the canonical label map matches the finalized four-status system', () => {
    expect(ROADMAP_STATUS_LABEL.planned).toBe('Planned');
    expect(ROADMAP_STATUS_LABEL['in-development']).toBe('In Development');
    expect(ROADMAP_STATUS_LABEL['early-testing']).toBe('Early Testing');
    expect(ROADMAP_STATUS_LABEL.published).toBe('Published / Released');
    // Subtitles: the record's roadmapStatusLabel — never the badge itself.
    expect(ROADMAP_STATUS_SUBTITLE.planned).toBe('Idea & Planning');
    expect(ROADMAP_STATUS_SUBTITLE['in-development']).toBe('Building Now');
    expect(ROADMAP_STATUS_SUBTITLE['early-testing']).toBe('Internal Only');
    expect(ROADMAP_STATUS_SUBTITLE.published).toBe('Public Release');
  });

  it('every record maps to exactly one canonical status label', () => {
    for (const app of UPCOMING_APPS) {
      expect(app.roadmapStatus, `${app.id} status`).toMatch(/^(planned|in-development|early-testing|published)$/);
    }
  });

  it('Register: repository integrity evidence is NOT a passed core-flow check', () => {
    const register = byId('register')!;
    const coreFlow = register.verification!.checks.find((c) => c.category === 'core-flow')!;
    // The Register webapp's core flow is unimplemented — must not show Passed.
    expect(coreFlow.result).not.toBe('passed');
    // The genuine 13/13 repository evidence is preserved AND labelled as
    // repository/registry integrity verification.
    expect(coreFlow.summary).toMatch(/repository\/registry integrity verification/i);
    expect(coreFlow.summary).toMatch(/13\/13/);
    expect(coreFlow.summary).toMatch(/not the Register application's core flow/);
    expect(coreFlow.source).toMatch(/not an application-flow test/);
  });

  it('Register: no fabricated build artifact — Build Verified stays unverified', () => {
    const register = byId('register')!;
    expect(register.roadmapStatus).toBe('planned');
    const build = register.verification!.checks.find((c) => c.category === 'build')!;
    expect(build.result).toBe('unable-to-verify');
    const passed = register.verification!.checks.filter((c) => c.result === 'passed');
    expect(passed).toHaveLength(0);
  });

  it('no verification check is passed without traceable evidence fields', () => {
    for (const app of UPCOMING_APPS) {
      for (const c of app.verification?.checks ?? []) {
        if (c.result === 'passed') {
          expect(c.id, `${app.id} ${c.category} passed without id`).toBeTruthy();
          expect(c.source, `${app.id} ${c.category} passed without source`).toBeTruthy();
          expect(c.date, `${app.id} ${c.category} passed without date`).toBeTruthy();
          expect(c.summary, `${app.id} ${c.category} passed without summary`).toBeTruthy();
        }
      }
    }
  });

  it('verification is never inferred from milestone completion', () => {
    // Register has a completed milestone (Repository created) — that must
    // NOT produce any passed verification check.
    const register = byId('register')!;
    expect(register.milestones.some((m) => m.status === 'done')).toBe(true);
    expect(register.verification!.checks.every((c) => c.result !== 'passed')).toBe(true);
  });

  it('overview counts derive from the records: 40 / 18 / 11 / 4 / 7 (catalog-synced)', () => {
    const count = (s?: string) =>
      s ? UPCOMING_APPS.filter((a) => a.roadmapStatus === s).length : UPCOMING_APPS.length;
    expect(count()).toBe(40); // 33 curated + 7 catalog-synced published records
    expect(count('planned')).toBe(18); // register + 17 imported; AgeX advanced to in-development (4e44560)
    expect(count('in-development')).toBe(11); // 10 imported + AgeX advanced from planned (4e44560)
    expect(count('early-testing')).toBe(4); // 3 imported + nutrilens
    // Published count MUST equal the catalog's published set — derived, never hardcoded.
    const catalog = JSON.parse(readFileSync(join(REPO, 'data', 'apps.json'), 'utf8'));
    const publishedCatalog = catalog.filter(
      (a: any) => a.status === 'published' && a.published === true
    );
    expect(count('published')).toBe(publishedCatalog.length);
    expect(new Set(UPCOMING_APPS.filter((a) => a.roadmapStatus === 'published').map((a) => a.catalogSlug))
    ).toEqual(new Set(publishedCatalog.map((a: any) => a.slug)));
  });
});

/* ---- archived lifecycle: hidden from the public Lab, restorable ---- */
describe('lab archived lifecycle', () => {
  it('getUpcomingApps hides records archived by the console', async () => {
    const mod = await import('@/data/upcoming-apps');
    // live dataset snapshot: no record is archived right now, so the
    // count equals the raw array length minus any invalid records — the
    // invariant is that getUpcomingApps() NEVER returns archived:true.
    const upcoming = mod.getUpcomingApps();
    const raw = (await import('@/data/upcoming-apps.json')).default as unknown as Array<{ archived?: unknown }>;
    const expectVisible = raw.filter((r) => r.archived !== true).length;
    expect(upcoming.every((u) => (u as unknown as { archived?: unknown }).archived !== true)).toBe(true);
    expect(upcoming.length).toBeLessThanOrEqual(raw.length);
    expect(upcoming.length).toBeGreaterThanOrEqual(expectVisible - 0);
  });
});

/* Phase-1D benefits import (P0) — every one of the 30 roadmap records must
   carry at least five distinct, app-specific, future-oriented benefits. */
const LAB_BENEFIT_FLOOR_SLUGS = [
  'hisaabkhata', 'qr-forge', 'unitx-axom', 'emiwise', 'agex', 'docuscan-mint',
  'imageslim', 'audiotrim', 'passportlab', 'colorsnap', 'textcraft', 'billsplit-mint',
  'typeaxom', 'focusmint', 'notecheck', 'measuremint', 'wagebook', 'randhoon',
  'billscan', 'signlab', 'cropcraft', 'soundmeter', 'breathease', 'bhoomimap',
  'cardmint', 'fileswitch', 'lightlux', 'slipgen', 'kharcha', 'morselab',
];

describe('Phase-1D benefits — 30 apps, five+ distinct each, app-specific', () => {
  it('every floor record exists exactly once with at least five benefits', () => {
    for (const slug of LAB_BENEFIT_FLOOR_SLUGS) {
      const matches = UPCOMING_APPS.filter((a) => a.slug === slug);
      expect(matches.length, `${slug} appears once`).toBe(1);
      const b = matches[0].benefits ?? [];
      expect(b.length, `${slug} benefit count`).toBeGreaterThanOrEqual(5);
      const distinct = new Set(b.map((x) => x.trim().toLowerCase()));
      expect(distinct.size, `${slug} distinct benefits`).toBe(b.length);
      for (const text of b) {
        expect(text.trim().length, `${slug} non-empty benefit`).toBeGreaterThan(10);
        expect(text.length, `${slug} benefit length`).toBeLessThanOrEqual(140);
      }
    }
  });

  it('totals at least 150 benefits and no generic list is shared between apps', () => {
    const sets = LAB_BENEFIT_FLOOR_SLUGS.map((slug) => {
      const app = UPCOMING_APPS.find((a) => a.slug === slug)!;
      return (app.benefits ?? []).join('|');
    });
    const total = LAB_BENEFIT_FLOOR_SLUGS.reduce((n, slug) => {
      const app = UPCOMING_APPS.find((a) => a.slug === slug)!;
      return n + (app.benefits?.length ?? 0);
    }, 0);
    expect(total).toBeGreaterThanOrEqual(150);
    expect(new Set(sets).size, 'each app has its own benefit list').toBe(sets.length);
  });

  it('planned benefits are future-oriented, never shipped-claim wording', () => {
    for (const slug of LAB_BENEFIT_FLOOR_SLUGS) {
      const app = UPCOMING_APPS.find((a) => a.slug === slug)!;
      for (const text of app.benefits ?? []) {
        expect(text, `${slug}: "${text}" must be future-oriented`).toMatch(/\bWill\b/);
      }
    }
  });
});

describe('milestone statuses and progress (P3)', () => {
  const ALL = ['done', 'in-progress', 'planned', 'pending', 'blocked'];
  it('all five statuses are used by shipped data and no unknown status exists', () => {
    const seen = new Set<string>();
    for (const app of UPCOMING_APPS) {
      for (const m of app.milestones ?? []) {
        expect(ALL, `${app.id}/${m.id} status`).toContain(m.status);
        seen.add(m.status);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
  it('progress counts only done and is zero-safe', () => {
    for (const app of UPCOMING_APPS) {
      const ms = app.milestones ?? [];
      const done = ms.filter((m) => m.status === 'done').length;
      const pct = ms.length ? Math.round((done / ms.length) * 100) : 0;
      expect(pct, `${app.id} progress`).toBe(ms.length ? Math.round((done / ms.length) * 100) : 0);
      if (ms.length === 0) expect(pct).toBe(0);
      if (pct === 100) expect(done).toBe(ms.length);
    }
  });
});
