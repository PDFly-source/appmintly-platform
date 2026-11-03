/**
 * GLOBAL ARTWORK SIZE SYSTEM — single source of truth.
 *
 * No marketplace surface may declare its own artwork dimensions, and no app
 * (existing, featured, upcoming or newly published) may override them. A
 * surface asks for a SLOT NAME; the slot resolves to one canonical size.
 *
 * The sizes below are AppMintly's established reference dimensions, lifted
 * verbatim from components/AppIcon.tsx where they have always lived:
 *   lg  = 56px  (>=sm: 64px)
 *   xl  = 80px  (>=sm: 96px)
 *   2xl = 112px (>=sm: 128px)
 *
 * History: this file exists because two gaps shipped twice. The detail hero
 * used a bespoke `max-w-[420px]` container, and cards rendered a full lockup
 * canvas inside a square slot. Both are now impossible by construction:
 * artwork is an icon in a named slot, and the slot vocabulary is closed.
 */

/** Canonical rendered icon box. `base` < 640px, `sm` >= 640px (Tailwind sm). */
export const ARTWORK_SIZE_PX = {
  xs: { base: 24, sm: 24 },
  sm: { base: 36, sm: 36 },
  md: { base: 48, sm: 48 },
  lg: { base: 56, sm: 64 },
  xl: { base: 80, sm: 96 },
  '2xl': { base: 112, sm: 128 },
} as const;

export type ArtworkSize = keyof typeof ARTWORK_SIZE_PX;

/** Tailwind classes derived from ARTWORK_SIZE_PX — do not hand-write these. */
export const ARTWORK_SIZE_CLASSES: Record<ArtworkSize, string> = {
  xs: 'w-6 h-6',
  sm: 'w-9 h-9',
  md: 'w-12 h-12',
  lg: 'w-14 h-14 sm:w-16 sm:h-16',
  xl: 'w-20 h-20 sm:w-24 sm:h-24',
  '2xl': 'w-28 h-28 sm:w-32 sm:h-32',
};

/**
 * The closed set of marketplace slots. Every surface uses one of these; the
 * renderer accepts a slot name only, never a width, ratio or app identifier.
 */
export const ARTWORK_SLOTS = {
  /** standard marketplace card (grid, explore, search, category, related) */
  card: 'lg',
  /** the taller featured card variant inside a grid */
  cardLarge: 'xl',
  /** compact list row (search list, related list) */
  list: 'sm',
  /** home featured app card */
  featured: 'xl',
  /** library and collection rows */
  library: 'lg',
  /** upcoming / roadmap cards (Lab) */
  upcoming: 'lg',
  /** app detail page — AppMintly's established 2xl reference */
  detail: '2xl',
} as const satisfies Record<string, ArtworkSize>;

export type ArtworkSlot = keyof typeof ARTWORK_SLOTS;

/** Largest box any marketplace surface may render: the detail slot. */
export const MAX_ARTWORK_PX = Math.max(
  ...Object.values(ARTWORK_SIZE_PX).map((s) => Math.max(s.base, s.sm))
);

export function sizeForSlot(slot: ArtworkSlot): ArtworkSize {
  return ARTWORK_SLOTS[slot] as ArtworkSize;
}

export function pxForSlot(slot: ArtworkSlot): { base: number; sm: number } {
  return ARTWORK_SIZE_PX[sizeForSlot(slot)];
}

/** The class string a surface must use — the only way to size artwork. */
export function classesForSlot(slot: ArtworkSlot): string {
  return ARTWORK_SIZE_CLASSES[sizeForSlot(slot)];
}
