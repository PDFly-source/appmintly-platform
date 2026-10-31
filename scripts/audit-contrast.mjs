#!/usr/bin/env node
/**
 * Computed-style contrast audit.
 *
 * The browser only collects facts: computed colour strings, the ancestor
 * background chain with geometry, and flags for backdrop filters. Every
 * calculation happens in lib/audit/contrast.mjs, which is unit tested against
 * known compositing fixtures. Unresolvable surfaces are reported as UNRESOLVED
 * and are never counted as passes.
 *
 * Usage: node scripts/audit-contrast.mjs [baseUrl] [routes] [themes] [viewports]
 */
import { spawn } from 'node:child_process';
import { resolveSurface, evaluateText, parseColor, gradientStops, gradientLayers, UNRESOLVED } from '../lib/audit/contrast.mjs';

const BASE = process.argv[2] || 'https://appmintly.pages.dev';
const ROUTES = (process.argv[3] || '/,/updates/,/trust/,/library/,/collections/,/explore/,/app/cineflow/').split(',');
const THEMES = (process.argv[4] || 'dark,light,amoled').split(',');
const VIEWPORTS = (process.argv[5] || '390x844').split(',').map((v) => v.split('x').map(Number));

const COLLECT = String.raw`(() => {
  const samples = [];
  const seen = new Set();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const text = (walk.currentNode.nodeValue || '').trim();
    if (text.length < 2) continue;
    const el = walk.currentNode.parentElement;
    if (!el || el.closest('[aria-hidden="true"],.sr-only,script,style,svg,option,noscript')) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const key = (typeof el.className === 'string' ? el.className : '') + '|' + s.color + '|' + Math.round(rect.top);
    if (seen.has(key)) continue;
    seen.add(key);
    const clip = /text/.test(s.webkitBackgroundClip || '') || /text/.test(s.backgroundClip || '');
    // absolute/fixed siblings that paint over this element (scrims, hero images)
    let occluded = null;
    let anc = el.parentElement;
    for (let d = 0; d < 3 && anc; d++, anc = anc.parentElement) {
      for (const sib of anc.querySelectorAll('img, [data-scrim], [aria-hidden="true"]')) {
        const cs = getComputedStyle(sib);
        if (cs.position !== 'absolute' && cs.position !== 'fixed') continue;
        const sr = sib.getBoundingClientRect();
        const sy = rect.top + rect.height / 2;
        if (sr.top <= sy && sr.bottom >= sy && sr.left <= rect.left + rect.width / 2 && sr.right >= rect.left + rect.width / 2) {
          occluded = (typeof sib.className === 'string' ? sib.className : sib.tagName).slice(0, 40);
          break;
        }
      }
      if (occluded) break;
    }
    const chain = [];
    let n = clip ? el.parentElement : el;
    while (n && n !== document.documentElement.parentElement && chain.length < 8) {
      const cs = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      chain.push({
        backgroundColor: cs.backgroundColor,
        backgroundImage: cs.backgroundImage,
        top: r.top + window.scrollY,
        height: r.height,
        backdrop: /blur|saturate/.test(cs.backdropFilter || cs.webkitBackdropFilter || ''),
      });
      n = n.parentElement;
    }
    samples.push({
      text: text.slice(0, 40),
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 90),
      color: s.color,
      fontSize: parseFloat(s.fontSize) || 16,
      fontWeight: parseInt(s.fontWeight, 10) || 400,
      sampleY: rect.top + window.scrollY + rect.height / 2,
      clipImage: clip ? s.backgroundImage : null,
      occluded,
      chain,
    });
  }
  return { samples, overflow: document.documentElement.scrollWidth };
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn('google-chrome', ['--headless=new', '--remote-debugging-port=9801', '--no-sandbox', '--disable-gpu', '--user-data-dir=/tmp/audit-resolver-profile', 'about:blank']);
let target = null;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(400);
  try { target = (await (await fetch('http://127.0.0.1:9801/json/list')).json()).find((t) => t.type === 'page'); } catch {}
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

const totals = { PASS: 0, FAIL: 0, UNRESOLVED: 0 };
const failures = [];
const unresolved = [];
for (const [w, h] of VIEWPORTS) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });
  for (const theme of THEMES) {
    for (const route of ROUTES) {
      await send('Page.navigate', { url: `${BASE}/` });
      await sleep(800);
      await evaluate(`localStorage.setItem('appmintly-theme','${theme}');1`);
      await send('Page.navigate', { url: BASE + route });
      await sleep(2600);
      const collected = await evaluate(COLLECT);
      const counts = { PASS: 0, FAIL: 0, UNRESOLVED: 0 };
      for (const sample of collected.samples) {
        const surface = sample.occluded
          ? { status: 'unresolved', color: null, reason: `sibling overlay layer covers the sample (${sample.occluded})` }
          : resolveSurface(sample.chain, sample.sampleY);
        let gradientTextStops = null;
        if (sample.clipImage) {
          gradientTextStops = gradientLayers(sample.clipImage).flatMap((l) => gradientStops(l).map((s) => s.color));
          if (!gradientTextStops.length) gradientTextStops = null;
        }
        const verdict = evaluateText({ ...sample, surface, gradientTextStops });
        counts[verdict.status]++;
        totals[verdict.status]++;
        if (verdict.status === 'FAIL') {
          failures.push({ route, theme, viewport: `${w}x${h}`, text: sample.text, cls: sample.cls, tag: sample.tag, ratio: verdict.ratio, required: verdict.required, fg: sample.color, bg: surface.color });
        } else if (verdict.status === UNRESOLVED) {
          unresolved.push({ route, theme, viewport: `${w}x${h}`, text: sample.text, cls: sample.cls, reason: verdict.reason });
        }
      }
      console.log(`${counts.FAIL === 0 ? 'CLEAN ' : 'FAILS '} ${w}x${h} ${theme.padEnd(6)} ${route.padEnd(16)} pass=${counts.PASS} fail=${counts.FAIL} unresolved=${counts.UNRESOLVED} overflow=${collected.overflow}/${w}`);
    }
  }
}
console.log('\n--- FAILURES ---');
for (const f of failures) console.log(`${f.ratio} < ${f.required} | ${f.theme} ${f.viewport} ${f.route} | ${f.text} | ${f.tag}.${f.cls} | fg ${f.fg} bg rgb(${f.bg.r},${f.bg.g},${f.bg.b})`);
console.log('\n--- UNRESOLVED (not counted as pass) ---');
const byReason = new Map();
for (const u of unresolved) byReason.set(u.reason, (byReason.get(u.reason) || 0) + 1);
for (const [reason, count] of byReason) console.log(`${count}x ${reason}`);
for (const u of unresolved.slice(0, 10)) console.log(`  UNRESOLVED | ${u.theme} ${u.route} | ${u.text} | ${u.cls.slice(0, 60)} | ${u.reason}`);
console.log(`\nTOTALS pass=${totals.PASS} fail=${totals.FAIL} unresolved=${totals.UNRESOLVED}`);
ws.close();
chrome.kill();
process.exit(failures.length ? 1 : 0);
