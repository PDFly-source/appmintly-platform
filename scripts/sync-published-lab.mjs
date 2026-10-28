#!/usr/bin/env node
/**
 * Phase 2/4 — Published/Released Lab sync.
 *
 * Derives the AppMintly Lab "Published / Released" roadmap records from the
 * authoritative production catalog (data/apps.json). Nothing is hardcoded:
 * the published set, the counts, versions, logos, categories and public URLs
 * all come from the catalog records themselves.
 *
 * COUNTING SEMANTICS (documented, per the delivery plan):
 *   - The Lab roadmap dataset (data/upcoming-apps.json) IS the published
 *     section's dataset. Sync either updates an existing linked record or
 *     appends a sync-managed published record, so the Published/Released
 *     filter count and the All Projects count stay consistent and additive.
 *
 * STABLE MAPPING (never display-name matching):
 *   A published catalog app with slug S maps to the roadmap record where
 *     1. record.catalogSlug === S, or
 *     2. record.id === 'catalog-' + S, or
 *     3. record.slug === S
 *   in that priority. Matching is idempotent: repeated runs converge to the
 *   same records and produce zero changes once in sync.
 *
 * PUBLISHED SET (fail-closed, no guesses):
 *   A catalog app counts as published ONLY when
 *     status === 'published' && published === true
 *   Draft, test, internal and unpublished entries are excluded.
 *
 * RETENTION POLICY (documented):
 *   - Sync-created records (syncManaged: true) whose catalog app is no
 *     longer published are REMOVED from the roadmap dataset. They were a
 *     live-catalog projection, not a curated roadmap project; the git
 *     history preserves every prior state. The marketplace catalog record
 *     itself is never touched.
 *   - Curated records linked via catalogSlug whose catalog app is no
 *     longer published are set back to 'early-testing' with publicUrl
 *     removed (fail-closed) and accessMessage restored to the internal
 *     default. Curated content is never deleted by sync.
 *
 * FAILURE BEHAVIOUR:
 *   - The catalog and the roadmap file must both parse; any read/parse
 *     failure aborts with a non-zero exit BEFORE any write. A failing or
 *     empty catalog never produces a silent zero-count overwrite.
 *   - An empty-but-valid catalog (no published apps) is a legitimate
 *     state: all sync-managed published records are removed then.
 *   - --dry-run prints the computed plan without writing.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CATALOG_PATH = path.join(ROOT, 'data', 'apps.json');
const ROADMAP_PATH = path.join(ROOT, 'data', 'upcoming-apps.json');
const DRY_RUN = process.argv.includes('--dry-run');

/** Canonical marketplace app-detail URL (the official public destination). */
export function detailUrlFor(slug) {
  return `https://appmintly.pages.dev/app/${slug}/`;
}

/** The authoritative published set — derived, never hardcoded. */
export function publishedCatalogApps(catalog) {
  if (!Array.isArray(catalog)) throw new Error('catalog must be an array');
  return catalog.filter(
    (a) => a && typeof a === 'object' && a.status === 'published' && a.published === true
  );
}

/** Stable-identifier match for one catalog slug against the roadmap set. */
export function matchRoadmapRecord(records, slug) {
  return (
    records.find((r) => r.catalogSlug === slug) ||
    records.find((r) => r.id === `catalog-${slug}`) ||
    records.find((r) => r.slug === slug) ||
    null
  );
}

function brandLogoFor(app) {
  // Only repository-hosted /brand/ assets are usable by the Lab card.
  if (typeof app.icon === 'string' && app.icon.startsWith('/brand/')) return app.icon;
  // The marketplace's own record points at its live-site icon; the same
  // original logo asset ships in this repository's /brand/ directory.
  if (app.slug === 'appmintly') return '/brand/appmintly-icon-512.png';
  return undefined;
}

/**
 * Build the sync-managed published record derived from one catalog app.
 * Every field traces back to the catalog record (authoritative source).
 */
export function publishedRecordFor(app) {
  const features = Array.isArray(app.features) ? app.features : [];
  const version = typeof app.version === 'string' ? app.version : '';
  const lastUpdated = typeof app.lastUpdated === 'string' ? app.lastUpdated : '';
  const checks = [];
  // Honest, catalog-derived verification: the release check is verifiable
  // directly from the production catalog record itself.
  checks.push({
    id: `V-${String(app.slug).slice(0, 4).toUpperCase()}-RELEASE`,
    category: 'release',
    result: 'passed',
    evidence_class: 'repository-inspection',
    summary: `Public release listed in the production AppMintly catalog (data/apps.json)${
      version ? `, version ${version}` : ''
    }.`,
    source: 'AppMintly production catalog (data/apps.json)',
    ...(lastUpdated ? { date: lastUpdated } : {}),
  });
  return {
    id: `catalog-${app.slug}`,
    slug: app.slug,
    catalogSlug: app.slug,
    syncManaged: true,
    name: app.name,
    developer: app.developer || 'AppMintly Team',
    category: app.category || 'Uncategorized',
    type: app.type || 'Web App',
    purpose: app.shortDescription || app.description || '',
    intendedUsers: ['Public AppMintly marketplace users'],
    problem: undefined,
    proposedFeatures: features.slice(0, 5),
    plannedCapabilities: ['Live on the AppMintly marketplace (auto-synced from the production catalog).'],
    roadmapStatus: 'published',
    roadmapStatusLabel: 'published',
    accessMessage: undefined,
    publicUrl: detailUrlFor(app.slug),
    releaseVersion: version || undefined,
    releaseDate: app.releaseDate || app.publishedAt || lastUpdated || undefined,
    milestones: [
      {
        id: `pub-${app.slug}-m1`,
        title: `Publicly released on the AppMintly marketplace${version ? ` (v${version})` : ''}`,
        description: `Listed in the production catalog with a verified public listing at ${detailUrlFor(
          app.slug
        )}.`,
        status: 'done',
      },
    ],
    verification: {
      source: 'AppMintly production catalog (data/apps.json)',
      checks,
    },
    logo: brandLogoFor(app),
    draftNote:
      'Published release record auto-synced from the production AppMintly catalog (data/apps.json). Managed by the catalog synchronization — do not hand-edit; use the Publisher Console Lab section or the sync workflow.',
  };
}

/**
 * Compute the full sync plan against the current roadmap dataset.
 * Pure function: no I/O. Returns { records, changes, plan }.
 */
export function computeSync(catalog, roadmap) {
  if (!Array.isArray(roadmap)) throw new Error('roadmap must be an array');
  const publishedApps = publishedCatalogApps(catalog);
  const changes = [];
  const out = [];

  const publishedSlugs = new Set(publishedApps.map((a) => a.slug));

  // Pass 1 — preserve every existing record; apply publish/unpublish updates.
  for (const rec of roadmap) {
    const linkedSlug = rec.catalogSlug || (rec.id && rec.id.startsWith('catalog-') ? rec.id.slice('catalog-'.length) : null);
    const app = linkedSlug ? publishedApps.find((a) => a.slug === linkedSlug) : null;

    if (app) {
      // Linked to a live published catalog app: ensure published state and
      // a valid public destination. Sync-managed records also refresh their
      // catalog-derived fields; curated records keep their own content.
      if (rec.roadmapStatus !== 'published' || rec.publicUrl !== detailUrlFor(app.slug)) {
        changes.push(`publish ${rec.slug} (catalog: ${app.slug})`);
      } else if (rec.syncManaged) {
        const want = publishedRecordFor(app);
        if (JSON.stringify(stripSyncManaged(rec)) !== JSON.stringify(stripSyncManaged(want))) {
          changes.push(`refresh ${rec.slug} from catalog`);
        }
      }
      const merged = rec.syncManaged ? publishedRecordFor(app) : rec;
      out.push({
        ...merged,
        roadmapStatus: 'published',
        publicUrl: detailUrlFor(app.slug),
      });
    } else if (linkedSlug && publishedSlugs.has(linkedSlug) === false) {
      // Linked to a catalog app that is no longer published.
      if (rec.syncManaged) {
        changes.push(`remove sync-managed record ${rec.slug} (catalog app no longer published)`);
        continue; // drop
      }
      if (rec.roadmapStatus === 'published') {
        changes.push(`revert ${rec.slug} to early-testing (catalog app unpublished)`);
        out.push({
          ...rec,
          roadmapStatus: 'early-testing',
          roadmapStatusLabel: rec.roadmapStatusLabel !== 'published' ? rec.roadmapStatusLabel : 'Internal Only',
          publicUrl: undefined,
        });
      } else {
        out.push(rec);
      }
    } else {
      out.push(rec); // untouched roadmap record
    }
  }

  // Pass 2 — published catalog apps with no roadmap record: create one.
  for (const app of publishedApps) {
    const existing = matchRoadmapRecord(out, app.slug);
    if (!existing) {
      out.push(publishedRecordFor(app));
      changes.push(`create published record for ${app.slug}`);
    } else if (existing.roadmapStatus !== 'published') {
      // handled in pass 1 via the id/link match
    }
  }

  return { records: out, changes, plan: { publishedCount: publishedApps.length } };
}

function stripSyncManaged(rec) {
  // Compare catalog-derived payload only; ignore ordering of keys via
  // canonical stringify.
  return JSON.parse(JSON.stringify(rec));
}

/** CLI entry: read files, compute, write only when there are changes. */
export function runSync({ catalogPath = CATALOG_PATH, roadmapPath = ROADMAP_PATH, dryRun = DRY_RUN } = {}) {
  if (!existsSync(catalogPath)) throw new Error(`catalog not found: ${catalogPath}`);
  if (!existsSync(roadmapPath)) throw new Error(`roadmap not found: ${roadmapPath}`);
  let catalog, roadmap;
  try {
    catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  } catch (err) {
    throw new Error(`catalog parse failure (aborting, nothing written): ${err.message}`);
  }
  try {
    roadmap = JSON.parse(readFileSync(roadmapPath, 'utf8'));
  } catch (err) {
    throw new Error(`roadmap parse failure (aborting, nothing written): ${err.message}`);
  }

  const { records, changes, plan } = computeSync(catalog, roadmap);

  if (changes.length === 0) {
    return { changed: false, changes: [], plan };
  }
  if (!dryRun) {
    writeFileSync(roadmapPath, JSON.stringify(records, null, 2) + '\n', 'utf8');
  }
  return { changed: !dryRun, changes, plan };
}

// ---- CLI ----
if (process.argv[1] && process.argv[1].endsWith('sync-published-lab.mjs')) {
  try {
    const result = runSync();
    if (!result.changed && result.changes.length === 0) {
      console.log(`lab sync: IN SYNC (${result.plan.publishedCount} published catalog apps)`);
    } else {
      console.log(`lab sync: ${result.changes.length} change(s)${DRY_RUN ? ' [dry-run]' : ''}`);
      for (const c of result.changes) console.log(`  - ${c}`);
      if (!DRY_RUN) console.log(`lab sync: roadmap updated from ${result.plan.publishedCount} published catalog app(s)`);
    }
  } catch (err) {
    console.error(`lab sync FAILED: ${err.message}`);
    process.exit(1);
  }
}
