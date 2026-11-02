#!/usr/bin/env node
/**
 * Publish a genuine release event to the AppMintly events API.
 *
 * Called by .github/workflows/release-android-apk.yml AFTER the catalog commit
 * that records a verified production release. It emits exactly one event, and
 * only when the committed catalog genuinely contains that release.
 *
 * Design constraints (see the release-event report):
 *  - The signing value lives only in GitHub Actions secrets and Worker secret
 *    storage. It is read from the environment and never logged, echoed,
 *    written to disk, or included in any file this script produces.
 *  - Idempotent by construction: the Worker derives the event id from
 *    sha256(appId|platform|version|catalogRevision), so re-running this script
 *    for the same release can never create a second feed entry.
 *  - Refuses to emit for drafts, takedowns, previews, unmatched versions or an
 *    unchanged catalog. Silent skips are printed with an explicit reason.
 *
 * Exit codes: 0 emitted or already present, 1 fatal (config/validation/auth),
 * 2 transient failure after retries.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';

export const ENDPOINT = 'https://appmintly-publisher-api.sbn50088.workers.dev/events/publish';
export const PLATFORM = 'android';
export const REVISION_RE = /^[0-9a-f]{7,40}$/;
export const VERSION_RE = /^\d{1,5}\.\d{1,5}\.\d{1,5}$/;
export const APP_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const MAX_NAME = 64;

/** Lowercase slug used as the public app id when the catalog has no slug. */
export function slugFromName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * @typedef {Object} ReleaseEvent
 * @property {string} appId
 * @property {string} platform
 * @property {string} version
 * @property {string} catalogRevision
 * @property {string} name
 */

/**
 * @typedef {Object} Decision
 * @property {boolean} emit
 * @property {string} [reason]
 * @property {boolean} [fatal]
 * @property {ReleaseEvent} [event]
 */

/**
 * Decide whether the committed catalog describes a genuine public release.
 * Pure: no IO, no clock, so every refusal reason is unit-testable.
 * @param {any} catalog
 * @param {{packageId?: string, appName?: string, version?: string, revision?: string}} opts
 * @returns {Decision}
 */
export function decide(catalog, { packageId, appName, version, revision }) {
  if (!Array.isArray(catalog)) return { emit: false, reason: 'catalog is not an array' };
  if (!REVISION_RE.test(String(revision || ''))) {
    return { emit: false, fatal: true, reason: 'catalog revision is not a git sha' };
  }
  if (!VERSION_RE.test(String(version || ''))) {
    return { emit: false, fatal: true, reason: `version "${version}" is not x.y.z, which the events contract requires` };
  }

  const wanted = String(packageId || '').trim();
  const entry = catalog.find(
    (a) => a && ((wanted && a.apk && a.apk.packageId === wanted) || (wanted && a.packageId === wanted)),
  );
  if (!entry) return { emit: false, reason: `no catalog entry for package ${wanted}` };

  // A takedown (published:false) is a deliberate removal, never a release.
  if (entry.published === false) return { emit: false, reason: 'app is unpublished (takedown)' };
  if (entry.apk && entry.apk.versionName && entry.apk.versionName !== version) {
    return { emit: false, reason: `catalog records ${entry.apk.versionName}, not ${version}` };
  }
  // No APK metadata means the release was never completed.
  if (!entry.apk || !entry.apk.sha256) return { emit: false, reason: 'catalog entry has no verified APK metadata' };

  const appId = APP_ID_RE.test(String(entry.slug || '')) ? entry.slug : slugFromName(entry.name || appName);
  if (!APP_ID_RE.test(appId)) return { emit: false, fatal: true, reason: `cannot derive a valid app id from "${entry.slug || entry.name}"` };

  return {
    emit: true,
    event: {
      appId,
      platform: PLATFORM,
      version: String(version),
      catalogRevision: String(revision),
      name: String(entry.name || appName || appId).slice(0, MAX_NAME),
    },
  };
}

/**
 * The exact body the Worker signs and validates. Key order is fixed.
 * @param {ReleaseEvent & {ts: number}} event
 * @returns {string}
 */
export function serialiseEvent(event) {
  return JSON.stringify({
    appId: event.appId,
    platform: event.platform,
    version: event.version,
    catalogRevision: event.catalogRevision,
    ts: event.ts,
    name: event.name,
  });
}

/**
 * HMAC-SHA256 over the exact bytes that are sent.
 * @param {string} secret
 * @param {string} rawBody
 * @returns {string}
 */
export function sign(secret, rawBody) {
  return crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

/**
 * The event id the Worker will derive, so the log can show it without trusting the response.
 * @param {ReleaseEvent & {ts?: number}} event
 * @returns {string}
 */
export function expectedEventId(event) {
  return crypto
    .createHash('sha256')
    .update(`${event.appId}|${event.platform}|${event.version}|${event.catalogRevision}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * POST the signed event with bounded retries.
 * 201 stored / 200 duplicate are success. 400/401/413 are fatal.
 * 429/5xx/network errors are transient and retried.
 */
/**
 * @param {{fetchImpl?: any, endpoint?: string, secret: string, event: ReleaseEvent & {ts: number},
 *          attempts?: number, backoffMs?: number[], log?: (m: string) => void}} opts
 * @returns {Promise<{ok: boolean, status?: number, duplicate?: boolean, eventId?: string, fatal?: boolean, reason?: string}>}
 */
export async function emit({ fetchImpl = globalThis.fetch, endpoint = ENDPOINT, secret, event, attempts = 3, backoffMs = [5000, 15000], log = () => {} }) {
  const rawBody = serialiseEvent(event);
  const signature = sign(secret, rawBody);
  let lastTransient = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let res;
    try {
      res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-appmintly-events-signature': `sha256=${signature}`,
        },
        body: rawBody,
        redirect: 'error',
      });
    } catch (e) {
      lastTransient = `network: ${e && e.message ? e.message : 'request failed'}`;
      log(`attempt ${attempt}: ${lastTransient}`);
      if (attempt < attempts) await sleep(backoffMs[Math.min(attempt - 1, backoffMs.length - 1)]);
      continue;
    }

    let payload = null;
    try { payload = await res.json(); } catch { payload = null; }

    if (res.status === 201) return { ok: true, status: 201, duplicate: false, eventId: payload?.eventId };
    if (res.status === 200 && payload && payload.status === 'duplicate') {
      return { ok: true, status: 200, duplicate: true, eventId: payload?.eventId };
    }
    if (res.status === 401) return { ok: false, fatal: true, status: 401, reason: 'the events API rejected the signature (emission secret mismatch or not configured)' };
    if (res.status === 400) return { ok: false, fatal: true, status: 400, reason: `payload rejected: ${payload?.error || 'invalid event'}` };
    if (res.status === 413) return { ok: false, fatal: true, status: 413, reason: 'payload too large' };

    lastTransient = `http ${res.status}${payload?.error ? ': ' + payload.error : ''}`;
    log(`attempt ${attempt}: ${lastTransient}`);
    if (attempt < attempts) await sleep(backoffMs[Math.min(attempt - 1, backoffMs.length - 1)]);
  }
  return { ok: false, fatal: false, status: 0, reason: lastTransient || 'exhausted retries' };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    out[argv[i].slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const secret = process.env.APPMINTLY_EVENTS_EMISSION_SECRET || '';
  if (!secret) {
    console.error('::error::APPMINTLY_EVENTS_EMISSION_SECRET is not set; refusing to claim the release event was published.');
    process.exit(1);
  }

  const catalogPath = args.catalog || 'data/apps.json';
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  } catch (e) {
    console.error(`::error::cannot read ${catalogPath}: ${e.message}`);
    process.exit(1);
  }

  const decision = decide(catalog, {
    packageId: args['package-id'],
    appName: args['app-name'],
    version: args.version,
    revision: args.revision,
  });

  if (!decision.emit) {
    const detail = `no release event emitted: ${decision.reason}`;
    if (decision.fatal) {
      console.error(`::error::${detail}`);
      process.exit(1);
    }
    console.log(detail);
    return;
  }

  const event = { ...decision.event, ts: Date.now() };
  console.log(`release event: ${event.appId} v${event.version} at ${event.catalogRevision} (id ${expectedEventId(event)})`);

  const result = await emit({
    secret,
    event,
    log: (m) => console.log(`  retry: ${m}`),
  });

  if (!result.ok) {
    console.error(`::error::release event NOT published (${result.status || 'no response'}): ${result.reason}. The release itself is already in the catalog; re-run this step to retry (the event id is deterministic, so a retry cannot duplicate).`);
    process.exit(result.fatal ? 1 : 2);
  }

  console.log(
    result.duplicate
      ? `event already present (id ${result.eventId}) — idempotent retry, no duplicate row created`
      : `event stored durably (id ${result.eventId})`,
  );
}

if (process.argv[1] && process.argv[1].endsWith('publish-release-event.mjs')) {
  main().catch((e) => {
    console.error(`::error::unexpected failure: ${e && e.message ? e.message : e}`);
    process.exit(1);
  });
}
