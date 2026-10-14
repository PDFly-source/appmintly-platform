'use client';

/**
 * React binding for the centralized Share System (lib/share.ts).
 *
 * Every app-detail page uses this single hook for its Share icon. Toast
 * feedback is derived strictly from the outcome reported by the core —
 * success is only ever shown after the browser/clipboard confirms it, a
 * cancelled share sheet stays silent, and failures show an honest error.
 * The hook is app-agnostic: it takes the catalog record, so future catalog
 * entries inherit the whole behavior without any new handler code.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/lib/ToastContext';
import { shareApp, singleFlight, type ShareableApp } from '@/lib/share';

type ToastFn = ReturnType<typeof useToast>['toast'];

/** Wrap the core share + toast feedback in a single-flight guard. */
function makeGuardedShare(getToast: () => ToastFn) {
  return singleFlight(async (app: ShareableApp) => {
    const outcome = await shareApp(app);
    const toast = getToast();
    switch (outcome.status) {
      case 'shared':
        // The OS share sheet already gave completion feedback; no toast.
        break;
      case 'cancelled':
        // User dismissed the share sheet — silent, no clipboard fallback.
        break;
      case 'copied':
        toast('App link copied to clipboard!', 'success');
        break;
      case 'copy-failed':
        toast(
          'Could not copy the link automatically. Use the QR code button next to Share, or copy the address from your browser bar.',
          'error'
        );
        break;
    }
    return outcome.status;
  });
}

export function useAppShare() {
  const { toast } = useToast();
  // Keep the latest toast available to the (once-created) guarded handler.
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);
  const guardRef = useRef<ReturnType<typeof makeGuardedShare> | null>(null);

  const share = useCallback((app: ShareableApp) => {
    if (!guardRef.current) {
      guardRef.current = makeGuardedShare(() => toastRef.current);
    }
    return guardRef.current(app);
  }, []);

  return { share };
}
