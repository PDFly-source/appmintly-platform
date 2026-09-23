'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  Layers,
  PlusCircle,
  FolderTree,
  Sparkles,
  Download,
  Upload,
  Copy,
  Check,
  Edit,
  Trash2,
  ExternalLink,
  Eye,
  CheckCircle2,
  FileCode,
  Smartphone,
  Globe,
  Gamepad2,
  Wrench,
  Search,
  Settings as SettingsIcon,
  X,
  ArrowRight,
  ArrowLeft,
  Info,
  ShieldCheck,
  RefreshCw,
  GitBranch,
  Terminal,
  AlertCircle,
  Sliders,
  ChevronRight,
  Save,
  CheckSquare
} from 'lucide-react';
import { AppItem, AppType } from '@/data/apps';
import { CATEGORIES } from '@/data/categories';
import { useCatalog } from '@/lib/CatalogContext';
import { useToast } from '@/lib/ToastContext';
import { AppCard } from '@/components/AppCard';
import { AppIcon } from '@/components/AppIcon';
import { IconManager } from '@/components/IconManager';
import { ScreenshotManager } from '@/components/ScreenshotManager';
import { ApkBuildCenter } from '@/components/ApkBuildCenter';
import { DetectedMetadata } from '@/app/api/analyze-url/route';

type WorkflowStep =
  | 'basic'
  | 'links'
  | 'icon'
  | 'apk'
  | 'screenshots'
  | 'description'
  | 'version'
  | 'preview'
  | 'publish';

export default function PublisherPage() {
  const { toast } = useToast();
  const { catalog, publishApp, deleteApp, refreshCatalog, isLoading } = useCatalog();

  // Active view: 'catalog' list or 'editor' (add/edit workflow)
  const [viewMode, setViewMode] = useState<'catalog' | 'editor'>('catalog');
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>('basic');
  const [publishedAppSuccess, setPublishedAppSuccess] = useState<AppItem | null>(null);

  // Search & filter in catalog list
  const [appSearch, setAppSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  // URL Analyzer State
  const [analyzerUrl, setAnalyzerUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [detectedData, setDetectedData] = useState<DetectedMetadata | null>(null);

  // Form State
  const emptyForm: AppItem = {
    id: '',
    name: '',
    shortName: '',
    slug: '',
    developer: 'APPFORGE Originals',
    shortDescription: '',
    description: '',
    icon: '',
    screenshots: [],
    banner: '',
    category: 'Tools',
    type: 'PWA',
    platform: ['Web Browser', 'Desktop', 'Mobile'],
    version: '1.0.0',
    previousVersion: '',
    releaseDate: '2026-03-23',
    lastUpdated: '2026-03-23',
    size: 'Installable Web App',
    status: 'Published',
    published: true,
    url: '',
    webUrl: '',
    pwaUrl: '',
    apkUrl: '',
    playStoreUrl: '',
    appStoreUrl: '',
    manifestUrl: '',
    startUrl: '',
    scope: '',
    themeColor: '#17191C',
    backgroundColor: '#FFFDF8',
    pwa: {
      detected: false,
      installable: false,
      manifestDetected: false,
      serviceWorkerDetected: null,
      statusSummary: 'Web App Only',
    },
    features: [],
    tags: [],
    releaseNotes: [],
    changelog: [],
    featured: false,
    original: true,
  };

  const [form, setForm] = useState<AppItem>(emptyForm);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [newFeatureInput, setNewFeatureInput] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [newReleaseNoteInput, setNewReleaseNoteInput] = useState('');

  // Launch Editor for New App
  const handleStartAddApp = () => {
    setForm(emptyForm);
    setIsEditingExisting(false);
    setWorkflowStep('links'); // Start at Links & Analyzer for instant magic
    setViewMode('editor');
    setDetectedData(null);
    setAnalysisError(null);
  };

  // Launch Editor for Existing App
  const handleEditApp = (app: AppItem) => {
    setForm({ ...app });
    setIsEditingExisting(true);
    setWorkflowStep('basic');
    setViewMode('editor');
    setDetectedData(null);
    setAnalysisError(null);
  };

  // Delete App from canonical catalog
  const handleDeleteApp = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to remove "${name}" from the canonical catalog?`)) {
      const ok = await deleteApp(id);
      if (ok) {
        toast(`Removed ${name} from catalog.`, 'info');
      } else {
        toast('Failed to delete application from catalog.', 'error');
      }
    }
  };

  // Quick Status change directly from catalog table
  const handleQuickStatusChange = async (app: AppItem, newStatus: string) => {
    const updated: AppItem = {
      ...app,
      status: newStatus as any,
      published: newStatus.toLowerCase() === 'published',
      updatedAt: new Date().toISOString(),
    };
    const ok = await publishApp(updated);
    if (ok) {
      toast(`Set "${app.name}" status to ${newStatus}.`, 'info');
    }
  };

  // Quick Featured toggle directly from catalog table
  const handleQuickFeaturedToggle = async (app: AppItem) => {
    const updated: AppItem = {
      ...app,
      featured: !app.featured,
      updatedAt: new Date().toISOString(),
    };
    const ok = await publishApp(updated);
    if (ok) {
      toast(`Turned Featured ${updated.featured ? 'ON' : 'OFF'} for "${app.name}".`, 'info');
    }
  };

  // Auto URL Analysis Engine
  const handleAnalyzeUrl = async (urlToAnalyze?: string) => {
    const target = (urlToAnalyze || analyzerUrl || form.url || '').trim();
    if (!target) {
      toast('Please enter a valid application URL.', 'error');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const res = await fetch('/api/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setAnalysisError(json.error || 'Failed to inspect application metadata.');
        toast('Analysis had partial restrictions. Check the discovered fields.', 'info');
        return;
      }

      const d: DetectedMetadata = json.data;
      setDetectedData(d);

      // Auto-generate clean slug
      const generatedSlug = (d.shortName || d.name || 'app')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      // Determine size label honestly (no fake MB)
      const honestSize = d.type === 'Android APK' ? 'APK Package' : 'Installable Web App';

      // Merge into form state
      setForm((prev) => ({
        ...prev,
        url: d.url,
        webUrl: d.url,
        pwaUrl: d.pwa.installable ? d.url : prev.pwaUrl,
        name: d.name || prev.name,
        shortName: d.shortName || prev.shortName,
        slug: prev.slug || generatedSlug,
        developer: d.developer || prev.developer,
        description: d.description || prev.description,
        shortDescription: d.shortDescription || prev.shortDescription,
        icon: d.icon || prev.icon,
        screenshots: d.screenshots.length > 0 ? d.screenshots : prev.screenshots,
        category: d.category || prev.category,
        type: d.type as AppType,
        version: d.version || prev.version,
        themeColor: d.themeColor || prev.themeColor,
        backgroundColor: d.backgroundColor || prev.backgroundColor,
        manifestUrl: d.manifestUrl || prev.manifestUrl,
        startUrl: d.startUrl || prev.startUrl,
        scope: d.scope || prev.scope,
        size: honestSize,
        pwa: {
          detected: d.pwa.detected,
          installable: d.pwa.installable,
          manifestDetected: d.pwa.manifestDetected,
          serviceWorkerDetected: d.pwa.serviceWorkerDetected,
          statusSummary: d.pwa.statusSummary,
        },
      }));

      toast(`Successfully analyzed ${d.name}! Metadata auto-filled.`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      setAnalysisError(msg);
      toast(`Analysis error: ${msg}`, 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Quick Test Fill: PDFMiniFly
  const handleQuickLoadPDFMiniFly = () => {
    const pdfUrl = 'https://pdfly-source.github.io/pdfly-app/';
    setAnalyzerUrl(pdfUrl);
    handleAnalyzeUrl(pdfUrl);
  };

  // Save App to Catalog
  const handleSaveAppToCatalog = async () => {
    // Validation
    if (!form.name.trim()) {
      toast('Application Name is required.', 'error');
      setWorkflowStep('basic');
      return;
    }
    const cleanSlug = form.slug.trim() || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    if (!form.url?.trim() && !form.webUrl?.trim() && !form.apkUrl?.trim()) {
      toast('At least one application URL or APK link is required.', 'error');
      setWorkflowStep('links');
      return;
    }

    const appToSave: AppItem = {
      ...form,
      slug: cleanSlug,
      id: form.id || cleanSlug,
      status: (form.status || 'published').toLowerCase() as 'published' | 'draft' | 'archived',
      published: (form.status || 'published').toLowerCase() === 'published',
      featured: Boolean(form.featured),
      lastUpdated: new Date().toISOString().split('T')[0],
      releaseDate: form.releaseDate || new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString(),
      isDemo: false,
    };

    const ok = await publishApp(appToSave);
    if (ok) {
      toast(`Published "${appToSave.name}" successfully!`, 'success');
      setPublishedAppSuccess(appToSave);
    } else {
      toast('Error saving application to catalog.', 'error');
    }
  };

  // Copy apps.json
  const handleCopyJson = () => {
    const jsonStr = JSON.stringify(catalog, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopiedJson(true);
    toast('Copied data/apps.json to clipboard!', 'success');
    setTimeout(() => setCopiedJson(false), 3000);
  };

  // Download apps.json
  const handleDownloadJson = () => {
    const jsonStr = JSON.stringify(catalog, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'apps.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('Downloaded apps.json. Place in /data/apps.json of your repository.', 'success');
  };

  // Step navigation items
  const steps: { id: WorkflowStep; label: string; number: number }[] = [
    { id: 'links', label: '1. App Link & Analysis', number: 1 },
    { id: 'basic', label: '2. Basic Info', number: 2 },
    { id: 'icon', label: '3. Icon Manager', number: 3 },
    { id: 'apk', label: '4. Android APK Build', number: 4 },
    { id: 'screenshots', label: '5. Screenshots', number: 5 },
    { id: 'description', label: '6. Features & Copy', number: 6 },
    { id: 'version', label: '7. Version & Updates', number: 7 },
    { id: 'preview', label: '8. Store Preview', number: 8 },
    { id: 'publish', label: '9. Publish & Deploy', number: 9 },
  ];

  // Filtered catalog list
  const filteredApps = useMemo(() => {
    return catalog.filter((a) => {
      const matchesSearch =
        a.name.toLowerCase().includes(appSearch.toLowerCase()) ||
        a.developer.toLowerCase().includes(appSearch.toLowerCase()) ||
        a.category.toLowerCase().includes(appSearch.toLowerCase());
      const matchesType = typeFilter === 'all' || a.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [catalog, appSearch, typeFilter]);

  return (
    <div className="min-h-screen bg-[#F8F2E7] text-[#17191C] pb-24">
      {/* Top Banner / Breadcrumb */}
      <header className="bg-[#FFFDF8] border-b border-[#E8DED0] sticky top-16 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-bold text-[#6F6F6F] hover:text-[#17191C] transition"
            >
              &larr; Storefront
            </Link>
            <span className="text-[#E8DED0] font-bold">/</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#16A765]" />
              <h1 className="text-sm font-black text-[#17191C] tracking-tight">
                Publisher Console
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                await refreshCatalog();
                toast('Refreshed canonical catalog from server.', 'info');
              }}
              className="px-3.5 py-1.5 rounded-full bg-[#FFFDF8] hover:bg-white text-xs font-bold text-[#17191C] border border-[#E8DED0] transition flex items-center gap-1.5 cursor-pointer"
              title="Refresh Catalog"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#1976F3]' : ''}`} />
              <span>Refresh</span>
            </button>

            {viewMode === 'editor' ? (
              <button
                type="button"
                onClick={() => setViewMode('catalog')}
                className="px-4 py-1.5 rounded-full bg-[#F8F2E7] hover:bg-[#E8DED0] text-xs font-bold text-[#17191C] border border-[#E8DED0] transition cursor-pointer"
              >
                Back to Catalog
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartAddApp}
                className="px-4 py-1.5 rounded-full bg-[#17191C] hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Add Application</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyJson}
              className="px-3.5 py-1.5 rounded-full bg-[#FFFDF8] hover:bg-white text-xs font-bold text-[#17191C] border border-[#E8DED0] transition flex items-center gap-1.5 cursor-pointer"
              title="Export current catalog JSON"
            >
              {copiedJson ? <Check className="w-3.5 h-3.5 text-[#16A765]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedJson ? 'Copied' : 'Export JSON'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        {/* ========================================================================= */}
        {/* VIEW 1: CATALOG OVERVIEW                                                  */}
        {/* ========================================================================= */}
        {viewMode === 'catalog' && (
          <div className="space-y-6">
            {/* Publisher Dashboard Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-5 rounded-3xl bg-[#FFFDF8] border border-[#E8DED0] shadow-xs">
                <p className="text-xs font-bold text-[#6F6F6F]">Total Applications</p>
                <p className="text-2xl font-black text-[#17191C] mt-1">{catalog.length}</p>
                <p className="text-[10px] text-[#16A765] font-semibold mt-1">Live in catalog</p>
              </div>

              <div className="p-5 rounded-3xl bg-[#FFFDF8] border border-[#E8DED0] shadow-xs">
                <p className="text-xs font-bold text-[#6F6F6F]">Installable PWAs</p>
                <p className="text-2xl font-black text-[#1976F3] mt-1">
                  {catalog.filter((a) => a.type === 'PWA').length}
                </p>
                <p className="text-[10px] text-[#6F6F6F] font-semibold mt-1">Manifest enabled</p>
              </div>

              <div className="p-5 rounded-3xl bg-[#FFFDF8] border border-[#E8DED0] shadow-xs">
                <p className="text-xs font-bold text-[#6F6F6F]">Android APKs</p>
                <p className="text-2xl font-black text-[#16A765] mt-1">
                  {catalog.filter((a) => a.type === 'Android APK').length}
                </p>
                <p className="text-[10px] text-[#6F6F6F] font-semibold mt-1">Direct downloads</p>
              </div>

              <div className="p-5 rounded-3xl bg-[#FFFDF8] border border-[#E8DED0] shadow-xs">
                <p className="text-xs font-bold text-[#6F6F6F]">Games &amp; Tools</p>
                <p className="text-2xl font-black text-[#E52B32] mt-1">
                  {catalog.filter((a) => a.type === 'Web Game' || a.type === 'Tool').length}
                </p>
                <p className="text-[10px] text-[#6F6F6F] font-semibold mt-1">Interactive</p>
              </div>
            </div>

            {/* Quick Action: Add App Banner */}
            <div className="p-6 rounded-3xl bg-gradient-to-r from-[#17191C] to-[#2A2E33] text-white flex flex-col md:flex-row items-center justify-between gap-4 shadow-md">
              <div className="space-y-1 text-center md:text-left">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E52B32] text-[10px] font-black uppercase tracking-wider text-white">
                  <Sparkles className="w-3 h-3" /> One-Click Discovery
                </div>
                <h2 className="text-xl font-black">Distribute a New Application</h2>
                <p className="text-xs text-white/70 max-w-xl">
                  Paste any web app or PWA URL. APPFORGE automatically parses the manifest, icons, metadata, and service worker indicators.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleQuickLoadPDFMiniFly}
                  className="px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 transition cursor-pointer"
                >
                  Test with PDFMiniFly
                </button>
                <button
                  type="button"
                  onClick={handleStartAddApp}
                  className="px-6 py-2.5 rounded-full bg-[#E52B32] hover:bg-[#b81f25] text-white text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Start Publishing</span>
                </button>
              </div>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FFFDF8] p-4 rounded-3xl border border-[#E8DED0]">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-[#6F6F6F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={appSearch}
                  onChange={(e) => setAppSearch(e.target.value)}
                  placeholder="Filter applications by name, developer, category..."
                  className="w-full bg-[#F8F2E7] border border-transparent rounded-full pl-10 pr-4 py-2 text-xs text-[#17191C] placeholder-[#6F6F6F] focus:outline-hidden focus:border-[#1976F3]"
                />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {['all', 'PWA', 'Web App', 'Android APK', 'Web Game', 'Tool'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeFilter(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition shrink-0 cursor-pointer ${
                      typeFilter === t
                        ? 'bg-[#17191C] text-white'
                        : 'bg-[#F8F2E7] text-[#6F6F6F] hover:bg-[#E8DED0]'
                    }`}
                  >
                    {t === 'all' ? 'All Types' : t}
                  </button>
                ))}
              </div>
            </div>

            {/* Applications Table / Cards */}
            <div className="bg-[#FFFDF8] border border-[#E8DED0] rounded-3xl overflow-hidden shadow-xs">
              <div className="p-4 sm:p-5 border-b border-[#E8DED0] flex items-center justify-between">
                <h3 className="font-black text-sm text-[#17191C]">
                  Catalog Records ({filteredApps.length})
                </h3>
                <span className="text-xs text-[#6F6F6F]">
                  Authoritative file: <code className="font-mono text-[#1976F3]">data/apps.json</code>
                </span>
              </div>

              <div className="divide-y divide-[#E8DED0]">
                {filteredApps.map((app) => (
                  <div
                    key={app.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#F8F2E7]/40 transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <AppIcon
                        src={app.icon}
                        name={app.name}
                        size="md"
                        themeColor={app.themeColor}
                        category={app.category}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-sm text-[#17191C] truncate">{app.name}</h4>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-[#F8F2E7] text-[#17191C] border border-[#E8DED0]">
                            {app.type}
                          </span>
                          {/* Quick Status Dropdown */}
                          <select
                            value={(app.status || 'published').toLowerCase()}
                            onChange={(e) => handleQuickStatusChange(app, e.target.value)}
                            className={`text-[10px] font-black uppercase tracking-wider rounded-lg px-2 py-0.5 border cursor-pointer transition ${
                              (app.status || 'published').toLowerCase() === 'published'
                                ? 'bg-[#16A765]/15 text-[#16A765] border-[#16A765]/40'
                                : (app.status || '').toLowerCase() === 'draft'
                                ? 'bg-[#F7B928]/25 text-[#8C6000] border-[#F7B928]/50'
                                : 'bg-[#6F6F6F]/15 text-[#6F6F6F] border-[#6F6F6F]/30'
                            }`}
                            title="Change publication status (Live update)"
                          >
                            <option value="published">Published</option>
                            <option value="draft">Draft</option>
                            <option value="archived">Archived</option>
                          </select>

                          {/* Quick Featured Toggle */}
                          <button
                            type="button"
                            onClick={() => handleQuickFeaturedToggle(app)}
                            className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold flex items-center gap-1 transition cursor-pointer ${
                              app.featured
                                ? 'bg-[#F7B928]/20 text-[#8C6000] border-[#F7B928]/50'
                                : 'bg-[#F8F2E7] text-[#6F6F6F] border-[#E8DED0] hover:text-[#17191C]'
                            }`}
                            title={app.featured ? 'Featured on Home (Click to toggle OFF)' : 'Not featured on Home (Click to toggle ON)'}
                          >
                            <Sparkles className={`w-3 h-3 ${app.featured ? 'fill-[#F7B928] text-[#F7B928]' : ''}`} />
                            <span>{app.featured ? 'Featured' : 'Standard'}</span>
                          </button>

                          {/* APK Status Pill */}
                          {app.apk?.enabled ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-[#16A765]/15 text-[#16A765] border border-[#16A765]/35 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> APK Ready (v{app.apk.versionName})
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#F8F2E7] text-[#6F6F6F] border border-[#E8DED0]">
                              No APK
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#6F6F6F] truncate mt-0.5">
                          {app.developer} &bull; {app.category} &bull; v{app.version} &bull; {app.size}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <Link
                        href={`/app/${app.slug}`}
                        target="_blank"
                        className="p-2 rounded-xl bg-[#F8F2E7] hover:bg-[#E8DED0] text-[#17191C] transition cursor-pointer"
                        title="View Live Listing"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>

                      <button
                        type="button"
                        onClick={() => {
                          handleEditApp(app);
                          setWorkflowStep('apk');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#16A765]/15 hover:bg-[#16A765] text-[#16A765] hover:text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-[#16A765]/30"
                        title="Build or update Android APK"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>{app.apk?.enabled ? 'APK' : 'Build APK'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleEditApp(app)}
                        className="px-3.5 py-1.5 rounded-xl bg-[#17191C] hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteApp(app.id, app.name)}
                        className="p-2 rounded-xl bg-[#F8F2E7] hover:bg-[#E52B32]/10 text-[#6F6F6F] hover:text-[#E52B32] transition cursor-pointer"
                        title="Delete App"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: 8-STEP PUBLISHING WORKFLOW                                        */}
        {/* ========================================================================= */}
        {viewMode === 'editor' && (
          <div className="space-y-6">
            {/* Workflow Step Tracker */}
            <div className="bg-[#FFFDF8] border border-[#E8DED0] rounded-3xl p-3 sm:p-4 overflow-x-auto scrollbar-none shadow-xs">
              <div className="flex items-center gap-2 min-w-max">
                {steps.map((st, idx) => {
                  const isActive = workflowStep === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setWorkflowStep(st.id)}
                      className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
                        isActive
                          ? 'bg-[#17191C] text-white shadow-xs'
                          : 'bg-[#F8F2E7] text-[#6F6F6F] hover:bg-[#E8DED0] hover:text-[#17191C]'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                          isActive ? 'bg-[#E52B32] text-white' : 'bg-[#E8DED0] text-[#17191C]'
                        }`}
                      >
                        {st.number}
                      </span>
                      <span>{st.label.replace(/^\d+\.\s*/, '')}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* STEP 1: APP LINK & AUTOMATIC DISCOVERY */}
            {workflowStep === 'links' && (
              <div className="bg-[#FFFDF8] border border-[#E8DED0] rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
                <div>
                  <h3 className="text-base font-black text-[#17191C]">
                    Step 1: Application Link &amp; Metadata Discovery
                  </h3>
                  <p className="text-xs text-[#6F6F6F]">
                    Enter the web application or PWA URL. APPFORGE will inspect the web app manifest, icons, OpenGraph data, and installation readiness.
                  </p>
                </div>

                {/* Quick prefill button */}
                <div className="p-4 rounded-2xl bg-[#16A765]/10 border border-[#16A765]/25 flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-xs">
                    <span className="font-bold text-[#16A765]">Try Primary Showcase App:</span>{' '}
                    <span className="text-[#17191C]/80 font-mono">https://pdfly-source.github.io/pdfly-app/</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleQuickLoadPDFMiniFly}
                    className="px-3.5 py-1.5 rounded-full bg-[#16A765] text-white text-xs font-bold hover:bg-[#11844f] transition cursor-pointer shadow-2xs"
                  >
                    Load PDFMiniFly Test Case
                  </button>
                </div>

                {/* URL Input Form */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-[#17191C]">
                    Application URL (HTTPS)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={analyzerUrl || form.url}
                      onChange={(e) => {
                        setAnalyzerUrl(e.target.value);
                        setForm((prev) => ({ ...prev, url: e.target.value, webUrl: e.target.value }));
                      }}
                      placeholder="https://your-app.example.com"
                      className="flex-1 bg-[#F8F2E7] border border-[#E8DED0] rounded-2xl px-4 py-3 text-xs font-mono text-[#17191C] focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    />
                    <button
                      type="button"
                      onClick={() => handleAnalyzeUrl()}
                      disabled={isAnalyzing}
                      className="px-6 py-3 rounded-2xl bg-[#1976F3] hover:bg-[#135bbd] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 shadow-xs"
                    >
                      {isAnalyzing ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      <span>{isAnalyzing ? 'Inspecting...' : 'Analyze URL'}</span>
                    </button>
                  </div>
                </div>

                {/* Analysis Error Notification */}
                {analysisError && (
                  <div className="p-4 rounded-2xl bg-[#E52B32]/10 border border-[#E52B32]/25 text-xs text-[#E52B32] space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4" /> Destination Inspection Notice
                    </p>
                    <p>{analysisError}</p>
                    <p className="text-[11px] text-[#17191C]/70">
                      You can proceed and manually edit any information in the next steps.
                    </p>
                  </div>
                )}

                {/* Discovered Summary Card */}
                {detectedData && (
                  <div className="p-5 rounded-2xl bg-[#F8F2E7] border border-[#E8DED0] space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#16A765]" />
                        <h4 className="font-black text-xs text-[#17191C]">
                          Discovered Metadata from {detectedData.name}
                        </h4>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#16A765]/20 text-[#16A765]">
                        {detectedData.pwa.statusSummary}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-2.5 rounded-xl bg-white border border-[#E8DED0]">
                        <span className="text-[10px] text-[#6F6F6F] font-bold">App Name:</span>
                        <p className="font-bold text-[#17191C] truncate">{detectedData.name}</p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-[#E8DED0]">
                        <span className="text-[10px] text-[#6F6F6F] font-bold">Category:</span>
                        <p className="font-bold text-[#17191C] truncate">{detectedData.category}</p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-[#E8DED0]">
                        <span className="text-[10px] text-[#6F6F6F] font-bold">Manifest URL:</span>
                        <p className="font-mono text-[10px] text-[#1976F3] truncate">
                          {detectedData.manifestUrl || 'Not detected'}
                        </p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-[#E8DED0]">
                        <span className="text-[10px] text-[#6F6F6F] font-bold">Icons Found:</span>
                        <p className="font-bold text-[#17191C]">{detectedData.icons.length} resolutions</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Additional Links: APK & App Stores */}
                <div className="border-t border-[#E8DED0] pt-6 space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#6F6F6F]">
                    Optional Distribution Links
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-[#17191C] block mb-1">
                        Direct Android APK Package (.apk)
                      </label>
                      <input
                        type="url"
                        value={form.apkUrl || ''}
                        onChange={(e) => setForm({ ...form, apkUrl: e.target.value })}
                        placeholder="https://.../app-v1.0.apk"
                        className="w-full bg-[#F8F2E7] border border-[#E8DED0] rounded-2xl px-4 py-2 text-xs font-mono text-[#17191C] focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-[#17191C] block mb-1">
                        Google Play Store Link
                      </label>
                      <input
                        type="url"
                        value={form.playStoreUrl || ''}
                        onChange={(e) => setForm({ ...form, playStoreUrl: e.target.value })}
                        placeholder="https://play.google.com/store/apps/details?id=..."
                        className="w-full bg-[#F8F2E7] border border-[#E8DED0] rounded-2xl px-4 py-2 text-xs font-mono text-[#17191C] focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-[#E8DED0]">
                  <button
                    type="button"
                    onClick={() => setWorkflowStep('basic')}
                    className="px-6 py-2.5 rounded-full bg-[#17191C] hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Next: Basic Info</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: BASIC INFO */}
            {workflowStep === 'basic' && (
              <div className="bg-[#FFFDF8] border border-[#E8DED0] rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
                <div>
                  <h3 className="text-base font-black text-[#17191C]">
                    Step 2: Basic Application Information
                  </h3>
                  <p className="text-xs text-[#6F6F6F]">
                    Define title, slug, developer branding, and marketplace classification.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-[#17191C] block mb-1">
                      Application Name *
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. PDFMiniFly"
                      className="w-full bg-[#F8F2E7] border border-[#E8DED0] rounded-2xl px-4 py-2.5 text-xs text-[#17191C] font-semibold focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#17191C] block mb-1">
                      Short Name (Home screen badge)
                    </label>
                    <input
                      type="text"
                      value={form.shortName || ''}
                      onChange={(e) => setForm({ ...form, shortName: e.target.value })}
                      placeholder="e.g. PDFMiniFly"
                      className="w-full bg-[#F8F2E7] border border-[#E8DED0] rounded-2xl px-4 py-2.5 text-xs text-[#17191C] focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#17191C] block mb-1">
                      URL Slug (Unique path) *
                    </label>
                    <input
                      type="text"
                      value={form.slug}
                      onChange={(e) => setForm({ ...form, slug: e.target.value })}
                      placeholder="e.g. pdfminifly"
                      className="w-full bg-[#F8F2E7] border border-[#E8DED0] rounded-2xl px-4 py-2.5 text-xs font-mono text-[#17191C] focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#17191C] block mb-1">
                      Developer / Studio *
                    </label>
                    <input
                      type="text"
                      value={form.developer}
                      onChange={(e) => setForm({ ...form, developer: e.target.value })}
                      placeholder="e.g. PKD"
                      className="w-full bg-[#F8F2E7] border border-[#E8DED0] rounded-2xl px-4 py-2.5 text-xs text-[#17191C] focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#17191C] block mb-1">
                      Category *
                    </label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="w-full bg-[#F8F2E7] border border-[#E8DED0] rounded-2xl px-4 py-2.5 text-xs text-[#17191C] font-semibold focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#17191C] block mb-1">
                      Internal Distribution Type *
                    </label>
                    <select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value as AppType })}
                      className="w-full bg-[#F8F2E7] border border-[#E8DED0] rounded-2xl px-4 py-2.5 text-xs text-[#17191C] font-semibold focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    >
                      <option value="PWA">PWA (Installable Web Application)</option>
                      <option value="Web App">Web App (Browser runtime)</option>
                      <option value="Android APK">Android APK (Direct package)</option>
                      <option value="Web Game">Web Game (Playable canvas / WebGL)</option>
                      <option value="Tool">Tool (In-browser utility)</option>
                      <option value="Website">Website</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#17191C] block mb-1">
                      Publication Status *
                    </label>
                    <select
                      value={(form.status || 'published').toLowerCase()}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm({
                          ...form,
                          status: val as any,
                          published: val === 'published',
                        });
                      }}
                      className="w-full bg-[#F8F2E7] border border-[#E8DED0] rounded-2xl px-4 py-2.5 text-xs text-[#17191C] font-semibold focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    >
                      <option value="published">Published (Live across public marketplace)</option>
                      <option value="draft">Draft (Staged, hidden from marketplace)</option>
                      <option value="archived">Archived (Deprecated, hidden publicly)</option>
                    </select>
                    <p className="text-[10px] text-[#6F6F6F] mt-1">
                      Only &ldquo;Published&rdquo; apps appear on Home, Explore, Categories, and Search.
                    </p>
                  </div>
                </div>

                {/* Flags: Featured / Original */}
                <div className="border-t border-[#E8DED0] pt-6 flex items-center gap-6 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#17191C]">
                    <input
                      type="checkbox"
                      checked={form.featured || false}
                      onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                      className="w-4 h-4 rounded-md accent-[#E52B32]"
                    />
                    <span>Highlight as Featured App</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#17191C]">
                    <input
                      type="checkbox"
                      checked={form.original || false}
                      onChange={(e) => setForm({ ...form, original: e.target.checked })}
                      className="w-4 h-4 rounded-md accent-[#F7B928]"
                    />
                    <span>APPFORGE Original</span>
                  </label>
                </div>

                <div className="flex justify-between pt-4 border-t border-[#E8DED0]">
                  <button
                    type="button"
                    onClick={() => setWorkflowStep('links')}
                    className="px-5 py-2.5 rounded-full bg-[#F8F2E7] text-[#17191C] text-xs font-bold hover:bg-[#E8DED0] transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkflowStep('icon')}
                    className="px-6 py-2.5 rounded-full bg-[#17191C] hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Next: Icon Manager</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: ICON MANAGER */}
            {workflowStep === 'icon' && (
              <div className="space-y-6">
                <IconManager
                  appName={form.name}
                  appSlug={form.slug}
                  currentIcon={form.icon}
                  themeColor={form.themeColor || '#17191C'}
                  manifestUrl={form.manifestUrl}
                  detectedIcons={detectedData?.icons || []}
                  onIconChange={(newIcon) => setForm({ ...form, icon: newIcon })}
                  onThemeColorChange={(c) => setForm({ ...form, themeColor: c })}
                />

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setWorkflowStep('basic')}
                    className="px-5 py-2.5 rounded-full bg-[#F8F2E7] text-[#17191C] text-xs font-bold hover:bg-[#E8DED0] transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkflowStep('apk')}
                    className="px-6 py-2.5 rounded-full bg-[#17191C] hover:bg-[#16A765] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Next: Android APK Build</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: ANDROID APK BUILD CENTER */}
            {workflowStep === 'apk' && (
              <ApkBuildCenter
                form={form}
                onUpdateForm={(fields) => setForm((prev) => ({ ...prev, ...fields }))}
                onNext={() => setWorkflowStep('screenshots')}
                onPrev={() => setWorkflowStep('icon')}
                onCatalogRefresh={refreshCatalog}
              />
            )}

            {/* STEP 5: SCREENSHOT MANAGER */}
            {workflowStep === 'screenshots' && (
              <div className="space-y-6">
                <ScreenshotManager
                  screenshots={form.screenshots || []}
                  coverScreenshot={form.banner}
                  detectedManifestScreenshots={detectedData?.screenshots || []}
                  onScreenshotsChange={(newScreenshots, newCover) =>
                    setForm({
                      ...form,
                      screenshots: newScreenshots,
                      banner: newCover || form.banner,
                    })
                  }
                />

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setWorkflowStep('apk')}
                    className="px-5 py-2.5 rounded-full bg-[#F8F2E7] text-[#17191C] text-xs font-bold hover:bg-[#E8DED0] transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous: APK Build</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkflowStep('description')}
                    className="px-6 py-2.5 rounded-full bg-[#17191C] hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Next: Features &amp; Copy</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5: DESCRIPTION & FEATURES */}
            {workflowStep === 'description' && (
              <div className="bg-[#FFFDF8] border border-[#E8DED0] rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
                <div>
                  <h3 className="text-base font-black text-[#17191C]">
                    Step 5: Description &amp; Key Features
                  </h3>
                  <p className="text-xs text-[#6F6F6F]">
                    Draft authentic copy describing the application&apos;s capabilities and value proposition.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-[#17191C] block mb-1">
                      Short Description (Card summary, max 90 chars)
                    </label>
                    <input
                      type="text"
                      value={form.shortDescription || ''}
                      onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
                      placeholder="e.g. Private PDF Tools. Powerful. Fast. Local."
                      maxLength={120}
                      className="w-full bg-[#F8F2E7] border border-[#E8DED0] rounded-2xl px-4 py-2.5 text-xs text-[#17191C] focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#17191C] block mb-1">
                      Full Description (Detail Page Overview) *
                    </label>
                    <textarea
                      rows={5}
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Describe what the app does, who it's for, and why users will love it..."
                      className="w-full bg-[#F8F2E7] border border-[#E8DED0] rounded-2xl p-4 text-xs text-[#17191C] leading-relaxed focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    />
                  </div>
                </div>

                {/* Key Features List Builder */}
                <div className="border-t border-[#E8DED0] pt-6 space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#6F6F6F]">
                    Key Features Checklist ({form.features?.length || 0})
                  </h4>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newFeatureInput}
                      onChange={(e) => setNewFeatureInput(e.target.value)}
                      placeholder="Add key capability (e.g. '100% offline local processing')"
                      className="flex-1 bg-[#F8F2E7] border border-[#E8DED0] rounded-2xl px-4 py-2 text-xs text-[#17191C] focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (newFeatureInput.trim()) {
                            setForm({
                              ...form,
                              features: [...(form.features || []), newFeatureInput.trim()],
                            });
                            setNewFeatureInput('');
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newFeatureInput.trim()) {
                          setForm({
                            ...form,
                            features: [...(form.features || []), newFeatureInput.trim()],
                          });
                          setNewFeatureInput('');
                        }
                      }}
                      className="px-4 py-2 rounded-2xl bg-[#17191C] hover:bg-[#E52B32] text-white text-xs font-bold transition cursor-pointer"
                    >
                      Add Feature
                    </button>
                  </div>

                  <div className="space-y-2 pt-2">
                    {form.features?.map((feat, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-2xl bg-[#F8F2E7] border border-[#E8DED0] text-xs font-semibold"
                      >
                        <span className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#16A765]" />
                          <span>{feat}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              features: form.features?.filter((_, i) => i !== idx),
                            })
                          }
                          className="text-[#6F6F6F] hover:text-[#E52B32] p-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between pt-4 border-t border-[#E8DED0]">
                  <button
                    type="button"
                    onClick={() => setWorkflowStep('screenshots')}
                    className="px-5 py-2.5 rounded-full bg-[#F8F2E7] text-[#17191C] text-xs font-bold hover:bg-[#E8DED0] transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkflowStep('version')}
                    className="px-6 py-2.5 rounded-full bg-[#17191C] hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Next: Version &amp; Updates</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 6: VERSION & UPDATES */}
            {workflowStep === 'version' && (
              <div className="bg-[#FFFDF8] border border-[#E8DED0] rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
                <div>
                  <h3 className="text-base font-black text-[#17191C]">
                    Step 6: Versioning &amp; Release Notes
                  </h3>
                  <p className="text-xs text-[#6F6F6F]">
                    Track version history and announce improvements in the &quot;What&apos;s New&quot; section.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-bold text-[#17191C] block mb-1">
                      Current Version *
                    </label>
                    <input
                      type="text"
                      value={form.version}
                      onChange={(e) => setForm({ ...form, version: e.target.value })}
                      placeholder="1.0.0"
                      className="w-full bg-[#F8F2E7] border border-[#E8DED0] rounded-2xl px-4 py-2 text-xs font-mono text-[#17191C] focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#17191C] block mb-1">
                      Previous Version
                    </label>
                    <input
                      type="text"
                      value={form.previousVersion || ''}
                      onChange={(e) => setForm({ ...form, previousVersion: e.target.value })}
                      placeholder="0.9.0"
                      className="w-full bg-[#F8F2E7] border border-[#E8DED0] rounded-2xl px-4 py-2 text-xs font-mono text-[#17191C] focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#17191C] block mb-1">
                      Last Updated Date
                    </label>
                    <input
                      type="date"
                      value={form.lastUpdated || new Date().toISOString().split('T')[0]}
                      onChange={(e) => setForm({ ...form, lastUpdated: e.target.value })}
                      className="w-full bg-[#F8F2E7] border border-[#E8DED0] rounded-2xl px-4 py-2 text-xs text-[#17191C] focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    />
                  </div>
                </div>

                {/* Release notes builder */}
                <div className="border-t border-[#E8DED0] pt-6 space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#6F6F6F]">
                    Release Notes for v{form.version}
                  </h4>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newReleaseNoteInput}
                      onChange={(e) => setNewReleaseNoteInput(e.target.value)}
                      placeholder="e.g. Added dark mode toggle and client-side PDF compression"
                      className="flex-1 bg-[#F8F2E7] border border-[#E8DED0] rounded-2xl px-4 py-2 text-xs text-[#17191C] focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (newReleaseNoteInput.trim()) {
                            setForm({
                              ...form,
                              releaseNotes: [
                                ...(form.releaseNotes || []),
                                newReleaseNoteInput.trim(),
                              ],
                            });
                            setNewReleaseNoteInput('');
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newReleaseNoteInput.trim()) {
                          setForm({
                            ...form,
                            releaseNotes: [
                              ...(form.releaseNotes || []),
                              newReleaseNoteInput.trim(),
                            ],
                          });
                          setNewReleaseNoteInput('');
                        }
                      }}
                      className="px-4 py-2 rounded-2xl bg-[#17191C] hover:bg-[#E52B32] text-white text-xs font-bold transition cursor-pointer"
                    >
                      Add Note
                    </button>
                  </div>

                  <div className="space-y-2 pt-2">
                    {form.releaseNotes?.map((note, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-2xl bg-[#F8F2E7] border border-[#E8DED0] text-xs font-semibold"
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-[#1976F3] font-bold">&bull;</span>
                          <span>{note}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              releaseNotes: form.releaseNotes?.filter((_, i) => i !== idx),
                            })
                          }
                          className="text-[#6F6F6F] hover:text-[#E52B32] p-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between pt-4 border-t border-[#E8DED0]">
                  <button
                    type="button"
                    onClick={() => setWorkflowStep('description')}
                    className="px-5 py-2.5 rounded-full bg-[#F8F2E7] text-[#17191C] text-xs font-bold hover:bg-[#E8DED0] transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkflowStep('preview')}
                    className="px-6 py-2.5 rounded-full bg-[#17191C] hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Next: Store Preview</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 7: STORE PREVIEW */}
            {workflowStep === 'preview' && (
              <div className="bg-[#FFFDF8] border border-[#E8DED0] rounded-3xl p-6 sm:p-8 space-y-8 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E8DED0] pb-4">
                  <div>
                    <h3 className="text-base font-black text-[#17191C]">
                      Step 7: Live App Store Listing Preview
                    </h3>
                    <p className="text-xs text-[#6F6F6F]">
                      Verify how this application card and detail view will render to marketplace visitors.
                    </p>
                  </div>

                  {(form.url || form.webUrl) && (
                    <a
                      href={form.url || form.webUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-full bg-[#F8F2E7] hover:bg-[#E8DED0] text-[#17191C] text-xs font-bold border border-[#E8DED0] transition flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Live Destination</span>
                    </a>
                  )}
                </div>

                {/* Marketplace Card Preview */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#6F6F6F]">
                    Marketplace Card Layout
                  </h4>
                  <div className="max-w-sm">
                    <AppCard app={form} variant="grid" />
                  </div>
                </div>

                {/* Detail Page Top Header Preview */}
                <div className="space-y-3 border-t border-[#E8DED0] pt-6">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#6F6F6F]">
                    Detail Page Header Preview
                  </h4>
                  <div className="p-6 rounded-3xl bg-[#F8F2E7] border border-[#E8DED0] flex flex-col sm:flex-row items-center sm:items-start gap-4">
                    <AppIcon
                      src={form.icon}
                      name={form.name}
                      size="xl"
                      themeColor={form.themeColor}
                      category={form.category}
                    />
                    <div className="min-w-0 flex-1 text-center sm:text-left space-y-1">
                      <div className="flex items-center justify-center sm:justify-start gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#1976F3]/15 text-[#1976F3]">
                          {form.type === 'Web Game' ? 'GAME' : form.type === 'Tool' ? 'TOOL' : 'APP'}
                        </span>
                        <span className="text-xs font-semibold text-[#6F6F6F]">
                          {form.category} &bull; v{form.version}
                        </span>
                      </div>
                      <h3 className="text-xl font-black text-[#17191C]">{form.name || 'Untitled Application'}</h3>
                      <p className="text-xs text-[#6F6F6F]">{form.developer}</p>
                      <p className="text-xs text-[#17191C]/80 line-clamp-2 pt-1">
                        {form.shortDescription || form.description}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-4 border-t border-[#E8DED0]">
                  <button
                    type="button"
                    onClick={() => setWorkflowStep('version')}
                    className="px-5 py-2.5 rounded-full bg-[#F8F2E7] text-[#17191C] text-xs font-bold hover:bg-[#E8DED0] transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkflowStep('publish')}
                    className="px-6 py-2.5 rounded-full bg-[#17191C] hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Next: Publish &amp; Deploy</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 8: PUBLISH & DEPLOY */}
            {workflowStep === 'publish' && (
              <div className="bg-[#FFFDF8] border border-[#E8DED0] rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
                <div>
                  <h3 className="text-base font-black text-[#17191C]">
                    Step 8: Publish &amp; Repository Deployment
                  </h3>
                  <p className="text-xs text-[#6F6F6F]">
                    Validate configuration, commit to the static catalog buffer, and export updated records for GitHub deployment.
                  </p>
                </div>

                {/* Validation Checklist */}
                <div className="p-5 rounded-2xl bg-[#F8F2E7] border border-[#E8DED0] space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#6F6F6F]">
                    Pre-Publish Quality Checklist
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        className={`w-4 h-4 ${form.name ? 'text-[#16A765]' : 'text-[#6F6F6F]'}`}
                      />
                      <span>App Name Configured: {form.name || 'Missing'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        className={`w-4 h-4 ${
                          form.url || form.apkUrl ? 'text-[#16A765]' : 'text-[#6F6F6F]'
                        }`}
                      />
                      <span>Destination URL Configured</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        className={`w-4 h-4 ${form.icon ? 'text-[#16A765]' : 'text-[#F7B928]'}`}
                      />
                      <span>App Icon: {form.icon ? 'Verified' : 'Using Vector Fallback'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        className={`w-4 h-4 ${form.description ? 'text-[#16A765]' : 'text-[#6F6F6F]'}`}
                      />
                      <span>Description &amp; Overview Populated</span>
                    </div>
                  </div>
                </div>

                {/* Save to Catalog Button */}
                <div className="p-5 rounded-2xl bg-[#16A765]/10 border border-[#16A765]/25 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h4 className="font-black text-sm text-[#16A765]">Publish to Canonical Catalog</h4>
                    <p className="text-xs text-[#17191C]/80 mt-0.5">
                      Saves &quot;{form.name}&quot; into the canonical catalog (<code className="font-mono font-bold">data/apps.json</code>) and immediately propagates across Home, Explore, Categories, and Search.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveAppToCatalog}
                    className="px-6 py-3 rounded-full bg-[#16A765] hover:bg-[#11844f] text-white text-xs font-black transition flex items-center gap-2 cursor-pointer shadow-xs shrink-0"
                  >
                    <Save className="w-4 h-4" />
                    <span>Publish Application</span>
                  </button>
                </div>

                {/* Git-backed Static Architecture Instructions */}
                <div className="space-y-3 border-t border-[#E8DED0] pt-6">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#6F6F6F] flex items-center gap-1.5">
                    <GitBranch className="w-4 h-4 text-[#1976F3]" />
                    <span>Permanent GitHub Deployment Architecture</span>
                  </h4>
                  <p className="text-xs text-[#6F6F6F] leading-relaxed">
                    APPFORGE operates as an ultra-fast, independent static marketplace with no cloud database dependency. To publish your updates to production:
                  </p>

                  <div className="bg-[#17191C] text-white p-4 rounded-2xl font-mono text-xs space-y-2 overflow-x-auto">
                    <p className="text-[#6F6F6F]"># 1. Download or copy your updated catalog JSON</p>
                    <p className="text-[#16A765]">cp downloaded_apps.json data/apps.json</p>
                    <p className="text-[#6F6F6F]"># 2. Stage changes and commit</p>
                    <p className="text-[#FFFDF8]">git add data/apps.json</p>
                    <p className="text-[#FFFDF8]">git commit -m &quot;feat(catalog): publish {form.slug || 'app'}&quot;</p>
                    <p className="text-[#6F6F6F]"># 3. Push to main branch (triggers auto-build)</p>
                    <p className="text-[#1976F3]">git push origin main</p>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleDownloadJson}
                      className="px-5 py-2.5 rounded-full bg-[#17191C] hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download apps.json</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyJson}
                      className="px-5 py-2.5 rounded-full bg-[#FFFDF8] hover:bg-white text-[#17191C] text-xs font-bold border border-[#E8DED0] transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy JSON to Clipboard</span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-between pt-4 border-t border-[#E8DED0]">
                  <button
                    type="button"
                    onClick={() => setWorkflowStep('preview')}
                    className="px-5 py-2.5 rounded-full bg-[#F8F2E7] text-[#17191C] text-xs font-bold hover:bg-[#E8DED0] transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous: Preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('catalog')}
                    className="px-6 py-2.5 rounded-full bg-[#17191C] hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Finish &amp; View Catalog</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Publisher Success Modal */}
        {publishedAppSuccess && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-[#FFFDF8] border border-[#E8DED0] rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5 text-center animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-[#16A765]/15 text-[#16A765] flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-[#17191C]">Published successfully</h3>
                <p className="text-xs sm:text-sm text-[#6F6F6F] mt-2 leading-relaxed">
                  Your app <span className="font-bold text-[#17191C]">{publishedAppSuccess.name}</span> is now available across the APPFORGE marketplace.
                </p>
              </div>

              <div className="space-y-2.5 pt-2">
                <Link
                  href={`/app/${publishedAppSuccess.slug}`}
                  target="_blank"
                  className="w-full py-3 px-4 rounded-full bg-[#17191C] hover:bg-[#E52B32] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition"
                >
                  <Eye className="w-4 h-4" />
                  <span>View App</span>
                </Link>
                <Link
                  href={`/explore?q=${encodeURIComponent(publishedAppSuccess.name)}`}
                  target="_blank"
                  className="w-full py-3 px-4 rounded-full bg-[#F8F2E7] hover:bg-[#E8DED0] text-[#17191C] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 border border-[#E8DED0] transition"
                >
                  <Search className="w-4 h-4" />
                  <span>View in Explore</span>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setPublishedAppSuccess(null);
                    setViewMode('catalog');
                  }}
                  className="w-full py-2.5 px-4 rounded-full text-[#6F6F6F] hover:text-[#17191C] font-semibold text-xs transition cursor-pointer"
                >
                  View in Catalog
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
