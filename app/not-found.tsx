import Link from 'next/link';
import { Compass } from 'lucide-react';

/**
 * Branded 404 — matches the existing EmptyState visual language
 * (card surface, muted icon chip, short copy, pill CTAs) so unknown
 * URLs keep the site's design instead of the default framework page.
 * Answers the two empty-state questions: what happened + what's next.
 */
export default function NotFound() {
  return (
    <div className="min-h-[70vh] bg-page text-ink flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center bg-card rounded-3xl border border-line p-8 sm:p-10 shadow-sm">
        <div className="w-14 h-14 rounded-2xl border border-line bg-page text-mut flex items-center justify-center mx-auto mb-4">
          <Compass className="w-7 h-7" aria-hidden="true" />
        </div>
        <h1 className="text-lg sm:text-xl font-black text-ink tracking-tight">Page not found</h1>
        <p className="text-xs sm:text-sm text-mut mt-1.5 max-w-sm mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2.5 flex-wrap">
          <Link
            href="/explore"
            className="btn-cta inline-flex items-center justify-center h-11 px-6 rounded-full text-xs font-bold"
          >
            Explore Apps
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center h-11 px-6 rounded-full border border-line bg-card text-ink text-xs font-bold hover:border-ink/25 transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
