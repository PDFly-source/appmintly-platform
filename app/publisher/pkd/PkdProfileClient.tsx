'use client';

import React from 'react';
import { useCatalog } from '@/lib/CatalogContext';
import { buildPkdData } from '@/lib/pkd-data';
import { PKD_CSS } from '@/lib/pkd-css';
import { buildPkdBody } from '@/lib/pkd-template';
import { BASE_PATH } from '@/lib/api-path';

const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const PROFILE_JS = () => `${BASE_PATH}/pkd/profile.js`;
const PHOTO = () => `${BASE_PATH}/pkd/pkd-photo-ead72d453a.jpg`;

interface PkdWindow extends Window {
  THREE?: unknown;
  __PKD_DATA__?: unknown;
  __PKD_BOOT__?: () => void;
  __PKD_TEARDOWN__?: () => void;
  __PKD_ACTIVE__?: number;
}

/**
 * PKD 3D publisher profile — hosts the complete PKD design experience.
 *
 * The page markup and styles are the supplied design, rendered server-side
 * for zero flash; the design's effect engine (public/pkd/profile.js) is
 * injected after mount and reads window.__PKD_DATA__, which this component
 * derives from the live AppMintly catalog (CatalogContext). Publishing,
 * version updates and unpublishing therefore reflect automatically —
 * a failed catalog fetch falls back to the build-time catalog snapshot,
 * never to demo records.
 */
export default function PkdProfileClient() {
  const { publishedApps } = useCatalog();

  const data = React.useMemo(
    () => buildPkdData(publishedApps, BASE_PATH),
    [publishedApps]
  );
  const bodyHtml = React.useMemo(
    () => buildPkdBody(data, PHOTO()),
    [data]
  );

  React.useEffect(() => {
    const w = window as PkdWindow;
    w.__PKD_DATA__ = data;
    document.body.classList.add('pkd-page');

    const injected: HTMLScriptElement[] = [];
    // The engine script executes exactly once per page load (it registers
    // window.__PKD_BOOT__ and auto-boots on first execution). Every later
    // data change re-invokes boot() synchronously on the current DOM —
    // no script re-execution, so section setup can never duplicate.
    const startEngine = () => {
      if (w.__PKD_BOOT__) {
        w.__PKD_BOOT__();
      } else {
        const s2 = document.createElement('script');
        s2.src = PROFILE_JS();
        document.body.appendChild(s2);
        injected.push(s2);
      }
    };

    if (w.THREE) {
      startEngine();
    } else {
      // Three.js loads from the same CDN the original design uses. If it
      // fails, the engine still runs — the design degrades to its
      // CSS-driven experience with all content intact.
      const s1 = document.createElement('script');
      s1.src = THREE_URL;
      s1.addEventListener('load', startEngine, { once: true });
      s1.addEventListener('error', startEngine, { once: true });
      document.body.appendChild(s1);
      injected.push(s1);
    }

    return () => {
      injected.forEach((s) => s.remove());
      try {
        w.__PKD_TEARDOWN__?.();
      } catch {
        /* teardown is best-effort; the page is unmounting anyway */
      }
      document.body.classList.remove('pkd-page');
      delete w.__PKD_DATA__;
    };
  }, [data]);

  return (
    <div className="pkd-root">
      <style dangerouslySetInnerHTML={{ __html: PKD_CSS }} />
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </div>
  );
}
