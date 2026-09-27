'use client';

/**
 * Phase 16.12 — native AppMintly service submission form.
 *
 * Premium, minimal, accessible client form used by:
 *   /services/request-app, /services/suggest-feature, /services/report-issue
 *
 * - No GitHub dependency: submits to the AppMintly Publisher API worker.
 * - Client-side validation mirrors the server rules for instant feedback;
 *   the server re-validates everything (never trust the client).
 * - Anti-spam: hidden honeypot field + time gate (2s) checked server-side.
 * - States: idle -> submitting -> success | error. Duplicate submissions
 *   are prevented while a request is in flight.
 */

import { useRef, useState } from 'react';
import { Check, Send } from 'lucide-react';
import { SERVICE_SUBMISSION_ENDPOINT } from '@/lib/service-submissions';

export type SubmissionField = {
  name: string;
  label: string;
  required?: boolean;
  kind?: 'text' | 'textarea' | 'select';
  options?: string[];
  placeholder?: string;
  rows?: number;
  hint?: string;
  autoComplete?: string;
};

type Props = {
  submissionType: 'request_app' | 'feature_suggestion' | 'issue_report';
  submitLabel: string;
  successTitle: string;
  successMessage: string;
  fields: SubmissionField[];
};

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const URL_RE = /^https?:\/\/\S+\.\S+/i;

function validateField(field: SubmissionField, value: string): string | null {
  const v = value.trim();
  if (field.required && !v) return `${field.label.replace(/ \*$/, '')} is required.`;
  if (!v) return null;
  if (field.name === 'email' && !EMAIL_RE.test(v)) return 'Please enter a valid email address.';
  if ((field.name === 'app_link' || field.name === 'reference_link' || field.name === 'page_url') && !URL_RE.test(v)) {
    return 'Please enter a full https:// link.';
  }
  if (field.required && field.kind === 'textarea' && v.length < 10) {
    return 'Please add a little more detail (at least 10 characters).';
  }
  return null;
}

export default function SubmissionForm({
  submissionType,
  submitLabel,
  successTitle,
  successMessage,
  fields,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const formTs = useRef(Date.now());

  const setField = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const resetForAnother = () => {
    setValues({});
    setErrors({});
    setFormError('');
    setSucceeded(false);
    formTs.current = Date.now();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setFormError('');

    const nextErrors: Record<string, string> = {};
    let honeypot = '';
    for (const field of fields) {
      const err = validateField(field, values[field.name] || '');
      if (err) nextErrors[field.name] = err;
    }
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      const first = document.getElementById(`sub-${submissionType}-${Object.keys(nextErrors).find((k) => nextErrors[k])}`);
      first?.focus();
      return;
    }

    const form = e.currentTarget;
    honeypot = (form.elements.namedItem('hp') as HTMLInputElement | null)?.value || '';

    setSubmitting(true);
    try {
      const res = await fetch(SERVICE_SUBMISSION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: submissionType,
          ...values,
          hp: honeypot,
          ts: Date.now(),
          form_ts: formTs.current,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setSucceeded(true);
      } else {
        setFormError(data?.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setFormError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (succeeded) {
    return (
      <div
        className="rounded-2xl border border-[#16A765]/30 bg-card p-6 sm:p-8 text-center motion-safe:animate-in"
        role="status"
        aria-live="polite"
      >
        <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#16A765]/15 border border-[#16A765]/30 mb-4">
          <Check className="w-6 h-6 text-[#16A765]" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-black mb-1.5">{successTitle}</h2>
        <p className="text-sm text-mut mb-6">{successMessage}</p>
        <button
          type="button"
          onClick={resetForAnother}
          className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl border border-line bg-transparent text-sm font-bold text-ink hover:border-ink/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976F3]/50 transition-colors cursor-pointer"
        >
          Submit another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label={submitLabel} className="space-y-5">
      {/* Honeypot: hidden from users and screen readers; bots only. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto w-px h-px overflow-hidden">
        <label>
          Website
          <input type="text" name="hp" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {fields.map((field) => {
        const id = `sub-${submissionType}-${field.name}`;
        const err = errors[field.name];
        const describedBy = [err ? `${id}-error` : null, field.hint ? `${id}-hint` : null]
          .filter(Boolean)
          .join(' ') || undefined;
        return (
          <div key={field.name}>
            <label htmlFor={id} className="block text-xs font-black uppercase tracking-wide mb-1.5">
              {field.label}
              {field.required ? (
                <>
                  {' '}
                  <span className="text-[#C2410C]" aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </>
              ) : null}
            </label>

            {field.kind === 'textarea' ? (
              <textarea
                id={id}
                name={field.name}
                rows={field.rows || 4}
                maxLength={2000}
                placeholder={field.placeholder}
                autoComplete={field.autoComplete || 'off'}
                aria-invalid={Boolean(err) || undefined}
                aria-describedby={describedBy}
                value={values[field.name] || ''}
                onChange={(e) => setField(field.name, e.target.value)}
                aria-required={field.required || undefined}
                className={`w-full rounded-xl bg-card border px-4 py-3 text-sm text-ink placeholder:text-mut/70 outline-none focus-visible:ring-2 focus-visible:ring-[#1976F3]/40 focus-visible:border-[#1976F3]/60 transition-colors min-h-[44px] ${
                  err ? 'border-[#C2410C]/60' : 'border-line'
                }`}
              />
            ) : field.kind === 'select' ? (
              <select
                id={id}
                name={field.name}
                aria-invalid={Boolean(err) || undefined}
                aria-describedby={describedBy}
                aria-required={field.required || undefined}
                value={values[field.name] || ''}
                onChange={(e) => setField(field.name, e.target.value)}
                className={`w-full rounded-xl bg-card border px-4 py-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-[#1976F3]/40 focus-visible:border-[#1976F3]/60 transition-colors min-h-[44px] cursor-pointer ${
                  err ? 'border-[#C2410C]/60' : 'border-line'
                } ${values[field.name] ? '' : 'text-mut/70'}`}
              >
                <option value="" disabled>
                  {field.placeholder || `Choose ${field.label.toLowerCase()}`}
                </option>
                {(field.options || []).map((opt) => (
                  <option key={opt} value={opt} className="text-ink">
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                name={field.name}
                type={field.name === 'email' ? 'email' : 'text'}
                inputMode={field.name === 'email' ? 'email' : undefined}
                maxLength={field.name === 'email' ? 254 : field.name.includes('url') || field.name.includes('link') ? 500 : 120}
                placeholder={field.placeholder}
                autoComplete={field.autoComplete || 'off'}
                aria-invalid={Boolean(err) || undefined}
                aria-describedby={describedBy}
                aria-required={field.required || undefined}
                value={values[field.name] || ''}
                onChange={(e) => setField(field.name, e.target.value)}
                className={`w-full rounded-xl bg-card border px-4 py-3 text-sm text-ink placeholder:text-mut/70 outline-none focus-visible:ring-2 focus-visible:ring-[#1976F3]/40 focus-visible:border-[#1976F3]/60 transition-colors min-h-[44px] ${
                  err ? 'border-[#C2410C]/60' : 'border-line'
                }`}
              />
            )}

            {field.hint && !err ? (
              <p id={`${id}-hint`} className="mt-1.5 text-xs text-mut">
                {field.hint}
              </p>
            ) : null}
            {err ? (
              <p id={`${id}-error`} className="mt-1.5 text-xs font-bold text-[#C2410C]">
                {err}
              </p>
            ) : null}
          </div>
        );
      })}

      {formError ? (
        <p
          role="alert"
          className="rounded-xl border border-[#C2410C]/40 bg-[#C2410C]/10 px-4 py-3 text-sm font-bold text-[#C2410C]"
        >
          {formError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full min-h-[48px] rounded-xl bg-inkbg hover:bg-[#16A765] text-white font-black text-sm shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976F3]/50 disabled:opacity-60 disabled:cursor-not-allowed motion-safe:hover:-translate-y-0.5"
      >
        <Send className="w-4 h-4" aria-hidden="true" />
        {submitting ? 'Submitting...' : submitLabel}
      </button>

      <p className="text-xs text-mut text-center">
        Your submission goes directly to the AppMintly team. No account needed.
      </p>
    </form>
  );
}
