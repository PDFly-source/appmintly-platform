import type { Metadata } from 'next';
import { Bug } from 'lucide-react';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import SubmissionForm from '@/components/services/SubmissionForm';

export const metadata: Metadata = {
  title: 'Report an Issue - AppMintly',
  description:
    'Report a broken download, incorrect information, or a layout problem on the AppMintly marketplace.',
  alternates: {
    canonical: `https://pdfly-source.github.io/appmintly-platform/services/report-issue${CANONICAL_TRAILING_SLASH}`,
  },
};

export default function ReportIssuePage() {
  return (
    <div className="min-h-screen bg-page text-ink">
      <div className="px-4 sm:px-6 max-w-[760px] mx-auto py-12">
        <div className="flex items-center gap-2.5 mb-2">
          <Bug className="w-6 h-6 text-[#16A765]" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Report an Issue</h1>
        </div>
        <p className="text-sm text-mut mb-8">
          Found something broken or incorrect? Send the details and we&apos;ll review it.
        </p>

        <SubmissionForm
          submissionType="issue_report"
          submitLabel="Submit Report"
          successTitle="Report received"
          successMessage="Thanks — the issue has been submitted for review."
          fields={[
            {
              name: 'issue_type',
              label: 'Issue type *',
              required: true,
              kind: 'select',
              options: [
                'Broken download',
                'Broken link',
                'Incorrect app information',
                'Incorrect version',
                'Incorrect screenshot',
                'UI / layout problem',
                'Other',
              ],
              placeholder: 'Choose an issue type',
            },
            {
              name: 'app_name',
              label: 'App name',
              placeholder: 'For example: PDFMiniFly',
              hint: 'Optional — if the issue is about a specific app.',
            },
            {
              name: 'app_version',
              label: 'App version',
              placeholder: 'For example: 2.1.1',
            },
            {
              name: 'page_url',
              label: 'Page URL',
              placeholder: 'https://pdfly-source.github.io/appmintly-platform/...',
              hint: 'Optional — the page where you saw the problem.',
            },
            {
              name: 'what_happened',
              label: 'What happened? *',
              required: true,
              kind: 'textarea',
              rows: 4,
              placeholder: 'What you did and what went wrong.',
            },
            {
              name: 'expected',
              label: 'What did you expect? *',
              required: true,
              kind: 'textarea',
              rows: 3,
              placeholder: 'What you expected to happen instead.',
            },
            {
              name: 'device',
              label: 'Device / browser',
              placeholder: 'For example: Pixel 7, Chrome',
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
          Reports are reviewed by the AppMintly team against the current production deployment.
          Nothing changes until a fix is verified — production apps and downloads stay untouched.
        </p>
      </div>
    </div>
  );
}
