import type { Metadata } from 'next';
import { PackagePlus } from 'lucide-react';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import { CATEGORIES } from '@/data/categories';
import SubmissionForm from '@/components/services/SubmissionForm';

export const metadata: Metadata = {
  title: 'Request an App - AppMintly',
  description:
    'Request an app, tool, or web app for the AppMintly marketplace. Requests are reviewed by the AppMintly team.',
  alternates: {
    canonical: `https://appmintly.pages.dev/services/request-app${CANONICAL_TRAILING_SLASH}`,
  },
};

export default function RequestAppPage() {
  return (
    <div className="min-h-screen bg-page text-ink">
      <div className="px-4 sm:px-6 max-w-[760px] mx-auto py-12">
        <div className="flex items-center gap-2.5 mb-2">
          <PackagePlus className="w-6 h-6 text-[#16A765]" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Request an App</h1>
        </div>
        <p className="text-sm text-mut mb-8">
          Tell us which app, tool, or web app you&apos;d like to see in AppMintly.
        </p>

        <SubmissionForm
          submissionType="request_app"
          submitLabel="Submit Request"
          successTitle="Request received"
          successMessage="Thanks — your request has been sent to the AppMintly team."
          fields={[
            {
              name: 'app_name',
              label: 'App name *',
              required: true,
              placeholder: 'For example: Flashcard Trainer',
            },
            {
              name: 'app_link',
              label: 'App link / website',
              placeholder: 'https://example.com',
              hint: 'Optional — if the app already exists somewhere.',
            },
            {
              name: 'format',
              label: 'Desired format *',
              required: true,
              kind: 'select',
              options: ['Android APK', 'PWA', 'Web App', 'Web Game'],
              placeholder: 'Choose a format',
            },
            {
              name: 'category',
              label: 'Category',
              kind: 'select',
              options: CATEGORIES.map((c) => c.name),
              placeholder: 'Choose a category',
            },
            {
              name: 'use_case',
              label: 'What would you use it for? *',
              required: true,
              kind: 'textarea',
              rows: 4,
              placeholder: 'A short use case helps us prioritize the right apps.',
            },
            {
              name: 'details',
              label: 'Additional details',
              kind: 'textarea',
              rows: 3,
              placeholder: 'Anything else worth knowing (optional).',
            },
            {
              name: 'email',
              label: 'Email',
              autoComplete: 'email',
              placeholder: 'you@example.com',
              hint: 'Optional — only used if the team needs to follow up.',
            },
          ]}
        />

        <p className="mt-8 text-xs text-mut leading-relaxed">
          Requests are wishes, not orders: publishing depends on a publisher deciding to build and
          release the app, and every published app still goes through the marketplace&apos;s
          verification practices. There is no queue position or delivery date.
        </p>
      </div>
    </div>
  );
}
