'use client';

import React from 'react';
import { Columns3 } from 'lucide-react';
import { useCompareActions, useIsComparing } from '@/lib/useCompare';
import { MAX_COMPARE } from '@/lib/compare';
import { useToast } from '@/lib/ToastContext';

/**
 * Compare entry point on an app card. Selection is local, capped at three and
 * fully independent from the Library wishlist.
 */
export function CompareToggle({
  appId,
  appName,
  className = '',
}: {
  appId: string;
  appName: string;
  className?: string;
}) {
  const selected = useIsComparing(appId);
  const { toggle, ids } = useCompareActions();
  // ids reflects the latest committed selection; the toast counts from the
  // action's own result so a rapid second tap cannot report a stale number.
  const { toast } = useToast();

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const action = toggle(appId);
    if (action === 'added') {
      toast(`Added ${appName} to comparison (${Math.min(ids.length + 1, MAX_COMPARE)}/${MAX_COMPARE})`, 'info');
    } else if (action === 'removed') {
      toast(`Removed ${appName} from comparison`, 'info');
    } else if (action === 'limit') {
      toast(`You can compare up to ${MAX_COMPARE} apps. Remove one first.`, 'info');
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={selected ? `Remove ${appName} from comparison` : `Add ${appName} to comparison`}
      title={selected ? 'Remove from compare' : 'Add to compare'}
      className={`flex h-11 w-11 items-center justify-center rounded-full transition shrink-0 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50 ${
        selected ? 'text-cta bg-cta/12' : 'text-mut hover:text-cta hover:bg-page'
      } ${className}`}
    >
      <Columns3 className={`w-4 h-4 ${selected ? 'fill-cta/20' : ''}`} aria-hidden="true" />
    </button>
  );
}
