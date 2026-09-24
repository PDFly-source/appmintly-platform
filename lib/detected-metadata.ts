// Shared metadata-detection types. Extracted from the /api/analyze-url route
// so client components (publisher) can import them without depending on the
// API route module (which is excluded from static GitHub Pages builds).

export interface DetectedMetadata {
  url: string;
  name: string;
  shortName: string;
  developer: string;
  description: string;
  shortDescription: string;
  icon: string;
  icons: { src: string; sizes?: string; type?: string; purpose?: string }[];
  screenshots: string[];
  themeColor: string;
  backgroundColor: string;
  type: 'PWA' | 'Web App' | 'Website' | 'Android APK' | 'Web Game' | 'Tool';
  category: string;
  version: string;
  manifestUrl: string;
  startUrl: string;
  scope: string;
  pwa: {
    detected: boolean;
    installable: boolean;
    manifestDetected: boolean;
    serviceWorkerDetected: boolean | null;
    statusSummary: 'PWA Ready' | 'PWA Metadata Found' | 'Web App Only' | 'Unable to Verify';
  };
  detectionSummary: {
    nameDetected: boolean;
    descriptionDetected: boolean;
    iconDetected: boolean;
    manifestFound: boolean;
    screenshotsFound: boolean;
    serviceWorkerIndicator: boolean;
  };
}
