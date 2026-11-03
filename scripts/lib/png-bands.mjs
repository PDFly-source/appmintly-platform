/**
 * Minimal PNG reader + artwork band profiler (no dependencies).
 *
 * Why this exists: the artwork policy has to be enforced on the actual pixels,
 * not on metadata. A publisher can declare "full lockup" and ship a symbol, so
 * the gate measures ink bands (symbol / wordmark / tagline) in the asset itself.
 *
 * Supports the 8-bit non-interlaced RGB/RGBA/grey PNGs we ship.
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function readPng(path) {
  const buf = readFileSync(path);
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error(`${path}: not a PNG`);
  let off = 8, w = 0, h = 0, depth = 0, color = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; color = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8) throw new Error(`${path}: only 8-bit PNG supported`);
  if (interlace !== 0) throw new Error(`${path}: interlaced PNG unsupported`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[color];
  if (!channels) throw new Error(`${path}: unsupported colour type ${color}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.from(line);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      switch (filter) {
        case 0: break;
        case 1: cur[x] = (cur[x] + a) & 0xff; break;
        case 2: cur[x] = (cur[x] + b) & 0xff; break;
        case 3: cur[x] = (cur[x] + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          cur[x] = (cur[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
          break;
        }
        default: throw new Error(`${path}: bad filter ${filter}`);
      }
    }
    cur.copy(out, y * stride); prev = cur;
  }
  return { width: w, height: h, channels, data: out };
}

/** rows whose ink ratio exceeds `threshold` of the width */
export function inkProfile(img, { threshold = 0.004, inkDelta = 40 } = {}) {
  const { width, height, channels, data } = img;
  // background = median of the four corners
  const px = (x, y) => { const i = (y * width + x) * channels; return [data[i], data[i + 1], data[i + 2]]; };
  const corners = [px(0, 0), px(width - 1, 0), px(0, height - 1), px(width - 1, height - 1)]
    .map((p) => p.map((v) => v)).flat()
    .sort((a, b) => a - b);
  const bg = [corners[Math.floor(corners.length / 2)], corners[Math.floor(corners.length / 2)], corners[Math.floor(corners.length / 2)]];
  const rows = [];
  for (let y = 0; y < height; y++) {
    let ink = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const d = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
      if (d > inkDelta) ink++;
    }
    rows.push(ink / width);
  }
  return rows.map((v) => v > threshold);
}

/** contiguous ink bands, gaps smaller than gapFraction*height merged */
export function bands(img, { gapFraction = 0.004, threshold = 0.004 } = {}) {
  const profile = inkProfile(img, { threshold });
  const H = img.height;
  const raw = [];
  let start = null;
  for (let y = 0; y < H; y++) {
    if (profile[y] && start === null) start = y;
    else if (!profile[y] && start !== null) { raw.push([start, y - 1]); start = null; }
  }
  if (start !== null) raw.push([start, H - 1]);
  const merged = [];
  for (const b of raw) {
    const last = merged[merged.length - 1];
    if (last && b[0] - last[1] < Math.max(1, H * gapFraction)) last[1] = b[1];
    else merged.push([...b]);
  }
  return merged.map(([y0, y1]) => ({
    y0, y1,
    height: y1 - y0 + 1,
    /** fraction of the canvas height — this is what decides rendered px */
    pct: (y1 - y0 + 1) / H,
  }));
}
