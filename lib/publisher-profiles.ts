/**
 * Publishers that have a bespoke full-page profile design.
 *
 * A full profile requires a VERIFIED identity AND an owner-supplied design
 * (portrait asset + copy). Adding another publisher here is an explicit,
 * reviewed decision: it must never be inferred, otherwise one publisher could
 * be rendered with another publisher's portrait or biography.
 */
const FULL_PROFILE_SLUGS: ReadonlySet<string> = new Set(['pkd']);

export function hasFullProfile(identity: { slug: string; verified: boolean } | null | undefined): boolean {
  return Boolean(identity && identity.verified && FULL_PROFILE_SLUGS.has(identity.slug.toLowerCase()));
}
