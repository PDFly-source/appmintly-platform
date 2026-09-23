import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/lib/ToastContext';
import { CatalogProvider } from '@/lib/CatalogContext';
import { Navbar } from '@/components/Navbar';
import { BottomNav } from '@/components/BottomNav';
import { Footer } from '@/components/Footer';
import { PWAInstallBanner } from '@/components/PWAInstallBanner';

export const metadata: Metadata = {
  title: 'APPFORGE - Discover. Install. Experience.',
  description: 'The independent digital application marketplace for Android APKs, Web Apps, PWAs, Games, and Tools.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/appforge-logo.svg',
  },
  openGraph: {
    title: 'APPFORGE - Discover. Install. Experience.',
    description: 'Discover, download, and experience verified Android APKs, Web Apps, PWAs, and developer tools.',
    url: 'https://appforge.dev',
    siteName: 'APPFORGE',
    images: [
      {
        url: '/appforge-logo.svg',
        width: 800,
        height: 600,
        alt: 'APPFORGE Official Logo',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'APPFORGE - Discover. Install. Experience.',
    description: 'Independent digital application marketplace for Android APKs, Web Apps, PWAs, and Games.',
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
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="min-h-screen bg-[#F8F2E7] text-[#17191C] font-sans antialiased selection:bg-[#E52B32]/20 selection:text-[#E52B32]">
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
