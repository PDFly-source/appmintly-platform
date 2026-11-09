import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/lib/ToastContext';
import { ThemeProvider, THEME_INIT_SCRIPT } from '@/lib/theme-context';
import { appearanceInitScript, readPublishedTheme, THEME_IDS } from '@/lib/appearance/themes';
import appearanceConfig from '@/data/appearance.json';
import { CatalogProvider } from '@/lib/CatalogContext';
import { Navbar } from '@/components/Navbar';
import { BottomNav } from '@/components/BottomNav';
import { Footer } from '@/components/Footer';
import { PWAInstallBanner } from '@/components/PWAInstallBanner';
import { SystemStatus } from '@/components/SystemStatus';
import { NotificationsProvider } from '@/components/NotificationsProvider';

import { SITE_URL } from '@/lib/site-url';
import { BrandSplash } from '@/components/brand/BrandSplash';

// Base path is '' for local/server deployments and '/appmintly-platform' for
// the static GitHub Pages build (injected at build time).
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Google Search Console ownership (Phase: SEO). Read at build time from the
  // CI secret; the value is public by design (it is emitted into the HTML head).
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION_TOKEN },
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
  viewportFit: 'cover',
};

const publishedTheme = readPublishedTheme(appearanceConfig);

/** The live-sync script validates the published id. It is built from the
 *  registry, not typed out: a hardcoded list here silently rejected every new
 *  palette and reverted the page to the baked theme seconds after load. */
const liveThemePattern = `^(${THEME_IDS.join('|')})$`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className="scroll-smooth"
      suppressHydrationWarning
      data-theme={publishedTheme ?? undefined}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: appearanceInitScript('public') }} />
        {/* Authoritative runtime theme: the Durable Object is the source of truth,
            so a publisher change reaches every open session within ~3s with no
            rebuild. The server-rendered data-theme stays as the first-paint value. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var E='https://appmintly-publisher-api.sbn50088.workers.dev/public/appearance';var ok=new RegExp('${liveThemePattern}');function a(t){if(t&&ok.test(t)&&document.documentElement.getAttribute('data-theme')!==t){document.documentElement.setAttribute('data-theme',t);}}function p(){fetch(E,{cache:'no-store'}).then(function(r){return r.json();}).then(function(d){if(d&&d.theme){a(d.theme);}}).catch(function(){});}p();setInterval(p,3000);document.addEventListener('visibilitychange',function(){if(!document.hidden){p();}});window.addEventListener('focus',p);}catch(e){}})();`,
          }}
        />
        <link rel="icon" href={`${BASE_PATH}/favicon.ico`} sizes="any" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="min-h-screen bg-page text-ink font-sans antialiased selection:bg-forge-red/20 selection:text-accent-text">
      <BrandSplash />
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
        <ThemeProvider>
        <ToastProvider>
          <NotificationsProvider>
          <CatalogProvider>
            <div className="flex min-h-screen flex-col">
              <PWAInstallBanner />
              <Navbar />
              <main className="flex-1 pb-16 md:pb-0">
                {children}
              </main>
              <Footer />
              <BottomNav />
              <SystemStatus />
            </div>
          </CatalogProvider>
          </NotificationsProvider>
        </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
