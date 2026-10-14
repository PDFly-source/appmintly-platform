/**
 * Phase 1A — Incremental, streaming SHA-256 (browser-safe, zero-copy chunks).
 *
 * Why this exists: `crypto.subtle.digest()` requires the ENTIRE input in
 * memory as one ArrayBuffer. Released AppMintly APKs are a few hundred KB so
 * that is fine today, but the verifier must stay honest and memory-safe for
 * larger files: this module feeds fixed-size chunks (default 4 MiB) through a
 * standard incremental SHA-256 implementation, so peak memory stays bounded
 * by the chunk size no matter how large the APK is.
 *
 * Correctness is enforced by unit tests against Node's webcrypto
 * (`crypto.subtle.digest`) across empty, small, exact-block-boundary,
 * multi-chunk and pseudo-random multi-MB inputs, plus the well-known
 * NIST/SHA test vectors ("abc", two-block message).
 *
 * Pure TypeScript, no DOM, no Node APIs — identical code path in the
 * browser, the WebView APK and the vitest node environment.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** True SHA-256 of a hex string, 64 lowercase hex characters. */
export const SHA256_HEX_LENGTH = 64;

/**
 * Structural validation of an EXPECTED release hash before it is ever
 * compared: exactly 64 lowercase/uppercase hex characters. Anything else
 * (missing, wrong length, non-hex) means the release metadata cannot be
 * trusted for verification and the verifier must report
 * "Verification Failed (metadata)" — never a fake match or a silent pass.
 */
export function isValidSha256Hex(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length === SHA256_HEX_LENGTH &&
    /^[0-9a-fA-F]{64}$/.test(value)
  );
}

/** Compares a computed hex digest with an expected hex digest, case-insensitive. */
export function sha256Matches(localHex: string, expectedHex: string): boolean {
  if (!isValidSha256Hex(localHex) || !isValidSha256Hex(expectedHex)) return false;
  return localHex.toLowerCase() === expectedHex.toLowerCase();
}

export class Sha256Stream {
  private h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  /** Total bytes fed so far. */
  private totalLen = 0;
  /** Unprocessed tail bytes (0..63). */
  private readonly buf = new Uint8Array(64);
  private bufLen = 0;
  private readonly w = new Uint32Array(64);

  /** Feed the next chunk of bytes. Never copies more than needed. */
  update(chunk: Uint8Array): this {
    let i = 0;
    this.totalLen += chunk.length;

    // Drain the pending buffer first so `buf` is 64-byte aligned again.
    if (this.bufLen > 0) {
      const need = 64 - this.bufLen;
      const take = Math.min(need, chunk.length);
      this.buf.set(chunk.subarray(0, take), this.bufLen);
      this.bufLen += take;
      i = take;
      if (this.bufLen === 64) {
        this.processBlock(this.buf, 0);
        this.bufLen = 0;
      }
    }

    // Process aligned 64-byte blocks straight from the caller's chunk.
    const blockEnd = chunk.length - 64;
    while (i <= blockEnd) {
      this.processBlock(chunk, i);
      i += 64;
    }

    // Stash the remainder (< 64 bytes) for the next update/final.
    const rest = chunk.length - i;
    if (rest > 0) {
      this.buf.set(chunk.subarray(i), 0);
      this.bufLen = rest;
    }
    return this;
  }

  private processBlock(bytes: Uint8Array, offset: number): void {
    const w = this.w;
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const prev = w[i - 15];
      const prev2 = w[i - 2];
      const s0 = rotr(prev, 7) ^ rotr(prev, 18) ^ (prev >>> 3);
      const s1 = rotr(prev2, 17) ^ rotr(prev2, 19) ^ (prev2 >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = this.h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g; g = f; f = e;
      e = (d + temp1) | 0;
      d = c; c = b; b = a;
      a = (temp1 + temp2) | 0;
    }
    this.h[0] = (this.h[0] + a) | 0;
    this.h[1] = (this.h[1] + b) | 0;
    this.h[2] = (this.h[2] + c) | 0;
    this.h[3] = (this.h[3] + d) | 0;
    this.h[4] = (this.h[4] + e) | 0;
    this.h[5] = (this.h[5] + f) | 0;
    this.h[6] = (this.h[6] + g) | 0;
    this.h[7] = (this.h[7] + h) | 0;
  }

  /** Finish and return the lowercase hex digest. */
  digest(): string {
    // FIPS 180-4 padding: 0x80, zeros, 64-bit big-endian bit length.
    const bitLenHi = Math.floor(this.totalLen / 0x20000000);
    const bitLenLo = (this.totalLen << 3) >>> 0;
    const pad = new Uint8Array(((this.bufLen < 56 ? 64 : 128) - this.bufLen));
    pad[0] = 0x80;
    // Manually append the length instead of relying on DataView endianness.
    pad[pad.length - 8] = (bitLenHi >>> 24) & 0xff;
    pad[pad.length - 7] = (bitLenHi >>> 16) & 0xff;
    pad[pad.length - 6] = (bitLenHi >>> 8) & 0xff;
    pad[pad.length - 5] = bitLenHi & 0xff;
    pad[pad.length - 4] = (bitLenLo >>> 24) & 0xff;
    pad[pad.length - 3] = (bitLenLo >>> 16) & 0xff;
    pad[pad.length - 2] = (bitLenLo >>> 8) & 0xff;
    pad[pad.length - 1] = bitLenLo & 0xff;

    const savedLen = this.totalLen;
    this.update(pad);
    this.totalLen = savedLen; // update() counted the padding; restore for idempotence

    return Array.from(this.h)
      .map((x) => (x >>> 0).toString(16).padStart(8, '0'))
      .join('');
  }
}

/** One-shot helper for small inputs. */
export function sha256Hex(data: Uint8Array): string {
  return new Sha256Stream().update(data).digest();
}

/**
 * Stream-hash a Web `ReadableStream<Uint8Array>` (e.g. an APK fetch body or a
 * `File.stream()`) chunk-by-chunk. `onProgress` receives bytes processed so
 * far and the total when the total is known (Content-Length).
 *
 * The stream itself controls memory: we never buffer the whole body.
 */
export async function sha256OfReadableStream(
  stream: ReadableStream<Uint8Array>,
  onProgress?: (bytesDone: number, totalBytes: number | null) => void,
  signal?: AbortSignal
): Promise<string> {
  const reader = stream.getReader();
  const hash = new Sha256Stream();
  let done = 0;
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const { done: finished, value } = await reader.read();
      if (finished) break;
      if (value && value.length > 0) {
        hash.update(value);
        done += value.length;
        onProgress?.(done, null);
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released by cancel/error */
    }
  }
  return hash.digest();
}

/**
 * Stream-hash a `File`/`Blob` from the local filesystem without loading it
 * fully into memory. Uses `blob.stream()` when available (all modern
 * browsers, incl. the AppMintly WebView) and falls back to slicing +
 * `arrayBuffer()` chunks for exotic environments.
 */
/** Structural Blob stand-in: real Blob satisfies this; tests can fake it. */
export interface BlobLike {
  size: number;
  slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> };
  stream?(): ReadableStream<Uint8Array>;
}

export async function sha256OfFile(
  file: BlobLike,
  onProgress?: (bytesDone: number, totalBytes: number | null) => void,
  signal?: AbortSignal
): Promise<string> {
  if (typeof file.stream === 'function') {
    return sha256OfReadableStream(file.stream(), (done) => onProgress?.(done, file.size), signal);
  }
  // Slicing fallback — still chunked, still bounded memory.
  const CHUNK = 4 * 1024 * 1024;
  const hash = new Sha256Stream();
  let done = 0;
  for (let off = 0; off < file.size; off += CHUNK) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const end = Math.min(off + CHUNK, file.size);
    const slice = file.slice(off, end);
    hash.update(new Uint8Array(await slice.arrayBuffer()));
    done = end;
    onProgress?.(done, file.size);
  }
  return hash.digest();
}
