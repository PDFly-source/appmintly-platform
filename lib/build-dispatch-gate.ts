/**
 * Pre-dispatch safety gate + authoritative GitHub Actions status mapping.
 *
 * Phase 7.6 correctness layer. Two independent problems are solved here:
 *
 * 1. REACT CONTROLLED-INPUT DIVERGENCE
 *    In Phase 7.5, browser automation wrote values directly into DOM inputs
 *    without triggering React's controlled-input state updates. The visible
 *    input showed "AppMintly Smoke Test" while React state (and therefore the
 *    build payload) still held the wizard default "AppMintly".
 *    Every payload-relevant input is tagged with `data-build-field`. Before
 *    any step transition that unmounts those inputs — and before any build
 *    dispatch — the live DOM value is compared against the React state value
 *    that will be sent. Any mismatch BLOCKS the transition / dispatch.
 *    Only real user input (or automation that dispatches proper input/change
 *    events) can ever pass this gate.
 *
 * 2. STALE BUILD STATUS
 *    Phase 7.5 also showed the console stuck on "QUEUED" after the real
 *    GitHub Actions run had already completed with success. GitHub Actions
 *    is the ONLY authoritative source for build state. `mapGitHubRunStatus`
 *    translates GitHub's status/conclusion into the console states and is
 *    used by the polling loop; the console never invents progress or
 *    success from a local timer.
 */

export type BuildUiState = 'QUEUED' | 'BUILDING' | 'SUCCESS' | 'FAILED';

/**
 * Map authoritative GitHub Actions run status/conclusion to console UI state.
 *
 *   queued                -> QUEUED
 *   in_progress           -> BUILDING
 *   completed + success   -> SUCCESS
 *   completed + failure   -> FAILED
 *   completed + cancelled -> FAILED
 *   completed + timed_out  -> FAILED
 *   completed + anything else (neutral, action_required, startup_failure,
 *   skipped) -> FAILED (terminal, no release artifact was produced)
 *
 * Unknown / missing status is treated as QUEUED (non-terminal, never
 * fabricated as SUCCESS or FAILED).
 */
export function mapGitHubRunStatus(status: unknown, conclusion?: unknown): BuildUiState {
  const s = String(status ?? '').toLowerCase();
  const c = String(conclusion ?? '').toLowerCase();
  if (s === 'completed') {
    return c === 'success' ? 'SUCCESS' : 'FAILED';
  }
  if (s === 'in_progress') return 'BUILDING';
  return 'QUEUED'; // queued, waiting, pending, requested, unknown
}

export interface FieldMismatch {
  field: string;
  domValue: string;
  expectedValue: string;
}

/**
 * Read every currently-mounted input tagged with `data-build-field`.
 * Returns a map of field name -> live DOM value (trimmed).
 * Browser-only; returns an empty map when document is unavailable (SSR/tests).
 */
export function collectDomFieldValues(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const values: Record<string, string> = {};
  document
    .querySelectorAll<HTMLInputElement>('input[data-build-field]')
    .forEach((el) => {
      const field = el.getAttribute('data-build-field');
      if (field) values[field] = (el.value ?? '').trim();
    });
  return values;
}

/**
 * Compare live DOM (UI) values against the React-state values that will be
 * used for the build payload. Only fields currently present in the DOM are
 * compared; unmounted inputs have no live UI value to verify.
 * Returns every mismatch — an empty list means UI == React state == payload
 * for all visible fields.
 */
export function findFieldMismatches(
  domValues: Record<string, string>,
  expectedValues: Record<string, string>
): FieldMismatch[] {
  const mismatches: FieldMismatch[] = [];
  for (const field of Object.keys(domValues)) {
    const expected = expectedValues[field];
    if (expected === undefined) continue;
    const domValue = String(domValues[field] ?? '').trim();
    if (domValue !== String(expected).trim()) {
      mismatches.push({ field, domValue, expectedValue: String(expected).trim() });
    }
  }
  return mismatches;
}

export interface DispatchGateResult {
  pass: boolean;
  mismatches: FieldMismatch[];
  message: string;
}

/**
 * Full pre-dispatch assertion: the visible UI target must equal the React
 * state, and the React state must equal the exact payload that would be sent
 * to the build service. Any divergence blocks the dispatch (the caller MUST
 * NOT call the build service, dispatch a workflow, or create a release).
 */
export function assertDispatchTargets(
  payload: Record<string, string>,
  reactState: Record<string, string>,
  domValues?: Record<string, string>
): DispatchGateResult {
  // 1. React state must equal the outgoing payload for every payload field.
  const stateMismatches: FieldMismatch[] = [];
  for (const field of Object.keys(payload)) {
    const stateValue = reactState[field];
    if (stateValue === undefined) continue; // not a state-backed field (e.g. derived)
    if (String(stateValue).trim() !== String(payload[field]).trim()) {
      stateMismatches.push({ field, domValue: '(react state)', expectedValue: String(payload[field]).trim() });
    }
  }
  // 2. Visible UI values must equal the outgoing payload.
  const uiMismatches = findFieldMismatches(domValues ?? collectDomFieldValues(), payload);

  const mismatches = [...uiMismatches, ...stateMismatches];
  if (mismatches.length === 0) {
    return { pass: true, mismatches: [], message: 'Pre-dispatch validation passed: UI, React state and payload are identical.' };
  }
  return {
    pass: false,
    mismatches,
    message:
      'Build dispatch BLOCKED — form state and visible input values do not match the build payload: ' +
      mismatches.map((m) => `${m.field} (UI/state: "${m.domValue}" vs payload: "${m.expectedValue}")`).join('; ') +
      '. Re-type the values normally so the form registers them, then try again.',
  };
}

export interface GitHubRunInfo {
  apiBaseUrl: string;
  runUrl: string;
}

/**
 * Extract the public, unauthenticated GitHub Actions run API URL from a run's
 * HTML URL (e.g. https://github.com/owner/repo/actions/runs/12345). The
 * repository is public, so the Actions API is publicly readable and the
 * browser can poll the authoritative state without any token or secret.
 */
export function extractGitHubRunApiUrl(runUrl: string | null | undefined): GitHubRunInfo | null {
  if (!runUrl) return null;
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)$/.exec(runUrl.trim());
  if (!m) return null;
  const [, owner, repo, runId] = m;
  return { apiBaseUrl: `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`, runUrl: runUrl.trim() };
}
