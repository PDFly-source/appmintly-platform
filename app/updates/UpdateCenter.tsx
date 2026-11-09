'use client';

/**
 * AppMintly Work 2 — the Update Center premium surface.
 *
 * The markup below is the supplied reference design
 * (AppMintly Update Center · premium cards) rendered as JSX with the same class
 * names, so app/updates/updates.css — the ported stylesheet — still paints it
 * pixel for pixel. Only the demo dataset was replaced.
 *
 * WHY JSX AND NOT INNERHTML: the page now prints catalog and browser-local
 * values (app names, release notes, versions, dates). React escapes them; a
 * template-string innerHTML path has to remember to escape every field.
 *
 * THE RULES LIVE ELSEWHERE. This file owns layout only:
 *   versions / buckets / notes / history / web hint  → lib/updates/model.ts
 *   "what this browser downloaded"                   → lib/app-installs.ts
 *   watch list                                       → lib/updates/watch.ts
 * No version comparison, no storage key and no release note is invented here.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppIcon } from '@/components/AppIcon';
import { ApkInstallSheet } from '@/components/ApkInstallSheet';
import { APPS, type AppItem } from '@/data/apps';
import { getInstallRecord, knownLocalVersion } from '@/lib/app-installs';
import {
  buildUpdateCenter,
  latestVersionOf,
  releaseNotesFor,
  versionHistoryFor,
  webUpdateHint,
  type ReleaseNoteEntry,
  type VersionKnowledge,
} from '@/lib/updates/model';
import { notificationsEnabled, useWatchList } from '@/lib/updates/watch';
import { THEMES, applyThemeToDocument, isThemeId, type ThemeId } from '@/lib/appearance/themes';

/** Published catalog records only — unpublished drafts are never listed. */
const PUBLISHED: AppItem[] = APPS.filter((a) => a.published === true);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/* --- Icons: the reference's own stroke paths ------------------------------ */

function Ic({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d={d} />
    </svg>
  );
}

const I = {
  back: 'M19 12H5M11 6l-6 6 6 6',
  upArrow: 'M12 19V6M6 12l6-6 6 6',
  checkCircle: 'M12 3a9 9 0 100 18 9 9 0 000-18M8 12.5l3 3 5-6',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5',
  bell: 'M6 16V11a6 6 0 0112 0v5l2 2H4zM10 20a2 2 0 004 0',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  globe: 'M12 3a9 9 0 100 18 9 9 0 000-18M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  calendar: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  sparkle: 'M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3z',
  history: 'M3 12a9 9 0 109-9 9 9 0 00-7 3M3 4v4h4M12 8v4l3 2',
} as const;

/* --- Small helpers ------------------------------------------------------- */

function accent(value: string) {
  return { '--c': value } as React.CSSProperties;
}

/** The record's own release date, or null. Nothing is substituted. */
function releasedOn(app: AppItem): string | null {
  const candidates = [app.apk?.releaseDate, app.releaseDate, app.lastUpdated];
  for (const value of candidates) {
    if (typeof value === 'string' && DATE_PATTERN.test(value)) return value;
  }
  return null;
}

type Kind = 'upd' | 'ok' | 'nd';

/** Map the model's five honest states onto the design's three card accents. */
function kindOf(knowledge: VersionKnowledge): Kind {
  if (knowledge.state === 'update-available') return 'upd';
  if (knowledge.state === 'up-to-date') return 'ok';
  return 'nd';
}

function badgeOf(knowledge: VersionKnowledge): string {
  switch (knowledge.state) {
    case 'update-available':
      return 'UPDATE AVAILABLE';
    case 'up-to-date':
      return 'UP TO DATE';
    case 'no-baseline':
      return 'NOT DOWNLOADED HERE';
    default:
      return knowledge.label.toUpperCase();
  }
}

/* --- What's new (collapsible, exactly like the reference) ---------------- */

function WhatsNew({ notes }: { notes: string[] }) {
  const [open, setOpen] = useState(false);
  if (notes.length === 0) {
    return (
      <div className="wn">
        <div className="wt">
          <Ic d={I.sparkle} />
          WHAT&rsquo;S NEW
        </div>
        <p className="mt" style={{ marginTop: 10 }}>
          No release notes were published for this version.
        </p>
      </div>
    );
  }
  const collapsible = notes.length > 2;
  return (
    <div className={`wn${collapsible && !open ? ' col' : ''}`}>
      <button
        className="wt"
        type="button"
        aria-expanded={collapsible ? open : true}
        onClick={() => collapsible && setOpen((v) => !v)}
      >
        <Ic d={I.sparkle} />
        WHAT&rsquo;S NEW
        {collapsible ? <span>{open ? 'Show less' : `Show all ${notes.length}`}</span> : null}
      </button>
      <ul>
        {notes.map((note, index) => (
          <li key={`${index}-${note.slice(0, 24)}`}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

/* --- Version history ----------------------------------------------------- */

function History({ entries }: { entries: ReleaseNoteEntry[] }) {
  if (entries.length <= 1) {
    return (
      <p className="foot">
        <Ic d={I.checkCircle} />
        No earlier releases recorded in the catalog.
      </p>
    );
  }
  return (
    <details className="hist">
      <summary>
        <Ic d={I.history} />
        VERSION HISTORY ({entries.length})
      </summary>
      <ul className="tl">
        {entries.map((entry, index) => (
          <li key={`${entry.version}-${index}`} style={accent(index === 0 ? 'var(--O)' : 'var(--B)')}>
            <i />
            <b>v{entry.version}</b>
            <span>
              {entry.date || 'no date recorded'}
              {entry.notes.length > 0 ? ` · ${entry.notes.join(' · ')}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* --- Card ---------------------------------------------------------------- */

function UpdateCard({
  app,
  knowledge,
  watched,
  onToggleWatch,
  onDownload,
}: {
  app: AppItem;
  knowledge: VersionKnowledge;
  watched: boolean;
  onToggleWatch: () => void;
  onDownload: () => void;
}) {
  const kind: Kind = kindOf(knowledge);
  const latest = knowledge.latestVersion || latestVersionOf(app as never);
  const notes = releaseNotesFor(app as never);
  const history = versionHistoryFor(app as never);
  const web = webUpdateHint(app as never);
  const released = releasedOn(app);

  const versionRow =
    kind === 'upd' ? (
      <>
        <span className="v">v{knowledge.localVersion}</span>
        <Ic d={I.arrow} />
        <span className="v new">v{latest}</span>
        <span className="mt">latest</span>
      </>
    ) : kind === 'ok' ? (
      <>
        <span className="v same">v{latest}</span>
        <span className="mt">matches what you downloaded</span>
      </>
    ) : knowledge.state === 'catalog-behind' ? (
      <>
        <span className="v">v{knowledge.localVersion}</span>
        <span className="mt">this browser has a newer copy than the catalog lists</span>
      </>
    ) : (
      <>
        <span className="v">v{latest || '—'}</span>
        <span className="mt">published version</span>
      </>
    );

  return (
    <article className={`card ${kind}`}>
      <div className="ch">
        <div className="ic">
          <AppIcon
            src={app.icon}
            name={app.name}
            category={app.category}
            themeColor={app.themeColor}
            size="lg"
          />
          <b>{kind === 'upd' ? <Ic d={I.upArrow} /> : <Ic d={I.check} />}</b>
        </div>
        <div className="ti">
          <div className="nm">
            <Link href={`/app/${app.slug}/`} className="nm-link">
              {app.name}
            </Link>
            <span className="bdg">{badgeOf(knowledge)}</span>
          </div>
          <div className="vr">{versionRow}</div>
          <div className="rel">
            <Ic d={I.calendar} />
            <span>
              Released <b>{released || 'not published'}</b>
            </span>
          </div>
        </div>
      </div>

      <WhatsNew notes={notes} />

      {knowledge.deliverable ? (
        <button className={`cta${kind === 'upd' ? '' : ' sec2'}`} type="button" onClick={onDownload}>
          <Ic d={I.download} />
          {kind === 'upd' ? `Get v${latest}` : 'Download APK'}
        </button>
      ) : web.state === 'web-always-current' ? (
        <a className="cta sec2" href={web.url} target="_blank" rel="noopener noreferrer">
          <Ic d={I.arrow} />
          Open web build
        </a>
      ) : null}

      <div className="chips">
        {web.state === 'web-always-current' ? (
          <span className="chip web">
            <Ic d={I.globe} />
            Web build always latest
          </span>
        ) : null}
        <button
          className={`chip w${watched ? ' on' : ''}`}
          type="button"
          aria-pressed={watched}
          onClick={onToggleWatch}
        >
          <Ic d={I.bell} />
          <em style={{ fontStyle: 'normal' }}>{watched ? 'Watching' : 'Watch'}</em>
        </button>
      </div>

      <History entries={history} />
    </article>
  );
}

/* --- Page ---------------------------------------------------------------- */

export default function UpdateCenter({ css }: { css: string }) {
  const router = useRouter();
  const { watched, toggle } = useWatchList();

  const [localVersions, setLocalVersions] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [notifyOn, setNotifyOn] = useState(false);
  const [filter, setFilter] = useState<'all' | 'upd' | 'ok'>('all');
  const [liveTheme, setLiveTheme] = useState<ThemeId | null>(null);
  const [toastText, setToastText] = useState('');
  const [toastTick, setToastTick] = useState(0);
  const [sheetApp, setSheetApp] = useState<AppItem | null>(null);

  const toast = (message: string) => {
    setToastText(message);
    setToastTick((tick) => tick + 1);
  };

  // One timer per toast, owned by an effect so nothing is scheduled into a ref.
  useEffect(() => {
    if (!toastText) return;
    const timer = window.setTimeout(() => setToastText(''), 1900);
    return () => window.clearTimeout(timer);
  }, [toastText, toastTick]);

  // Browser-local records are read after mount: SSR cannot know them, and
  // rendering a guess would be a hydration mismatch and a false claim. That
  // deliberate post-hydration read is the only setState-in-effect in this file.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const app of PUBLISHED) map[app.id] = knownLocalVersion(getInstallRecord(app.id));
    setLocalVersions(map);
    setNotifyOn(notificationsEnabled());
    setReady(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // The palette on <html> is the single truth (Work 1 engine). The pills mirror
  // it rather than keeping their own idea of which theme is active.
  useEffect(() => {
    const read = () => {
      const value = document.documentElement.getAttribute('data-theme');
      setLiveTheme(isThemeId(value) ? value : null);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const buckets = useMemo(() => buildUpdateCenter(PUBLISHED as never[], localVersions), [localVersions]);

  const goBack = () => {
    let cameFromApp = false;
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      const here = window.location.pathname.replace(/\/$/, '') || '/';
      const from = ref && ref.origin === window.location.origin ? ref.pathname.replace(/\/$/, '') || '/' : '';
      cameFromApp = Boolean(from) && from !== here && !from.endsWith('/updates');
    } catch {
      cameFromApp = false;
    }
    if (cameFromApp && window.history.length > 1) router.back();
    else router.push('/');
  };

  const handleWatch = (appId: string) => {
    toggle(appId);
    toast(watched.includes(appId) ? 'Stopped watching' : 'You will be told about new releases');
  };

  const showUpd = filter !== 'ok';
  const showOk = filter !== 'upd';
  const showNd = filter === 'all';

  const count = (value: number) => (ready ? value : '—');

  return (
    <div className="uc-root">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <main className="in">
        <div className="th" id="th">
          <span>Theme:</span>
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={liveTheme === theme.id ? 'on' : undefined}
              aria-pressed={liveTheme === theme.id}
              onClick={() => applyThemeToDocument(theme.id)}
            >
              {theme.label}
            </button>
          ))}
        </div>
        <p className="thnote">
          Palette: {liveTheme ? THEMES.find((t) => t.id === liveTheme)?.label || liveTheme : 'default'} — published
          site-wide from the Publisher console. The pills preview the other palettes with the same Work 1 engine; the
          published one returns automatically.
        </p>

        <button className="back" type="button" data-back="1" onClick={goBack}>
          <Ic d={I.back} />
          Back
        </button>

        <div className="kick">UPDATE CENTER</div>
        <h1>
          Your apps, at their latest <span>published version</span>
        </h1>
        <p className="lead">
          Versions come from the published AppMintly catalog. AppMintly never asks your device what is installed: it
          compares the catalog against the version this browser downloaded, so “up to date” always means “matches what
          you downloaded here”.
        </p>

        <div className="sum">
          <div className="sm" style={accent('var(--O)')}>
            <span className="si">
              <Ic d={I.upArrow} />
            </span>
            <div>
              <b>{count(buckets.available.length)}</b>
              <small>Updates available</small>
            </div>
          </div>
          <div className="sm" style={accent('var(--G)')}>
            <span className="si">
              <Ic d={I.checkCircle} />
            </span>
            <div>
              <b>{count(buckets.upToDate.length)}</b>
              <small>Up to date</small>
            </div>
          </div>
          <div className="sm" style={accent('var(--B)')}>
            <span className="si">
              <Ic d={I.shield} />
            </span>
            <div>
              <b>{count(buckets.totalPublished)}</b>
              <small>Published apps checked</small>
            </div>
          </div>
          <div className="sm" style={accent('var(--R)')}>
            <span className="si">
              <Ic d={I.bell} />
            </span>
            <div>
              <b>{ready ? watched.length : '—'}</b>
              <small>Watched in this browser</small>
            </div>
          </div>
        </div>

        <div className="nt">
          <Ic d={I.bell} />
          <span>{ready ? (notifyOn ? 'Update notifications on' : 'Update notifications off') : 'Update notifications'}</span>
          <button type="button" onClick={() => router.push('/notifications')}>
            Manage
          </button>
        </div>

        <div className="fl" id="fl">
          {(
            [
              ['all', 'All'],
              ['upd', 'Updates'],
              ['ok', 'Up to date'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={filter === id ? 'on' : undefined}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {showUpd ? (
          <section aria-labelledby="uc-upd">
            <h2 className="sec" id="uc-upd" style={accent('var(--O)')}>
              Updates for apps you downloaded
              <i />
              <em>{count(buckets.available.length)}</em>
            </h2>
            {!ready ? null : buckets.available.length === 0 ? (
              <p className="empty">
                No updates found for the versions recorded in this browser. This stays empty until the catalog
                publishes a newer verified release than the one you downloaded here.
              </p>
            ) : (
              buckets.available.map(({ app, knowledge }) => (
                <UpdateCard
                  key={app.id}
                  app={app as AppItem}
                  knowledge={knowledge}
                  watched={watched.includes(app.id || '')}
                  onToggleWatch={() => handleWatch(app.id || '')}
                  onDownload={() => setSheetApp(app as AppItem)}
                />
              ))
            )}
          </section>
        ) : null}

        {showOk ? (
          <section aria-labelledby="uc-ok">
            <h2 className="sec" id="uc-ok" style={accent('var(--G)')}>
              Up to date
              <i />
              <em>{count(buckets.upToDate.length)}</em>
            </h2>
            {!ready ? null : buckets.upToDate.length === 0 ? (
              <p className="empty">
                Nothing to show yet. Download an app from its page and it will appear here once this browser records
                the published version.
              </p>
            ) : (
              buckets.upToDate.map(({ app, knowledge }) => (
                <UpdateCard
                  key={app.id}
                  app={app as AppItem}
                  knowledge={knowledge}
                  watched={watched.includes(app.id || '')}
                  onToggleWatch={() => handleWatch(app.id || '')}
                  onDownload={() => setSheetApp(app as AppItem)}
                />
              ))
            )}
          </section>
        ) : null}

        {showNd ? (
          <section aria-labelledby="uc-nd">
            <h2 className="sec" id="uc-nd" style={accent('var(--B)')}>
              Not downloaded in this browser
              <i />
              <em>{count(buckets.unknown.length + buckets.unverifiable.length)}</em>
            </h2>
            {!ready ? null : buckets.unknown.length + buckets.unverifiable.length === 0 ? (
              <p className="empty">Every published app already has a version recorded in this browser.</p>
            ) : (
              [...buckets.unknown, ...buckets.unverifiable].map(({ app, knowledge }) => (
                <UpdateCard
                  key={app.id}
                  app={app as AppItem}
                  knowledge={knowledge}
                  watched={watched.includes(app.id || '')}
                  onToggleWatch={() => handleWatch(app.id || '')}
                  onDownload={() => setSheetApp(app as AppItem)}
                />
              ))
            )}
          </section>
        ) : null}

        {ready && buckets.totalPublished === 0 ? (
          <p className="empty">
            <b>The catalog published no apps.</b> Nothing can be checked until the published catalog carries a
            release.
          </p>
        ) : null}
      </main>

      {sheetApp ? (
        <ApkInstallSheet app={sheetApp} isOpen onClose={() => setSheetApp(null)} />
      ) : null}

      <div className={`toast${toastText ? ' on' : ''}`} role="status" aria-live="polite">
        {toastText}
      </div>
    </div>
  );
}
