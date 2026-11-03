/**
 * ARTWORK POLICY — full lockup vs symbol only.
 *
 * Sizing lives in lib/artwork-tokens.ts and nowhere else. This module answers a
 * different question: what must the artwork ITSELF contain?
 *
 * The marketplace standard is that an app's brand identity is presented whole:
 * symbol, wordmark and (where the brand has one) its tagline, inside the one
 * standard square slot. An app may ship symbol-only artwork, but that is an
 * explicit declaration — never a silent fallback when a required lockup is
 * missing, and never a reason for the slot to grow.
 *
 * Pixel enforcement lives in scripts/check-artwork-lockup.mjs, which verifies
 * each declared element actually has ink inside the asset (data/artwork-lockups.json).
 */

export type ArtworkPolicy = 'full-lockup' | 'symbol-only';

export const ARTWORK_POLICIES: readonly ArtworkPolicy[] = ['full-lockup', 'symbol-only'];

/** Absent metadata means symbol-only: the historical default for the catalogue. */
export const DEFAULT_ARTWORK_POLICY: ArtworkPolicy = 'symbol-only';

export const FULL_LOCKUP_ELEMENTS = ['symbol', 'wordmark', 'tagline'] as const;
export type LockupElement = (typeof FULL_LOCKUP_ELEMENTS)[number];

export interface LockupElementBox {
  /** [x0, y0, x1, y1] in asset pixels, inclusive */
  0: number; 1: number; 2: number; 3: number;
}

export interface ArtworkLockupManifest {
  asset: string;
  policy: ArtworkPolicy;
  width: number;
  height: number;
  elements: Record<LockupElement, [number, number, number, number]>;
  source?: string;
}

/** Minimum share of a declared element box that must contain ink. */
export const MIN_ELEMENT_COVERAGE: Record<LockupElement, number> = {
  symbol: 0.08,
  wordmark: 0.04,
  tagline: 0.02,
};

/** A lockup tagline below this fraction of the canvas is unreadable at card size. */
export const MIN_READABLE_TAGLINE_PCT = 0.03;

export function policyOf(record: { artworkPolicy?: string } | null | undefined): ArtworkPolicy {
  const declared = record?.artworkPolicy;
  if (!declared) return DEFAULT_ARTWORK_POLICY;
  if (!ARTWORK_POLICIES.includes(declared as ArtworkPolicy)) {
    throw new Error(`invalid artworkPolicy '${declared}' — allowed: ${ARTWORK_POLICIES.join(', ')}`);
  }
  return declared as ArtworkPolicy;
}

export function requiresFullLockup(record: { artworkPolicy?: string } | null | undefined): boolean {
  return policyOf(record) === 'full-lockup';
}

/** Honest legibility figure: rendered tagline height in px at a slot height. */
export function renderedTaglinePx(manifest: ArtworkLockupManifest, slotHeightPx: number): number {
  const [, y0, , y1] = manifest.elements.tagline;
  return ((y1 - y0 + 1) / manifest.height) * slotHeightPx;
}
