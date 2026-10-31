/**
 * Item 10 / Batch 5 — shareable collections.
 *
 * Architecture: the shared collection IS the URL. There is no backend, no
 * database and no worker endpoint; the payload is a versioned, compact
 * base64url document carried in `?d=`. Nothing about the visitor's browser is
 * included, and the original local collection is never read at render time on
 * the shared page (the shared page only ever sees the payload plus the
 * authoritative catalog).
 *
 * The payload is untrusted input on every read. It carries ids and two short
 * text fields only: no app names, versions, ratings, sizes or links. All app
 * metadata rendered on the shared page comes from publishedApps.
 */

import {
  isPublishedCatalogApp,
  normalizeSlug,
  type CatalogAppLike,
} from './model';

export const SHARE_VERSION = 1;

export const SHARE_LIMITS = {
  /** Whole encoded payload cap. Keeps shared links comfortably shareable. */
  payloadChars: 1800,
  /** Raw `d` parameter length cap, applied before any decoding. */
  rawChars: 2400,
  apps: 50,
  name: 40,
  description: 160,
  /** Anything beyond this many raw entries is rejected outright. */
  rawEntries: 200,
} as const;

export interface SharedCollection {
  name: string;
  description: string;
  /** Distinct catalog slugs, order preserved, validated against the catalog at render. */
  apps: string[];
}

export type EncodeResult =
  | { ok: true; payload: string }
  | { ok: false; error: string };

export type DecodeResult =
  | { ok: true; data: SharedCollection; droppedApps: number }
  | { ok: false; reason: string; message: string };

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Plain text for a public page: control characters and angle brackets are
 * removed (not escaped) so a payload can never carry markup, and length is
 * clamped. React escapes the rest.
 */
export function sanitizeSharedText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function toBase64Url(binary: string): string {
  return binary.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return padded + '='.repeat((4 - (padded.length % 4)) % 4);
}

function bytesToBinary(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

function binaryToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Normalize the ids a collection wants to share: valid slug shape, de-duped,
 * capped. Returns the accepted ids and how many were refused.
 */
export function prepareSharedApps(raw: unknown): { apps: string[]; refused: number } {
  if (!Array.isArray(raw)) return { apps: [], refused: 0 };
  const apps: string[] = [];
  let refused = 0;
  for (const entry of raw) {
    const slug = normalizeSlug(entry);
    if (!slug || !SLUG_PATTERN.test(slug) || apps.includes(slug)) {
      refused += 1;
      continue;
    }
    if (apps.length >= SHARE_LIMITS.apps) {
      refused += 1;
      continue;
    }
    apps.push(slug);
  }
  return { apps, refused };
}

/** Build the compact payload for a collection. Never throws. */
export function encodeSharedCollection(input: {
  name: unknown;
  description?: unknown;
  apps: unknown;
}): EncodeResult {
  const name = sanitizeSharedText(input.name, SHARE_LIMITS.name);
  if (name.length === 0) return { ok: false, error: 'This collection has no name to share.' };
  const description = sanitizeSharedText(input.description, SHARE_LIMITS.description);
  const { apps } = prepareSharedApps(input.apps);
  const document = { v: SHARE_VERSION, n: name, d: description, a: apps };
  let json: string;
  try {
    json = JSON.stringify(document);
  } catch {
    return { ok: false, error: 'This collection could not be encoded.' };
  }
  const payload = toBase64Url(btoa(bytesToBinary(new TextEncoder().encode(json))));
  if (payload.length > SHARE_LIMITS.payloadChars) {
    return { ok: false, error: 'This collection is too large to share as a link.' };
  }
  return { ok: true, payload };
}

/** Full shared URL. Origin is passed in so this stays testable and SSR-safe. */
export function buildSharedCollectionUrl(payload: string, origin: string): string {
  const base = (origin || '').replace(/\/+$/, '');
  return `${base}/shared/collection/?d=${payload}`;
}

/**
 * Decode and validate a `?d=` payload. Every failure path returns a reason the
 * page can explain in plain language; nothing is ever partially trusted.
 */
export function decodeSharedCollection(raw: string | null | undefined): DecodeResult {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, reason: 'missing', message: 'This link has no collection in it.' };
  }
  const value = raw.trim();
  if (value.length > SHARE_LIMITS.rawChars) {
    return { ok: false, reason: 'too-long', message: 'This link is too long to be a collection link.' };
  }
  if (!BASE64URL_PATTERN.test(value)) {
    return { ok: false, reason: 'encoding', message: 'This collection link is not valid.' };
  }
  let json: string;
  try {
    const binary = atob(fromBase64Url(value));
    json = new TextDecoder().decode(binaryToBytes(binary));
  } catch {
    return { ok: false, reason: 'decoding', message: 'This collection link is not valid.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'json', message: 'This collection link is not valid.' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'shape', message: 'This collection link is not valid.' };
  }
  const record = parsed as Record<string, unknown>;
  if (record.v !== SHARE_VERSION) {
    return {
      ok: false,
      reason: 'version',
      message: 'This link was made by a different version of AppMintly and cannot be opened.',
    };
  }
  const name = sanitizeSharedText(record.n, SHARE_LIMITS.name);
  if (name.length === 0) {
    return { ok: false, reason: 'name', message: 'This collection link is not valid.' };
  }
  const description = sanitizeSharedText(record.d, SHARE_LIMITS.description);
  if (Array.isArray(record.a) && record.a.length > SHARE_LIMITS.rawEntries) {
    return { ok: false, reason: 'apps', message: 'This collection link is not valid.' };
  }
  const { apps, refused } = prepareSharedApps(record.a);
  return { ok: true, data: { name, description, apps }, droppedApps: refused };
}

export interface ResolvedSharedCollection<T extends CatalogAppLike> {
  name: string;
  description: string;
  /** Published catalog records, in the order the link asked for them. */
  apps: T[];
  /** Distinct ids requested by the link. */
  requested: number;
  /** Ids that are unknown, unpublished or no longer in the catalog. */
  missing: number;
  /** How many ids the decoder refused as malformed or duplicated. */
  dropped: number;
}

/**
 * Resolve ids against the authoritative published catalog. Metadata never
 * comes from the URL, and an app that has since been unpublished simply drops
 * out with `missing` counting it, which the page reports honestly.
 */
export function resolveSharedCollection<T extends CatalogAppLike>(
  data: SharedCollection,
  catalog: T[]
): ResolvedSharedCollection<T> {
  const published = new Map<string, T>();
  for (const app of catalog) {
    const slug = normalizeSlug(app.slug);
    if (slug && isPublishedCatalogApp(app)) published.set(slug, app);
  }
  const apps: T[] = [];
  for (const slug of data.apps) {
    const match = published.get(slug);
    if (match) apps.push(match);
  }
  return {
    name: data.name,
    description: data.description,
    apps,
    requested: data.apps.length,
    missing: data.apps.length - apps.length,
    dropped: 0,
  };
}
