import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/lib/ToastContext';
import { CatalogProvider } from '@/lib/CatalogContext';
import { Navbar } from '@/components/Navbar';
import { BottomNav } from '@/components/BottomNav';
import { Footer } from '@/components/Footer';
import { PWAInstallBanner } from '@/components/PWAInstallBanner';

export const SITE_URL = 'https://pdfly-source.github.io/appmintly-platform/';

// Base path is '' for local/server deployments and '/appmintly-platform' for
// the static GitHub Pages build (injected at build time).
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'AppMintly - Discover. Install. Experience.',
  description: 'AppMintly is a digital marketplace for Apps, Web Apps, Games, Tools, and Websites. Your digital world, one place.',
  manifest: `${BASE_PATH}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${BASE_PATH}/favicon.ico` },
      { url: `${BASE_PATH}/icon-32.png`, sizes: '32x32', type: 'image/png' },
      { url: `${BASE_PATH}/icon-192.png`, sizes: '192x192', type: 'image/png' },
    ],
    shortcut: `${BASE_PATH}/favicon.ico`,
    apple: `${BASE_PATH}/apple-touch-icon.png`,
  },
  openGraph: {
    title: 'AppMintly — Discover. Install. Experience.',
    description: 'Discover, install, and experience Apps, Web Apps, Games, Tools, and Websites — all in one digital marketplace.',
    url: SITE_URL,
    siteName: 'AppMintly',
    images: [
      {
        url: '/brand/appmintly-logo-full.png',
        width: 900,
        height: 900,
        alt: 'AppMintly — Discover. Install. Experience.',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AppMintly - Discover. Install. Experience.',
    description: 'Your digital world, one place. Discover, install, and experience Apps, Web Apps, Games, Tools, and Websites.',
    images: ['/brand/appmintly-logo-full.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#E52B32',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="icon" href={`${BASE_PATH}/favicon.ico`} sizes="any" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="min-h-screen bg-[#F8F2E7] text-[#17191C] font-sans antialiased selection:bg-[#E52B32]/20 selection:text-[#E52B32]">
        {/* Sitewide structured data: marketplace Organization + WebSite */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'Organization',
                  '@id': `${SITE_URL}#organization`,
                  name: 'AppMintly',
                  url: SITE_URL,
                  slogan: 'Discover. Install. Experience.',
                  description:
                    'AppMintly is a digital marketplace for apps, web apps, PWAs, games, tools, and websites.',
                },
                {
                  '@type': 'WebSite',
                  '@id': `${SITE_URL}#website`,
                  url: SITE_URL,
                  name: 'AppMintly',
                  publisher: { '@id': `${SITE_URL}#organization` },
                  potentialAction: {
                    '@type': 'SearchAction',
                    target: {
                      '@type': 'EntryPoint',
                      urlTemplate: `${SITE_URL}search?q={search_term_string}`,
                    },
                    'query-input': 'required name=search_term_string',
                  },
                },
              ],
            }),
          }}
        />
        <ToastProvider>
          <CatalogProvider>
            <div className="flex min-h-screen flex-col">
              <PWAInstallBanner />
              <Navbar />
              <main className="flex-1 pb-16 md:pb-0">
                {children}
              </main>
              <Footer />
              <BottomNav />
            </div>
          </CatalogProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
