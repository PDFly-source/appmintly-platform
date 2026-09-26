import type {NextConfig} from 'next';

// GitHub Pages project sites are served from a sub-path (e.g. /appmintly-platform/).
// NEXT_PUBLIC_BASE_PATH is set by the Pages deployment workflow; local/server
// deployments keep the default root path.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Static-export builds serve routes as directories on GitHub Pages
// (e.g. /appmintly-platform/explore/ -> explore/index.html). Next.js
// export-mode RSC prefetch maps a URL ending in '/' to '<route>/index.txt'
// and any other URL to '<route>.txt'. Without a trailing slash on the
// basePath, the ROOT route prefetch resolves to '<basePath>.txt' — a path
// that does not exist on GitHub Pages (404), because the root payload is
// at <basePath>/index.txt. `trailingSlash: true` makes every internal
// href (including the root '/'), render with a trailing slash, so the
// prefetch correctly resolves to index.txt for every route.
// Server/standalone builds (local dev + the marketplace build embedded in
// APKs) are unaffected: their prefetches use RSC headers, not .txt files.
const IS_EXPORT = process.env.NEXT_OUTPUT === 'export';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 'export' produces a fully static ./out directory for GitHub Pages.
  // 'standalone' remains the default for server deployments.
  output: process.env.NEXT_OUTPUT === 'export' ? 'export' : 'standalone',
  basePath: BASE_PATH,
  assetPrefix: BASE_PATH,
  // See the IS_EXPORT note above: fixes the root-route RSC prefetch 404
  // ('appmintly-platform.txt?_rsc=...') in static export builds only.
  trailingSlash: IS_EXPORT,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', // This allows any path under the hostname
      },
    ],
  },
  transpilePackages: ['motion'],
  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
