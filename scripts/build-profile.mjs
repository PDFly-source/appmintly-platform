#!/usr/bin/env node
/**
 * Build profile resolver and contract validator for the dual-kernel APK system.
 *
 * data/build-profiles.json is the single source of truth for HOW an app is
 * built; data/apps.json only records published artifact metadata. Nothing here
 * builds anything - it proves the two agree and that a native build request is
 * inside the approved envelope before a single Gradle task runs.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SHA_RE = /^[0-9a-f]{40}$/;

export function loadProfiles(root = ROOT) {
  return JSON.parse(readFileSync(resolve(root, 'data/build-profiles.json'), 'utf8'));
}
export function loadCatalog(root = ROOT, catalogPath) {
  const raw = JSON.parse(readFileSync(catalogPath || resolve(root, 'data/apps.json'), 'utf8'));
  return Array.isArray(raw) ? raw : raw.apps || [];
}

/** Flatten a profile into its artifacts (webview profiles have exactly one). */
export function artifactsOf(profiles, slug) {
  const profile = profiles.profiles?.[slug];
  if (!profile) return [];
  if (profile.buildKind === 'webview') {
    return [{ id: 'web', catalogSlug: profile.catalogSlug, module: null, gradleTask: null }];
  }
  return profile.artifacts || [];
}

export function resolveProfile(profiles, slug, artifactId) {
  const profile = profiles.profiles?.[slug];
  if (!profile) throw new Error(`unknown build profile: ${slug}`);
  if (profile.buildKind === 'webview') return { kernel: 'webview', profile, artifact: artifactsOf(profiles, slug)[0] };
  const list = profile.artifacts || [];
  const artifact = artifactId ? list.find((a) => a.id === artifactId) : list.length === 1 ? list[0] : null;
  if (!artifact) throw new Error(`artifact '${artifactId || '(unspecified)'}' not found for ${slug}; available: ${list.map((a) => a.id).join(', ')}`);
  return { kernel: 'native', profile, artifact };
}

/** A. identity consistency between profiles and the published catalog. */
export function validateIdentity(profiles, catalog) {
  const problems = [];
  const warnings = [];
  const bySlug = new Map(catalog.map((a) => [a.slug, a]));
  for (const [slug, profile] of Object.entries(profiles.profiles || {})) {
    for (const art of artifactsOf(profiles, slug)) {
      const entry = bySlug.get(art.catalogSlug);
      if (!entry) {
        const msg = `${slug}/${art.id}: catalog slug '${art.catalogSlug}' missing from data/apps.json`;
        // An artifact that has never been published yet is declared pending; it must
        // still be listed here so the slug stays reserved to exactly one artifact.
        (art.catalogPending ? warnings : problems).push(msg);
        continue;
      }
      const publishedPackage = entry.apk?.packageId || entry.packageId;
      if (art.packageId && publishedPackage && art.packageId !== publishedPackage) {
        problems.push(`${slug}/${art.id}: profile packageId ${art.packageId} != catalog ${publishedPackage}`);
      }
      const publishedKind = entry.apk?.buildKind;
      if (publishedKind && publishedKind !== profile.buildKind) {
        problems.push(`${slug}/${art.id}: catalog buildKind '${publishedKind}' != profile buildKind '${profile.buildKind}'`);
      }
    }
  }
  const usedSlugs = new Set();
  for (const [slug, profile] of Object.entries(profiles.profiles || {})) {
    for (const art of artifactsOf(profiles, slug)) {
      if (usedSlugs.has(art.catalogSlug)) problems.push(`catalog slug '${art.catalogSlug}' is claimed by more than one artifact`);
      usedSlugs.add(art.catalogSlug);
    }
  }
  return { problems, warnings };
}

/** B. version safety: strictly greater than everything already published. */
export function maxPublishedVersionCode(catalog, packageId) {
  return catalog.reduce((max, a) => {
    const pkg = a.apk?.packageId || a.packageId;
    const code = Number(a.apk?.versionCode || 0);
    return pkg === packageId && code > max ? code : max;
  }, 0);
}

export function validateVersionSafety({ catalog, packageId, versionCode, floor }) {
  const problems = [];
  const published = maxPublishedVersionCode(catalog, packageId);
  if (!Number.isFinite(versionCode) || versionCode <= 0) problems.push(`versionCode '${versionCode}' is not a positive integer`);
  if (versionCode <= published) problems.push(`versionCode ${versionCode} must be greater than the highest published ${published} for ${packageId} (downgrade refused)`);
  if (floor && versionCode < floor) problems.push(`versionCode ${versionCode} is below the profile floor ${floor}`);
  return { problems, published };
}

/** D. repository security: allowlist, immutable ref, approved path and task. */
export function validateRepository({ profiles, profile, artifact, repo, ref, task, projectPath, dryRun }) {
  const problems = [];
  if (!Array.isArray(profiles.allowedRepositories) || !profiles.allowedRepositories.includes(repo)) {
    problems.push(`repository '${repo}' is not on the approved allowlist`);
  }
  if (repo !== profile.repository) problems.push(`repository '${repo}' != profile repository '${profile.repository}'`);
  const refMode = profile.refMode || 'sha';
  if (refMode === 'sha' && !SHA_RE.test(String(ref || ''))) {
    problems.push(dryRun ? `ref '${ref}' is not an immutable 40-hex commit SHA` : `release builds require an immutable commit SHA, got '${ref}'`);
  }
  if (projectPath !== profile.projectPath) problems.push(`project path '${projectPath}' != profile path '${profile.projectPath}'`);
  const approvedTasks = (profile.artifacts || []).map((a) => a.gradleTask);
  if (!approvedTasks.includes(task)) problems.push(`gradle task '${task}' is not approved for this profile (allowed: ${approvedTasks.join(', ')})`);
  if (artifact && !approvedTasks.includes(artifact.gradleTask)) problems.push(`artifact ${artifact.id}: task ${artifact.gradleTask} not in approved list`);
  return problems;
}

/** C. the native gate plan a build must satisfy before it can publish. */
export function gatesFor(profiles, { profile, artifact }) {
  const kernel = profiles.kernels?.[profile.buildKind];
  return [...(kernel?.gates || [])];
}

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const isMain = process.argv[1] && process.argv[1].endsWith('build-profile.mjs');
if (isMain) {
  const cmd = process.argv[2];
  const profiles = loadProfiles();
  const catalog = loadCatalog(ROOT, arg('--catalog'));
  const slug = process.argv[3];
  const artifactId = arg('--artifact');
  const out = (obj) => console.log(JSON.stringify(obj, null, 2));
  try {
    if (cmd === 'validate') {
      const res = validateIdentity(profiles, catalog);
      out({ ok: res.problems.length === 0, problems: res.problems, warnings: res.warnings, profiles: Object.keys(profiles.profiles || {}).length });
      process.exit(res.problems.length ? 1 : 0);
    }
    if (cmd === 'resolve') {
      const r = resolveProfile(profiles, slug, artifactId);
      out({
        kernel: r.kernel,
        build_kind: r.profile.buildKind,
        catalog_slug: r.artifact.catalogSlug,
        artifact_id: r.artifact.id,
        package_id: r.artifact.packageId || null,
        repository: r.profile.repository || null,
        project_path: r.profile.projectPath || null,
        gradle_task: r.artifact.gradleTask || null,
        signing_secret_set: r.profile.signingSecretSet || null,
        launcher_source: r.artifact.launcherSource || null,
        gates: gatesFor(profiles, r).join(','),
      });
      process.exit(0);
    }
    if (cmd === 'assert-version') {
      const r = resolveProfile(profiles, slug, artifactId);
      const res = validateVersionSafety({ catalog, packageId: r.artifact.packageId, versionCode: Number(arg('--version-code')), floor: r.profile.versionCodeFloor });
      out({ ok: res.problems.length === 0, published_version_code: res.published, problems: res.problems });
      process.exit(res.problems.length ? 1 : 0);
    }
    if (cmd === 'gate-args') {
      const r = resolveProfile(profiles, slug, artifactId);
      const a = r.artifact;
      const parts = [];
      if (a.minSdk) parts.push('--min-sdk', String(a.minSdk));
      if (a.targetSdk) parts.push('--target-sdk', String(a.targetSdk));
      if (a.allowedDangerousPermissions) parts.push('--allow-permissions', a.allowedDangerousPermissions.join(','));
      if (a.allowedExportedComponents) parts.push('--allow-exported', a.allowedExportedComponents.join(','));
      parts.push('--cleartext-allowed', String(!!a.cleartextAllowed));
      if (a.requiredNativeModules) parts.push('--require-dex-strings', a.requiredNativeModules.join(','));
      console.log(parts.join(' '));
      process.exit(0);
    }
    if (cmd === 'assert-repository') {
      const r = resolveProfile(profiles, slug, artifactId);
      const problems = validateRepository({ profiles, profile: r.profile, artifact: r.artifact, repo: arg('--repo'), ref: arg('--ref'), task: arg('--task'), projectPath: arg('--project-path'), dryRun: arg('--dry-run') === 'true' });
      out({ ok: problems.length === 0, problems });
      process.exit(problems.length ? 1 : 0);
    }
    console.error('usage: build-profile.mjs <validate|resolve|assert-version|assert-repository> <slug> [--artifact id] [flags]');
    process.exit(2);
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(2);
  }
}
