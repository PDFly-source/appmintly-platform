#!/usr/bin/env node
/**
 * Computed-style contrast audit (Batch 2 repair, hotfix).
 *
 * Methodology, deliberately different from the class-name matcher that caused
 * the regression:
 *   - Reads computed foreground via getComputedStyle(el).color.
 *   - Reads the rendered background by walking ancestors for the first opaque
 *     background-color, and records gradient/backdrop parents as indeterminate
 *     instead of guessing.
 *   - Composites text alpha over the resolved background before measuring, so
 *     opacity-driven muting cannot hide a failure.
 *   - Reports route, theme, viewport, tag, class list and both colours.
 *   - Never writes to the DOM and never edits source. It only reports.
 *
 * Usage: node scripts/audit-contrast.mjs [baseUrl] [routes] [themes] [viewports]
 */

const BASE = process.argv[2] || 'https://appmintly.pages.dev';
const ROUTES = (process.argv[3] || '/updates/,/trust/,/library/,/collections/,/explore/,/app/cineflow/,/').split(',');
const THEMES = (process.argv[4] || 'dark,light,amoled').split(',');
const VIEWPORTS = (process.argv[5] || '390x844').split(',').map((v) => v.split('x').map(Number));

const AUDIT = String.raw`(() => {
  const parse = (c) => {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const q = m[1].split(',').map(Number);
    return { r: q[0], g: q[1], b: q[2], a: q.length > 3 ? q[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: Math.round(fg.r * fg.a + bg.r * (1 - fg.a)),
    g: Math.round(fg.g * fg.a + bg.g * (1 - fg.a)),
    b: Math.round(fg.b * fg.a + bg.b * (1 - fg.a)),
    a: 1,
  });
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };
  const stopsFrom = (image) => {
    const stops = [];
    const re = /rgba?\([^)]+\)/g;
    let m;
    while ((m = re.exec(image))) {
      const c = parse(m[0]);
      // Scrims are translucent: composite over white, the brightest thing an
      // image behind them could be, so the measurement is conservative.
      if (c && c.a > 0) stops.push(c.a >= 0.999 ? c : over(c, { r: 255, g: 255, b: 255, a: 1 }));
    }
    return stops;
  };
  const resolveBg = (el) => {
    let n = el;
    let indeterminate = null;
    while (n && n !== document.documentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== 'none' && /gradient/.test(s.backgroundImage)) {
        // A gradient is a real rendered background: every stop is a candidate,
        // and the worst contrast against the text is what counts. This is why
        // the install banner and the 3D hero were false negatives before.
        const stops = stopsFrom(s.backgroundImage);
        const c = parse(s.backgroundColor);
        if (c && c.a >= 0.999) stops.push(c);
        if (stops.length) return { candidates: stops, indeterminate: null };
      }
      const c = parse(s.backgroundColor);
      if (c && c.a >= 0.999) return { candidates: [c], indeterminate };
      if (c && c.a > 0) { const parent = parse(getComputedStyle(n.parentElement).backgroundColor); if (parent && parent.a === 1) return { candidates: [over(c, parent)], indeterminate }; }
      n = n.parentElement;
    }
    const body = parse(getComputedStyle(document.body).backgroundColor);
    return { candidates: [body && body.a === 1 ? body : { r: 255, g: 255, b: 255, a: 1 }], indeterminate };
  };
  const out = [];
  const seen = new Set();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const text = (walk.currentNode.nodeValue || '').trim();
    if (!text || text.length < 2) continue;
    const el = walk.currentNode.parentElement;
    if (!el) continue;
    if (el.closest('[aria-hidden="true"],.sr-only,script,style,svg,option')) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const rawFg = parse(s.color);
    if (!rawFg) continue;
    const clipTest = /text/.test(s.webkitBackgroundClip || '') || /text/.test(s.backgroundClip || '');
    const { candidates, indeterminate } = resolveBg(clipTest ? el.parentElement || el : el);
    const bg = candidates[0];
    const clipped = clipTest;
    const clipStops = clipped && s.backgroundImage !== 'none' ? stopsFrom(s.backgroundImage) : [];
    const fgs = clipStops.length ? clipStops : [rawFg.a < 1 ? over(rawFg, bg) : rawFg];
    const worst = fgs.map((f) => Math.min(...candidates.map((b) => ratio(f, b))))
      .reduce((a, b) => Math.min(a, b), Infinity);
    const fg = fgs[0];
    const size = parseFloat(s.fontSize) || 16;
    const weight = parseInt(s.fontWeight, 10) || 400;
    const need = (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3 : 4.5;
    const r = Math.round(worst * 100) / 100;
    const cls = typeof el.className === 'string' ? el.className : '';
    const key = cls + '|' + Math.round(r * 10);
    if (r >= need || seen.has(key)) continue;
    seen.add(key);
    out.push({
      text: text.slice(0, 40),
      tag: el.tagName.toLowerCase(),
      cls: cls.slice(0, 90),
      fg: 'rgb(' + fg.r + ',' + fg.g + ',' + fg.b + ')',
      bg: 'rgb(' + bg.r + ',' + bg.g + ',' + bg.b + ')',
      ratio: r,
      need,
      gradientClipped: clipStops.length > 0,
      gradientParent: indeterminate,
    });
  }
  return { fails: out.slice(0, 20), total: out.length, overflow: document.documentElement.scrollWidth };
})()`;

const { spawn } = await import('node:child_process');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn('google-chrome', [
  '--headless=new', '--remote-debugging-port=9781', '--no-sandbox', '--disable-gpu',
  '--user-data-dir=/tmp/audit-contrast-profile', 'about:blank',
]);
let target = null;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(400);
  try { target = (await (await fetch('http://127.0.0.1:9781/json/list')).json()).find((t) => t.type === 'page'); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }))?.result?.value;
await send('Runtime.enable');
await send('Page.enable');

const report = {};
let failures = 0;
for (const [w, h] of VIEWPORTS) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });
  for (const theme of THEMES) {
    for (const route of ROUTES) {
      await send('Page.navigate', { url: `${BASE}/` });
      await sleep(900);
      await evaluate(`localStorage.setItem('appmintly-theme','${theme}');1`);
      await send('Page.navigate', { url: BASE + route });
      await sleep(2600);
      const result = await evaluate(AUDIT);
      const key = `${w}x${h} ${theme} ${route}`;
      report[key] = result;
      failures += result.total;
      if (result.total) {
        console.log(`FAIL ${key}: ${result.total}`);
        for (const f of result.fails) console.log(`   ${f.ratio} < ${f.need} | ${f.text} | ${f.tag}.${f.cls} | fg ${f.fg} bg ${f.bg}`);
      } else {
        console.log(`ok   ${key} (overflow ${result.overflow}/${w})`);
      }
    }
  }
}
console.log(JSON.stringify({ failures, report }));
ws.close();
chrome.kill();
process.exit(failures ? 1 : 0);
