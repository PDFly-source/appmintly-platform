/**
 * Phase 16.12 — native AppMintly service submissions.
 *
 * The public marketplace posts submissions to the AppMintly submission
 * endpoint (Base44 backend function, anonymous, CORS-enabled). This URL
 * is the ONLY thing the public browser holds: no keys, no tokens, no
 * secrets. Validation, spam protection and storage all happen
 * server-side (see functions/submitServiceSubmission.ts).
 *
 * Admin side: submissions land in the private ServiceSubmission entity,
 * which only the AppMintly administrator's agent can read and manage.
 */
export const SERVICE_SUBMISSION_ENDPOINT =
  'https://base44.app/api/apps/6ab566cd2d475b7ce1e8b13e/functions/submitServiceSubmission';
