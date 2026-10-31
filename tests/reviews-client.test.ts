import { describe, expect, it } from 'vitest';
import {
  describeStatus,
  formatReviewDate,
  mineForSlug,
  parseMine,
  reviewCountLabel,
  summaryLabel,
  upsertMine,
  validateDraft,
} from '@/lib/reviews/client';

describe('review draft validation mirrors the server', () => {
  it('requires enough text', () => {
    expect(validateDraft({ body: 'too short', rating: null, displayName: '' }).ok).toBe(false);
    expect(validateDraft({ body: 'A genuinely useful review body.', rating: null, displayName: '' }).ok).toBe(true);
  });
  it('refuses links and impossible ratings', () => {
    expect(validateDraft({ body: 'See https://spam.example now please', rating: 5, displayName: '' }).ok).toBe(false);
    expect(validateDraft({ body: 'A genuinely useful review body.', rating: 9, displayName: '' }).ok).toBe(false);
    expect(validateDraft({ body: 'A genuinely useful review body.', rating: 0, displayName: '' }).ok).toBe(false);
  });
  it('accepts an optional rating and name', () => {
    expect(validateDraft({ body: 'A genuinely useful review body.', rating: null, displayName: 'Sam' }).ok).toBe(true);
  });
});

describe('ratings are only shown when they are real', () => {
  it('shows nothing without approved rated reviews', () => {
    expect(summaryLabel({ reviewCount: 0, ratedCount: 0, averageRating: null })).toBeNull();
    expect(summaryLabel({ reviewCount: 3, ratedCount: 0, averageRating: null })).toBeNull();
    expect(summaryLabel(null)).toBeNull();
  });
  it('formats an actual average with its real count', () => {
    expect(summaryLabel({ reviewCount: 3, ratedCount: 2, averageRating: 4.5 })).toBe('4.5 from 2 rated reviews');
    expect(summaryLabel({ reviewCount: 1, ratedCount: 1, averageRating: 5 })).toBe('5.0 from 1 rated review');
  });
  it('never invents a review count', () => {
    expect(reviewCountLabel({ reviewCount: 0, ratedCount: 0, averageRating: null })).toBeNull();
    expect(reviewCountLabel({ reviewCount: 1, ratedCount: 1, averageRating: 4 })).toBe('1 published review');
  });
});

describe('status copy is explicit about moderation', () => {
  it('labels every state without claiming verification', () => {
    expect(describeStatus('pending')).toMatch(/moderation/i);
    expect(describeStatus('approved')).toBe('Published');
    expect(describeStatus('removed')).toBe('Removed');
    expect(describeStatus('mystery')).toBe('Status unavailable');
  });
});

describe('this browser remembers only its own reviews', () => {
  const entry = { id: 'r-abc123', slug: 'cineflow', token: 'a'.repeat(20), created_at: 1 };
  it('parses valid entries and rejects junk', () => {
    expect(parseMine(JSON.stringify([entry]))).toEqual([entry]);
    expect(parseMine('not-json')).toEqual([]);
    expect(parseMine(JSON.stringify([{ id: 'nope', slug: 'cineflow', token: 'x' }]))).toEqual([]);
    expect(parseMine(JSON.stringify([{ ...entry, token: 'short' }]))).toEqual([]);
  });
  it('keeps one entry per review and filters by app', () => {
    const updated = upsertMine([entry], { ...entry, token: 'b'.repeat(20) });
    expect(updated).toHaveLength(1);
    expect(updated[0].token).toBe('b'.repeat(20));
    expect(mineForSlug(updated, 'cineflow')).toHaveLength(1);
    expect(mineForSlug(updated, 'nexdrop')).toHaveLength(0);
  });
});

describe('dates are displayed only when real', () => {
  it('passes through ISO dates and drops junk', () => {
    expect(formatReviewDate('2026-10-31T09:00:00.000Z')).toBe('2026-10-31');
    expect(formatReviewDate('soon')).toBe('');
    expect(formatReviewDate('')).toBe('');
  });
});
