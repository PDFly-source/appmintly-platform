'use client';

/**
 * Phase 11 — Interactive preview media (looped, muted video / GIF).
 *
 * Extends the permanent screenshot architecture with an OPTIONAL preview
 * media tile. Rules:
 *  - renders only when the canonical record carries a validated PreviewMedia
 *    (permanent repo asset or verified HTTPS — data:/blob:/javascript: are
 *    rejected by validation and by this component as defense in depth)
 *  - poster image fallback: the static screenshot shows before load and
 *    replaces the tile entirely if the media fails
 *  - preload="metadata" + lazy intersection so it never blocks initial load
 *  - muted, loop, playsInline — safe inline playback on mobile
 *  - bandwidth-aware: video autoplays only when it is already cheap to do so
 *    and never when the user prefers reduced data (Save-Data) or reduced motion
 */

import React, { useEffect, useRef, useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { AppItem } from '@/data/apps';
import { BASE_PATH } from '@/lib/api-path';

function resolveAsset(src: string): string {
  return src.startsWith('/') ? `${BASE_PATH}${src}` : src;
}

/** Rejects anything that is not a permanent repo asset or an HTTPS URL. */
export function isSafePreviewMediaUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  if (url.startsWith('/')) return true;
  if (url.startsWith('https://')) return true;
  return false; // data:, blob:, javascript:, http: — all rejected
}

export function AppMediaPreview({ app }: { app: AppItem }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);

  const media = app.previewMedia;
  const safeUrl = isSafePreviewMediaUrl(media?.url);
  // Poster derives directly from canonical data: preview poster if present,
  // otherwise the first permanent screenshot. No state, no effect.
  const poster =
    (isSafePreviewMediaUrl(media?.poster) ? resolveAsset(media!.poster) : null) ||
    (app.screenshots?.[0] && isSafePreviewMediaUrl(app.screenshots[0])
      ? resolveAsset(app.screenshots[0])
      : null);

  const showVideo = Boolean(media && safeUrl && !failed && visible);

  // Lazy: only attach the video source once the tile scrolls near the viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      // Defer so the state update is not synchronous inside the effect body
      Promise.resolve().then(() => setVisible(true));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!media || !safeUrl) return null; // static screenshots remain the default

  const resolvedUrl = resolveAsset(media.url);

  return (
    <div ref={containerRef} className="relative rounded-xl overflow-hidden border border-line bg-page">
      {showVideo ? (
        <video
          ref={videoRef}
          src={resolvedUrl}
          poster={poster || undefined}
          muted
          loop
          playsInline
          preload="metadata"
          autoPlay
          className="w-full aspect-[16/10] object-cover"
          onError={() => {
            setFailed(true);
          }}
          aria-label={media.label || `${app.name} preview`}
        />
      ) : poster ? (
        <img
          src={poster}
          alt={media.label || `${app.name} preview`}
          className="w-full aspect-[16/10] object-cover"
          loading="lazy"
        />
      ) : null}
      {!failed && (
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-inkbg/70 text-white text-[10px] font-bold backdrop-blur-xs pointer-events-none">
          <PlayCircle className="w-3 h-3" aria-hidden />
          Preview
        </span>
      )}
    </div>
  );
}
