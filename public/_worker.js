/**
 * Pages advanced mode: render the authoritative theme into the HTML on the way
 * out. The Durable Object stays the single source of truth; this reads it over
 * the public runtime endpoint, so no second database and no bindings are needed.
 * Only HTML is touched, and only the data-theme attribute; assets keep their
 * normal caching.
 */
const THEME_ENDPOINT = 'https://appmintly-publisher-api.sbn50088.workers.dev/public/appearance';
const VALID = /^(emerald|sapphire|ruby|champagne|obsidian|amethyst|copper|aurora|platinum|sakura)$/;

function withTheme(html, theme) {
  if (!VALID.test(theme)) return html;
  if (/<html[^>]*\sdata-theme="[a-z]+"/.test(html)) {
    return html.replace(/(<html[^>]*?)\sdata-theme="[a-z]+"/, `$1 data-theme="${theme}"`);
  }
  return html.replace(/<html(\s|>)/, `<html data-theme="${theme}"$1`);
}

export default {
  async fetch(request, env) {
    const res = await env.ASSETS.fetch(request);
    const type = res.headers.get('content-type') || '';
    if (request.method !== 'GET' || !type.includes('text/html')) return res;

    let theme = null;
    try {
      const r = await fetch(THEME_ENDPOINT, { cf: { cacheTtl: 0 } });
      if (r.ok) theme = (await r.json()).theme;
    } catch (error) {
      // Storage trouble must not break the page: the build-time palette is a
      // valid fallback, so serve the page and let the runtime client converge.
      return res;
    }

    const html = await res.text();
    const headers = new Headers(res.headers);
    headers.delete('content-length');
    headers.set('cache-control', 'no-store, max-age=0');
    headers.set('x-appmintly-theme', VALID.test(theme || '') ? theme : 'unset');
    return new Response(theme ? withTheme(html, theme) : html, { status: res.status, headers });
  },
};
