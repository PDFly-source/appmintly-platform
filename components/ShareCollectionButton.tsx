'use client';

/**
 * Item 10 / Batch 5 — explicit, user-initiated collection sharing.
 *
 * Reuses the platform Share System (lib/share.ts) so behaviour matches every
 * other share surface: native sheet first, clipboard fallback, silence on
 * cancel, and never a fabricated success. The URL is built at click time from
 * the real origin, so nothing is computed during render.
 */

import React, { useMemo, useState } from 'react';
import { Check, Copy, Link2, Share2 } from 'lucide-react';
import { useToast } from '@/lib/ToastContext';
import { shareContent } from '@/lib/share';
import {
  SHARE_LIMITS,
  buildSharedCollectionUrl,
  encodeSharedCollection,
} from '@/lib/personalization/share';

interface Props {
  name: string;
  description?: string;
  apps: string[];
}

export function ShareCollectionButton({ name, description, apps }: Props) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const encoded = useMemo(
    () => encodeSharedCollection({ name, description, apps }),
    [name, description, apps]
  );

  const needUrl = () => {
    if (!encoded.ok) {
      toast(encoded.error, 'error');
      return null;
    }
    if (typeof window === 'undefined') return null;
    return buildSharedCollectionUrl(encoded.payload, window.location.origin);
  };

  const onShare = async () => {
    const url = needUrl();
    if (!url) return;
    const title = `${name} · AppMintly collection`;
    const outcome = await shareContent({
      title,
      text: description || `A shared AppMintly collection: ${name}`,
      url,
    });
    if (outcome.status === 'shared') {
      toast('Collection shared.', 'success');
      return;
    }
    if (outcome.status === 'cancelled') return; // user chose not to share
    if (outcome.status === 'copied') {
      setCopied(true);
      toast('Link copied. Anyone with it can view the collection.', 'success');
      return;
    }
    setManualUrl(outcome.url);
    toast('Could not copy the link automatically. Copy it from the box below.', 'error');
  };

  const onCopy = async () => {
    const url = needUrl();
    if (!url) return;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setManualUrl(null);
        toast('Link copied. Anyone with it can view the collection.', 'success');
        return;
      }
      throw new Error('clipboard-unavailable');
    } catch {
      setManualUrl(url);
      toast('Could not copy automatically. Select and copy the link below.', 'error');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onShare}
          disabled={!encoded.ok}
          className="min-h-[44px] inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-4 text-xs font-bold text-ink hover:border-mut/40 disabled:opacity-50 transition"
        >
          <Share2 aria-hidden="true" className="w-4 h-4" />
          Share collection
        </button>
        <button
          type="button"
          onClick={onCopy}
          disabled={!encoded.ok}
          aria-label="Copy collection link"
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full border border-line bg-card text-mut hover:text-ink disabled:opacity-50 transition"
        >
          {copied ? (
            <Check aria-hidden="true" className="w-4 h-4 text-success-text" />
          ) : (
            <Copy aria-hidden="true" className="w-4 h-4" />
          )}
        </button>
      </div>

      {!encoded.ok && (
        <p className="text-[11px] text-mut">
          {encoded.error} A collection can be shared while it has up to {SHARE_LIMITS.apps} apps.
        </p>
      )}

      {manualUrl && (
        <div className="rounded-xl border border-line bg-page p-2">
          <p className="text-[10px] font-bold text-mut mb-1">Copy this link</p>
          <input
            readOnly
            value={manualUrl}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Shared collection link"
            className="w-full rounded-lg border border-line bg-card px-2 py-2 text-[11px] text-ink"
          />
        </div>
      )}

      <p className="text-[10px] text-mut inline-flex items-start gap-1">
        <Link2 aria-hidden="true" className="w-3 h-3 mt-0.5 shrink-0" />
        Sharing creates a public read-only link. Anyone who has it can open the collection; it is not
        private and not password-protected.
      </p>
    </div>
  );
}

export default ShareCollectionButton;
