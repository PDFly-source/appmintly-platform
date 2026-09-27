import type { Metadata } from 'next';
import { Lightbulb } from 'lucide-react';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import SubmissionForm from '@/components/services/SubmissionForm';

export const metadata: Metadata = {
  title: 'Suggest a Feature - AppMintly',
  description:
    'Suggest a feature for the AppMintly marketplace. Ideas are reviewed by the AppMintly team.',
  alternates: {
    canonical: `https://appmintly.pages.dev/services/suggest-feature${CANONICAL_TRAILING_SLASH}`,
  },
};

export default function SuggestFeaturePage() {
  return (
    <div className="min-h-screen bg-page text-ink">
      <div className="px-4 sm:px-6 max-w-[760px] mx-auto py-12">
        <div className="flex items-center gap-2.5 mb-2">
          <Lightbulb className="w-6 h-6 text-[#16A765]" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Suggest a Feature</h1>
        </div>
        <p className="text-sm text-mut mb-8">
          Have an idea that could make AppMintly better? Tell us what problem you want to solve.
        </p>

        <SubmissionForm
          submissionType="feature_suggestion"
          submitLabel="Submit Suggestion"
          successTitle="Suggestion received"
          successMessage="Thanks — your idea has been sent to the AppMintly team."
          fields={[
            {
              name: 'feature_title',
              label: 'Feature title *',
              required: true,
              placeholder: 'A short, clear title',
            },
            {
              name: 'problem',
              label: 'What problem would this solve? *',
              required: true,
              kind: 'textarea',
              rows: 4,
              placeholder: 'Describe the problem you keep running into.',
            },
            {
              name: 'where',
              label: 'Where should it work?',
              kind: 'select',
              options: ['Home', 'Explore', 'Categories', 'Library', 'App Details', 'Services', 'Other'],
              placeholder: 'Choose an area',
            },
            {
              name: 'solution',
              label: 'Suggested solution',
              kind: 'textarea',
              rows: 3,
              placeholder: 'Optional — how you imagine it working.',
            },
            {
              name: 'reference_link',
              label: 'Reference link',
              placeholder: 'https://example.com',
              hint: 'Optional — an example of the idea elsewhere.',
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
          Suggestions shape what gets built next, but there is no promise of implementation or a
          timeline. Every idea is read and considered alongside the marketplace roadmap.
        </p>
      </div>
    </div>
  );
}
