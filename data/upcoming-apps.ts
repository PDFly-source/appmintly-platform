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

export interface RoadmapMilestone {
  title: string;
  status: 'done' | 'in-progress' | 'planned';
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
  draftNote: string;
}

const VALID_STATUSES: RoadmapStatus[] = ['planned', 'in-development', 'early-testing'];
const VALID_MILESTONE_STATUSES: RoadmapMilestone['status'][] = ['done', 'in-progress', 'planned'];

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
    .map((m) => ({
      title: m.title as string,
      status: VALID_MILESTONE_STATUSES.includes(m.status as RoadmapMilestone['status'])
        ? (m.status as RoadmapMilestone['status'])
        : 'planned',
    }));
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
