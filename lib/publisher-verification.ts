/**
 * Publisher verification state — ONE strict resolver for the public surface.
 *
 * The canonical record (data/publishers.json) carries a single `verified`
 * field. That field is the only evidence the marketplace has, so it is read
 * strictly:
 *
 *   verified === true   → 'verified'    (the record explicitly says so)
 *   verified === false  → 'unverified'  (the record explicitly says not)
 *   anything else       → 'unknown'     (missing, null, "true", 1, {}, …)
 *
 * 'unknown' fails closed: it renders the same neutral wording as 'unverified'
 * and never shows a badge. Verification is never inferred from publisher
 * existence, application count, ownership, profile completeness or a display
 * name, and an absent badge never means the publisher is suspicious.
 *
 * Pure module: no React, no I/O, no JSON import, so it is unit-testable from
 * a script and safe to share between server metadata and client components.
 */

export type PublisherVerificationState = 'verified' | 'unverified' | 'unknown';

type MaybePublisher = { verified?: unknown } | null | undefined;

/** Strict canonical verification state. Never throws on malformed input. */
export function getVerificationState(identity: MaybePublisher): PublisherVerificationState {
  if (!identity || typeof identity !== 'object') return 'unknown';
  const value = (identity as { verified?: unknown }).verified;
  if (value === true) return 'verified';
  if (value === false) return 'unverified';
  return 'unknown';
}

/** True only when the canonical record explicitly marks the publisher verified. */
export function isVerifiedPublisher(identity: MaybePublisher): boolean {
  return getVerificationState(identity) === 'verified';
}

export interface PublisherVerificationCopy {
  state: PublisherVerificationState;
  /** Render the verified badge. True only for an explicit canonical `true`. */
  showVerifiedBadge: boolean;
  /** Small label above the publisher name. */
  eyebrow: string;
  /** One-line description of the applications list. */
  appsIntro: string;
  /** Short descriptor used in page titles and social metadata. */
  metaDescriptor: string;
}

const VERIFIED_COPY = {
  eyebrow: 'Verified Publisher',
  appsIntro: 'All published applications from this verified publisher.',
  metaDescriptor: 'Verified Publisher',
} as const;

const NEUTRAL_COPY = {
  eyebrow: 'Publisher Profile',
  appsIntro: 'Applications published by this publisher.',
  metaDescriptor: 'Publisher Profile',
} as const;

/**
 * Public copy for a publisher. Verified wording requires an explicit canonical
 * `true`; 'unverified' and 'unknown' both get neutral wording.
 */
export function getPublisherVerificationCopy(identity: MaybePublisher): PublisherVerificationCopy {
  const state = getVerificationState(identity);
  const copy = state === 'verified' ? VERIFIED_COPY : NEUTRAL_COPY;
  return {
    state,
    showVerifiedBadge: state === 'verified',
    eyebrow: copy.eyebrow,
    appsIntro: copy.appsIntro,
    metaDescriptor: copy.metaDescriptor,
  };
}
