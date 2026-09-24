/**
 * Publisher / developer identity model.
 *
 * Publisher identities live in the repository-controlled data/publishers.json
 * catalog. They are intentionally NOT part of the browser-editable publisher
 * form: verification ("Verified Publisher" badge) is an admin/repository-level
 * attribute that a publisher edit session cannot grant to itself.
 *
 * Apps reference an identity via `developerSlug`. When the slug resolves, the
 * canonical identity (display name, verification state, avatar, website, bio)
 * is used consistently across every application by the same publisher.
 */

export interface DeveloperIdentity {
  slug: string;
  name: string;
  verified: boolean;
  avatar?: string;
  website?: string;
  bio?: string;
}

import rawPublishers from './publishers.json';

export const PUBLISHERS: DeveloperIdentity[] = (rawPublishers as DeveloperIdentity[]) || [];

const bySlug = new Map(PUBLISHERS.map((p) => [p.slug.toLowerCase(), p]));

export function getDeveloperIdentity(slug?: string): DeveloperIdentity | null {
  if (!slug) return null;
  return bySlug.get(slug.toLowerCase()) || null;
}

/**
 * Resolve the display identity for an app.
 * Falls back to the raw `developer` string when no identity record exists,
 * which is always unverified (no badge).
 */
export function resolveDeveloper(app: {
  developer?: string;
  developerSlug?: string;
}): { name: string; slug?: string; verified: boolean; avatar?: string; website?: string; bio?: string } {
  const identity = getDeveloperIdentity(app.developerSlug);
  if (identity) {
    return {
      name: identity.name,
      slug: identity.slug,
      verified: Boolean(identity.verified),
      avatar: identity.avatar,
      website: identity.website,
      bio: identity.bio,
    };
  }
  return { name: app.developer || 'Unknown Developer', verified: false };
}
