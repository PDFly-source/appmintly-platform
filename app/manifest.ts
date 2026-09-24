import type { MetadataRoute } from 'next';

// Base path is injected by the Pages deployment workflow; root for local/server builds.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: `${BASE}/`,
    name: 'AppMintly',
    short_name: 'AppMintly',
    description: 'Discover. Install. Experience. Your digital world, one place — Apps, Web Apps, Games, Tools, and Websites.',
    start_url: `${BASE}/`,
    scope: `${BASE}/`,
    display: 'standalone',
    background_color: '#F8F2E7',
    theme_color: '#17191C',
    icons: [
      {
        src: `${BASE}/icon-192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${BASE}/icon-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${BASE}/icon-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
