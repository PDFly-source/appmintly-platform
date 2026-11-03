/**
 * Minimal read-only ZIP reader for inspecting a built APK (no dependencies).
 *
 * Why: the release pipeline used to prove the launcher icon by counting files in
 * the source tree. 0.2.4 shipped 17 correct-looking resources and still rendered
 * as the symbol alone, so the gate now has to read the bytes inside the packaged
 * APK. Uses the central directory, supports stored and deflated entries.
 */
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

export function openApk(path) {
  const buf = readFileSync(path);
  // find End Of Central Directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 0xffff - 22); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error(`${path}: not a ZIP/APK (no EOCD)`);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`${path}: bad central directory`);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.set(name, { method, csize, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names: () => [...entries.keys()],
    has: (n) => entries.has(n),
    read(name) {
      const e = entries.get(name);
      if (!e) throw new Error(`${path}: missing ${name}`);
      const nameLen = buf.readUInt16LE(e.local + 26);
      const extraLen = buf.readUInt16LE(e.local + 28);
      const start = e.local + 30 + nameLen + extraLen;
      const raw = buf.subarray(start, start + e.csize);
      if (e.method === 0) return Buffer.from(raw);
      if (e.method === 8) return inflateRawSync(raw);
      throw new Error(`${path}: unsupported compression ${e.method} for ${name}`);
    },
  };
}
