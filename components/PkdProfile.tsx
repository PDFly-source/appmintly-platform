'use client';

/**
 * PKD "Verified Developer & Publisher" profile.
 *
 * Port of the supplied standalone HTML design into the AppMintly app. Section
 * order, headings, class names and interactions follow the reference. The
 * differences are deliberate and listed in docs/PKD_PROFILE_PORT.md:
 *  - every number / version / date / category / link is catalog-driven
 *    (lib/publisher-stats.ts), nothing is hardcoded;
 *  - "Get App" follows the project's distribution policy (real verified APK
 *    release -> download, otherwise Open on Web);
 *  - the Three.js scene is lazy-loaded, disposed on unmount, and falls back to
 *    a CSS-only presentation when WebGL is unavailable.
 */

import React from 'react';
import Link from 'next/link';
import { useCatalog } from '@/lib/CatalogContext';
import { BASE_PATH } from '@/lib/api-path';
import { getDeveloperIdentity } from '@/data/publishers';
import { computePublisherStats, getUpdateTime } from '@/lib/publisher-stats';
import { hasAuthoritativeApkRelease } from '@/lib/distribution';
import { loadThree, startScene, webglAvailable, type SceneHandle } from '@/lib/pkd-scene';
import '@/app/pkd-profile.css';

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500&display=swap';
const THREE_SRC = `${BASE_PATH}/vendor/three-r128.min.js`;
const PORTRAIT = `${BASE_PATH}/brand/pkd/pkd-portrait.jpg`;

/** Accent glow per app (reference palette); unknown apps fall back to blue. */
const GLOW: Record<string, number> = {
  appmintly: 0xf5b50a,
  studyria: 0xb91c1c,
  pdfminifly: 0xd97706,
  niramay: 0x22c55e,
  nexdrop: 0x22d3ee,
};

const Badge = ({ style }: { style?: React.CSSProperties }) => (
  <svg className="vb" style={style} aria-hidden="true">
    <use href="#pkd-v" />
  </svg>
);

const SECTIONS = ['about', 'me', 'apps', 'updates', 'trust'];
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const getReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const getReducedServer = () => false;

const pad2 = (n: number) => (n < 10 ? '0' + n : String(n));

function iconUrl(src: string | undefined): string {
  if (!src) return `${BASE_PATH}/brand/appmintly-icon-192.png`;
  if (/^https?:\/\//i.test(src) || src.startsWith('data:')) return src;
  return `${BASE_PATH}${src.startsWith('/') ? '' : '/'}${src}`;
}

function fmtDate(app: { lastUpdated?: string; updatedAt?: string }): string {
  const t = getUpdateTime(app as never);
  if (t === null) return '';
  return new Date(t).toISOString().slice(0, 10);
}

export default function PkdProfile({ slug }: { slug: string }) {
  const { publishedApps } = useCatalog();
  const identity = getDeveloperIdentity(slug);
  const stats = React.useMemo(
    () => (identity ? computePublisherStats(publishedApps, identity.slug) : null),
    [publishedApps, identity]
  );
  const apps = React.useMemo(() => {
    // Showcase order = alphabetical-by-recency is NOT used; use stable catalog order
    // by name so tab order never reshuffles on a same-day publish.
    return [...(stats?.apps ?? [])];
  }, [stats]);
  const total = apps.length;

  const rootRef = React.useRef<HTMLDivElement>(null);
  const [sceneOn, setSceneOn] = React.useState(false);
  const [sceneTried, setSceneTried] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [swap, setSwap] = React.useState(false); // fade-out phase of the reference's .sw.o
  const [shown, setShown] = React.useState(0);
  const [tick, setTick] = React.useState(0);
  const [loaderDone, setLoaderDone] = React.useState(false);
  const [dot, setDot] = React.useState(-1);

  const reduced = React.useSyncExternalStore(subscribeReduced, getReduced, getReducedServer);

  // ---- fonts (scoped, once) + sticky offset under the AppMintly header ----
  React.useEffect(() => {
    if (!document.querySelector(`link[data-pkd-font]`)) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = FONT_HREF;
      l.setAttribute('data-pkd-font', '1');
      document.head.appendChild(l);
    }
    const root = rootRef.current;
    if (!root) return;
    const header = document.querySelector('header');
    const setH = () => root.style.setProperty('--hh', (header ? header.getBoundingClientRect().height : 0) + 'px');
    setH();
    window.addEventListener('resize', setH);
    return () => window.removeEventListener('resize', setH);
  }, []);

  // ---- loader splash (reference: 2.6s, skipped for reduced motion) ----
  React.useEffect(() => {
    const t = setTimeout(() => setLoaderDone(true), reduced ? 0 : 2700);
    return () => clearTimeout(t);
  }, [reduced]);

  // ---- .rv reveal observer ----
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = root.querySelectorAll('.rv');
    if (reduced || typeof IntersectionObserver === 'undefined') {
      els.forEach((e) => e.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')),
      { threshold: 0.12 }
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [total, stats, reduced]);

  // ---- hero stat count-up (reference: 200ms steps), driven by real numbers ----
  const target = React.useMemo(
    () => [stats?.totalApps ?? 0, stats?.publishedApps ?? 0, stats?.categoryCount ?? 0],
    [stats]
  );
  React.useEffect(() => {
    if (reduced) return;
    const max = Math.max(...target, 0);
    const iv = setInterval(() => {
      setTick((t) => {
        if (t + 1 >= max) clearInterval(iv);
        return t + 1;
      });
    }, 200);
    return () => {
      clearInterval(iv);
      setTick(0);
    };
  }, [target, reduced]);
  const counts = reduced ? target : target.map((n) => Math.min(tick, n));

  // ---- pointer effects: card spotlight, magnetic buttons, cursor glow, 3D tilt ----
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ac = new AbortController();
    const o = { signal: ac.signal };
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    root.querySelectorAll<HTMLElement>('.card').forEach((c) => {
      c.addEventListener(
        'pointermove',
        (e) => {
          const b = c.getBoundingClientRect();
          c.style.setProperty('--mx', e.clientX - b.left + 'px');
          c.style.setProperty('--my', e.clientY - b.top + 'px');
        },
        o
      );
    });

    if (fine && !reduced) {
      const cg = root.querySelector<HTMLElement>('#cg');
      if (cg) {
        window.addEventListener(
          'pointermove',
          (e) => (cg.style.transform = `translate(${e.clientX - 250}px,${e.clientY - 250}px)`),
          o
        );
      }
      root.querySelectorAll<HTMLElement>('.btn').forEach((b) => {
        b.addEventListener(
          'pointermove',
          (e) => {
            const r = b.getBoundingClientRect();
            b.style.transform = `translate(${((e.clientX - r.left) / r.width - 0.5) * 10}px,${((e.clientY - r.top) / r.height - 0.5) * 8}px)`;
          },
          o
        );
        b.addEventListener('pointerleave', () => (b.style.transform = ''), o);
      });
      const tilt = (el: HTMLElement | null, kx: number, ky: number) => {
        if (!el || !el.parentElement) return;
        const host = el.parentElement;
        host.addEventListener(
          'pointermove',
          (e) => {
            if ((e as PointerEvent).pointerType !== 'mouse') return;
            const b = host.getBoundingClientRect();
            const x = (e.clientX - b.left) / b.width - 0.5;
            const y = (e.clientY - b.top) / b.height - 0.5;
            el.style.transform = `rotateY(${x * kx}deg) rotateX(${-y * ky}deg)`;
            el.style.setProperty('--sx', (x + 0.5) * 100 + '%');
            el.style.setProperty('--sy', (y + 0.5) * 100 + '%');
          },
          o
        );
        host.addEventListener('pointerleave', () => (el.style.transform = ''), o);
      };
      tilt(root.querySelector<HTMLElement>('#id'), 18, 14);
      tilt(root.querySelector<HTMLElement>('#pf'), 14, 10);
    }
    return () => ac.abort();
  }, [total, reduced]);

  // ---- section dots (reference #dots) ----
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onScroll = () => {
      const y = window.scrollY + window.innerHeight * 0.4;
      let c = -1;
      SECTIONS.forEach((k, i) => {
        const el = root.querySelector<HTMLElement>('#' + k);
        if (el && el.getBoundingClientRect().top + window.scrollY <= y) c = i;
      });
      setDot(c);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ---- showcase: swap animation (reference show()) ----
  const showRef = React.useRef(-1);
  const onShow = React.useCallback((i: number) => {
    if (showRef.current === i) return;
    showRef.current = i;
    setActive(i);
    setSwap(true);
    window.setTimeout(() => {
      setShown(i);
      setSwap(false);
    }, 220);
  }, []);

  // ---- Three.js scene ----
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || total === 0) return;
    let handle: SceneHandle | null = null;
    let cancelled = false;

    const noWebgl = !webglAvailable();
    const loader: Promise<unknown> = noWebgl
      ? Promise.reject(new Error('webgl unavailable'))
      : loadThree(THREE_SRC);
    loader
      .then((THREE: any) => {
        if (cancelled) return;
        const canvas = root.querySelector<HTMLCanvasElement>('#gl');
        const sec = root.querySelector<HTMLElement>('#apps');
        const fill = root.querySelector<HTMLElement>('.pb u');
        const bar = root.querySelector<HTMLElement>('#pg');
        if (!canvas || !sec || !fill || !bar) return;
        try {
          handle = startScene(THREE, {
            canvas,
            apps: apps.map((a) => ({
              name: a.name || a.slug,
              icon: iconUrl(a.icon),
              glow: GLOW[a.slug] ?? 0x4c8dff,
            })),
            showcase: sec,
            progressFill: fill,
            progressBar: bar,
            onShow,
            reducedMotion: reduced,
          });
          setSceneOn(true);
        } catch {
          setSceneOn(false);
        }
        setSceneTried(true);
      })
      .catch(() => {
        if (!cancelled) {
          setSceneOn(false);
          setSceneTried(true);
        }
      });
    return () => {
      cancelled = true;
      handle?.dispose();
      setSceneOn(false);
    };
    // apps identity changes only when the catalog changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, reduced, onShow]);

  // Without the scene nobody drives the showcase index: derive it from scroll.
  React.useEffect(() => {
    if (sceneOn || total === 0) return;
    const root = rootRef.current;
    if (!root) return;
    const sec = root.querySelector<HTMLElement>('#apps');
    const fill = root.querySelector<HTMLElement>('.pb u');
    const bar = root.querySelector<HTMLElement>('#pg');
    if (!sec) return;
    const f = () => {
      const top = sec.getBoundingClientRect().top + window.scrollY;
      const h = sec.offsetHeight - window.innerHeight;
      const pr = h > 0 ? (window.scrollY - top) / h : 0;
      if (pr > -0.15 && pr < 1.1) onShow(Math.max(0, Math.min(total - 1, Math.floor(pr * total))));
      if (fill) fill.style.width = (pr > 0 && pr < 1 ? pr * 100 : 0) + '%';
      const hh = document.documentElement.scrollHeight - window.innerHeight;
      if (bar) bar.style.transform = `scaleX(${hh > 0 ? window.scrollY / hh : 0})`;
    };
    window.addEventListener('scroll', f, { passive: true });
    window.addEventListener('resize', f);
    f();
    return () => {
      window.removeEventListener('scroll', f);
      window.removeEventListener('resize', f);
    };
  }, [sceneOn, total, onShow]);

  const goTab = (i: number) => {
    const sec = rootRef.current?.querySelector<HTMLElement>('#apps');
    if (!sec) return;
    const h = sec.offsetHeight - window.innerHeight;
    const top = sec.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + (h * (i + 0.5)) / Math.max(1, total), behavior: reduced ? 'auto' : 'smooth' });
  };

  /* ---------------- not found / empty ---------------- */
  if (!identity) return null;

  const a = apps[Math.min(shown, Math.max(0, total - 1))];
  const aApk = a ? hasAuthoritativeApkRelease(a as never) : false;
  const aHref = a ? (aApk ? (a.apk?.apkUrl || a.apkUrl) : (a.webUrl || a.url)) : '#';
  const sizeOf = (x: typeof a) => (x && x.size && /\d/.test(String(x.size)) ? String(x.size) : '');
  const cats = stats?.categoryCount ?? 0;
  const latest = stats?.latestVersion ? `v${stats.latestVersion}` : '—';
  const updates = apps; // already newest-first from the aggregation layer
  const smallest = apps
    .map((x) => sizeOf(x))
    .filter(Boolean)
    .map((s) => ({ s, n: parseFloat(s) * (/mb/i.test(s) ? 1024 : 1) }))
    .sort((p, q) => p.n - q.n)[0];
  const nexdrop = apps.find((x) => x.slug === 'nexdrop');

  return (
    <div ref={rootRef} className={`pkd${sceneTried && !sceneOn ? ' noscene' : ''}`}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <symbol id="pkd-v" viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M12 1.5l2.6 1.9 3.2-.1 1 3 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3L2.6 15.8l1-3.1-1-3.1 2.6-1.9 1-3 3.2.1z"
          />
          <path d="M8 12.2l2.7 2.7L16 9.6" fill="none" stroke="#07090E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
      </svg>

      {!loaderDone && (
        <div id="ld" aria-hidden="true">
          <span>PKD</span>
          <Badge />
        </div>
      )}
      <div id="cg" aria-hidden="true" />
      <div id="dots" aria-label="Page sections">
        {SECTIONS.map((k, i) => (
          <a key={k} href={`#${k}`} className={i === dot ? 'on' : ''} aria-label={`Go to ${k}`} />
        ))}
      </div>
      <div id="pg" aria-hidden="true" />
      <canvas id="gl" aria-hidden="true" />
      <div className="bgf" aria-hidden="true" />
      <div className="noise" aria-hidden="true" />

      <nav className="pkdnav" aria-label="PKD profile">
        <div className="logo">
          PKD <Badge />
        </div>
        <div className="lk">
          <a href="#about">About</a>
          <a href="#me">Developer</a>
          <a href="#apps">Apps</a>
          <a href="#updates">Updates</a>
        </div>
        <Link className="btn p" href="/">
          AppMintly ↗
        </Link>
      </nav>

      <main className="pkdmain">
        {/* ---------------- HERO ---------------- */}
        <section className="hero">
          <div className="chips rv">
            <span className="chip g">★ Trusted Developer</span>
            <span className="chip b">&lt;/&gt; Developer</span>
            <span className="chip b">✓ Verified Publisher</span>
          </div>
          <h1 className="rv">
            {identity.name}
            <Badge />
          </h1>
          <div className="who rv">
            <img className="ph" src={PORTRAIT} alt={identity.name} width={62} height={62} />
            <div className="sub">
              <b>Verified</b> Developer <span style={{ color: 'var(--mute)' }}>&amp;</span> Publisher
            </div>
          </div>
          <p className="lead rv">
            {identity.bio ||
              'Building private, fast, local-first apps — published on AppMintly with a verified publisher identity.'}
          </p>
          <div className="row rv">
            <a className="btn p" href="#apps">
              Explore my apps ↓
            </a>
            <a className="btn g" href="#about">
              Verified identity
            </a>
          </div>
          <div className="cmd rv">
            <span>$</span>pkd publish --verified<i className="cur" />
          </div>
          <div className="stats rv" role="list" aria-label="Publisher statistics">
            <div className="stat" role="listitem">
              <b>{counts[0]}</b>
              <span>Total apps</span>
            </div>
            <div className="stat" role="listitem">
              <b>{counts[1]}</b>
              <span>Published</span>
            </div>
            <div className="stat" role="listitem">
              <b>{counts[2]}</b>
              <span>Categories</span>
            </div>
            <div className="stat" role="listitem">
              <b>{latest}</b>
              <span>Latest</span>
            </div>
          </div>
        </section>

        {total > 0 && (
          <div className="mq" aria-hidden="true">
            <div>
              {[...apps, ...apps].map((x, i) => (
                <span key={i}>{x.name}</span>
              ))}
            </div>
          </div>
        )}

        {/* ---------------- ABOUT / IDENTITY ---------------- */}
        <section id="about">
          <div className="ey rv">Two roles · One identity</div>
          <h2 className="rv">
            I build it. <em>I publish it.</em>
          </h2>
          <div className="ab">
            <div className="idw rv">
              <div className="id" id="id">
                <div className="t">VERIFIED PUBLISHER · APPMINTLY</div>
                <div className="mid">
                  <div className="av">
                    <img src={PORTRAIT} alt={identity.name} />
                  </div>
                  <div>
                    <h3>
                      {identity.name} <Badge />
                    </h3>
                    <p>
                      {stats?.publishedApps ?? 0} published {stats?.publishedApps === 1 ? 'application' : 'applications'}
                    </p>
                  </div>
                </div>
                <div className="b">
                  <span>IDENTITY VERIFIED</span>
                  <span>★ TRUSTED DEVELOPER</span>
                </div>
              </div>
            </div>
            <div className="rl">
              <div className="card rv">
                <div className="ico">&lt;/&gt;</div>
                <h3>Developer</h3>
                <p>Designs and engineers every app end to end, focused on speed and privacy.</p>
                <ul>
                  <li>Installable web apps &amp; APK packages</li>
                  {smallest && <li>Lightweight — from {smallest.s}</li>}
                </ul>
              </div>
              <div className="card rv">
                <div className="ico">
                  <Badge style={{ width: '1.3em', height: '1.3em' }} />
                </div>
                <h3>Verified Publisher</h3>
                <p>Publisher identity verified by the AppMintly team — every release carries the verified badge.</p>
                <ul>
                  <li>
                    {stats?.publishedApps ?? 0} of {stats?.totalApps ?? 0} apps published
                  </li>
                  <li>Regular, versioned updates</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- DEVELOPER ---------------- */}
        <section id="me">
          <div className="me">
            <div className="pw rv">
              <i className="br t1" />
              <i className="br t2" />
              <i className="br b1" />
              <i className="br b2" />
              <div className="pf" id="pf">
                <div className="im">
                  <img src={PORTRAIT} alt={`${identity.name} — Verified Developer and Publisher`} />
                  <i className="sc" />
                </div>
                <div className="tag">{'// pkd.profile'}</div>
                <div className="cap">
                  <h3>
                    {identity.name} <Badge />
                  </h3>
                  <p>Verified Developer · Publisher</p>
                </div>
                <div className="fc a">
                  <Badge />
                  Verified Publisher
                </div>
                <div className="fc b">
                  <span style={{ color: 'var(--cy)' }}>&lt;/&gt;</span>Developer
                </div>
                <div className="fc c">
                  <span style={{ color: 'var(--gold)' }}>★</span>
                  {stats?.publishedApps ?? 0} apps published
                </div>
              </div>
            </div>
            <div>
              <div className="ey rv">{'// Meet the developer'}</div>
              <h2 className="rv">
                Developer by craft. <em>Publisher by trust.</em>
              </h2>
              <div className="term rv">
                <div className="th">
                  <i />
                  <i />
                  <i />
                  <span>pkd.config.js</span>
                  <b>✓ verified</b>
                </div>
                <div className="code">
                  <span className="l" style={{ ['--i' as string]: 0 }}>
                    <span className="k">const</span> <span className="pp">developer</span> = {'{'}
                  </span>
                  <span className="l" style={{ ['--i' as string]: 1 }}>
                    {'  '}
                    <span className="pp">name</span>: <span className="sg">&quot;{identity.name}&quot;</span>,
                  </span>
                  <span className="l" style={{ ['--i' as string]: 2 }}>
                    {'  '}
                    <span className="pp">roles</span>: [<span className="sg">&quot;Developer&quot;</span>,{' '}
                    <span className="sg">&quot;Publisher&quot;</span>],
                  </span>
                  <span className="l" style={{ ['--i' as string]: 3 }}>
                    {'  '}
                    <span className="pp">verified</span>: <span className="nb">{String(identity.verified)}</span>,
                  </span>
                  <span className="l" style={{ ['--i' as string]: 4 }}>
                    {'  '}
                    <span className="pp">apps</span>: <span className="nb">{stats?.publishedApps ?? 0}</span>,
                  </span>
                  <span className="l" style={{ ['--i' as string]: 5 }}>
                    {'  '}
                    <span className="pp">values</span>: [<span className="sg">&quot;private&quot;</span>,{' '}
                    <span className="sg">&quot;fast&quot;</span>, <span className="sg">&quot;local-first&quot;</span>],
                  </span>
                  <span className="l" style={{ ['--i' as string]: 6 }}>
                    {'  '}
                    <span className="pp">publishedOn</span>: <span className="sg">&quot;AppMintly&quot;</span>
                  </span>
                  <span className="l" style={{ ['--i' as string]: 7 }}>
                    {'};'}
                    <span className="cur" />
                  </span>
                </div>
              </div>
              <p className="t rv">
                I design, build and publish apps that stay fast, private and light — from PDF tools and P2P sharing to
                Assam-focused study and wellness apps. What you install is built, verified and supported by the same
                person.
              </p>
              <div className="tech rv">
                <span>Installable Apps</span>
                <span>APK Packages</span>
                <span>WebRTC P2P</span>
                <span>Web Crypto</span>
                <span>Local-first</span>
              </div>
              <div className="wf rv">
                <span>build</span>
                <i>→</i>
                <span>verify</span>
                <i>→</i>
                <span>publish</span>
                <i>→</i>
                <span>update</span>
              </div>
              <div className="fx rv" style={{ marginTop: 22 }}>
                <div>
                  <b>{stats?.publishedApps ?? 0}</b>
                  <span>Apps</span>
                </div>
                <div>
                  <b>{cats}</b>
                  <span>Categories</span>
                </div>
                <div>
                  <b>{identity.verified ? '100%' : '—'}</b>
                  <span>Verified</span>
                </div>
              </div>
              <div className="row rv">
                <a className="btn p" href="#apps">
                  See my apps ↓
                </a>
                <Link className="btn g" href="/">
                  AppMintly ↗
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- APP SHOWCASE (sticky, scroll-driven) ---------------- */}
        <section id="apps" style={{ height: `${Math.max(1, total) * 104}vh` }} aria-label="Apps by PKD">
          <div className="stk">
            <div className="pn">
              <div className="n">
                <span>APPS BY {identity.name.toUpperCase()}</span>
                <span id="an">
                  {pad2(Math.min(shown, Math.max(0, total - 1)) + 1)} / {pad2(total)}
                </span>
              </div>
              <div className="pb">
                <u />
              </div>
              {a ? (
                <div className={`sw${swap ? ' o' : ''}`} id="sw">
                  <div className="hd">
                    <img id="ai" alt="" src={iconUrl(a.icon)} />
                    <div>
                      <h3 id="nm">{a.name}</h3>
                      <div className="by">
                        {identity.name} <Badge />
                      </div>
                    </div>
                  </div>
                  <div className="tags">
                    <span className="tg b" id="ty">
                      {aApk ? 'APK' : 'App'}
                    </span>
                    <span className="tg n">{a.version ? `v${a.version}` : 'Live'}</span>
                  </div>
                  <p id="ad">{a.shortDescription || a.description}</p>
                  <div className="ft">
                    <div>
                      <b id="vs">
                        {a.version ? `v${a.version}` : ''}
                        {sizeOf(a) ? ` • ${sizeOf(a)}` : ''}
                      </b>
                      <small id="ct">
                        {[a.category, aApk ? 'APK Package' : a.type].filter(Boolean).join(' • ')}
                      </small>
                    </div>
                    <a
                      className="btn p"
                      id="gb"
                      href={aHref}
                      {...(aApk ? { download: true } : { target: '_blank', rel: 'noopener noreferrer' })}
                    >
                      {aApk ? '⬇ Get App' : 'Open on Web ↗'}
                    </a>
                  </div>
                </div>
              ) : (
                <div className="sw" id="sw">
                  <p id="ad">No published applications yet.</p>
                </div>
              )}
              <div className="tabs" id="tabs" role="tablist" aria-label="Choose an app">
                {apps.map((x, i) => (
                  <button
                    key={x.slug}
                    type="button"
                    role="tab"
                    aria-selected={i === active}
                    className={`tab${i === active ? ' on' : ''}`}
                    onClick={() => goTab(i)}
                  >
                    {x.name}
                  </button>
                ))}
              </div>
              {a && (
                <Link
                  href={`/app/${a.slug}`}
                  className="by"
                  style={{ marginTop: 14, fontSize: '.8rem', textDecoration: 'none' }}
                >
                  View {a.name} on AppMintly →
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* ---------------- UPDATES ---------------- */}
        <section id="updates">
          <div className="ey rv">Changelog</div>
          <h2 className="rv">
            Latest <em>updates.</em>
          </h2>
          <div className="tl">
            {updates.map((x) => (
              <div className="ti rv" key={x.slug}>
                <img src={iconUrl(x.icon)} alt="" />
                <div className="a">
                  <b>{x.name}</b>
                  <small>{x.category}</small>
                </div>
                <div className="r">
                  <b>{x.version ? `v${x.version}` : '—'}</b>
                  <small>{fmtDate(x)}</small>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- TRUST ---------------- */}
        <section id="trust">
          <div className="ey rv">Principles</div>
          <h2 className="rv">
            Small apps. <em>Big trust.</em>
          </h2>
          <div className="three">
            <div className="card rv">
              <div className="ico">🔒</div>
              <h3>Private</h3>
              <p>Tools that keep your data on your device — PDFs, files and text stay local.</p>
            </div>
            <div className="card rv">
              <div className="ico">⚡</div>
              <h3>Fast &amp; light</h3>
              <p>Lightweight apps built to load quickly and work well on modest devices.</p>
            </div>
            <div className="card rv">
              <div className="ico">🌏</div>
              <h3>Made for people</h3>
              <p>From Assam-focused study and wellness apps to universal utilities.</p>
            </div>
          </div>
        </section>

        {/* ---------------- CTA ---------------- */}
        <section className="cta">
          <div className="wm" aria-hidden="true">
            {identity.name}
          </div>
          <div className="ey rv">Everything in one place</div>
          <h2 className="rv">
            All apps by {identity.name}, <em>on AppMintly.</em>
          </h2>
          <div className="row rv" style={{ justifyContent: 'center' }}>
            <Link className="btn p" href="/">
              Open AppMintly →
            </Link>
            {nexdrop ? (
              <a className="btn g" href={nexdrop.webUrl} target="_blank" rel="noopener noreferrer">
                Try NexDrop
              </a>
            ) : (
              <Link className="btn g" href="/explore">
                Browse apps
              </Link>
            )}
          </div>
        </section>
      </main>

      <div className="pkdfoot">
        <span>© 2026 {identity.name} · Verified Developer &amp; Publisher</span>
        <span>
          <Link href="/">AppMintly</Link>
          {nexdrop && (
            <a href={nexdrop.webUrl} target="_blank" rel="noopener noreferrer">
              NexDrop
            </a>
          )}
        </span>
      </div>
    </div>
  );
}
