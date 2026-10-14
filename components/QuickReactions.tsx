'use client';

/**
 * Phase 1B — Quick Reactions bar for the app detail page.
 *
 * Working UI states, honest data boundary:
 *  - Idle: no reaction on this device.
 *  - Selected: exactly one reaction highlighted (aria-pressed=true).
 *  - Toggle: clicking the selected reaction removes it; clicking another
 *    switches it. The store guarantees one reaction per app per browser.
 *  - The scope label is ALWAYS rendered: reactions are local to this
 *    device; there is no shared backend, so no totals are ever shown.
 */

import React from 'react';
import { ThumbsUp, Heart, PartyPopper, Lightbulb } from 'lucide-react';
import {
  REACTION_TYPES,
  ReactionType,
  REACTION_SCOPE_LABEL,
  useReaction,
  toggleReaction,
} from '@/lib/app-reactions';

const REACTION_META: Record<ReactionType, { label: string; icon: React.ElementType }> = {
  like: { label: 'Like', icon: ThumbsUp },
  love: { label: 'Love', icon: Heart },
  celebrate: { label: 'Celebrate', icon: PartyPopper },
  insightful: { label: 'Insightful', icon: Lightbulb },
};

interface QuickReactionsProps {
  appId: string;
  appName: string;
}

export function QuickReactions({ appId, appName }: QuickReactionsProps) {
  const selected = useReaction(appId);

  const handleToggle = (reaction: ReactionType) => {
    const next = toggleReaction(appId, reaction);
    // next === null means "removed" — no further action needed; the store
    // event updates the UI state through useReaction.
    void next;
  };

  return (
    <section
      className="mt-10 rounded-2xl border border-line bg-card p-5"
      aria-label={`Quick reactions for ${appName}`}
    >
      <h3 className="flex items-center gap-2 text-ink font-bold mb-1">
        <PartyPopper className="w-4 h-4 text-forge-red" aria-hidden />
        Quick Reactions
      </h3>
      <p className="text-xs text-mut mb-4">
        How does {appName} feel to you? Tap a reaction — tap it again to remove it.
      </p>

      <div className="flex flex-wrap gap-2" role="group" aria-label={`Reaction choices for ${appName}`}>
        {REACTION_TYPES.map((reaction) => {
          const meta = REACTION_META[reaction];
          const Icon = meta.icon;
          const isSelected = selected === reaction;
          return (
            <button
              key={reaction}
              type="button"
              onClick={() => handleToggle(reaction)}
              aria-pressed={isSelected}
              className={`flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                isSelected
                  ? 'border-inkbg bg-inkbg text-white'
                  : 'border-line bg-page text-ink hover:border-ink/30'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden />
              {meta.label}
              {isSelected && <span className="sr-only">— your reaction on this device</span>}
            </button>
          );
        })}
      </div>

      {/* The honest boundary — always visible, never collapsed away. */}
      <p className="mt-3 text-[10px] text-mut flex items-start gap-1.5">
        <Lightbulb className="w-3 h-3 shrink-0 mt-px" aria-hidden />
        <span>
          {selected
            ? `Your "${REACTION_META[selected].label}" is saved on this device. `
            : ''}
          {REACTION_SCOPE_LABEL}
        </span>
      </p>
    </section>
  );
}
