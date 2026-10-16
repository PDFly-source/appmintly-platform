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
  { path: '/brand/appmintly-icon-192.png', sha256: '9d9cac752e44dcf41d4d71555751048887210468172c9c773b6223151eac525e', size: 28718 },
  { path: '/brand/appmintly-logo-official.png', sha256: '74e7386ec91e11db3daa3bc804efdb72fe668b607a4d6ba952e5156c767105db', size: 1196688 },
  { path: '/icon-512.png', sha256: '6db4e143053bd3aebc04bed0703f36720ce9fe9e6f4e4c474ef881f3047e9287', size: 198042 },
  { path: '/icon-512-maskable.png', sha256: 'ee9cd79e5ff6d310417d70d0847eb66366558a0fb656d6b71ae51be2d05c46e0', size: 67003 },
  { path: '/brand/appmintly-icon.png', sha256: '14ad90aa88df9c6a69ec9c5cd0005cc9a81bc5a4f688b8f4ca52c23d032e171d', size: 349646 },
  { path: '/brand/appmintly-logo-compact.png', sha256: 'a28e6b4714687046a497b967f24cda929ee959f949b7fb6d972480571d561e1c', size: 626877 },
  { path: '/brand/appmintly-logo-full.png', sha256: '2938ebd05d095325d5924a647a69a9964040f83462d9d77d0a324d04cab51a78', size: 527361 },
  { path: '/brand/pdfminifly-icon-384.png', sha256: '499ba529ee4ef582692213e3e0eaab751f9c9791c0db5cd10b484b1534d74f38', size: 109668 },
  { path: '/brand/pdfminifly-logo-official.png', sha256: 'aa8f4139c8130bac014a092c487f3227d1e2854a5a7e9dfca793ad84d42a2bed', size: 1154717 },
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
