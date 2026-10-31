'use client';

/**
 * Item 9 — public safety report form.
 *
 * What it does: validates locally, posts to the worker's validated/rate-limited
 * endpoint, then shows an honest receipt.
 * What it deliberately does not do: promise an outcome, expose other reports, or
 * describe the app as unsafe. The owner decides everything after submission.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldQuestion, X } from 'lucide-react';
import {
  RECEIPT_TEXT,
  RECEIPT_TEXT_PRIVATE,
  REPORT_CATEGORIES,
  REPORT_MESSAGE_MAX,
  TRUST_API_BASE,
  describeReportFailure,
  sanitizeReportText,
  validateReportDraft,
} from '@/lib/trust/reports';

interface Props {
  slug: string;
  appName: string;
  onClose: () => void;
}

export function ReportAppDialog({ slug, appName, onClose }: Props) {
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const [receiptId, setReceiptId] = useState('');

  const draft = useMemo(() => ({ slug, category, message, contact }), [slug, category, message, contact]);
  const validation = validateReportDraft(draft);
  const hint = REPORT_CATEGORIES.find((c) => c.id === category)?.hint;

  const submit = async () => {
    if (!validation.ok || state === 'sending') return;
    setState('sending');
    setError('');
    try {
      const res = await fetch(`${TRUST_API_BASE}/reports/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: validation.value.slug,
          category: validation.value.category,
          message: validation.value.message,
          contact: validation.value.contact,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState('error');
        setError(data.error || describeReportFailure(res.status));
        return;
      }
      setReceiptId(typeof data.id === 'string' ? data.id : '');
      setState('sent');
    } catch {
      setState('error');
      setError(describeReportFailure(0));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="report-heading">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-card p-4 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="report-heading" className="flex items-center gap-2 text-sm font-bold text-ink">
            <ShieldQuestion className="h-4 w-4" aria-hidden="true" /> Report a problem with {appName}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close report form" className="rounded-lg border border-line p-1 text-mut hover:text-ink">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {state === 'sent' ? (
          <div className="mt-3 space-y-2">
            <p className="flex items-start gap-2 rounded-xl border border-forge-green/30 bg-forge-green/10 p-3 text-[12px] font-semibold text-ink">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {RECEIPT_TEXT}
            </p>
            <p className="text-[11px] text-mut">{RECEIPT_TEXT_PRIVATE}</p>
            {receiptId ? <p className="text-[11px] text-mut">Receipt id: <span className="font-mono">{receiptId}</span></p> : null}
            <button type="button" onClick={onClose} className="mt-1 rounded-lg border border-line bg-canvas px-3 py-1.5 text-[12px] font-bold text-ink">
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="mt-1 text-[11px] text-mut">
              Reports are private and reviewed by the owner. Nothing you send is published, and the listing stays as it is
              until the owner decides otherwise.
            </p>

            <label className="mt-3 block text-[11px] font-bold text-mut">
              What is wrong?
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-canvas p-2 text-[12px] font-semibold text-ink"
              >
                <option value="">Choose a category</option>
                {REPORT_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
            {hint ? <p className="mt-1 text-[11px] text-mut">{hint}</p> : null}

            <label className="mt-3 block text-[11px] font-bold text-mut">
              What happened? ({sanitizeReportText(message).length}/{REPORT_MESSAGE_MAX})
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                maxLength={REPORT_MESSAGE_MAX}
                placeholder="Describe what you saw, in plain words. Do not include passwords."
                className="mt-1 w-full rounded-lg border border-line bg-canvas p-2 text-[12px] text-ink"
              />
            </label>

            <label className="mt-2 block text-[11px] font-bold text-mut">
              Contact email (optional, private)
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Only if you want a reply"
                className="mt-1 w-full rounded-lg border border-line bg-canvas p-2 text-[12px] text-ink"
              />
            </label>

            {!validation.ok && (message.length > 0 || category.length > 0) ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-mut">
                {validation.errors.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}

            {state === 'error' ? (
              <p className="mt-2 flex items-start gap-2 rounded-xl border border-forge-red/40 bg-forge-red/10 p-2 text-[11px] font-semibold text-ink">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {error}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={!validation.ok || state === 'sending'}
              className="mt-3 w-full rounded-xl bg-ink px-3 py-2 text-[12px] font-bold text-white disabled:opacity-40"
            >
              {state === 'sending' ? 'Sending…' : 'Send report'}
            </button>
            <p className="mt-2 text-[10px] text-mut">
              A receipt means the report was received. It is not a finding, and it does not mean the app was investigated.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
