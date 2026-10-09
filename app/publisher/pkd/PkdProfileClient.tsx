'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
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
  __PKD_SEEDED__?: boolean;
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
  const router = useRouter();

  /**
   * Safe back navigation. When this profile document is the first entry of
   * its browsing task (installed-PWA deep link, direct open — detected and
   * flagged by the history guard below) or its predecessor is outside the
   * app, go to the marketplace home on the CURRENT host (never a hardcoded
   * host). Otherwise return to the in-app page the user came from.
   */
  const goBack = React.useCallback(() => {
    const w = window as PkdWindow;
    // Seeded means the profile was confirmed to have no usable in-app
    // predecessor (direct open / deep link) — go to the marketplace home.
    if (w.__PKD_SEEDED__) {
      router.push('/');
      return;
    }
    const strip = (u: string) => u.split('#')[0].replace(/\/$/, '');
    const nav = w.performance.getEntriesByType?.('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    // SPA arrival: this document was born on another in-app page —
    // back() returns to it natively.
    const bornHere = !nav || strip(nav.name) === strip(w.location.href);
    const ref = document.referrer;
    const refInApp =
      !!ref && strip(ref) !== strip(w.location.href) && ref.startsWith(w.location.origin);
    if (!bornHere || refInApp) {
      w.history.back();
    } else {
      router.push('/');
    }
  }, [router]);

  /**
   * Android system-back guard. In standalone PWA/TWA contexts the profile
   * can be the ONLY entry of its task (deep link, direct open, or a
   * history-replacing navigation); system Back then has no in-app
   * destination and Android closes the app to the home screen. When no
   * usable predecessor exists, seed a duplicate entry whose base carries
   * a null state — Next.js ignores null-state pops, so the captured back
   * press is handled entirely here and full-loads the marketplace home on
   * the current host. Adds exactly one entry; never runs when the profile
   * was reached through a normal in-app navigation.
   */
  React.useEffect(() => {
    const w = window as PkdWindow;
    const strip = (u: string) => u.split('#')[0].replace(/\/$/, '');
    const nav = w.performance.getEntriesByType?.('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    // Was this document loaded directly at the profile (no in-app SPA
    // navigation preceded it inside this document)?
    const bornHere = !nav || strip(nav.name) === strip(w.location.href);
    // A refresh makes document.referrer the profile's own URL — that is not
    // a usable predecessor, so only a DIFFERENT same-origin referrer counts.
    const ref = document.referrer;
    const refInApp =
      !!ref && strip(ref) !== strip(w.location.href) && ref.startsWith(w.location.origin);
    // A reload of a profile that still HAS prior entries (SPA arrival from
    // the marketplace, an earlier visit in this task) must keep native back
    // intact — only reload a direct-open task (no real entries to keep).
    const reloadWithPredecessor = nav?.type === 'reload' && w.history.length > 2;
    const seed =
      bornHere && !refInApp && !reloadWithPredecessor && !w.__PKD_SEEDED__ && w.history.state !== null;
    if (seed) {
      w.__PKD_SEEDED__ = true;
      const next = w.history.state; // preserve Next's own state on the live entry
      w.history.replaceState(null, '', w.location.href);
      w.history.pushState(next, '', w.location.href);
    }
    // Registered on every mount (cheap): only our own seeded base entry can
    // carry a null state, so native Next pops are never intercepted.
    const onPop = (e: PopStateEvent) => {
      if (e.state === null) {
        // Captured a back press with no usable in-app predecessor —
        // full-load the marketplace home on the CURRENT host.
        w.location.replace(`${w.location.origin}${BASE_PATH}/`);
      }
    };
    w.addEventListener('popstate', onPop);
    return () => w.removeEventListener('popstate', onPop);
  }, []);

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

    // Visible Back button lives inside the template body — wire it here
    // (re-attached whenever the catalog data re-renders the body HTML).
    const backBtn = document.getElementById('pkd-back');
    backBtn?.addEventListener('click', goBack);

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
      backBtn?.removeEventListener('click', goBack);
      injected.forEach((s) => s.remove());
      try {
        w.__PKD_TEARDOWN__?.();
      } catch {
        /* teardown is best-effort; the page is unmounting anyway */
      }
      document.body.classList.remove('pkd-page');
      delete w.__PKD_DATA__;
    };
  }, [data, goBack]);

  return (
    <div className="pkd-root">
      <style dangerouslySetInnerHTML={{ __html: PKD_CSS }} />
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </div>
  );
}
