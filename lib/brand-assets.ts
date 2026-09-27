/**
 * Official repository-hosted brand assets (Phase 10.4).
 *
 * Uploaded icon files whose byte content matches one of these repository
 * assets are converted to the asset's canonical repository path before they
 * can enter a catalog draft, session edit, export or publish payload.
 * Uploaded previews may live in transient UI memory ONLY — a data: URL is
 * NEVER persisted as a catalog `icon` value.
 *
 * Fingerprints are sha256 of the deployed files under public/brand/ and are
 * verified against the live GitHub Pages deployment. Update them in lockstep
 * with the artwork (the official AppMintly logo itself must not change).
 */

export interface RepoBrandAsset {
  /** Canonical catalog value: repository asset path starting with "/" */
  path: string;
  /** sha256 of the file bytes, lowercase hex */
  sha256: string;
  /** Exact byte size (secondary confirmation) */
  size: number;
}

export const REPO_BRAND_ASSETS: RepoBrandAsset[] = [
  { path: '/brand/appmintly-icon-192.png', sha256: '4efd0a2a54f00f54cdbbe9af4dd87ed47765c6dcf22be9d4ae045720ab24a4ba', size: 42774 },
  { path: '/brand/appmintly-icon.png', sha256: 'c66e3b709139d17cb3bace4ac8699c85645469e1794b7cc7b79dc3a48be68473', size: 377332 },
  { path: '/brand/appmintly-logo-compact.png', sha256: 'a8514765952de3ceaa73ee7e3ad78b5c884574b34f291292c2ac622a00ce6ba2', size: 572472 },
  { path: '/brand/appmintly-logo-full.png', sha256: '538c505357775a479edbd09a198a833830b517d863a799952f2d4ddb539d5cab', size: 796741 },
  { path: '/brand/pdfminifly-icon-384.png', sha256: '2645cb6fe7118e34d2941d23245cefabb80b23f0660f33052bf82bcd6f82ba63', size: 88287 },
  { path: '/brand/studyria-icon-384.png', sha256: 'd73721749806d27c2df00aea8a6c4bf675465d49591c0a97578101db9a71896b', size: 142118 },
];

/**
 * Resolve an uploaded file to its canonical repository asset path by content
 * fingerprint. Returns the canonical path when the bytes are byte-identical
 * to a deployed repository asset, otherwise null (the upload stays a
 * preview-only image and never becomes a persisted catalog icon).
 */
export async function resolveUploadToRepoAsset(file: File): Promise<string | null> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const match = REPO_BRAND_ASSETS.find(
    (a) => a.sha256 === hex && a.size === buffer.byteLength
  );
  return match ? match.path : null;
}
