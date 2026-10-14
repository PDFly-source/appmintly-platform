/**
 * Phase 1A — regression tests for lib/sha256.ts (streaming SHA-256 core).
 *
 * The incremental implementation is validated against Node's webcrypto
 * `crypto.subtle.digest` (the exact primitive the existing verifier used)
 * across: empty input, single bytes, exact 64-byte block boundaries, chunk
 * sizes that split blocks (7, 63, 65, 1000), multi-megabyte pseudo-random
 * input (memory-bounded path), and the well-known FIPS test vectors.
 * Also validates the expected-hash format guard used before ANY
 * verification comparison.
 */

import { describe, it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  Sha256Stream,
  sha256Hex,
  sha256OfFile,
  isValidSha256Hex,
  sha256Matches,
} from '../lib/sha256';

const subtle = webcrypto.subtle;

async function referenceSha256(data: Uint8Array): Promise<string> {
  const buf = await subtle.digest('SHA-256', data as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function pseudoRandomBytes(n: number, seed = 42): Uint8Array {
  // Deterministic xorshift so test vectors are stable across runs.
  const out = new Uint8Array(n);
  let s = seed || 42;
  for (let i = 0; i < n; i++) {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    out[i] = s & 0xff;
  }
  return out;
}

/** Feeds `data` to a Sha256Stream in `chunkSize` slices and digests. */
function streamIn(data: Uint8Array, chunkSize: number): string {
  const h = new Sha256Stream();
  for (let i = 0; i < data.length; i += chunkSize) {
    h.update(data.subarray(i, Math.min(i + chunkSize, data.length)));
  }
  return h.digest();
}

describe('sha256 known vectors', () => {
  it('hashes the empty input', async () => {
    expect(sha256Hex(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });
  it('hashes "abc"', () => {
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
  it('hashes the two-block FIPS message (448-bit + padding)', async () => {
    const msg = new TextEncoder().encode(
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'
    );
    expect(sha256Hex(msg)).toBe(await referenceSha256(msg));
  });
});

describe('sha256 chunking equivalence (vs crypto.subtle)', () => {
  const sizes = [1, 63, 64, 65, 127, 128, 1000, 4096, 10000];
  const chunkSizes = [1, 7, 63, 64, 65, 512, 1024];

  for (const size of sizes) {
    for (const chunk of chunkSizes) {
      it(`size=${size} chunk=${chunk}`, async () => {
        const data = pseudoRandomBytes(size, size + chunk);
        expect(streamIn(data, chunk)).toBe(await referenceSha256(data));
      });
    }
  }

  it('multi-MB input stays correct across few large chunks', async () => {
    const data = pseudoRandomBytes(3 * 1024 * 1024 + 17);
    const expected = await referenceSha256(data);
    expect(streamIn(data, 4 * 1024 * 1024)).toBe(expected);
    expect(streamIn(data, 1024 * 1024 - 33)).toBe(expected);
    expect(sha256Hex(data)).toBe(expected);
  });

  it('file/blob path (slice fallback) matches the reference digest', async () => {
    const data = pseudoRandomBytes(300_003);
    const expected = await referenceSha256(data);
    // Blob without .stream() forces the chunked slice fallback path.
    const blob = new Blob([data as unknown as Uint8Array]);
    expect(typeof blob.stream).toBe('function'); // real Blob has stream()
    // Fake blob WITHOUT .stream() forces the chunked slice fallback path.
    const noStreamBlob = {
      size: blob.size,
      slice: blob.slice.bind(blob),
      arrayBuffer: () => blob.arrayBuffer(),
    } as Blob & { stream?: undefined };
    expect(noStreamBlob.stream).toBeUndefined();
    expect(await sha256OfFile(noStreamBlob)).toBe(expected);
  });
});

describe('expected-hash format guard', () => {
  it('accepts only 64-hex strings', () => {
    expect(isValidSha256Hex('a'.repeat(64))).toBe(true);
    expect(isValidSha256Hex('A'.repeat(64))).toBe(true);
    expect(isValidSha256Hex('6e7d3413b862d671a205ff40445be9d3c694687b433cfa528d33e62fc9ce0aa0')).toBe(true);
  });
  it('rejects malformed expected hashes (never silently verifies)', () => {
    expect(isValidSha256Hex(undefined)).toBe(false);
    expect(isValidSha256Hex(null)).toBe(false);
    expect(isValidSha256Hex('')).toBe(false);
    expect(isValidSha256Hex('z'.repeat(64))).toBe(false);
    expect(isValidSha256Hex('a'.repeat(63))).toBe(false);
    expect(isValidSha256Hex('a'.repeat(65))).toBe(false);
    expect(isValidSha256Hex('')).toBe(false);
  });
  it('matches case-insensitively and never matches on malformed input', () => {
    expect(sha256Matches('A'.repeat(64), 'a'.repeat(64))).toBe(true);
    expect(sha256Matches('a'.repeat(64), 'b'.repeat(64))).toBe(false);
    expect(sha256Matches('a'.repeat(63), 'a'.repeat(64))).toBe(false);
  });
});

describe('digest idempotence guards', () => {
  it('produces the right padding across the 56-byte boundary', async () => {
    for (let n = 50; n <= 66; n++) {
      const data = pseudoRandomBytes(n, n);
      expect(streamIn(data, 1)).toBe(await referenceSha256(data));
      expect(sha256Hex(data)).toBe(await referenceSha256(data));
    }
  });
});
