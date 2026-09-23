import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'APPFORGE',
    short_name: 'APPFORGE',
    description: 'Discover. Install. Experience.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#F8F2E7',
    theme_color: '#17191C',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/appforge-logo.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/appforge-logo.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'any',
      }
    ],
  };
}
