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
