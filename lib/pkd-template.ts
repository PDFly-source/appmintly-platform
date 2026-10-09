import type { PkdCatalogData } from './pkd-data';

/**
 * PKD 3D profile page body — verbatim structure from the supplied PKD design
 * source. Only catalog-driven values (stats, marquee, showcase shell, updates
 * timeline, photo asset path) are injected; every other element, class,
 * animation hook and wording is preserved exactly.
 */
export function buildPkdBody(data: PkdCatalogData, photoUrl: string): string {
  const s = data.stats;
  const a0 = data.apps[0];
  const marquee = data.apps.map((a) => `<span>${esc(a.n)}</span>`).join('')
    + data.apps.map((a) => `<span>${esc(a.n)}</span>`).join('');
  const updates = data.updates.map((u) =>
    `<div class="ti rv"><img src="${esc(u.icon)}" alt=""><div class="a"><b>${esc(u.name)}</b><small>${esc(u.category)}</small></div><div class="r"><b>${esc(u.version)}</b><small>${esc(u.date)}</small></div></div>`).join('\n    ');
  return TEMPLATE
    .replace(/__PHOTO__/g, esc(photoUrl))
    .replace(/__TOTAL__/g, String(s.total))
    .replace(/__PUBLISHED__/g, String(s.published))
    .replace(/__CATS__/g, String(s.categories))
    .replace(/__LATEST__/g, esc(s.latest))
    .replace(/__MARQUEE__/, marquee)
    .replace(/__UPDATES__/, updates)
    .replace(/__COUNTER__/, data.apps.length ? `01 / ${String(data.apps.length).padStart(2, '0')}` : '— / —')
    .replace(/__A0_ICON__/, a0 ? esc(a0.i) : '')
    .replace(/__A0_NAME__/, a0 ? esc(a0.n) : 'PKD')
    .replace(/__A0_TY__/, a0 ? esc(a0.ty) : 'App')
    .replace(/__A0_NEW__/, a0 && a0.nw ? '' : 'display:none')
    .replace(/__A0_DESC__/, a0 ? esc(a0.d) : 'No published applications yet.')
    .replace(/__A0_V__/, a0 ? esc(a0.v) : '—')
    .replace(/__A0_T__/, a0 ? esc(a0.t) : '')
    .replace(/__A0_URL__/, a0 ? esc(a0.u) : '#');
}

function esc(v: string): string {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const TEMPLATE = `
<svg width="0" height="0" style="position:absolute"><symbol id="v" viewBox="0 0 24 24"><path fill="currentColor" d="M12 1.5l2.6 1.9 3.2-.1 1 3 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3L2.6 15.8l1-3.1-1-3.1 2.6-1.9 1-3 3.2.1z"/><path d="M8 12.2l2.7 2.7L16 9.6" fill="none" stroke="#07090E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol></svg>
<div id="ld"><span>PKD</span><svg class="vb"><use href="#v"/></svg></div><div id="cg"></div><div id="dots"></div><div id="pg"></div><canvas id="gl"></canvas><div class="bgf"></div>
<nav class="pkd-nav"><div class="navl"><button class="btn g pkd-back" id="pkd-back" type="button" aria-label="Back to AppMintly marketplace" title="Back to AppMintly"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg><span class="pkd-bf">Back to AppMintly</span><span class="pkd-bs">Back</span></button><div class="logo">PKD <svg class="vb"><use href="#v"/></svg></div></div><div class="lk"><a href="#about">About</a><a href="#me">Developer</a><a href="#apps">Apps</a><a href="#updates">Updates</a></div><a class="btn p" href="https://appmintly.pages.dev/">AppMintly ↗</a></nav>
<main class="pkd-main">
<section class="hero">
  <div class="chips rv"><span class="chip g">★ Trusted Developer</span><span class="chip b">&lt;/&gt; Developer</span><span class="chip b">✓ Verified Publisher</span></div>
  <h1 class="rv">PKD<svg class="vb"><use href="#v"/></svg></h1>
  <div class="who rv"><img class="ph" src="__PHOTO__" alt="PKD"><div class="sub"><b>Verified</b> Developer <span style="color:var(--mute)">&amp;</span> Publisher</div></div>
  <p class="lead rv">Building private, fast, local-first apps — published on AppMintly with a verified publisher identity.</p>
  <div class="row rv"><a class="btn p" href="#apps">Explore my apps ↓</a><a class="btn g" href="#about">Verified identity</a></div>
  <div class="cmd rv"><span>$</span>pkd publish --verified<i class="cur"></i></div>
  <div class="stats rv">
    <div class="stat"><b data-n="__TOTAL__">0</b><span>Total apps</span></div>
    <div class="stat"><b data-n="__PUBLISHED__">0</b><span>Published</span></div>
    <div class="stat"><b data-n="__CATS__">0</b><span>Categories</span></div>
    <div class="stat"><b>__LATEST__</b><span>Latest</span></div>
  </div>
</section>
<div class="mq"><div>__MARQUEE__</div></div>
<section id="about">
  <div class="ey rv">Two roles · One identity</div>
  <h2 class="rv">I build it. <em>I publish it.</em></h2>
  <div class="ab">
    <div class="idw rv"><div class="id" id="id">
      <div class="t">VERIFIED PUBLISHER · APPMINTLY</div>
      <div class="mid"><div class="av"><img src="__PHOTO__" alt="PKD"></div><div><h3>PKD <svg class="vb"><use href="#v"/></svg></h3><p>__PUBLISHED__ published applications</p></div></div>
      <div class="b"><span>IDENTITY VERIFIED</span><span>★ TRUSTED DEVELOPER</span></div>
    </div></div>
    <div class="rl">
      <div class="card rv"><div class="ico">&lt;/&gt;</div><h3>Developer</h3><p>Designs and engineers every app end to end, focused on speed and privacy.</p><ul><li>Installable web apps &amp; APK packages</li><li>Lightweight — from 254 KB</li></ul></div>
      <div class="card rv"><div class="ico"><svg class="vb" style="width:1.3em;height:1.3em"><use href="#v"/></svg></div><h3>Verified Publisher</h3><p>Publisher identity verified by the AppMintly team — every release carries the verified badge.</p><ul><li>__PUBLISHED__ of __TOTAL__ apps published</li><li>Regular, versioned updates</li></ul></div>
    </div>
  </div>
</section>
<section id="me">
  <div class="me">
    <div class="pw rv"><i class="br t1"></i><i class="br t2"></i><i class="br b1"></i><i class="br b2"></i><div class="pf" id="pf">
      <div class="im"><img src="__PHOTO__" alt="PKD — Verified Developer and Publisher"><i class="sc"></i></div>
      <div class="tag">// pkd.profile</div>
      <div class="cap"><h3>PKD <svg class="vb"><use href="#v"/></svg></h3><p>Verified Developer · Publisher</p></div>
      <div class="fc a"><svg class="vb"><use href="#v"/></svg>Verified Publisher</div>
      <div class="fc b"><span style="color:var(--cy)">&lt;/&gt;</span>Developer</div>
      <div class="fc c"><span style="color:var(--gold)">★</span>5 apps published</div>
    </div></div>
    <div>
      <div class="ey rv">// Meet the developer</div>
      <h2 class="rv">Developer by craft. <em>Publisher by trust.</em></h2>
      <div class="term rv"><div class="th"><i></i><i></i><i></i><span>pkd.config.js</span><b>✓ verified</b></div><div class="code">
<span class="l" style="--i:0"><span class="k">const</span> <span class="pp">developer</span> = {</span><span class="l" style="--i:1">  <span class="pp">name</span>: <span class="sg">"PKD"</span>,</span><span class="l" style="--i:2">  <span class="pp">roles</span>: [<span class="sg">"Developer"</span>, <span class="sg">"Publisher"</span>],</span><span class="l" style="--i:3">  <span class="pp">verified</span>: <span class="nb">true</span>,</span><span class="l" style="--i:4">  <span class="pp">apps</span>: <span class="nb">__PUBLISHED__</span>,</span><span class="l" style="--i:5">  <span class="pp">values</span>: [<span class="sg">"private"</span>, <span class="sg">"fast"</span>, <span class="sg">"local-first"</span>],</span><span class="l" style="--i:6">  <span class="pp">publishedOn</span>: <span class="sg">"AppMintly"</span></span><span class="l" style="--i:7">};<span class="cur"></span></span></div></div>
      <p class="t rv">I design, build and publish apps that stay fast, private and light — from PDF tools and P2P sharing to Assam-focused study and wellness apps. What you install is built, verified and supported by the same person.</p>
      <div class="tech rv"><span>Installable Apps</span><span>APK Packages</span><span>WebRTC P2P</span><span>Web Crypto</span><span>Local-first</span></div>
      <div class="wf rv"><span>build</span><i>→</i><span>verify</span><i>→</i><span>publish</span><i>→</i><span>update</span></div>
      <div class="fx rv" style="margin-top:22px"><div><b>__PUBLISHED__</b><span>Apps</span></div><div><b>__CATS__</b><span>Categories</span></div><div><b>100%</b><span>Verified</span></div></div>
      <div class="row rv"><a class="btn p" href="#apps">See my apps ↓</a><a class="btn g" href="https://appmintly.pages.dev/">AppMintly ↗</a></div>
    </div>
  </div>
</section>
<section id="apps">
  <div class="stk"><div class="pn">
    <div class="n"><span>APPS BY PKD</span><span id="an">__COUNTER__</span></div>
    <div class="pb"><u id="pbu"></u></div>
    <div class="sw" id="sw">
      <div class="hd"><img id="ai" alt="" src="__A0_ICON__"><div><h3 id="nm">__A0_NAME__</h3><div class="by">PKD <svg class="vb"><use href="#v"/></svg></div></div></div>
      <div class="tags"><span class="tg b" id="ty">__A0_TY__</span><span class="tg n" id="nw" style="__A0_NEW__">New</span></div>
      <p id="ad">__A0_DESC__</p>
      <div class="ft"><div><b id="vs">__A0_V__</b><small id="ct">__A0_T__</small></div><a class="btn p" id="gb" href="__A0_URL__">⬇ Get App</a></div>
    </div>
    <div class="tabs" id="tabs"></div>
  </div></div>
</section>
<section id="updates">
  <div class="ey rv">Changelog</div>
  <h2 class="rv">Latest <em>updates.</em></h2>
  <div class="tl">__UPDATES__</div>
</section>
<section id="trust">
  <div class="ey rv">Principles</div>
  <h2 class="rv">Small apps. <em>Big trust.</em></h2>
  <div class="three">
    <div class="card rv"><div class="ico">🔒</div><h3>Private</h3><p>Tools that keep your data on your device — PDFs, files and text stay local.</p></div>
    <div class="card rv"><div class="ico">⚡</div><h3>Fast &amp; light</h3><p>Every app is under 4 MB, and most under 500 KB.</p></div>
    <div class="card rv"><div class="ico">🌏</div><h3>Made for people</h3><p>From Assam-focused study and wellness apps to universal utilities.</p></div>
  </div>
</section>
<section class="cta"><div class="wm">PKD</div>
  <div class="ey rv">Everything in one place</div>
  <h2 class="rv">All apps by PKD, <em>on AppMintly.</em></h2>
  <div class="row rv" style="justify-content:center"><a class="btn p" href="https://appmintly.pages.dev/">Open AppMintly →</a><a class="btn g" href="https://pdfly-source.github.io/nexdrop/">Try NexDrop</a></div>
</section>
</main>
<footer class="pkd-footer"><span>© 2026 PKD · Verified Developer &amp; Publisher</span><span><a href="https://appmintly.pages.dev/">AppMintly</a><a href="https://pdfly-source.github.io/nexdrop/">NexDrop</a></span></footer>
`;
