'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  Briefcase,
  Wrench,
  Cpu,
  Gamepad2,
  Globe,
  GraduationCap,
  DollarSign,
  HeartPulse,
  ShoppingBag,
  Film,
  MessageSquare,
  Sparkles,
  Box
} from 'lucide-react';
import { CATEGORIES } from '@/data/categories';
import { useCatalog } from '@/lib/CatalogContext';
import { AppCard } from '@/components/AppCard';

const ICON_MAP: Record<string, any> = {
  Briefcase,
  Wrench,
  Cpu,
  Gamepad2,
  Globe,
  GraduationCap,
  DollarSign,
  HeartPulse,
  ShoppingBag,
  Film,
  MessageSquare,
  Sparkles,
  Box,
};

function renderCategoryIcon(iconKey?: string, className = 'w-7 h-7') {
  const IconComponent = (iconKey && ICON_MAP[iconKey]) || Box;
  return <IconComponent className={className} />;
}

export default function CategoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = (params?.slug as string || '').toLowerCase().trim();

  const { publishedApps, getCategoryApps } = useCatalog();

  const category = CATEGORIES.find(
    (c) => c.slug.toLowerCase() === slug || c.name.toLowerCase() === slug
  );

  const categoryName = category ? category.name : slug.charAt(0).toUpperCase() + slug.slice(1);
  const matchingApps = getCategoryApps(category ? category.slug : slug);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Back Button */}
      <div className="mb-6">
        <Link
          href="/categories"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-mut hover:text-ink transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>All Categories</span>
        </Link>
      </div>

      {/* Category Header */}
      <div className="p-6 sm:p-8 rounded-3xl bg-card border border-line mb-8 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs"
            style={{
              backgroundColor: category?.bgColor || 'rgba(25, 118, 243, 0.08)',
              border: `1px solid ${category?.borderColor || 'rgba(25, 118, 243, 0.25)'}`,
              color: category?.color || '#1976F3',
            }}
          >
            {renderCategoryIcon(category?.icon, 'w-7 h-7')}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-black uppercase tracking-wider text-mut">
                Category
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-page text-mut border border-line">
                {matchingApps.length} {matchingApps.length === 1 ? 'app' : 'apps'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-ink tracking-tight">
              {categoryName}
            </h1>
            <p className="text-xs sm:text-sm text-mut mt-1 max-w-xl leading-relaxed">
              {category?.description || `Explore top verified ${categoryName} applications in the AppMintly marketplace.`}
            </p>
          </div>
        </div>

        <Link
          href={`/explore?category=${encodeURIComponent(category?.slug || slug)}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-inkbg hover:bg-[#E52B32] text-white text-xs font-bold transition shadow-xs self-start md:self-auto"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search in {categoryName}</span>
        </Link>
      </div>

      {/* Grid of Apps */}
      {matchingApps.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {matchingApps.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 sm:py-24 px-4 bg-card rounded-3xl border border-line">
          <div className="w-16 h-16 rounded-2xl bg-[#E52B32]/10 text-[#E52B32] flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8" />
          </div>
          <h3 className="text-lg sm:text-xl font-black text-ink tracking-tight">
            No applications in {categoryName} yet
          </h3>
          <p className="text-xs sm:text-sm text-mut mt-1 max-w-sm mx-auto">
            Check back soon as developers publish new software to AppMintly, or publish your own app today.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <Link
              href="/explore"
              className="px-5 py-2.5 rounded-full bg-inkbg text-white text-xs font-bold transition"
            >
              Explore All Apps
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
