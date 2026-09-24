// Shared JSON API client for same-origin Next.js API routes.
//
// On static GitHub Pages hosting the /api routes do not exist and the CDN
// returns HTML pages (404/405) instead of JSON. This helper verifies the
// response before parsing so HTML is never parsed as JSON, and returns a
// truthful "service unavailable" diagnostic instead of a parser error.

export interface ApiJsonResult<T = any> {
  ok: boolean;
  status: number;
  isJson: boolean;
  /** True when the endpoint did not return a usable JSON response. */
  unavailable: boolean;
  data?: T;
  error?: string;
}

export const API_UNAVAILABLE_MESSAGE =
  'This service is not available on the current static deployment (no server-side API endpoint is reachable).';

export async function fetchJson<T = any>(path: string, init?: RequestInit): Promise<ApiJsonResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (e: any) {
    return {
      ok: false,
      status: 0,
      isJson: false,
      unavailable: true,
      error: 'Network request failed: ' + (e?.message || 'unknown error'),
    };
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok || !isJson) {
    return {
      ok: false,
      status: res.status,
      isJson,
      unavailable: !isJson,
      error: isJson ? `Request failed with HTTP ${res.status}` : API_UNAVAILABLE_MESSAGE,
    };
  }

  try {
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, isJson: true, unavailable: false, data };
  } catch {
    return {
      ok: false,
      status: res.status,
      isJson: true,
      unavailable: true,
      error: 'The service returned an invalid response.',
    };
  }
}
