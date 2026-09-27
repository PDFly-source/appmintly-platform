/**
 * Phase 16.12 — native AppMintly service submissions.
 *
 * The public marketplace posts submissions to the AppMintly Publisher API
 * Worker's anonymous endpoint. This URL is the ONLY thing the public
 * browser holds: no keys, no tokens, no secrets. Validation, spam
 * protection (honeypot, time gate, per-IP + global KV rate limits,
 * duplicate protection) and storage (Workers KV namespace
 * APPMINTLY_SUBMISSIONS, binding SUBMISSIONS) all happen server-side in
 * the Worker (see the private appmintly-publisher repository).
 *
 * Admin side: submissions are managed in the existing private Publisher
 * Console's Service Inbox module (/console/service-inbox) behind the
 * existing session authentication. The public frontend never touches the
 * admin endpoints (/service-submission/list, /service-submission/update).
 */
export const SERVICE_SUBMISSION_ENDPOINT =
  'https://appmintly-publisher-api.sbn50088.workers.dev/service-submission';
