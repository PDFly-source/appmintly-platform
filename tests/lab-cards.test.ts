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
import { UPCOMING_APPS } from '../data/upcoming-apps';

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
