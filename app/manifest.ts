import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'AppMintly',
    short_name: 'AppMintly',
    description: 'Discover. Install. Experience. Your digital world, one place — Apps, Web Apps, Games, Tools, and Websites.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#F8F2E7',
    theme_color: '#17191C',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
