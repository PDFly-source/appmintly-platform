/**
 * AppMintly Item 7 — review client helpers (pure, testable).
 *
 * These mirror the worker's rules so the form can explain a problem before a
 * request is made. The worker remains the authority: it re-validates and
 * re-sanitizes everything, and only it decides what is public.
 *
 * HONESTY RULES ENCODED HERE
 * - A rating average exists only when the server says at least one approved
 *   review carried a rating. With none, `averageRating` is null and the UI
 *   shows nothing rather than a 0 or a placeholder score.
 * - Reviewers are never described as verified users: the only labels are
 *   "anonymous" submissions and token-based ownership of one's own review.
 * - Display names are user text: they are rendered as text, never as markup.
 */

export const REVIEW_API_BASE = 'https://appmintly-publisher-api.sbn50088.workers.dev';
export const REVIEW_BODY_MIN = 10;
export const REVIEW_BODY_MAX = 1200;
export const REVIEW_NAME_MAX = 40;
export const MY_REVIEWS_KEY = 'appmintly_reviews_mine_v1';

export interface PublicReview {
  id: string;
  slug: string;
  displayName: string;
  rating: number | null;
  body: string;
  created_at: string;
  updated_at: string;
  edited: boolean;
  helpful: number;
  notHelpful: number;
  submission: 'anonymous' | string;
  ownership: 'token' | string;
}

export interface ReviewSummary {
  reviewCount: number;
  ratedCount: number;
  averageRating: number | null;
  distribution?: Record<string, number>;
}

export interface ReviewDraft {
  body: string;
  rating: number | null;
  displayName: string;
}

export interface DraftValidation {
  ok: boolean;
  errors: string[];
}

/** Client-side mirror of the worker's text rules (never a bypass). */
export function validateDraft(draft: ReviewDraft): DraftValidation {
  const errors: string[] = [];
  const body = (draft.body || '').trim();
  if (body.length < REVIEW_BODY_MIN) errors.push(`Write at least ${REVIEW_BODY_MIN} characters.`);
  if (body.length > REVIEW_BODY_MAX) errors.push(`Keep it under ${REVIEW_BODY_MAX} characters.`);
  if (/https?:\/\/|www\./i.test(body)) errors.push('Links are not allowed in reviews.');
  if (draft.rating !== null && draft.rating !== undefined) {
    const r = Number(draft.rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) errors.push('Choose a rating from 1 to 5 stars, or leave it empty.');
  }
  if ((draft.displayName || '').length > REVIEW_NAME_MAX) errors.push(`Names are limited to ${REVIEW_NAME_MAX} characters.`);
  return { ok: errors.length === 0, errors };
}

/**
 * Rating summary label. Returns null when there is nothing real to show, so the
 * caller cannot accidentally render "0.0 from 0 reviews".
 */
export function summaryLabel(summary: ReviewSummary | null): string | null {
  if (!summary) return null;
  const rated = Number(summary.ratedCount) || 0;
  if (rated === 0 || summary.averageRating === null || summary.averageRating === undefined) return null;
  const avg = Number(summary.averageRating);
  if (!Number.isFinite(avg)) return null;
  return `${avg.toFixed(1)} from ${rated} rated ${rated === 1 ? 'review' : 'reviews'}`;
}

export function reviewCountLabel(summary: ReviewSummary | null): string | null {
  if (!summary) return null;
  const count = Number(summary.reviewCount) || 0;
  if (count === 0) return null;
  return `${count} published ${count === 1 ? 'review' : 'reviews'}`;
}

export const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending owner moderation',
  approved: 'Published',
  rejected: 'Not published',
  removed: 'Removed',
};

export function describeStatus(status: string): string {
  return STATUS_LABELS[status] || 'Status unavailable';
}

export interface MyReviewEntry {
  id: string;
  slug: string;
  token: string;
  created_at: number;
}

/** Defensive parse of this browser's own submissions (ids + edit tokens). */
export function parseMine(raw: string | null): MyReviewEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.reviews) ? parsed.reviews : [];
    return list.filter(
      (entry: unknown): entry is MyReviewEntry => {
        if (!entry || typeof entry !== 'object') return false;
        const e = entry as Record<string, unknown>;
        return (
          typeof e.id === 'string' &&
          /^r-[a-z0-9]+$/.test(e.id) &&
          typeof e.slug === 'string' &&
          /^[a-z0-9][a-z0-9-]{0,63}$/.test(e.slug) &&
          typeof e.token === 'string' &&
          e.token.length >= 10
        );
      }
    );
  } catch {
    return [];
  }
}

export function upsertMine(list: MyReviewEntry[], entry: MyReviewEntry): MyReviewEntry[] {
  return [...list.filter((item) => item.id !== entry.id), entry].slice(-20);
}

export function mineForSlug(list: MyReviewEntry[], slug: string): MyReviewEntry[] {
  return list.filter((item) => item.slug === slug);
}

/** Format a real ISO timestamp; returns '' rather than a guessed date. */
export function formatReviewDate(iso: string): string {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  return iso.slice(0, 10);
}
