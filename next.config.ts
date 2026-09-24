import type {NextConfig} from 'next';

// GitHub Pages project sites are served from a sub-path (e.g. /appmintly-platform/).
// NEXT_PUBLIC_BASE_PATH is set by the Pages deployment workflow; local/server
// deployments keep the default root path.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 'export' produces a fully static ./out directory for GitHub Pages.
  // 'standalone' remains the default for server deployments.
  output: process.env.NEXT_OUTPUT === 'export' ? 'export' : 'standalone',
  basePath: BASE_PATH,
  assetPrefix: BASE_PATH,
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
