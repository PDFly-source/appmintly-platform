import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import UpdateCenter from './UpdateCenter';

/**
 * Work 2 — Update Center. Static route; every version, date, release note and
 * download target on this page comes from the published catalog record.
 *
 * The stylesheet is the ported premium reference, read once at build time and
 * scoped under .uc-root so it cannot disturb the rest of the site.
 */
export const metadata: Metadata = {
  title: 'Update Center | AppMintly',
  description:
    'See the latest published version of the apps you downloaded, compare it with the version this browser recorded, and read the release notes the publisher actually shipped.',
  alternates: { canonical: `${SITE_URL}updates${CANONICAL_TRAILING_SLASH}` },
  robots: { index: true, follow: true },
};

export default function UpdatesPage() {
  const css = fs.readFileSync(path.join(process.cwd(), 'app', 'updates', 'updates.css'), 'utf8');
  return <UpdateCenter css={css} />;
}
