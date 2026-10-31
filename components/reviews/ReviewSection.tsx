'use client';

/**
 * AppMintly Item 7 — app reviews on the app detail page.
 *
 * DISPLAY CONTRACT
 * - Only reviews the worker returns as approved are rendered. Pending, rejected
 *   and removed reviews are never fetched by this component, because the public
 *   endpoint does not return them.
 * - The average is shown only when the server reports at least one approved
 *   review that carried a rating; otherwise nothing is shown at all.
 * - Reviewers are described as "anonymous"; the only ownership claim is that
 *   this browser holds the edit token for its own submission.
 * - All user text renders as text (React escapes it), and the worker strips
 *   markup before storage, so a stored XSS payload cannot reach this DOM.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Flag, HelpCircle, Loader2, MessageSquare, ShieldCheck, Star, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import type { AppItem } from '@/data/apps';
import {
  REVIEW_API_BASE,
  REVIEW_BODY_MAX,
  REVIEW_BODY_MIN,
  describeStatus,
  formatReviewDate,
  mineForSlug,
  parseMine,
  reviewCountLabel,
  summaryLabel,
  upsertMine,
  validateDraft,
  type MyReviewEntry,
  type PublicReview,
  type ReviewSummary,
} from '@/lib/reviews/client';

export function ReviewSection({ app }: { app: AppItem }) {
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState('');
  const [mine, setMine] = useState<MyReviewEntry[]>([]);
  const [mineStatus, setMineStatus] = useState<Record<string, string | null>>({});
  const [voted, setVoted] = useState<Record<string, boolean>>({});
  const [reportOpen, setReportOpen] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${REVIEW_API_BASE}/reviews?slug=${encodeURIComponent(app.slug)}`, {
        headers: { accept: 'application/json' },
      });
      const data = await res.json();
      setReviews(Array.isArray(data.reviews) ? data.reviews : []);
      setSummary(data.summary || null);
    } catch {
      setReviews([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [app.slug]);

  useEffect(() => {
    // Deliberate post-mount fetch: the list is server-moderated state, so it can
    // only be read after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // This browser's own submissions, plus the live status of each from the server.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const entries = mineForSlug(parseMine(window.localStorage.getItem('appmintly_reviews_mine_v1')), app.slug);
    // Reading this browser's own submissions can only happen after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMine(entries);
    void Promise.all(
      entries.map(async (entry) => {
        try {
          const res = await fetch(`${REVIEW_API_BASE}/reviews/mine`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: entry.id, token: entry.token }),
          });
          if (!res.ok) return [entry.id, null] as const;
          const data = await res.json();
          return [entry.id, data.review?.status ?? null] as const;
        } catch {
          return [entry.id, null] as const;
        }
      })
    ).then((pairs) => setMineStatus(Object.fromEntries(pairs)));
  }, [app.slug]);

  const rememberMine = (entry: MyReviewEntry) => {
    if (typeof window === 'undefined') return;
    const next = upsertMine(parseMine(window.localStorage.getItem('appmintly_reviews_mine_v1')), entry);
    window.localStorage.setItem('appmintly_reviews_mine_v1', JSON.stringify(next));
    setMine(mineForSlug(next, app.slug));
  };

  const forgetMine = (id: string) => {
    if (typeof window === 'undefined') return;
    const next = parseMine(window.localStorage.getItem('appmintly_reviews_mine_v1')).filter((x) => x.id !== id);
    window.localStorage.setItem('appmintly_reviews_mine_v1', JSON.stringify(next));
    setMine(mineForSlug(next, app.slug));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const check = validateDraft({ body, rating, displayName });
    setErrors(check.errors);
    if (!check.ok) return;
    setSubmitting(true);
    setBanner('');
    try {
      const res = await fetch(`${REVIEW_API_BASE}/reviews/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: app.slug, body, rating, displayName, honeypot }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors([data.error || 'Your review could not be submitted.']);
        return;
      }
      if (data.id && data.token) {
        rememberMine({ id: data.id, slug: app.slug, token: data.token, created_at: Date.now() });
        setMineStatus((prev) => ({ ...prev, [data.id]: data.status || 'pending' }));
      }
      setBanner(data.message || 'Thanks. Your review is pending owner moderation and is not public yet.');
      setBody('');
      setRating(null);
      setDisplayName('');
      setOpen(false);
      await load();
    } catch {
      setErrors(['Your review could not be submitted. Please try again.']);
    } finally {
      setSubmitting(false);
    }
  };

  const vote = async (id: string, kind: 'helpful' | 'notHelpful') => {
    if (voted[id]) return;
    setVoted((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`${REVIEW_API_BASE}/reviews/vote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setReviews((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, helpful: data.helpful ?? r.helpful, notHelpful: data.notHelpful ?? r.notHelpful }
              : r
          )
        );
      }
    } catch {
      /* a failed vote is silent: nothing is claimed */
    }
  };

  const report = async (id: string) => {
    try {
      const res = await fetch(`${REVIEW_API_BASE}/reviews/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, reason: reportReason }),
      });
      if (res.ok) {
        setBanner('Reported. An owner will review it.');
        setReportOpen(null);
        setReportReason('');
      }
    } catch {
      /* silent */
    }
  };

  const editMine = async (entry: MyReviewEntry) => {
    const nextBody = window.prompt('Edit your review', body || '');
    if (!nextBody) return;
    const check = validateDraft({ body: nextBody, rating, displayName });
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    try {
      const res = await fetch(`${REVIEW_API_BASE}/reviews/edit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: entry.id, token: entry.token, body: nextBody, rating, displayName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors([data.error || 'That edit was refused.']);
        return;
      }
      setMineStatus((prev) => ({ ...prev, [entry.id]: data.status || 'pending' }));
      setBanner('Edited. It is back in the moderation queue until it is approved again.');
      await load();
    } catch {
      setErrors(['That edit could not be sent.']);
    }
  };

  const deleteMine = async (entry: MyReviewEntry) => {
    if (!window.confirm('Delete your review? This cannot be undone.')) return;
    try {
      const res = await fetch(`${REVIEW_API_BASE}/reviews/delete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: entry.id, token: entry.token }),
      });
      if (res.ok) {
        forgetMine(entry.id);
        setBanner('Your review was deleted.');
        await load();
      }
    } catch {
      setErrors(['That delete could not be sent.']);
    }
  };

  const average = summaryLabel(summary);
  const countLabel = reviewCountLabel(summary);

  return (
    <section aria-labelledby="reviews-heading" className="mt-8 rounded-2xl border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="reviews-heading" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-mut">
            <MessageSquare className="h-4 w-4" aria-hidden="true" /> Reviews
          </h2>
          {average ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-ink">
              <Star className="h-4 w-4 fill-forge-yellow text-forge-yellow" aria-hidden="true" />
              {average}
            </p>
          ) : (
            <p className="mt-1 text-sm text-mut">No rating yet. Ratings appear only once approved reviews carry one.</p>
          )}
          {countLabel ? <p className="text-[11px] text-mut">{countLabel}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-4 text-xs font-bold text-ink hover:border-ink/30"
        >
          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> {open ? 'Close' : 'Write a review'}
        </button>
      </div>

      {banner ? (
        <p role="status" className="mt-3 rounded-xl border border-forge-green/30 bg-forge-green/10 p-3 text-[12px] font-semibold text-ink">
          {banner}
        </p>
      ) : null}
      {errors.length > 0 ? (
        <ul role="alert" className="mt-3 space-y-1 rounded-xl border border-forge-red/30 bg-forge-red/10 p-3 text-[12px] font-semibold text-forge-red">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <span className="block text-[11px] font-bold uppercase tracking-wider text-mut">Rating (optional)</span>
            <div role="radiogroup" aria-label="Rating" className="mt-1 flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={`${value} star${value === 1 ? '' : 's'}`}
                  onClick={() => setRating(rating === value ? null : value)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line"
                >
                  <Star className={`h-5 w-5 ${rating !== null && value <= rating ? 'fill-forge-yellow text-forge-yellow' : 'text-mut'}`} aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="review-body" className="block text-[11px] font-bold uppercase tracking-wider text-mut">
              Your experience
            </label>
            <textarea
              id="review-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={REVIEW_BODY_MAX}
              placeholder={`What worked, what did not. At least ${REVIEW_BODY_MIN} characters, no links.`}
              className="mt-1 w-full rounded-xl border border-line bg-canvas p-3 text-sm text-ink"
            />
            <p className="mt-1 text-[11px] text-mut">
              {body.length}/{REVIEW_BODY_MAX}
            </p>
          </div>
          <div>
            <label htmlFor="review-name" className="block text-[11px] font-bold uppercase tracking-wider text-mut">
              Display name (optional)
            </label>
            <input
              id="review-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
              placeholder="Leave empty to appear as Anonymous"
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink"
            />
          </div>
          {/* Honeypot: hidden from people, filled by naive bots. */}
          <div aria-hidden="true" className="hidden">
            <label htmlFor="review-extra">Leave this field empty</label>
            <input id="review-extra" tabIndex={-1} value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>
          <p className="flex items-start gap-1.5 text-[11px] text-mut">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Reviews are moderated before they appear. This is an anonymous submission: AppMintly cannot verify who wrote it
            or that the app was installed, so nothing here is labelled as a verified-user review.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-xs font-bold text-white disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Submit for review
          </button>
        </form>
      ) : null}

      {mine.length > 0 ? (
        <div className="mt-4 rounded-xl border border-line bg-canvas p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-mut">Your submissions from this browser</p>
          <ul className="mt-2 space-y-2">
            {mine.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="rounded-md bg-white px-2 py-0.5 font-bold text-ink">
                  {describeStatus(mineStatus[entry.id] || 'pending')}
                </span>
                <span className="font-mono text-mut">{entry.id}</span>
                <button type="button" onClick={() => void editMine(entry)} className="min-h-11 rounded-lg border border-line px-3 font-bold text-ink">
                  Edit
                </button>
                <button type="button" onClick={() => void deleteMine(entry)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-forge-red/30 px-3 font-bold text-forge-red">
                  <Trash2 className="h-3 w-3" aria-hidden="true" /> Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-mut">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading reviews…
          </p>
        ) : reviews.length === 0 ? (
          <div className="rounded-xl border border-line bg-canvas p-4">
            <p className="text-sm font-semibold text-ink">No published reviews yet.</p>
            <p className="mt-1 text-[12px] text-mut">
              Reviews appear here only after the owner approves them. Be the first to share a real experience with{' '}
              {app.name}.
            </p>
            {!open ? (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-ink px-4 text-xs font-bold text-white"
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> Write the first review
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-3">
            {reviews.map((review) => (
              <li key={review.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-mut">
                  <span className="font-bold text-ink">{review.displayName || 'Anonymous'}</span>
                  <span className="rounded-md bg-canvas px-1.5 py-0.5">anonymous submission</span>
                  {review.rating ? (
                    <span className="inline-flex items-center gap-0.5 font-bold text-ink">
                      <Star className="h-3 w-3 fill-forge-yellow text-forge-yellow" aria-hidden="true" />
                      {review.rating}/5
                    </span>
                  ) : null}
                  <span>{formatReviewDate(review.created_at)}</span>
                  {review.edited ? <span>edited</span> : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{review.body}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void vote(review.id, 'helpful')}
                    disabled={Boolean(voted[review.id])}
                    aria-label={`Mark this review helpful (${review.helpful} found it helpful)`}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-[11px] font-bold text-ink disabled:opacity-60"
                  >
                    <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" /> Helpful ({review.helpful})
                  </button>
                  <button
                    type="button"
                    onClick={() => void vote(review.id, 'notHelpful')}
                    disabled={Boolean(voted[review.id])}
                    aria-label={`Mark this review not helpful (${review.notHelpful} did not find it helpful)`}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-[11px] font-bold text-ink disabled:opacity-60"
                  >
                    <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" /> Not helpful ({review.notHelpful})
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportOpen(reportOpen === review.id ? null : review.id)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-[11px] font-bold text-mut"
                  >
                    <Flag className="h-3.5 w-3.5" aria-hidden="true" /> Report
                  </button>
                </div>
                {reportOpen === review.id ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                      placeholder="Why is this inappropriate?"
                      aria-label="Report reason"
                      className="min-h-11 w-full max-w-sm rounded-xl border border-line bg-canvas px-3 text-[12px]"
                    />
                    <button
                      type="button"
                      onClick={() => void report(review.id)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-ink px-4 text-[11px] font-bold text-white"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Send report
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-4 flex items-start gap-1.5 text-[11px] text-mut">
        <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        One vote per browser. Reports are reviewed by the owner. AppMintly stores no IP addresses with reviews — only a
        short-lived rate-limit counter that cannot be joined to any review.
      </p>
    </section>
  );
}
