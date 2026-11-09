'use client';

import { useEffect, useRef } from 'react';

type Props = { css: string; shell: string };

/**
 * Update Center. The markup and styles are the supplied premium reference
 * (incoming_files/e8dce13ee_...premium cards.html), scoped under .uc-root so it
 * cannot disturb the rest of the site. Only the demo dataset is replaced: every
 * card, badge, version, date, note and history row now comes from
 * /data/apps.json, the published catalog.
 */
export default function UpdateCenter({ css, shell }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const VALID = ['emerald', 'sapphire', 'ruby', 'champagne'];
    const WATCH_KEY = 'appmintly.updates.watched';
    const DONE_KEY = 'appmintly.updates.downloaded';
    const root = ref.current;
    if (!root) return;

    const readSet = (key: string): Record<string, string> => {
      try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
    };
    const writeSet = (key: string, value: Record<string, string>) => {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
    };

    const toast = (message: string) => {
      const t = root.querySelector('#toast');
      if (!t) return;
      t.textContent = message;
      t.classList.add('on');
      window.clearTimeout((root as any)._tm);
      (root as any)._tm = window.setTimeout(() => t.classList.remove('on'), 1900);
    };

    const arrows = '<span class="ar">→</span>';
    const version = (app: any) => (app.apk?.versionName || app.version || '').replace(/^v/, '');
    const dateOf = (app: any) => app.apk?.releaseDate || app.releaseDate || app.lastUpdated || '';
    const notesOf = (app: any): string[] => {
      const notes = app.releaseNotes;
      if (Array.isArray(notes) && notes.length) {
        return notes.map((n: any) => (typeof n === 'string' ? n : n?.note || n?.text || '')).filter(Boolean);
      }
      const cl = app.changelog;
      if (Array.isArray(cl) && cl.length && Array.isArray(cl[0]?.notes)) return cl[0].notes;
      return [app.shortDescription || app.description || ''].filter(Boolean);
    };
    const historyOf = (app: any) => {
      const cl = app.changelog;
      if (!Array.isArray(cl)) return [];
      return cl.slice(0, 6).map((entry: any) => [
        entry.version ? `v${String(entry.version).replace(/^v/, '')}` : '',
        entry.date || entry.releaseDate || '',
        Array.isArray(entry.notes) ? entry.notes.filter(Boolean).join('; ') : '',
      ]).filter((row: string[]) => row[0]);
    };

    const card = (app: any, watched: Record<string, string>, done: Record<string, string>) => {
      const latest = version(app);
      const downloaded = done[app.id];
      const isUpdate = Boolean(downloaded) && downloaded !== latest;
      const isCurrent = Boolean(downloaded) && downloaded === latest;
      const kind = isUpdate ? 'upd' : 'ok';
      const badge = isUpdate ? 'UPDATE AVAILABLE' : isCurrent ? 'UP TO DATE' : 'NOT DOWNLOADED HERE';
      const cmp = isUpdate
        ? `<span class="v">v${downloaded}</span>${arrows}<span class="v new">v${latest}</span><span class="mt">latest</span>`
        : `<span class="v same">v${latest}</span><span class="mt">${isCurrent ? 'matches what you downloaded' : 'published version'}</span>`;
      const notes = notesOf(app);
      const more = notes.length > 2 ? `<span>Show all ${notes.length}</span>` : '';
      const history = historyOf(app);
      const histBlock = history.length
        ? `<details class="hist"><summary>VERSION HISTORY (${history.length})</summary><ul class="tl">${history
            .map((row: string[], i: number) => `<li style="--c:${i === 0 ? 'var(--O)' : 'var(--B)'}"><i></i><b>${row[0]}</b><span>${row[1]}${row[2] ? ' · ' + row[2] : ''}</span></li>`)
            .join('')}</ul></details>`
        : '';
      const href = app.apk?.apkUrl || app.apkUrl || '';
      const cta = href
        ? `<a class="cta${isUpdate ? '' : ' sec2'}" href="${href}" data-app="${app.id}" data-ver="${latest}"${app.apk?.downloadAvailable === false ? ' aria-disabled="true"' : ''}>⬇ ${isUpdate ? `Get v${latest}` : isCurrent ? `Re-download v${latest}` : `Get v${latest}`}</a>`
        : `<a class="cta sec2" href="${app.webUrl || app.launchUrl || '#'}" target="_blank" rel="noreferrer">↗ Open web build</a>`;
      return `<article class="card ${kind}" data-k="${kind}">
        <div class="ch"><div class="ic"><img alt="" src="${app.icon || ''}"><b>${isUpdate ? '↑' : '✓'}</b></div>
          <div class="ti"><div class="nm">${app.name}<span class="bdg">${badge}</span></div>
            <div class="vr">${cmp}</div>
            <div class="rel">Released <b>${dateOf(app)}</b></div></div></div>
        <div class="wn col"><button class="wt" type="button">✦ WHAT'S NEW${more}</button><ul>${notes.map((n: string) => `<li>${n}</li>`).join('')}</ul></div>
        ${cta}
        <div class="chips"><span class="chip web">Web build always latest</span>
          <button class="chip w${watched[app.id] ? ' on' : ''}" type="button" data-watch="${app.id}"><em style="font-style:normal">${watched[app.id] ? 'Watching' : 'Watch'}</em></button></div>
        ${histBlock}
      </article>`;
    };

    const render = () => {
      const watched = readSet(WATCH_KEY);
      const done = readSet(DONE_KEY);
      fetch('/data/apps.json', { cache: 'no-store' })
        .then((r) => r.json())
        .then((payload) => {
          const list = (payload.apps || payload).filter((a: any) => a && (a.published === true || a.status === 'published' || a.apk?.buildStatus === 'released'));
          const model = list.map((app: any) => {
            const latest = version(app);
            const downloaded = done[app.id];
            const state = !downloaded ? 'new' : downloaded === latest ? 'ok' : 'upd';
            return { app, state };
          });
          const updates = model.filter((m: any) => m.state === 'upd');
          const current = model.filter((m: any) => m.state === 'ok');
          const never = model.filter((m: any) => m.state === 'new');
          const put = (id: string, html: string) => {
            const el = root.querySelector('#' + id);
            if (el) el.innerHTML = html;
          };
          put('u', updates.map((m: any) => card(m.app, watched, done)).join(''));
          put('k', current.map((m: any) => card(m.app, watched, done)).join('') + never.map((m: any) => card(m.app, watched, done)).join(''));
          const setText = (id: string, value: string) => {
            const el = root.querySelector('#' + id);
            if (el) el.textContent = value;
          };
          setText('statUpd', String(updates.length));
          setText('statOk', String(current.length));
          setText('statAll', String(list.length));
          setText('wc', String(Object.keys(watched).length));
          setText('gUpd', String(updates.length));
          setText('gOk', String(current.length + never.length));
        })
        .catch(() => toast('Could not read the catalog. Nothing is being shown as up to date.'));
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const watch = target.closest('[data-watch]') as HTMLElement | null;
      if (watch) {
        const id = watch.getAttribute('data-watch') || '';
        const watched = readSet(WATCH_KEY);
        if (watched[id]) delete watched[id]; else watched[id] = '1';
        writeSet(WATCH_KEY, watched);
        watch.classList.toggle('on', Boolean(watched[id]));
        const em = watch.querySelector('em');
        if (em) em.textContent = watched[id] ? 'Watching' : 'Watch';
        const wcEl = root.querySelector('#wc');
        if (wcEl) wcEl.textContent = String(Object.keys(watched).length);
        toast(watched[id] ? 'You will be told about new releases' : 'Stopped watching');
        return;
      }
      const nl = target.closest('.wt');
      if (nl) {
        const wn = nl.parentNode as HTMLElement;
        wn.classList.toggle('col');
        const span = nl.querySelector('span');
        if (span) span.textContent = wn.classList.contains('col') ? `Show all ${wn.querySelectorAll('li').length}` : 'Show less';
        return;
      }
      const download = target.closest('.cta[data-app]') as HTMLAnchorElement | null;
      if (download) {
        const id = download.getAttribute('data-app') || '';
        const ver = download.getAttribute('data-ver') || '';
        const done = readSet(DONE_KEY);
        done[id] = ver;
        writeSet(DONE_KEY, done);
        toast(`Downloading v${ver} · recorded for this browser`);
        window.setTimeout(render, 900);
        return;
      }
      const filter = target.closest('[data-f]') as HTMLElement | null;
      if (filter) {
        const want = filter.getAttribute('data-f');
        root.querySelectorAll('[data-f]').forEach((n) => n.classList.toggle('on', n === filter));
        const show = (id: string, heading: string, visible: boolean) => {
          [id, heading].forEach((sel) => {
            const el = root.querySelector('#' + sel) as HTMLElement | null;
            if (el) el.style.display = visible ? '' : 'none';
          });
        };
        show('u', '', want !== 'ok');
        show('k', '', want !== 'upd');
        const hUpd = root.querySelector('[data-g="upd"]') as HTMLElement | null;
        const hOk = root.querySelector('[data-g="ok"]') as HTMLElement | null;
        if (hUpd) hUpd.style.display = want === 'ok' ? 'none' : '';
        if (hOk) hOk.style.display = want === 'upd' ? 'none' : '';
        return;
      }
      const notify = target.closest('[data-notify]') as HTMLElement | null;
      if (notify) {
        const label = root.querySelector('.nt span');
        if (typeof Notification === 'undefined') {
          if (label) label.textContent = 'This browser cannot show update notifications';
          toast('Notifications are not supported in this browser');
          return;
        }
        Notification.requestPermission().then((state) => {
          if (label) label.textContent = state === 'granted' ? 'Update notifications on' : 'Update notifications blocked';
          toast(state === 'granted' ? 'Update notifications enabled' : 'Notifications stay off');
        });
        return;
      }
      const back = target.closest('[data-back]');
      if (back) { if (history.length > 1) history.back(); else window.location.assign('/'); return; }
      const themeBtn = target.closest('[data-th]') as HTMLElement | null;
      if (themeBtn) {
        const next = themeBtn.getAttribute('data-th') || '';
        if (!VALID.includes(next)) return;
        document.documentElement.setAttribute('data-theme', next);
        root.querySelectorAll('[data-th]').forEach((n) => n.classList.toggle('on', n === themeBtn));
        toast('Preview only · the published palette is set in the Publisher console');
      }
    };

    root.addEventListener('click', onClick as EventListener);

    // Mark the authoritative palette without creating a second source of truth.
    fetch('https://appmintly-publisher-api.sbn50088.workers.dev/public/appearance', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const theme = d && d.theme;
        if (theme && VALID.includes(theme)) {
          root.querySelectorAll('[data-th]').forEach((n) => n.classList.toggle('on', n.getAttribute('data-th') === theme));
        }
      })
      .catch(() => {});

    render();
    return () => root.removeEventListener('click', onClick as EventListener);
  }, []);

  return (
    <div className="uc-root" ref={ref}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div dangerouslySetInnerHTML={{ __html: shell }} />
    </div>
  );
}
