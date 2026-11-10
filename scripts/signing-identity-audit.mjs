#!/usr/bin/env node
/**
 * Signing identity audit (fail-closed).
 *
 * Answers one question before any native release: does the configured keystore
 * contain the certificate that the app's existing installations trust?
 *
 * Only fingerprints and alias names are printed - never passwords or key material.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; };
const norm = (s) => String(s || '').replace(/[^0-9a-f]/gi, '').toLowerCase();

const expected = norm(arg('--expected-fingerprint'));
const storeB64 = process.env.KEYSTORE_BASE64 || '';
const storePass = process.env.KEYSTORE_PASSWORD || '';

if (!storeB64) { console.error('::error::KEYSTORE_BASE64 is not configured'); process.exit(1); }
if (!expected) { console.error('::error::--expected-fingerprint is required (authoritative previous release certificate)'); process.exit(1); }

const dir = mkdtempSync(join(tmpdir(), 'ks-audit-'));
const ks = join(dir, 'audit.jks');
writeFileSync(ks, Buffer.from(storeB64, 'base64'));

let out = '';
try {
  out = execFileSync('keytool', ['-list', '-v', '-keystore', ks, '-storepass', storePass], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  out = `${e.stdout || ''}${e.stderr || ''}`;
  console.error('::error::keytool could not read the configured keystore');
  console.error(out.split('\n').filter((l) => /error|Exception/i.test(l)).join('\n'));
  process.exit(1);
}

const entries = out.split(/^Alias name: /m).slice(1).map((chunk) => {
  const alias = chunk.split('\n')[0].trim();
  const m = chunk.match(/SHA-?256:\s*([0-9A-F:]{40,})/i);
  return { alias, fingerprint: m ? norm(m[1]) : '' };
});

console.log(`keystore entries: ${entries.length}`);
for (const e of entries) {
  const mark = e.fingerprint === expected ? 'MATCH' : '     ';
  console.log(`  [${mark}] alias=${e.alias} sha256=${e.fingerprint || '(none)'}`);
}
console.log(`expected (previous release): ${expected}`);

const hit = entries.find((e) => e.fingerprint === expected);
if (!hit) {
  console.error('::error::No alias in this keystore carries the certificate that existing installs trust. Refusing to sign: a release signed with a different key cannot upgrade over the installed app.');
  process.exit(1);
}
console.log(`::notice::signing identity confirmed - alias '${hit.alias}' matches the published certificate`);
const gh = process.env.GITHUB_OUTPUT;
if (gh) appendFileSync(gh, `alias=${hit.alias}\nfingerprint=${hit.fingerprint}\n`);
