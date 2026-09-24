// Base path is '' for local/server deployments and '/appmintly-platform' for
// the static GitHub Pages build (injected at build time).
// Use apiUrl() for all client-side API calls so they resolve under Pages.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const apiUrl = (path: string): string => `${BASE_PATH}${path}`;
