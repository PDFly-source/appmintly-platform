/**
 * Search suggestion engine — premium storefront Phase B.
 *
 * Pure, dependency-free, framework-free (unit-testable without React).
 * Suggests REAL catalog records only: every entry in the result list is a
 * passed-in app record — nothing is ever invented, padded, or faked.
 */
export interface SuggestableApp {
  slug: string;
  name: string;
  shortName?: string;
  developer: string;
  category: string;
  type: string;
}

export type SuggestionField = 'name' | 'developer' | 'category' | 'type';

export interface Suggestion {
  app: SuggestableApp;
  field: SuggestionField;
  score: number;
}

/** Subsequence match (loose typo tolerance): 0 = no match. */
function subsequence(query: string, target: string): boolean {
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) qi++;
  }
  return qi === query.length;
}

function scoreApp(app: SuggestableApp, q: string): { score: number; field: SuggestionField } | null {
  const name = (app.shortName || app.name).toLowerCase();
  const fullName = app.name.toLowerCase();
  const developer = (app.developer || '').toLowerCase();
  const category = (app.category || '').toLowerCase();
  const type = (app.type || '').toLowerCase();

  // Name is the strongest signal: exact > prefix > word-start > contains.
  if (name === q || fullName === q) return { score: 100, field: 'name' };
  if (name.startsWith(q)) return { score: 90, field: 'name' };
  const words = name.split(/[\s\-_.]+/);
  if (words.some((w) => w.startsWith(q))) return { score: 80, field: 'name' };
  if (name.includes(q)) return { score: 70, field: 'name' };

  if (developer && (developer.startsWith(q) || developer.includes(q))) {
    return { score: developer.startsWith(q) ? 55 : 45, field: 'developer' };
  }
  if (category && (category.startsWith(q) || category.includes(q))) {
    return { score: category.startsWith(q) ? 40 : 32, field: 'category' };
  }
  if (type && type.includes(q)) return { score: 28, field: 'type' };

  // Loose fallback: subsequence over the name only (e.g. "nrmay").
  if (subsequence(q, name)) return { score: 15, field: 'name' };
  return null;
}

/**
 * Rank real catalog apps for a raw query. Returns at most `limit` entries,
 * best score first; ties break alphabetically by name for stable order.
 * Queries shorter than 2 characters return no suggestions.
 */
export function suggestApps(
  apps: readonly SuggestableApp[],
  rawQuery: string,
  limit = 6
): Suggestion[] {
  const q = rawQuery.trim().toLowerCase();
  if (q.length < 2 || apps.length === 0) return [];

  const scored: Suggestion[] = [];
  for (const app of apps) {
    const hit = scoreApp(app, q);
    if (hit) scored.push({ app, field: hit.field, score: hit.score });
  }

  scored.sort((a, b) => b.score - a.score || a.app.name.localeCompare(b.app.name));

  // Dedupe by slug (an app can only appear once, at its best score).
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const s of scored) {
    if (seen.has(s.app.slug)) continue;
    seen.add(s.app.slug);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}
