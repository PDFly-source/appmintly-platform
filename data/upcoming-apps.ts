import rawUpcoming from './upcoming-apps.json';

/**
 * Phase 1B — Upcoming Apps roadmap records (AppMintly Lab).
 *
 * Source of truth: version-controlled data/upcoming-apps.json — the same
 * "data file as catalog" architecture as data/apps.json. No backend, no
 * database, no external API.
 *
 * HONESTY RULES:
 *  - Every record carries real evidence: `sourceRepo` links to the actual
 *    GitHub repository of the project. Descriptive text (purpose, features,
 *    capabilities) is team-maintained draft roadmap content — each record
 *    carries a `draftNote` saying exactly that.
 *  - roadmapStatus is a controlled vocabulary: 'planned' | 'in-development'
 *    | 'early-testing' | 'published'. Anything else is rejected by the
 *    normalizer and the record is skipped — the Lab never renders an
 *    unknown status. 'published' is FAIL-CLOSED: a published record without
 *    a valid https publicUrl is skipped — a product is never marked
 *    published merely because a build or internal APK exists.
 *  - These records are roadmap projects, not installable catalog apps. The
 *    Lab UI never shows download buttons or version numbers for them; the
 *    only public destination CTA is 'Open App' on a published record with
 *    a real public URL.
 */

export type RoadmapStatus = 'planned' | 'in-development' | 'early-testing' | 'published';

/** Explicit milestone states (Lab 3.0 roadmap engine). */
export type MilestoneStatus = 'done' | 'in-progress' | 'planned' | 'blocked';

export interface RoadmapMilestone {
  /** Stable identifier (never changes once shipped). */
  id: string;
  title: string;
  /** What this milestone covers — team-maintained draft roadmap text. */
  description: string;
  status: MilestoneStatus;
  /** Completion evidence, only when it actually exists. */
  evidence?: string;
  /** Last-updated date (ISO), only when a real update date is known. */
  lastUpdated?: string;
}

export interface UpcomingApp {
  id: string;
  slug: string;
  name: string;
  developer: string;
  category: string;
  type: string;
  /** One-sentence reason this app exists. */
  purpose: string;
  /** Who the app is being built for. */
  intendedUsers: string[];
  /** The problem the app exists to solve (team-maintained roadmap copy). */
  problem?: string;
  /** Practical user benefits derived from the planned features. */
  benefits?: string[];
  /** Features proposed for the first public release. */
  proposedFeatures: string[];
  /** Capabilities planned for the product over time. */
  plannedCapabilities: string[];
  roadmapStatus: RoadmapStatus;
  roadmapStatusLabel: string;
  /**
   * Status-specific availability message rendered in the card banner
   * (team-maintained copy, e.g. 'Internal Testing Only — Not publicly
   * accessible.'). Falls back to the per-status default in the card.
   */
  accessMessage?: string;
  /**
   * Verified public product URL — ONLY valid on 'published' records. A
   * published record without a real https destination is never rendered.
   */
  publicUrl?: string;
  /**
   * Real concept-page URL for a 'planned' record. When it exists the CTA
   * is 'View Concept'; otherwise the honest CTA is 'Coming Later'. The
   * Lab never invents or guesses a concept destination.
   */
  conceptUrl?: string;
  milestones: RoadmapMilestone[];
  /** Evidence link — the real repository of the project, when one exists. */
  sourceRepo?: string;
  /** Official brand asset under /brand/ (rendered by the showcase card). */
  logo?: string;
  /** Real app screenshots, only when actual captures exist (never logos). */
  screenshots?: AppScreenshot[];
  /**
   * Evidence-driven verification record. Checks are only marked passed
   * when real evidence exists; otherwise the Lab shows "Verification
   * pending" — never an invented result.
   */
  verification?: VerificationRecord;
  draftNote: string;
}

/**
 * Canonical status labels of the finalized four-status system. The badge on
 * every Lab card shows THIS label (e.g. "Early Testing"); the record's
 * `roadmapStatusLabel` is the status SUBTITLE (e.g. "Internal Only") and is
 * rendered as a secondary line, never as the badge itself.
 */
export const ROADMAP_STATUS_LABEL: Record<UpcomingApp['roadmapStatus'], string> = {
  planned: 'Planned',
  'in-development': 'In Development',
  'early-testing': 'Early Testing',
  published: 'Published / Released',
};

/** Default status subtitles (used when a record does not carry its own). */
export const ROADMAP_STATUS_SUBTITLE: Record<UpcomingApp['roadmapStatus'], string> = {
  planned: 'Idea & Planning',
  'in-development': 'Building Now',
  'early-testing': 'Internal Only',
  published: 'Public Release',
};

/** AppMintly verification categories (distinct checks, not decorations). */
export const VERIFICATION_CATEGORIES = [
  'identity',
  'build',
  'core-flow',
  'device',
  'release',
] as const;
export type VerificationCategory = (typeof VERIFICATION_CATEGORIES)[number];

export type VerificationCheckResult = 'pending' | 'passed' | 'failed' | 'unable-to-verify';

export interface VerificationCheck {
  /** Stable check id, e.g. 'register-build-2026-10-15'. */
  id?: string;
  category: VerificationCategory;
  /** pending | passed | failed | unable-to-verify — never a fabricated pass. */
  result: VerificationCheckResult;
  /** What was actually checked + evidence summary, when one exists. */
  summary?: string;
  /** Where the evidence comes from (e.g. 'repository test run', 'manual device test'). */
  source?: string;
  /** Build or version identifier tied to the evidence, when one exists. */
  buildId?: string;
  /** ISO date, only when the check actually ran. */
  date?: string;
  /** Known limitations discovered by the check. */
  limitations?: string;
}

export interface VerificationRecord {
  /** Honest label for the source and scope of these records. */
  source: string;
  checks: VerificationCheck[];
}

export interface AppScreenshot {
  /** Path under /brand/ — must exist in the repo, never a placeholder. */
  src: string;
  alt: string;
}

const VALID_STATUSES: RoadmapStatus[] = ['planned', 'in-development', 'early-testing', 'published'];
const VALID_MILESTONE_STATUSES: MilestoneStatus[] = ['done', 'in-progress', 'planned', 'blocked'];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function normalizeMilestones(v: unknown): RoadmapMilestone[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (m): m is Record<string, unknown> =>
        typeof m === 'object' && m !== null && typeof m.title === 'string'
    )
    .map((m, i) => ({
      id: typeof m.id === 'string' && m.id ? m.id : `milestone-${i + 1}`,
      title: m.title as string,
      description: typeof m.description === 'string' ? m.description : '',
      status: VALID_MILESTONE_STATUSES.includes(m.status as MilestoneStatus)
        ? (m.status as MilestoneStatus)
        : 'planned',
      evidence: typeof m.evidence === 'string' ? m.evidence : undefined,
      lastUpdated: typeof m.lastUpdated === 'string' ? m.lastUpdated : undefined,
    }));
}

/** Normalize a verification record — unknown shapes never become passes. */
function normalizeVerification(v: unknown): VerificationRecord | undefined {
  if (typeof v !== 'object' || v === null || !Array.isArray((v as Record<string, unknown>).checks)) return undefined;
  const raw = v as Record<string, unknown>;
  const checks: VerificationCheck[] = [];
  for (const c of raw.checks as unknown[]) {
    if (typeof c !== 'object' || c === null) continue;
    const rec = c as Record<string, unknown>;
    const category = rec.category as VerificationCategory;
    if (!VERIFICATION_CATEGORIES.includes(category)) continue;
    const result = rec.result as VerificationCheckResult;
    checks.push({
      id: typeof rec.id === 'string' ? rec.id : undefined,
      category,
      result:
        result === 'passed' || result === 'failed' || result === 'unable-to-verify'
          ? result
          : 'pending',
      summary: typeof rec.summary === 'string' ? rec.summary : undefined,
      source: typeof rec.source === 'string' ? rec.source : undefined,
      buildId: typeof rec.buildId === 'string' ? rec.buildId : undefined,
      date: typeof rec.date === 'string' ? rec.date : undefined,
      limitations: typeof rec.limitations === 'string' ? rec.limitations : undefined,
    });
  }
  return {
    source: typeof raw.source === 'string' ? raw.source : 'AppMintly team — locally recorded verification',
    checks,
  };
}

function normalizeUpcoming(raw: unknown): UpcomingApp | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string' || typeof r.slug !== 'string') return null;
  const status = r.roadmapStatus as RoadmapStatus;
  if (!VALID_STATUSES.includes(status)) return null;
  const httpsUrl = (v: unknown) =>
    typeof v === 'string' && /^https:\/\//.test(v) && !/\s/.test(v) ? (v as string) : undefined;
  const publicUrl = httpsUrl(r.publicUrl);
  const conceptUrl = httpsUrl(r.conceptUrl);
  // FAIL-CLOSED: 'published' requires a real, verified public destination.
  // A build, internal APK or repository never makes a product published.
  if (status === 'published' && !publicUrl) return null;
  // sourceRepo is OPTIONAL engineering metadata: it stays in the data
  // records for internal use but is NOT rendered in the public Lab
  // (Phase 1D+). Some roadmap entries have no public repository yet —
  // the Lab never invents one.
  const sourceRepo = typeof r.sourceRepo === 'string' && /^https:\/\//.test(r.sourceRepo)
    ? r.sourceRepo
    : undefined;
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    developer: typeof r.developer === 'string' ? r.developer : 'AppMintly Team',
    category: typeof r.category === 'string' ? r.category : 'Uncategorized',
    type: typeof r.type === 'string' ? r.type : 'Web App',
    purpose: typeof r.purpose === 'string' ? r.purpose : '',
    intendedUsers: isStringArray(r.intendedUsers) ? r.intendedUsers : [],
    problem: typeof r.problem === 'string' ? r.problem : undefined,
    benefits: isStringArray(r.benefits) ? r.benefits : undefined,
    proposedFeatures: isStringArray(r.proposedFeatures) ? r.proposedFeatures : [],
    plannedCapabilities: isStringArray(r.plannedCapabilities) ? r.plannedCapabilities : [],
    roadmapStatus: status,
    roadmapStatusLabel:
      typeof r.roadmapStatusLabel === 'string' ? r.roadmapStatusLabel : status,
    accessMessage: typeof r.accessMessage === 'string' ? r.accessMessage : undefined,
    publicUrl,
    conceptUrl,
    milestones: normalizeMilestones(r.milestones),
    sourceRepo,
    // Optional official brand asset (public/brand/...) rendered by the
    // showcase card. Only records that actually supplied an asset set it.
    logo: typeof r.logo === 'string' && r.logo.startsWith('/brand/') ? r.logo : undefined,
    screenshots: Array.isArray(r.screenshots)
      ? (r.screenshots as unknown[])
          .filter(
            (sc): sc is Record<string, unknown> =>
              typeof sc === 'object' && sc !== null && typeof (sc as Record<string, unknown>).src === 'string'
          )
          .map((sc) => ({ src: sc.src as string, alt: typeof sc.alt === 'string' ? sc.alt : '' }))
      : undefined,
    verification: normalizeVerification(r.verification),
    draftNote: typeof r.draftNote === 'string' ? r.draftNote : '',
  };
}

/** All valid upcoming-app records (invalid records are skipped, never guessed). */
export const UPCOMING_APPS: UpcomingApp[] = (rawUpcoming as unknown as unknown[])
  .map(normalizeUpcoming)
  .filter((u): u is UpcomingApp => u !== null);

export function getUpcomingApps(): UpcomingApp[] {
  return UPCOMING_APPS;
}

export function getUpcomingAppBySlug(slug: string): UpcomingApp | undefined {
  return UPCOMING_APPS.find((u) => u.slug === slug);
}
