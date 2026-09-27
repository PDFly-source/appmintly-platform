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
  { path: '/brand/appmintly-icon-192.png', sha256: '78356ab81991996cc99fb7685dd2c0d249c33d406b3547191eeb4edd64fd8e64', size: 41797 },
  { path: '/brand/appmintly-icon.png', sha256: 'd32bf84b96f72572ca759e96aa9ecb5b2ea552571f20ef0edcd25bae727d5384', size: 365106 },
  { path: '/brand/appmintly-logo-compact.png', sha256: '9342230b79af19ede7ed504d0eef81354760f42c34aef8758dc236d1f3211b1f', size: 449543 },
  { path: '/brand/appmintly-logo-full.png', sha256: 'e9c9528121d0f93d2a1a9ad334fd4132b31623019f9bdde20f44e3dac932cd22', size: 830602 },
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
