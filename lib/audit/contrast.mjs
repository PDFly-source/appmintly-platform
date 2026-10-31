/**
 * Pure contrast-resolution helpers used by scripts/audit-contrast.mjs.
 *
 * The previous resolver guessed: it skipped gradient ancestors, treated
 * "transparent" stops as absent, read scattered colour strings incorrectly and
 * fell back to white when a surface could not be determined. That produced
 * fabricated ratios in both directions. This module resolves what is actually
 * painted, and says UNRESOLVED when it cannot.
 *
 * No DOM access here on purpose: the browser only reports computed strings and
 * geometry, and every calculation happens in tested pure code.
 */

export const UNRESOLVED = 'UNRESOLVED';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Parse a CSS colour into {r,g,b,a}. Returns null for anything unrecognised. */
export function parseColor(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (s === 'currentcolor' || s === 'inherit' || s === 'initial') return null;

  const hex = s.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const h = hex[1];
    const expand = (x) => parseInt(x.length === 1 ? x + x : x, 16);
    if (h.length === 3 || h.length === 4) {
      return { r: expand(h[0]), g: expand(h[1]), b: expand(h[2]), a: h.length === 4 ? expand(h[3]) / 255 : 1 };
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }

  const srgb = s.match(/^color\(srgb\s+([^)]*)\)$/);
  if (srgb) {
    const t = srgb[1].split(/[\s/]+/).filter(Boolean);
    const a = t[3] === undefined ? 1 : clamp(parseFloat(t[3]), 0, 1);
    return {
      r: clamp(Math.round(parseFloat(t[0]) * 255), 0, 255),
      g: clamp(Math.round(parseFloat(t[1]) * 255), 0, 255),
      b: clamp(Math.round(parseFloat(t[2]) * 255), 0, 255),
      a: Number.isNaN(a) ? 1 : a,
    };
  }
  const lab = s.match(/^oklab\(([^)]*)\)$/);
  if (lab) {
    const t = lab[1].split(/[\s/]+/).filter(Boolean);
    const L = t[0].endsWith('%') ? parseFloat(t[0]) / 100 : parseFloat(t[0]);
    const A = parseFloat(t[1]);
    const B = parseFloat(t[2]);
    const a = t[3] === undefined ? 1 : clamp(parseFloat(t[3]), 0, 1);
    if ([L, A, B].some((v) => Number.isNaN(v))) return null;
    return { ...oklabToRgb(L, A, B), a: Number.isNaN(a) ? 1 : a };
  }
  const lch = s.match(/^oklch\(([^)]*)\)$/);
  if (lch) {
    const t = lch[1].split(/[\s/]+/).filter(Boolean);
    const L = t[0].endsWith('%') ? parseFloat(t[0]) / 100 : parseFloat(t[0]);
    const C = parseFloat(t[1]);
    const H = ((parseFloat(t[2]) || 0) * Math.PI) / 180;
    const a = t[3] === undefined ? 1 : clamp(parseFloat(t[3]), 0, 1);
    if ([L, C, H].some((v) => Number.isNaN(v))) return null;
    return { ...oklabToRgb(L, C * Math.cos(H), C * Math.sin(H)), a: Number.isNaN(a) ? 1 : a };
  }

  const fn = s.match(/^(rgba?|hsla?)\(([^)]*)\)$/);
  if (!fn) return null;
  // Modern syntax allows spaces and a slash before alpha: "rgb(1 2 3 / .5)"
  const parts = fn[2].split(/[,\s/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const num = (tok, scale) => {
    if (tok.endsWith('%')) return (parseFloat(tok) / 100) * scale;
    const v = parseFloat(tok);
    return Number.isNaN(v) ? null : v;
  };
  if (fn[1].startsWith('hsl')) {
    const h = num(parts[0], 360);
    const sat = num(parts[1], 1);
    const lig = num(parts[2], 1);
    const a = parts[3] === undefined ? 1 : clamp(num(parts[3], 1), 0, 1);
    if ([h, sat, lig, a].some((v) => v === null)) return null;
    return { ...hslToRgb(((h % 360) + 360) % 360, clamp(sat, 0, 1), clamp(lig, 0, 1)), a };
  }
  const r = num(parts[0], 255);
  const g = num(parts[1], 255);
  const b = num(parts[2], 255);
  const a = parts[3] === undefined ? 1 : clamp(num(parts[3], 1), 0, 1);
  if ([r, g, b, a].some((v) => v === null)) return null;
  return { r: clamp(Math.round(r), 0, 255), g: clamp(Math.round(g), 0, 255), b: clamp(Math.round(b), 0, 255), a };
}

function oklabToRgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s2 = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s2,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s2,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s2,
  ];
  const gamma = (v) => {
    const c = clamp(v, 0, 1);
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  };
  return {
    r: clamp(Math.round(gamma(lin[0]) * 255), 0, 255),
    g: clamp(Math.round(gamma(lin[1]) * 255), 0, 255),
    b: clamp(Math.round(gamma(lin[2]) * 255), 0, 255),
  };
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6];
  return { r: Math.round((seg[0] + m) * 255), g: Math.round((seg[1] + m) * 255), b: Math.round((seg[2] + m) * 255) };
}

/** Source-over compositing of a foreground colour onto a backdrop. */
export function composite(fg, bg) {
  if (!fg) return bg || null;
  if (!bg) return fg.a >= 1 ? fg : null;
  const a = fg.a + bg.a * (1 - fg.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: Math.round((fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a),
    g: Math.round((fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a),
    b: Math.round((fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a),
    a,
  };
}

/** WCAG 2.x relative luminance and contrast ratio. */
export function luminance({ r, g, b }) {
  const f = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a, b) {
  if (!a || !b) return null;
  const l1 = luminance(a);
  const l2 = luminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Split a background-image value into individual gradient layers (any depth). */
export function gradientLayers(image) {
  if (typeof image !== 'string' || !image || image === 'none') return [];
  const layers = [];
  const re = /(linear-gradient|radial-gradient|conic-gradient)\(/g;
  let m;
  while ((m = re.exec(image))) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < image.length && depth > 0) {
      if (image[i] === '(') depth++;
      else if (image[i] === ')') depth--;
      i++;
    }
    layers.push({ type: m[1], body: image.slice(re.lastIndex, i - 1), hasUrl: /url\(/.test(image.slice(0, m.index)) });
    re.lastIndex = i;
  }
  return layers;
}

const splitTop = (body) => {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

/** Positioned colour stops for one gradient layer. */
export function gradientStops(layer) {
  const parts = splitTop(layer.body);
  const geometryTokens = /^(to |at |circle|ellipse|closest|farthest|from |\d+(\.\d+)?(deg|rad|turn|grad))$/i;
  const stops = [];
  for (const part of parts) {
    if (!part) continue;
    const colorMatch = part.match(/(rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8}|transparent)/i);
    if (!colorMatch) {
      // pure geometry: "to top", "at 88% 0px", "120deg"
      if (geometryTokens.test(part.trim()) || /\bat\b/.test(part)) continue;
      continue;
    }
    const color = parseColor(colorMatch[1]);
    if (!color) continue;
    const posTokens = part.match(/(-?\d+(\.\d+)?%)/g) || [];
    const at = posTokens.length ? parseFloat(posTokens[posTokens.length - 1]) : null;
    stops.push({ color, at });
  }
  if (!stops.length) return [];
  if (stops.every((s) => s.at === null)) stops.forEach((s, i) => { s.at = (i / Math.max(1, stops.length - 1)) * 100; });
  else {
    if (stops[0].at === null) stops[0].at = 0;
    if (stops[stops.length - 1].at === null) stops[stops.length - 1].at = 100;
    for (let i = 1; i < stops.length - 1; i++) if (stops[i].at === null) stops[i].at = (stops[i - 1].at + stops[i + 1].at) / 2;
  }
  return stops.sort((a, b) => a.at - b.at);
}

/** Colour of a gradient layer at normalised position t (0 = start, 1 = end). */
export function colorAt(layer, t) {
  const stops = gradientStops(layer);
  if (!stops.length) return null;
  const at = clamp(t, 0, 1) * 100;
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (at >= stops[i].at && at <= stops[i + 1].at) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const span = hi.at - lo.at || 1;
  const k = clamp((at - lo.at) / span, 0, 1);
  return {
    r: Math.round(lo.color.r + (hi.color.r - lo.color.r) * k),
    g: Math.round(lo.color.g + (hi.color.g - lo.color.g) * k),
    b: Math.round(lo.color.b + (hi.color.b - lo.color.b) * k),
    a: lo.color.a + (hi.color.a - lo.color.a) * k,
  };
}

/**
 * Resolve the colour actually painted behind an element.
 *
 * chain is ordered from the element upward; each entry is
 * { backgroundColor, backgroundImage, top, height, backdrop, hasImageElement }.
 * sampleY is the absolute Y of the text being measured, used to sample a
 * gradient where the text actually sits rather than at the ramp's midpoint.
 *
 * Returns { status, color, reason }:
 *   status 'resolved'  -> color is a fully opaque composite
 *   status 'unresolved'-> reason explains why, and no ratio may be reported
 */
export function resolveSurface(chain, sampleY) {
  // Paint order is root -> element: the furthest ancestor establishes the base
  // surface and every nearer layer composites on top of it. Walking the other way
  // (element first) makes translucent layers composite onto nothing, which is how
  // a glass panel silently became black or white before.
  const ordered = [...chain].filter(Boolean).reverse();
  let surface = null;
  let reason = null;
  for (const item of ordered) {
    if (/url\(/.test(item.backgroundImage || '')) reason = reason || 'background-image url() cannot be measured';
    const itemGradients = gradientLayers(item.backgroundImage);
    if (item.backdrop && !surface) reason = reason || 'backdrop-filter over unmeasured content';

    const bg = parseColor(item.backgroundColor);
    if (bg && bg.a > 0) surface = bg.a >= 0.999 ? { ...bg, a: 1 } : composite(bg, surface);

    for (let i = itemGradients.length - 1; i >= 0; i--) {
      const height = item.height || 0;
      const t = height > 0 ? clamp((sampleY - item.top) / height, 0, 1) : 0.5;
      // Sample both directions along the ramp and keep whichever leaves less
      // contrast against the eventual text, so direction guessing cannot help.
      const samples = [colorAt(itemGradients[i], t), colorAt(itemGradients[i], 1 - t)].filter(Boolean);
      if (!samples.length) continue;
      const painted = samples.map((c) => composite(c, surface));
      const usable = painted.filter(Boolean);
      if (!usable.length) { surface = null; continue; }
      surface = usable.sort((a, b) => luminance(a) - luminance(b))[0];
    }
  }
  if (surface && surface.a >= 0.999) {
    return { status: 'resolved', color: { r: surface.r, g: surface.g, b: surface.b, a: 1 }, reason: null };
  }
  return { status: 'unresolved', color: null, reason: reason || 'no opaque background found' };
}

/** Decide PASS / FAIL / UNRESOLVED for one text sample. */
export function evaluateText({ color, fontSize, fontWeight, surface, gradientTextStops }) {
  const normal = Number(fontSize) >= 24 || (Number(fontSize) >= 18.66 && Number(fontWeight) >= 700);
  const required = normal ? 3 : 4.5;
  if (!surface || surface.status !== 'resolved' || !surface.color) {
    return { status: UNRESOLVED, ratio: null, required, reason: surface ? surface.reason : 'no surface' };
  }
  let fg = parseColor(color);
  if (gradientTextStops && gradientTextStops.length) {
    let worst = Infinity;
    for (const stop of gradientTextStops) {
      const c = composite(stop, surface.color);
      const r = contrastRatio(c, surface.color);
      if (r !== null) worst = Math.min(worst, r);
    }
    if (!Number.isFinite(worst)) return { status: UNRESOLVED, ratio: null, required, reason: 'unparseable gradient text' };
    return { status: worst >= required ? 'PASS' : 'FAIL', ratio: Math.round(worst * 100) / 100, required, surface: surface.color };
  }
  if (!fg) return { status: UNRESOLVED, ratio: null, required, reason: 'unparseable colour' };
  const painted = fg.a < 1 ? composite(fg, surface.color) : fg;
  const ratio = contrastRatio(painted, surface.color);
  if (ratio === null) return { status: UNRESOLVED, ratio: null, required, reason: 'unparseable composite' };
  return { status: ratio >= required ? 'PASS' : 'FAIL', ratio, required, surface: surface.color };
}
