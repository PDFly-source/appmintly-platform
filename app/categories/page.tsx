'use client';

import React from 'react';
import Link from 'next/link';
import {
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
  ArrowRight
} from 'lucide-react';
import { CATEGORIES, CategoryItem } from '@/data/categories';
import { useCatalog } from '@/lib/CatalogContext';

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

export default function CategoriesPage() {
  const { publishedApps } = useCatalog();

  const getCount = (catName: string, catSlug: string) => {
    const nameLower = catName.toLowerCase().trim();
    const slugLower = catSlug.toLowerCase().trim();

    return publishedApps.filter((a) => {
      const appCat = (a.category || '').toLowerCase().trim();
      return (
        appCat === nameLower ||
        appCat === slugLower ||
        appCat.replace(/\s+/g, '-') === slugLower
      );
    }).length;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8 sm:mb-12 max-w-2xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFFDF8] border border-[#E8DED0] text-xs font-bold text-[#17191C] mb-3">
          <span>Catalog Taxonomy</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-[#17191C] tracking-tight">
          Browse by Category
        </h1>
        <p className="text-sm sm:text-base text-[#6F6F6F] mt-2 leading-relaxed">
          Navigate curated collections across education, productivity, tools, utilities, mobile apps, and games.
        </p>
      </div>

      {/* Grid of Categories */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {CATEGORIES.map((cat) => {
          const Icon = ICON_MAP[cat.icon] || Box;
          const count = getCount(cat.name, cat.slug);

          return (
            <Link
              key={cat.id}
              href={`/category/${encodeURIComponent(cat.slug)}`}
              className="group relative flex flex-col justify-between p-6 rounded-3xl bg-[#FFFDF8] border border-[#E8DED0] hover:border-[#17191C]/40 hover:shadow-md transition-all duration-300"
            >
              <div>
                {/* Category Icon Badge */}
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 duration-300"
                  style={{
                    backgroundColor: cat.bgColor,
                    border: `1px solid ${cat.borderColor}`,
                    color: cat.color,
                  }}
                >
                  <Icon className="w-6 h-6" />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-black text-[#17191C] group-hover:text-[#1976F3] transition-colors">
                    {cat.name}
                  </h3>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#F8F2E7] text-[#6F6F6F] border border-[#E8DED0]">
                    {count} {count === 1 ? 'app' : 'apps'}
                  </span>
                </div>

                <p className="text-xs text-[#6F6F6F] mt-2 leading-relaxed">
                  {cat.description}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-[#E8DED0]/60 flex items-center justify-between text-xs font-bold text-[#17191C]">
                <span>View {cat.name}</span>
                <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
