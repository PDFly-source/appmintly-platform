import { AppItem, getPublishedApps } from './apps';

export interface AppCollection {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  appIds?: string[];
  filterFn?: (app: AppItem) => boolean;
}

export const COLLECTIONS: AppCollection[] = [
  {
    id: 'featured-spotlight',
    title: 'Featured Apps',
    subtitle: 'Hand-picked applications crafted with attention to performance, design, and privacy.',
    badge: 'FEATURED',
    badgeColor: '#E52B32',
    filterFn: (app) => app.featured,
  },
  {
    id: 'education-learning',
    title: 'Education & Knowledge',
    subtitle: 'Structured learning, exam preparation, and academic resources.',
    badge: 'EDUCATION',
    badgeColor: '#16A765',
    filterFn: (app) => app.category.toLowerCase() === 'education',
  },
  {
    id: 'tools-utilities',
    title: 'Tools & Utilities',
    subtitle: 'Instant sandboxes, document converters, and offline utilities built for makers.',
    badge: 'TOOLS',
    badgeColor: '#1976F3',
    filterFn: (app) => app.type === 'Tool' || app.category.toLowerCase() === 'tools' || app.category.toLowerCase() === 'utilities',
  },
  {
    id: 'android-apks',
    title: 'Direct Android APKs',
    subtitle: 'Verified Android packages with zero tracking and direct download.',
    badge: 'APK',
    badgeColor: '#16A765',
    filterFn: (app) => app.type === 'Android APK',
  }
];

export function getAppsForCollection(collectionId: string, catalog?: AppItem[]): AppItem[] {
  const published = getPublishedApps(catalog);
  const col = COLLECTIONS.find((c) => c.id === collectionId);
  if (!col) return [];

  if (col.filterFn) {
    const matched = published.filter(col.filterFn);
    if (matched.length > 0) return matched;
  }

  if (col.appIds && col.appIds.length > 0) {
    return col.appIds
      .map((id) => published.find((a) => a.id.toLowerCase() === id.toLowerCase() || a.slug.toLowerCase() === id.toLowerCase()))
      .filter((a): a is AppItem => Boolean(a));
  }

  return [];
}
