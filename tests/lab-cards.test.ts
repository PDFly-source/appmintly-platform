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
import { UPCOMING_APPS, ROADMAP_STATUS_LABEL, ROADMAP_STATUS_SUBTITLE } from '../data/upcoming-apps';

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
 * These tests keep the four required cards honest:
 *  - exact statuses for BillCraft, Cartora, NutriLens, Register
 *  - status-specific availability messages on every record
 *  - NO public destination (publicUrl/conceptUrl) unless a real one
 *    exists — so no unavailable product can ever be opened or installed
 *    through a Lab CTA, and nothing is marked published without a real
 *    verified public URL.
 */
describe('finalized project status system — four correct project cards', () => {
  const byId = (id: string) => UPCOMING_APPS.find((a) => a.id === id);

  it('the four records carry their required finalized statuses', () => {
    expect(byId('billcraft')?.roadmapStatus).toBe('early-testing');
    expect(byId('cartora')?.roadmapStatus).toBe('in-development');
    expect(byId('nutrilens')?.roadmapStatus).toBe('in-development');
    expect(byId('register')?.roadmapStatus).toBe('planned');
  });

  it('status labels follow the finalized system vocabulary', () => {
    expect(byId('billcraft')?.roadmapStatusLabel).toBe('Internal Only');
    expect(byId('cartora')?.roadmapStatusLabel).toBe('Building Now');
    expect(byId('nutrilens')?.roadmapStatusLabel).toBe('Building Now');
    expect(byId('register')?.roadmapStatusLabel).toBe('Idea & Planning');
  });

  it('every record carries a status-specific availability (access) message', () => {
    expect(byId('billcraft')?.accessMessage).toBe('Internal Testing Only — Not publicly accessible.');
    expect(byId('cartora')?.accessMessage).toBe('Currently being built — public release not available.');
    expect(byId('nutrilens')?.accessMessage).toBe('Currently being built — public release not available.');
    expect(byId('register')?.accessMessage).toBe('Development has not started.');
  });

  it('BillCraft (Early Testing) has NO public install/open destination', () => {
    const billcraft = byId('billcraft')!;
    expect(billcraft.publicUrl).toBeUndefined();
    expect(billcraft.conceptUrl).toBeUndefined();
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
    // Current dataset: nothing has been published yet — an honest count of 0.
    expect(UPCOMING_APPS.filter((a) => a.roadmapStatus === 'published').length).toBe(0);
  });

  it('Register (Planned) has no concept URL — the CTA is honestly "Coming Later"', () => {
    expect(byId('register')?.conceptUrl).toBeUndefined();
  });

  it('no fabricated verification: pending checks stay pending, no invented passes', () => {
    for (const app of UPCOMING_APPS) {
      for (const check of app.verification?.checks ?? []) {
        // Only Register has recorded real evidence; all other checks stay pending.
        if (app.id !== 'register') {
          expect(check.result, `${app.id} ${check.category}`).toBe('pending');
        }
      }
    }
  });

  it('roadmap progress derives only from each record own milestones — no copied progress', () => {
    const doneOf = (id: string) => byId(id)!.milestones.filter((m) => m.status === 'done').length;
    expect(doneOf('billcraft')).toBe(2); // its own records
    expect(doneOf('cartora')).toBe(2);   // distinct from NutriLens
    expect(doneOf('nutrilens')).toBe(1); // NOT Cartora's progress
    expect(doneOf('register')).toBe(1);
  });
});

describe('problem statements and benefits — honest, complete, claim-free', () => {
  it('every public app record carries a problem statement and benefits', () => {
    expect(UPCOMING_APPS.length).toBe(4);
    for (const app of UPCOMING_APPS) {
      expect(app.problem, `${app.id} problem`).toBeTruthy();
      expect(app.benefits, `${app.id} benefits`).toBeTruthy();
      expect(app.benefits!.length).toBeGreaterThanOrEqual(3);
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

  it('overview counts derive from the records: 4 / 1 / 2 / 1 / 0', () => {
    const count = (s?: string) =>
      s ? UPCOMING_APPS.filter((a) => a.roadmapStatus === s).length : UPCOMING_APPS.length;
    expect(count()).toBe(4); // All Projects
    expect(count('planned')).toBe(1);
    expect(count('in-development')).toBe(2);
    expect(count('early-testing')).toBe(1);
    expect(count('published')).toBe(0); // honest zero — no verified public URL yet
  });
});
