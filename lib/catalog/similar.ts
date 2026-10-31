/**
 * AppMintly 2.0 — similar apps from real metadata only.
 *
 * Score comes from catalogued facts (category, type, tags, publisher), never
 * from popularity numbers we do not have. Ties break on the real release date.
 */
import type { AppItem } from '@/data/apps';

type AnyApp = AppItem & { tags?: string[] };

export interface SimilarOptions {
  limit?: number;
  /** Exclude apps from the same publisher (used when we want cross-publisher discovery). */
  excludeSamePublisher?: boolean;
}

export function similarApps(
  apps: AppItem[],
  target: AppItem | null | undefined,
  options: SimilarOptions = {}
): AppItem[] {
  if (!target) return [];
  const limit = options.limit ?? 4;
  const targetTags = new Set(((target as AnyApp).tags || []).map((t) => t.toLowerCase()));

  const scored = apps
    .filter((a) => a.published && a.slug !== target.slug)
    .filter(
      (a) =>
        !options.excludeSamePublisher ||
        (a as AnyApp & { developerSlug?: string }).developerSlug !==
          (target as AnyApp & { developerSlug?: string }).developerSlug
    )
    .map((a) => {
      let score = 0;
      if (a.category === target.category) score += 4;
      if (a.type === target.type) score += 2;
      const shared = ((a as AnyApp).tags || []).filter((t) => targetTags.has(t.toLowerCase()));
      score += Math.min(shared.length, 4);
      if (
        (a as AnyApp & { developerSlug?: string }).developerSlug ===
        (target as AnyApp & { developerSlug?: string }).developerSlug
      ) {
        score += 1;
      }
      return { app: a, score };
    })
    .filter((s) => s.score > 0);

  const stamp = (a: AppItem) =>
    new Date(
      (a as AnyApp & { updatedAt?: string }).updatedAt || a.lastUpdated || a.publishedAt || 0
    ).getTime() || 0;

  return scored
    .sort((x, y) => y.score - x.score || stamp(y.app) - stamp(x.app))
    .slice(0, limit)
    .map((s) => s.app);
}
