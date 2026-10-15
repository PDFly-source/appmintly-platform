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
 *    | 'early-testing'. Anything else is rejected by the normalizer and the
 *    record is skipped — the Lab never renders an unknown status.
 *  - These records are NOT installable catalog apps. The Lab UI must never
 *    show download buttons or version numbers for them.
 */

export type RoadmapStatus = 'planned' | 'in-development' | 'early-testing';

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
  /** Features proposed for the first public release. */
  proposedFeatures: string[];
  /** Capabilities planned for the product over time. */
  plannedCapabilities: string[];
  roadmapStatus: RoadmapStatus;
  roadmapStatusLabel: string;
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

/** AppMintly verification categories (distinct checks, not decorations). */
export const VERIFICATION_CATEGORIES = [
  'identity',
  'build',
  'core-flow',
  'device',
  'release',
] as const;
export type VerificationCategory = (typeof VERIFICATION_CATEGORIES)[number];

export type VerificationCheckResult = 'pending' | 'passed' | 'failed';

export interface VerificationCheck {
  category: VerificationCategory;
  /** pending | passed | failed — never a fabricated pass. */
  result: VerificationCheckResult;
  /** What was actually checked + evidence summary, when one exists. */
  summary?: string;
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

const VALID_STATUSES: RoadmapStatus[] = ['planned', 'in-development', 'early-testing'];
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
      category,
      result: result === 'passed' || result === 'failed' ? result : 'pending',
      summary: typeof rec.summary === 'string' ? rec.summary : undefined,
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
    proposedFeatures: isStringArray(r.proposedFeatures) ? r.proposedFeatures : [],
    plannedCapabilities: isStringArray(r.plannedCapabilities) ? r.plannedCapabilities : [],
    roadmapStatus: status,
    roadmapStatusLabel:
      typeof r.roadmapStatusLabel === 'string' ? r.roadmapStatusLabel : status,
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
