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
  CheckSquare,
  CloudUpload,
  KeyRound,
  Loader2,
  GitCommitHorizontal,
  RotateCcw,
  Lock,
  FilePen
} from 'lucide-react';
import { AppItem, AppType } from '@/data/apps';
import { CATEGORIES } from '@/data/categories';
import { useCatalog, type DraftEnvelope } from '@/lib/CatalogContext';
import { useToast } from '@/lib/ToastContext';
import { AppCard } from '@/components/AppCard';
import { AppIcon } from '@/components/AppIcon';
import { IconManager } from '@/components/IconManager';
import { ScreenshotManager } from '@/components/ScreenshotManager';
import { ApkBuildCenter } from '@/components/ApkBuildCenter';
import { collectDomFieldValues, findFieldMismatches } from '@/lib/build-dispatch-gate';
import type { DetectedMetadata } from '@/lib/detected-metadata';
import { apiUrl } from '@/lib/api-path';
import { fetchJson } from '@/lib/api-client';
import {
  validateAppForPublish,
  ValidationReport,
} from '@/lib/catalog-validation';
import {
  publishAppToProduction,
  checkPublishService,
  clearLegacyRememberedPublishKey,
  verifyPublisherKey,
  PUBLISHER_API_BASE,
  ProductionPublishResult,
  PublishServiceStatus,
  serviceFetchJson,
  ANALYZE_SERVICE_ENDPOINT,
  PUBLISHER_SESSION_IDLE_MS,
  LoginThrottle,
} from '@/lib/production-publish';
import { checkExternalUrl } from '@/lib/url-safety';

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
  const {
    catalog,
    publishApp,
    refreshCatalog,
    clearSessionEdits,
    hasSessionEdits,
    isLoading,
    // Phase 10.6: console-scoped device drafts (never merged into public pages)
    getSessionEditMap,
    getSessionEditFor,
    mergeDraftOverlay,
    clearSessionEditFor,
    // Phase 10.7: envelope accessors for optimistic concurrency
    getDraftEnvelopeFor,
    getDraftEnvelopeMap,
  } = useCatalog();

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
    developer: 'AppMintly Originals',
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
  // Production APK releases are protected infrastructure. When editing an
  // existing app whose APK is verified against a production release, all
  // release-identity fields become read-only in the editor.
  const isProtectedRelease = Boolean(isEditingExisting && form.apk?.verified && form.apk?.enabled);
  const [copiedJson, setCopiedJson] = useState(false);
  const [newFeatureInput, setNewFeatureInput] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [newReleaseNoteInput, setNewReleaseNoteInput] = useState('');

  // ---------- Phase 5: truthful edit → validate → publish lifecycle ----------
  // The authoritative catalog record this edit session started from
  // (null when adding a brand-new application).
  const [originalRecord, setOriginalRecord] = useState<AppItem | null>(null);
  // The last form state that was actually saved (session or production).
  const lastSavedRef = React.useRef<AppItem | null>(null);
  // Phase 10.7: revision of the draft this editor session loaded (null when
  // the editor opened with no draft). Save Draft compares it against the
  // stored draft's revision — a draft changed or discarded in another tab
  // is NEVER silently overwritten.
  const draftRevisionRef = React.useRef<number | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Validation for publish
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Production publish state
  const [publishStage, setPublishStage] = useState<'idle' | 'validated' | 'publishing' | 'published' | 'failed'>('idle');
  // Publisher authentication (MEMORY-ONLY). The publish key lives in React
  // state for the lifetime of the page session only — never in localStorage,
  // sessionStorage, cookies or URLs. A refresh requires re-entry (intentional).
  const [publisherKey, setPublisherKey] = useState('');
  // Phase 9 session hardening: client-side login throttle + idle expiration.
  const loginThrottleRef = React.useRef<LoginThrottle | null>(null);
  if (!loginThrottleRef.current) loginThrottleRef.current = new LoginThrottle();
  const lastActivityRef = React.useRef<number>(Date.now());
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authKeyInput, setAuthKeyInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authVerifying, setAuthVerifying] = useState(false);
  const authResolverRef = React.useRef<((key: string) => void) | null>(null);
  const [publishResult, setPublishResult] = useState<ProductionPublishResult | null>(null);
  const [serviceStatus, setServiceStatus] = useState<PublishServiceStatus | null>(null);

  // Unsaved-changes detection: compare the live form to the last saved state.
  React.useEffect(() => {
    if (!lastSavedRef.current) {
      setHasUnsavedChanges(false);
      return;
    }
    setHasUnsavedChanges(JSON.stringify(form) !== JSON.stringify(lastSavedRef.current));
  }, [form]);

  // Memory-only authentication: scrub any legacy remembered publish key from
  // browser storage (the previous "remember on this device" feature is
  // removed) and start the session unauthenticated. The publish key itself
  // is never persisted — a page refresh requires re-entry (intentional).
  React.useEffect(() => {
    clearLegacyRememberedPublishKey();
    checkPublishService().then(setServiceStatus);
  }, []);

  // Session expiration: sign out after 30 minutes of inactivity. The key
  // never persists, so expiry simply drops it and reports honestly.
  React.useEffect(() => {
    if (!publisherKey) return;
    const bump = () => {
      lastActivityRef.current = Date.now();
    };
    const events: (keyof WindowEventMap)[] = ['click', 'keydown', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const interval = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current > PUBLISHER_SESSION_IDLE_MS) {
        setPublisherKey('');
        toast('Session expired after 30 minutes of inactivity. Re-authenticate to continue.', 'info');
      }
    }, 60_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(interval);
    };
  }, [publisherKey, toast]);

  // Re-check the publishing service whenever the publish step is opened.
  React.useEffect(() => {
    if (workflowStep === 'publish') {
      checkPublishService().then(setServiceStatus);
    }
  }, [workflowStep]);

  // ---------------------------------------------------------------------------
  // Publisher authentication (memory-only)
  // ---------------------------------------------------------------------------
  // Resolves immediately with the in-memory key when already authenticated;
  // otherwise opens the authentication dialog and resolves with the key
  // once the owner authenticates ('' if cancelled). Never fabricates success.
  const requestPublisherAuth = (): Promise<string> => {
    if (publisherKey.trim()) return Promise.resolve(publisherKey);
    return new Promise((resolve) => {
      authResolverRef.current = resolve;
      setAuthKeyInput('');
      setAuthError('');
      setAuthDialogOpen(true);
    });
  };

  // Verify the entered key against the Cloudflare Worker (non-mutating:
  // the Worker checks the key before request validation and dispatches
  // nothing). 401 => Invalid Publisher Key; any other response means the
  // key was accepted. Never marks the session authenticated on failure.
  const handleAuthenticate = async () => {
    if (authVerifying) return;
    setAuthError('');
    const entered = authKeyInput.trim();
    if (!entered) {
      setAuthError('Enter your AppMintly Publisher Key.');
      return;
    }
    // Client-side brute-force throttle (Worker remains the real boundary).
    const lockMs = loginThrottleRef.current!.remainingLockoutMs();
    if (lockMs > 0) {
      setAuthError(`Too many failed attempts. Try again in ${Math.ceil(lockMs / 60000)} minute(s).`);
      return;
    }
    setAuthVerifying(true);
    const result = await verifyPublisherKey(entered);
    setAuthVerifying(false);
    if (!result.verified) {
      // Only a REAL Worker 401 counts as a failed attempt for throttling.
      // A network/service outage must never lock the owner out or imply a
      // wrong key (Phase 10.1: honest service-vs-credential distinction).
      if (result.kind === 'invalid-key') {
        loginThrottleRef.current!.recordFailure();
        setAuthError(result.message || 'Invalid Publisher Key');
      } else {
        setAuthError(result.message);
      }
      return;
    }
    loginThrottleRef.current!.reset();
    lastActivityRef.current = Date.now();
    setPublisherKey(entered); // memory only — never persisted, never displayed
    setAuthDialogOpen(false);
    setAuthKeyInput('');
    toast('✓ Publisher authenticated — the key is held in memory for this session only.', 'success');
    const resolve = authResolverRef.current;
    authResolverRef.current = null;
    resolve?.(entered);
  };

  const handleAuthCancel = () => {
    setAuthDialogOpen(false);
    setAuthKeyInput('');
    setAuthError('');
    const resolve = authResolverRef.current;
    authResolverRef.current = null;
    resolve?.('');
  };

  const handleSignOut = () => {
    setPublisherKey('');
    toast('Signed out — the publish key was cleared from memory.', 'info');
  };

  // Reset the publish lifecycle whenever the edited app changes.
  const resetPublishLifecycle = () => {
    setValidationReport(null);
    setPublishStage('idle');
    setPublishResult(null);
  };

  // Launch Editor for New App
  const handleStartAddApp = () => {
    setForm(emptyForm);
    lastSavedRef.current = emptyForm;
    draftRevisionRef.current = null;
    setOriginalRecord(null);
    setIsEditingExisting(false);
    setWorkflowStep('links'); // Start at Links & Analyzer for instant magic
    setViewMode('editor');
    setDetectedData(null);
    setAnalysisError(null);
    resetPublishLifecycle();
  };

  // Launch Editor for Existing App
  const handleEditApp = (app: AppItem) => {
    // Phase 10.6: if a device-local draft exists for this app, open the
    // draft (canonical + sanitized draft overlay) so in-progress edits
    // survive a reload. Public pages keep showing the canonical record.
    const hasDraft = Boolean(getSessionEditFor(app.slug || app.id));
    draftRevisionRef.current = hasDraft
      ? (getDraftEnvelopeFor(app.slug || app.id)?.revision ?? null)
      : null;
    const hydrated = hasDraft ? mergeDraftOverlay(app) : app;
    setForm({ ...hydrated });
    lastSavedRef.current = { ...hydrated };
    setOriginalRecord({ ...app });
    if (hasDraft) {
      toast(`Loaded device-local draft for "${app.name}" — publish to make changes live.`, 'info');
    }
    setIsEditingExisting(true);
    setWorkflowStep('basic');
    setViewMode('editor');
    setDetectedData(null);
    setAnalysisError(null);
    resetPublishLifecycle();
  };

  // Leave the editor with unsaved-changes protection.
  const handleLeaveEditor = () => {
    if (hasUnsavedChanges && !confirm('You have unsaved changes that are not saved or published. Leave the editor and discard them?')) {
      return;
    }
    setViewMode('catalog');
  };

  // Discard all unsaved edits and restore the last saved state.
  const handleDiscardChanges = () => {
    if (lastSavedRef.current) {
      setForm({ ...lastSavedRef.current });
    }
    setShowDiscardConfirm(false);
    setValidationReport(null);
    setPublishStage('idle');
    setPublishResult(null);
    toast('Unsaved changes discarded — restored the last saved state.', 'info');
  };

  // ── Phase 10.2: production-grade DELETE architecture ──────────────────
  // The old one-tap delete (window.confirm + full-catalog overwrite via a
  // client API that does not exist on production Pages) is REMOVED. The new
  // flow: authenticated session required → identity resolved from the
  // canonical catalog → typed "DELETE" confirmation → real server-side
  // capability check against the authorized publishing Worker. It NEVER
  // fabricates success: with no server-side delete endpoint deployed, it
  // reports the exact failed step instead of deleting client-side.
  const PROTECTED_PACKAGES = ['com.appforge.studyria', 'com.appforge.pdfminifly'];
  const PROTECTED_SLUGS = ['studyria', 'pdfminifly'];
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AppItem | null>(null);
  const [deleteStep, setDeleteStep] = useState<'confirming' | 'authenticating' | 'validating' | 'failed' | 'protected'>( 'confirming');
  const [deleteError, setDeleteError] = useState('');
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleteRunning, setDeleteRunning] = useState(false);

  // Open the destructive-confirmation dialog. Identity (name/package/version)
  // is resolved from the canonical catalog record, never from the button.
  const handleDeleteApp = (id: string) => {
    const record = catalog.find((a) => a.id === id || a.slug === id);
    if (!record) {
      toast('Delete blocked — no such application exists in the canonical catalog.', 'error');
      return;
    }
    setDeleteTarget(record);
    setDeleteConfirmInput('');
    setDeleteError('');
    const pkg = record.apk?.packageId || '';
    if (PROTECTED_SLUGS.includes(record.slug) || PROTECTED_PACKAGES.includes(pkg)) {
      setDeleteStep('protected');
    } else {
      setDeleteStep('confirming');
    }
    setDeleteDialogOpen(true);
  };

  const handleDeleteDialogCancel = () => {
    if (deleteRunning) return; // no accidental dismissal mid-operation
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
    setDeleteConfirmInput('');
    setDeleteError('');
    setDeleteStep('confirming');
  };

  const handleDeleteDialogConfirm = async () => {
    if (!deleteTarget || deleteRunning) return;
    if (deleteConfirmInput.trim() !== 'DELETE') {
      setDeleteError('Type DELETE exactly to confirm. Nothing has been removed.');
      return;
    }
    setDeleteRunning(true);
    try {
      // B.1/B.3 — an authenticated publisher session is REQUIRED. Expired
      // sessions trigger the authentication dialog; the flow stops if the
      // publisher does not authenticate.
      setDeleteStep('authenticating');
      const key = await requestPublisherAuth();
      if (!key) {
        setDeleteStep('failed');
        setDeleteError('Deletion blocked — publisher authentication is required (401).');
        return;
      }

      // B.4/B.5 — deletion is SERVER-SIDE only. The browser holds no GitHub
      // credentials; the authorized publishing Worker is the only path.
      // Capability check: does the deployed Worker accept DELETE-method
      // requests at all? (Verified live today: its CORS allows only
      // GET, POST, OPTIONS — there is no delete endpoint deployed.)
      setDeleteStep('validating');
      let deleteSupported = false;
      try {
        const probe = await fetch(`${PUBLISHER_API_BASE}/publish-catalog`, {
          method: 'OPTIONS',
          headers: {
            'Access-Control-Request-Method': 'DELETE',
          },
        });
        const allow = probe.headers.get('access-control-allow-methods') || '';
        deleteSupported = probe.ok && allow.toUpperCase().includes('DELETE');
      } catch {
        deleteSupported = false; // Worker unreachable → capability unknown → refuse
      }

      if (!deleteSupported) {
        // Honest terminal state: NO fake client-side deletion.
        setDeleteStep('failed');
        setDeleteError(
          'FAILED at VALIDATING: server-side deletion is not deployed on the authorized publishing backend (the publishing Worker accepts only GET, POST, OPTIONS — no DELETE endpoint exists). Nothing was deleted: no release asset, no release, no tag, and no catalog record were modified. Permanent deletions must be performed through the authorized backend by the platform operator.'
        );
        return;
      }
      // Even if a DELETE method appears someday, its request contract is
      // undocumented — we refuse to guess a payload for a destructive op.
      setDeleteStep('failed');
      setDeleteError(
        'FAILED at VALIDATING: the publishing backend now reports DELETE support, but its delete request contract is undocumented. Refusing to guess a destructive payload. Nothing was deleted.'
      );
    } finally {
      setDeleteRunning(false);
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
      toast(`Saved "${app.name}" status ${newStatus} as a device draft — publish it to make the change live.`, 'info');
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
      toast(`Saved Featured ${updated.featured ? 'ON' : 'OFF'} for "${app.name}" as a device draft — publish it to change the live homepage.`, 'info');
    }
  };

  // Auto URL Analysis Engine
  const handleAnalyzeUrl = async (urlToAnalyze?: string) => {
    const target = (urlToAnalyze || analyzerUrl || form.url || '').trim();
    if (!target) {
      toast('Please enter a valid application URL.', 'error');
      return;
    }
    // Phase 9 security: reject loopback/private/link-local and non-http(s)
    // targets before they ever reach the Worker. The Worker performs its own
    // server-side SSRF validation; this is browser-side defense-in-depth.
    const safety = checkExternalUrl(target);
    if (!safety.safe) {
      setAnalysisError(`URL rejected: ${safety.reason}`);
      toast(`URL rejected: ${safety.reason}`, 'error');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const result = await serviceFetchJson(ANALYZE_SERVICE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
      });

      if (!result.ok) {
        setAnalysisError(
          result.unavailable
            ? 'Metadata analysis service temporarily unavailable. Enter the application details manually below.'
            : result.data?.error || 'Failed to inspect application metadata.'
        );
        return;
      }

      const json = result.data;
      if (!json.success) {
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

  // Build the normalized record to save/publish from the current form.
  const buildAppRecord = (): AppItem => {
    const cleanSlug = form.slug.trim() || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
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

    // Phase 10.5 (protected APK metadata sync): the save/publish payload is
    // AUTHORITATIVE production APK metadata + editable listing metadata —
    // never draft APK metadata. When the edited app has a released APK and
    // no newer release was actually built in this session (a real new build
    // has a strictly higher versionCode), every protected release field is
    // pinned to the authoritative baseline. An ordinary listing edit (name,
    // icon, description, distribution type, URLs…) can therefore never
    // attempt to change release metadata — the exact cause of
    // "Protected production APK field cannot be changed: apk.fileSizeBytes"
    // publish rejections from stale draft/session state.
    const base = originalRecord;
    if (base?.apk?.enabled && base.apk.verified) {
      const draftApk = appToSave.apk;
      const newerReleaseActuallyBuilt =
        Boolean(draftApk?.versionCode) &&
        Boolean(base.apk.versionCode) &&
        draftApk!.versionCode! > base.apk.versionCode!;
      if (!newerReleaseActuallyBuilt) {
        appToSave.apk = base.apk;
        appToSave.version = base.version;
        appToSave.previousVersion = base.previousVersion;
        appToSave.size = base.size;
        appToSave.apkUrl = base.apkUrl;
      }
    }
    return appToSave;
  };

  // Run the full Phase 5 validation (presentation + protected integrity).
  const handleValidateForPublish = async (): Promise<{ record: AppItem; report: ValidationReport } | null> => {
    setIsValidating(true);
    const record = buildAppRecord();
    const report = validateAppForPublish(record, catalog, originalRecord);
    setValidationReport(report);
    setIsValidating(false);
    if (!report.valid) {
      setPublishStage('idle');
      // Phase 10.2 (C.4): surface the EXACT issues in the toast, not just the count.
      const issues = report.errors
        .map((e, i) => `${i + 1}. ${e}`)
        .join(' ');
      toast(`Validation failed — ${report.errors.length} issue${report.errors.length > 1 ? 's' : ''} must be fixed before publishing: ${issues}`, 'error');
    } else {
      setPublishStage('validated');
      toast('Validation passed — ready to publish.', 'success');
    }
    return { record, report };
  };

  // Publish to the AUTHORITATIVE production catalog through the authorized
  // publishing layer (server-side validated commit to data/apps.json).
  const handlePublishToProduction = async () => {
    // Authentication gate: the publish key is required and lives only in
    // memory. If no key is held, the authentication dialog opens
    // automatically and publishing continues only after successful
    // authentication.
    const key = await requestPublisherAuth();
    if (!key) {
      toast('Publisher authentication is required to publish to production.', 'info');
      return;
    }
    let record: AppItem | null = null;
    if (publishStage !== 'validated' || !validationReport?.valid) {
      const result = await handleValidateForPublish();
      if (!result?.report.valid) return; // errors already surfaced
      record = result.record;
    }
    record = record || buildAppRecord();

    // Phase 9 concurrency guard: re-read the authoritative catalog right
    // before publishing. If the remote record for this slug changed since
    // this session loaded it, stop with an honest CATALOG_CONFLICT state —
    // the Worker additionally performs a SHA-aware commit server-side.
    try {
      const live = await fetch(
        typeof window !== 'undefined' ? '/data/apps.json' : 'about:blank',
        { cache: 'no-store' }
      );
      if (live.ok) {
        const liveCatalog: AppItem[] = await live.json();
        const remote = Array.isArray(liveCatalog)
          ? liveCatalog.find((a) => (a.slug || '').toLowerCase() === (record.slug || '').toLowerCase())
          : undefined;
        const baseline = originalRecord?.slug
          ? originalRecord
          : null;
        const remoteMatchesBaseline = baseline && remote && remote.version === baseline.version;
        const isNewSlug = !baseline;
        // Conflict = the remote record changed since this session loaded its
        // baseline (remote no longer matches the version we based edits on).
        // A legitimate version bump (remote == baseline, record = new) is safe.
        if (remote && ((baseline && !remoteMatchesBaseline) || (isNewSlug && record.version === remote.version))) {
          setPublishStage('failed');
          setPublishResult({
            success: false,
            message:
              `CATALOG_CONFLICT: the published version of "${record.slug}" is v${remote.version}, ` +
              `which differs from the baseline this session loaded. Reload the catalog and ` +
              `re-apply your changes before publishing. Nothing was written.`,
          });
          toast('Catalog conflict detected — publish stopped. Nothing was written.', 'error');
          return;
        }
      }
    } catch {
      /* pre-flight read failed — the Worker's SHA-aware commit remains the
         authoritative concurrency control; continue rather than block. */
    }

    setPublishStage('publishing');
    toast('Publishing to production — committing data/apps.json…', 'info');

    const result = await publishAppToProduction(record, key);
    setPublishResult(result);

    if (result.success) {
      // Phase 10.6: the canonical catalog now carries this record — the
      // device draft must go, so it can never overlay newer canonical data.
      clearSessionEditFor(record.slug || record.id);
      draftRevisionRef.current = null;
      lastSavedRef.current = record;
      setOriginalRecord(record);
      setHasUnsavedChanges(false);
      setPublishStage('published');
      toast(
        `Published "${record.name}" to the production catalog — commit ${result.commitSha?.slice(0, 7) || 'created'}. The live site updates after the deployment finishes.`,
        'success'
      );
      await refreshCatalog();
    } else {
      setPublishStage('failed');
      toast(`Publish failed: ${result.message}`, 'error');
    }
  };

  // Save App as a device draft (NOT a production publish).
  const handleSaveAppToCatalog = async () => {
    const appToSave = buildAppRecord();

    // Validation gates saving as well — the same rules apply before the
    // change is stored as a device draft (console + Store Preview).
    const report = validateAppForPublish(appToSave, catalog, originalRecord);
    setValidationReport(report);
    if (!report.valid) {
      setWorkflowStep('publish');
      const saveIssues = report.errors
        .map((e, i) => `${i + 1}. ${e}`)
        .join(' ');
      toast(`Validation failed — ${report.errors.length} issue${report.errors.length > 1 ? 's' : ''} must be fixed before saving: ${saveIssues}`, 'error');
      return;
    }

    // Change detection — do not claim a save when nothing changed
    const existing = catalog.find(
      (a) => a.slug.toLowerCase() === appToSave.slug.toLowerCase() || a.id.toLowerCase() === appToSave.id.toLowerCase()
    );
    if (existing && JSON.stringify({ ...existing, ...appToSave }) === JSON.stringify({ ...existing })) {
      const changedKeys = Object.keys(appToSave).filter(
        (k) => JSON.stringify((appToSave as any)[k]) !== JSON.stringify((existing as any)[k])
      );
      if (changedKeys.length === 0) {
        toast('No changes detected — nothing to save.', 'info');
        return;
      }
    }

    // Phase 10.7 optimistic concurrency: refuse to silently overwrite a
    // draft that changed (or was discarded) since this editor loaded it.
    const draftSlugKey = (appToSave.slug || appToSave.id).toLowerCase();
    const storedDraft = getDraftEnvelopeFor(draftSlugKey);
    if (storedDraft && draftRevisionRef.current === null) {
      toast(
        `DRAFT_CONFLICT: a draft for "${draftSlugKey}" already exists but this editor did not load it (it was created or changed in another tab). Reopen the draft from the catalog list and re-apply your changes. Nothing was overwritten.`,
        'error'
      );
      return;
    }
    if (!storedDraft && draftRevisionRef.current !== null) {
      toast(
        `DRAFT_CONFLICT: the draft for "${draftSlugKey}" was discarded in another tab. Reopen the app from the catalog list and re-apply your changes. Nothing was written.`,
        'error'
      );
      return;
    }
    if (storedDraft && draftRevisionRef.current !== null && storedDraft.revision !== draftRevisionRef.current) {
      toast(
        `DRAFT_CONFLICT: the draft for "${draftSlugKey}" was saved again in another tab (revision ${storedDraft.revision}, this editor holds ${draftRevisionRef.current}). Reopen the draft and re-apply your changes. Nothing was overwritten.`,
        'error'
      );
      return;
    }

    const ok = await publishApp(appToSave);
    if (ok.success && (ok.persisted === 'session' || ok.persisted === 'server')) {
      // This editor now holds the freshly written draft revision.
      draftRevisionRef.current = getDraftEnvelopeFor(draftSlugKey)?.revision ?? null;
    }
    if (ok.success && ok.persisted === 'session') {
      // Static GitHub Pages hosting: the change is applied to the local
      // device draft (console + Store Preview only) and is NOT a permanent
      // production publish. State this truthfully.
      lastSavedRef.current = appToSave;
      setHasUnsavedChanges(false);
      setPublishedAppSuccess(appToSave);
      toast(
        `Saved "${appToSave.name}" as a device draft (console + Store Preview only). Use Publish to Production to make it live on the marketplace.`,
        'success'
      );
    } else if (ok.success) {
      lastSavedRef.current = appToSave;
      setHasUnsavedChanges(false);
      setPublishedAppSuccess(appToSave);
      toast(`Saved "${appToSave.name}" to the server catalog.`, 'success');
    } else {
      toast(ok.message || 'Error saving application to catalog.', 'error');
    }
  };

  // Phase 10.6: the manual export includes the canonical catalog PLUS any
  // device-local drafts (sanitized overlays applied, new-draft records
  // appended) so the Save Draft -> Export -> manual commit fallback keeps
  // working. The toast states exactly what was exported.
  const buildExportJson = (): string => {
    const draftMap: Record<string, Partial<AppItem>> = getSessionEditMap();
    const draftEnvelopes: Record<string, DraftEnvelope> = getDraftEnvelopeMap();
    const inCatalog = new Set(catalog.map((a) => (a.slug || a.id).toLowerCase()));
    const mergedExisting = catalog.map((a) => {
      const slug = (a.slug || a.id).toLowerCase();
      return draftMap[slug] ? mergeDraftOverlay(a) : a;
    });
    // Phase 10.7: new-app drafts are exported WITH their draft metadata
    // (revision/updatedAt/status) clearly labeled, so the manual
    // export-and-commit fallback stays honest about what is a draft.
    const newDrafts = Object.entries(draftEnvelopes)
      .filter(([slug]) => !inCatalog.has(slug.toLowerCase()))
      .map(([slug, envelope]) => ({
        ...emptyForm,
        ...envelope.data,
        slug,
        status: 'draft',
        published: false,
        draftMetadata: { revision: envelope.revision, updatedAt: envelope.updatedAt },
      } as AppItem));
    const draftCount = Object.keys(draftMap).length;
    if (draftCount === 0) return JSON.stringify(mergedExisting, null, 2);
    return JSON.stringify([...newDrafts, ...mergedExisting], null, 2);
  };

  // Copy apps.json
  const handleCopyJson = () => {
    const jsonStr = buildExportJson();
    navigator.clipboard.writeText(jsonStr);
    setCopiedJson(true);
    toast('Copied catalog JSON (canonical + device drafts) to clipboard!', 'success');
    setTimeout(() => setCopiedJson(false), 3000);
  };

  // Download apps.json
  const handleDownloadJson = () => {
    const jsonStr = buildExportJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'apps.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('Downloaded apps.json (canonical catalog + device drafts). Place in /data/apps.json of your repository to publish manually.', 'success');
  };

  // -----------------------------------------------------------------
  // STEP-TRANSITION SAFETY GATE (Phase 7.6)
  // Wizard steps unmount their inputs when navigating. Before ANY step
  // change, every visible input tagged with data-build-field is compared
  // against the React state it visually represents. If the DOM value and
  // the state diverge (the exact failure mode of the Phase 7.5 automation,
  // where DOM values were written without React input/change events), the
  // navigation is BLOCKED so the divergence can never reach the build
  // payload. Only real user input (or automation dispatching proper React
  // compatible events) can pass.
  // -----------------------------------------------------------------
  const buildFieldStateValues = (): Record<string, string> => ({
    launchUrl: (form.launchUrl || form.webUrl || form.url || '').trim(),
    name: form.name,
    slug: form.slug,
    version: form.version || '1.0.0',
    // packageId intentionally excluded here: it lives in ApkBuildCenter's
    // local state and is verified by the dedicated pre-dispatch gate in
    // handleStartBuild (DOM value == React state == payload) instead.
  });

  const guardedSetWorkflowStep = (next: WorkflowStep) => {
    const dom = collectDomFieldValues();
    const mismatches = findFieldMismatches(dom, buildFieldStateValues());
    if (mismatches.length > 0) {
      toast(
        'Blocked: visible input values do not match the form state (' +
          mismatches.map((m) => `${m.field}: input shows "${m.domValue}", state has "${m.expectedValue}"`).join('; ') +
          '). Please re-enter the values by typing so the form registers them.',
        'error'
      );
      console.error('[AppMintly] Step transition blocked by input-state mismatch:', mismatches);
      return;
    }
    setWorkflowStep(next);
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
    <div className="min-h-screen bg-page text-ink pb-24">
      {/* Top Banner / Breadcrumb */}
      <header className="bg-card border-b border-line sticky top-16 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-bold text-mut hover:text-ink transition"
            >
              &larr; Storefront
            </Link>
            <span className="text-line font-bold">/</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#16A765]" />
              <h1 className="text-sm font-black text-ink tracking-tight">
                Publisher Console
              </h1>
            </div>
          </div>

          {/* Responsive control groups — each group wraps independently, so the
              toolbar reflows into multiple tidy rows on mobile instead of
              overflowing the viewport. */}
          <div className="flex flex-wrap items-center gap-2">

            {/* Row A: session / refresh / publisher authentication state */}
            <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                if (window.confirm('Discard all session-only edits saved on this device? The console will re-sync with the published catalog.')) {
                  await clearSessionEdits();
                  toast('Session edits discarded. Console re-synced with the published catalog.', 'info');
                }
              }}
              disabled={!hasSessionEdits}
              className="px-3.5 py-1.5 rounded-full bg-card hover:bg-white text-xs font-bold text-ink border border-line transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Discard device-local session edits and re-sync with the published catalog"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{hasSessionEdits ? 'Reset Session' : 'No Session Edits'}</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                await refreshCatalog();
                toast('Refreshed canonical catalog from server.', 'info');
              }}
              className="px-3.5 py-1.5 rounded-full bg-card hover:bg-white text-xs font-bold text-ink border border-line transition flex items-center gap-1.5 cursor-pointer"
              title="Refresh Catalog"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#1976F3]' : ''}`} />
              <span>Refresh</span>
            </button>

            {/* Publisher authentication state — memory-only key, never persisted */}
            {publisherKey.trim() ? (
              <>
                <span
                  className="px-3 py-1.5 rounded-full bg-[#16A765]/10 border border-[#16A765]/40 text-xs font-bold text-[#11844f] flex items-center gap-1.5"
                  title="The publish key is held in memory for this session only"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Publisher authenticated</span>
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="px-3.5 py-1.5 rounded-full bg-card hover:bg-white text-xs font-bold text-ink border border-line transition flex items-center gap-1.5 cursor-pointer"
                  title="Clear the publish key from memory"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>
              </>
            ) : (
              <>
                <span
                  className="px-3 py-1.5 rounded-full bg-page border border-line text-xs font-bold text-mut flex items-center gap-1.5"
                  title="No publish key is held in memory for this session"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#B9A99A]" />
                  <span>Unauthenticated</span>
                </span>
                <button
                  type="button"
                  onClick={() => requestPublisherAuth()}
                  className="px-3.5 py-1.5 rounded-full bg-inkbg hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  title="Authenticate with your AppMintly Publisher Key (memory-only)"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Authenticate</span>
                </button>
              </>
            )}

            </div>

            {/* Row B: primary actions */}
            <div className="flex flex-wrap items-center gap-2">
            {viewMode === 'editor' ? (
              <button
                type="button"
                onClick={handleLeaveEditor}
                className="px-4 py-1.5 rounded-full bg-page hover:bg-line text-xs font-bold text-ink border border-line transition cursor-pointer whitespace-nowrap"
              >
                Back to Catalog
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartAddApp}
                className="px-4 py-1.5 rounded-full bg-inkbg hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Add Application</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyJson}
              className="px-3.5 py-1.5 rounded-full bg-card hover:bg-white text-xs font-bold text-ink border border-line transition flex items-center gap-1.5 cursor-pointer"
              title="Export current catalog JSON"
            >
              {copiedJson ? <Check className="w-3.5 h-3.5 text-[#16A765]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedJson ? 'Copied' : 'Export JSON'}</span>
            </button>
            </div>
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="p-4 sm:p-5 rounded-3xl bg-card border border-line shadow-xs min-w-0">
                <p className="text-xs font-bold text-mut">Total Applications</p>
                <p className="text-2xl font-black text-ink mt-1">{catalog.length}</p>
                <p className="text-[10px] text-[#16A765] font-semibold mt-1">Live in catalog</p>
              </div>

              <div className="p-4 sm:p-5 rounded-3xl bg-card border border-line shadow-xs min-w-0">
                <p className="text-xs font-bold text-mut">Installable PWAs</p>
                <p className="text-2xl font-black text-[#1976F3] mt-1">
                  {catalog.filter((a) => a.type === 'PWA').length}
                </p>
                <p className="text-[10px] text-mut font-semibold mt-1">Manifest enabled</p>
              </div>

              <div className="p-4 sm:p-5 rounded-3xl bg-card border border-line shadow-xs min-w-0">
                <p className="text-xs font-bold text-mut">Android APKs</p>
                <p className="text-2xl font-black text-[#16A765] mt-1">
                  {catalog.filter((a) => a.type === 'Android APK').length}
                </p>
                <p className="text-[10px] text-mut font-semibold mt-1">Direct downloads</p>
              </div>

              <div className="p-4 sm:p-5 rounded-3xl bg-card border border-line shadow-xs min-w-0">
                <p className="text-xs font-bold text-mut">Games &amp; Tools</p>
                <p className="text-2xl font-black text-[#E52B32] mt-1">
                  {catalog.filter((a) => a.type === 'Web Game' || a.type === 'Tool').length}
                </p>
                <p className="text-[10px] text-mut font-semibold mt-1">Interactive</p>
              </div>
            </div>

            {/* Phase 10.6: device-local drafts for apps not yet in the catalog */}
            {(() => {
              const draftEnvelopes: Record<string, DraftEnvelope> = getDraftEnvelopeMap();
              const newDrafts = Object.entries(draftEnvelopes).filter(
                ([slug]) => !catalog.some((a) => (a.slug || a.id).toLowerCase() === slug.toLowerCase())
              );
              if (newDrafts.length === 0) return null;
              return (
                <div className="p-5 rounded-3xl bg-[#1976F3]/5 border border-[#1976F3]/25">
                  <div className="flex items-center gap-2 mb-3">
                    <FilePen className="w-4 h-4 text-[#1976F3]" />
                    <h3 className="text-sm font-black text-ink">Device Drafts (not in the published catalog)</h3>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-[#1976F3]/10 text-[#1976F3] border border-[#1976F3]/30">
                      {newDrafts.length} draft{newDrafts.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-xs text-mut mb-3">
                    These records exist only as device drafts. They never appear on the public marketplace until published.
                  </p>
                  <div className="space-y-2">
                    {newDrafts.map(([slug, envelope]) => (
                      <div key={slug} className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-card border border-line">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-ink truncate">{envelope.data.name || slug}</p>
                          <p className="text-[11px] text-mut truncate">
                            {slug} &bull; v{envelope.data.version || '1.0.0'} &bull; draft &bull; rev {envelope.revision} &bull; saved {new Date(envelope.updatedAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const rec = { ...emptyForm, ...envelope.data, slug } as AppItem;
                              handleEditApp(rec);
                            }}
                            className="px-3 py-1.5 rounded-full bg-page hover:bg-line text-xs font-bold text-ink border border-line transition cursor-pointer flex items-center gap-1.5"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Open Draft</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Discard the device draft "${slug}"? This cannot be undone.`)) {
                                clearSessionEditFor(slug);
                                toast(`Discarded device draft "${slug}".`, 'info');
                              }
                            }}
                            className="px-3 py-1.5 rounded-full bg-card hover:bg-[#E52B32]/10 text-xs font-bold text-[#E52B32] border border-[#E52B32]/30 transition cursor-pointer flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Discard</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Quick Action: Add App Banner */}
            <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-inkbg to-[#2A2E33] text-white flex flex-col md:flex-row items-center justify-between gap-4 shadow-md">
              <div className="space-y-1 text-center md:text-left">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E52B32] text-[10px] font-black uppercase tracking-wider text-white">
                  <Sparkles className="w-3 h-3" /> One-Click Discovery
                </div>
                <h2 className="text-xl font-black">Distribute a New Application</h2>
                <p className="text-xs text-white/70 max-w-xl">
                  Paste any web app or PWA URL. AppMintly automatically parses the manifest, icons, metadata, and service worker indicators.
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-3xl border border-line">
              <div className="relative flex-1 min-w-0 w-full sm:max-w-md">
                <Search className="w-4 h-4 text-mut absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={appSearch}
                  onChange={(e) => setAppSearch(e.target.value)}
                  placeholder="Filter applications by name, developer, category..."
                  className="w-full bg-page border border-transparent rounded-full pl-10 pr-4 py-2 text-xs text-ink placeholder-mut focus:outline-hidden focus:border-[#1976F3]"
                />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto scrollbar-none max-w-full pb-1 -mx-1 px-1">
                {['all', 'PWA', 'Web App', 'Android APK', 'Web Game', 'Tool'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeFilter(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition shrink-0 cursor-pointer ${
                      typeFilter === t
                        ? 'bg-inkbg text-white'
                        : 'bg-page text-mut hover:bg-line'
                    }`}
                  >
                    {t === 'all' ? 'All Types' : t}
                  </button>
                ))}
              </div>
            </div>

            {/* Applications Table / Cards */}
            <div className="bg-card border border-line rounded-3xl overflow-hidden shadow-xs">
              <div className="p-4 sm:p-5 border-b border-line flex items-center justify-between">
                <h3 className="font-black text-sm text-ink">
                  Catalog Records ({filteredApps.length})
                </h3>
                <span className="text-xs text-mut">
                  Authoritative file: <code className="font-mono text-[#1976F3]">data/apps.json</code>
                </span>
              </div>

              <div className="divide-y divide-line">
                {filteredApps.map((app) => (
                  <div
                    key={app.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-page/40 transition-colors"
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
                          <h4 className="font-bold text-sm text-ink truncate">{app.name}</h4>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-page text-ink border border-line">
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
                                : 'bg-mut/15 text-mut border-mut/30'
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
                                : 'bg-page text-mut border-line hover:text-ink'
                            }`}
                            title={app.featured ? 'Featured on Home (Click to toggle OFF)' : 'Not featured on Home (Click to toggle ON)'}
                          >
                            <Sparkles className={`w-3 h-3 ${app.featured ? 'fill-[#F7B928] text-[#F7B928]' : ''}`} />
                            <span>{app.featured ? 'Featured' : 'Standard'}</span>
                          </button>

                          {/* Phase 10.6: device-local draft indicator */}
                          {Boolean(getSessionEditFor(app.slug || app.id)) && (
                            <span
                              className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-[#1976F3]/10 text-[#1976F3] border border-[#1976F3]/30 flex items-center gap-1"
                              title="This app has a device-local draft. Public pages show the published record until you publish."
                            >
                              <FilePen className="w-3 h-3" /> Draft on this device
                            </span>
                          )}

                          {/* APK Status Pill */}
                          {app.apk?.enabled ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-[#16A765]/15 text-[#16A765] border border-[#16A765]/35 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> APK Ready (v{app.apk.versionName})
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-page text-mut border border-line">
                              No APK
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-mut truncate mt-0.5">
                          {app.developer} &bull; {app.category} &bull; v{app.version} &bull; {app.size}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 self-end sm:self-center shrink-0">
                      <Link
                        href={`/app/${app.slug}`}
                        target="_blank"
                        className="p-2 rounded-xl bg-page hover:bg-line text-ink transition cursor-pointer"
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
                        className="px-3.5 py-1.5 rounded-xl bg-inkbg hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteApp(app.id)}
                        className="p-2 rounded-xl bg-page hover:bg-[#E52B32]/10 text-mut hover:text-[#E52B32] transition cursor-pointer"
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
            {/* Unsaved changes banner (Phase 5 truthful editing flow) */}
            {hasUnsavedChanges && (
              <div
                role="alert"
                className="bg-[#F7B928]/10 border border-[#F7B928]/40 rounded-2xl px-4 py-3 flex items-start gap-3"
              >
                <AlertCircle className="w-4 h-4 text-[#F7B928] mt-0.5 shrink-0" />
                <div className="flex-1 text-xs text-mut leading-relaxed">
                  <span className="font-bold text-ink">You have unsaved changes.</span>{' '}
                  These edits exist only in the editor. Save to store them as a device draft, or Publish to Production to update the authoritative catalog.
                </div>
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(true)}
                  className="px-3.5 py-1.5 rounded-full bg-card hover:bg-[#E52B32]/10 text-xs font-bold text-[#E52B32] border border-[#E52B32]/30 transition flex items-center gap-1.5 cursor-pointer shrink-0"
                  aria-label="Discard unsaved changes and restore the last saved state"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Discard</span>
                </button>
              </div>
            )}

            {/* Persistence boundary banner (static GitHub Pages hosting) */}
            <div className="bg-page border border-line rounded-2xl px-4 py-3 flex items-start gap-3">
              <Info className="w-4 h-4 text-[#1976F3] mt-0.5 shrink-0" />
              <div className="text-xs text-mut leading-relaxed">
                <span className="font-bold text-ink">How saving works on this deployment:</span>{' '}
                AppMintly runs as a static site on GitHub Pages. <span className="font-semibold text-ink">Save</span> validates
                your changes and stores them as a <span className="font-semibold text-ink">device draft</span> — it opens again in this console (and in Step 8 Store Preview)
                on this device only, and <span className="font-semibold text-ink">never changes the public marketplace</span> (Home, Explore, Categories, Search and detail
                pages always show the published catalog). To publish permanently, use <span className="font-semibold text-ink">Publish to Production</span> (step 9) — it
                commits <code className="font-mono">data/apps.json</code> through the authorized publishing layer with your publish key and deploys automatically. The
                manual <span className="font-semibold text-ink">Export Catalog JSON</span> path (which includes your device drafts, clearly separated) remains available as a fallback.
              </div>
            </div>

            {/* Workflow Step Tracker */}
            <div className="bg-card border border-line rounded-3xl p-3 sm:p-4 overflow-x-auto scrollbar-none shadow-xs">
              <div className="flex items-center gap-2 min-w-max">
                {steps.map((st, idx) => {
                  const isActive = workflowStep === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => guardedSetWorkflowStep(st.id)}
                      className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
                        isActive
                          ? 'bg-inkbg text-white shadow-xs'
                          : 'bg-page text-mut hover:bg-line hover:text-ink'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                          isActive ? 'bg-[#E52B32] text-white' : 'bg-line text-ink'
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
              <div className="bg-card border border-line rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
                <div>
                  <h3 className="text-base font-black text-ink">
                    Step 1: Application Link &amp; Metadata Discovery
                  </h3>
                  <p className="text-xs text-mut">
                    Enter the web application or PWA URL. AppMintly will inspect the web app manifest, icons, OpenGraph data, and installation readiness.
                  </p>
                </div>

                {/* Quick prefill button */}
                <div className="p-4 rounded-2xl bg-[#16A765]/10 border border-[#16A765]/25 flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-xs">
                    <span className="font-bold text-[#16A765]">Try Primary Showcase App:</span>{' '}
                    <span className="text-ink/80 font-mono">https://pdfly-source.github.io/pdfly-app/</span>
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
                  <label className="text-xs font-bold text-ink">
                    Application URL (HTTPS)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      data-build-field="launchUrl"
                      value={analyzerUrl || form.url}
                      onChange={(e) => {
                        setAnalyzerUrl(e.target.value);
                        setForm((prev) => ({ ...prev, url: e.target.value, webUrl: e.target.value }));
                      }}
                      placeholder="https://your-app.example.com"
                      className="flex-1 bg-page border border-line rounded-2xl px-4 py-3 text-xs font-mono text-ink focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
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
                    <p className="text-[11px] text-ink/70">
                      You can proceed and manually edit any information in the next steps.
                    </p>
                  </div>
                )}

                {/* Discovered Summary Card */}
                {detectedData && (
                  <div className="p-5 rounded-2xl bg-page border border-line space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#16A765]" />
                        <h4 className="font-black text-xs text-ink">
                          Discovered Metadata from {detectedData.name}
                        </h4>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#16A765]/20 text-[#16A765]">
                        {detectedData.pwa.statusSummary}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-2.5 rounded-xl bg-white border border-line">
                        <span className="text-[10px] text-mut font-bold">App Name:</span>
                        <p className="font-bold text-ink truncate">{detectedData.name}</p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-line">
                        <span className="text-[10px] text-mut font-bold">Category:</span>
                        <p className="font-bold text-ink truncate">{detectedData.category}</p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-line">
                        <span className="text-[10px] text-mut font-bold">Manifest URL:</span>
                        <p className="font-mono text-[10px] text-[#1976F3] truncate">
                          {detectedData.manifestUrl || 'Not detected'}
                        </p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-line">
                        <span className="text-[10px] text-mut font-bold">Icons Found:</span>
                        <p className="font-bold text-ink">{detectedData.icons.length} resolutions</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Additional Links: APK & App Stores */}
                <div className="border-t border-line pt-6 space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-mut">
                    Optional Distribution Links
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-ink block mb-1">
                        Direct Android APK Package (.apk)
                      </label>
                      <input
                        type="url"
                        value={form.apkUrl || ''}
                        readOnly={isProtectedRelease}
                        onChange={(e) => setForm({ ...form, apkUrl: e.target.value })}
                        placeholder="https://.../app-v1.0.apk"
                        className={`w-full bg-page border border-line rounded-2xl px-4 py-2 text-xs font-mono text-ink focus:outline-hidden focus:ring-1 focus:ring-[#1976F3] ${isProtectedRelease ? 'opacity-60 cursor-not-allowed' : ''}`}
                      />
                      {isProtectedRelease && (
                        <p className="text-[10px] text-mut mt-1">
                          Read-only: production APK distribution is linked to the verified GitHub release and cannot be edited here.
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-bold text-ink block mb-1">
                        Google Play Store Link
                      </label>
                      <input
                        type="url"
                        value={form.playStoreUrl || ''}
                        onChange={(e) => setForm({ ...form, playStoreUrl: e.target.value })}
                        placeholder="https://play.google.com/store/apps/details?id=..."
                        className="w-full bg-page border border-line rounded-2xl px-4 py-2 text-xs font-mono text-ink focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-line">
                  <button
                    type="button"
                    onClick={() => guardedSetWorkflowStep('basic')}
                    className="px-6 py-2.5 rounded-full bg-inkbg hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Next: Basic Info</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: BASIC INFO */}
            {workflowStep === 'basic' && (
              <div className="bg-card border border-line rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
                <div>
                  <h3 className="text-base font-black text-ink">
                    Step 2: Basic Application Information
                  </h3>
                  <p className="text-xs text-mut">
                    Define title, slug, developer branding, and marketplace classification.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-ink block mb-1">
                      Application Name *
                    </label>
                    <input
                      type="text"
                      data-build-field="name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. PDFMiniFly"
                      className="w-full bg-page border border-line rounded-2xl px-4 py-2.5 text-xs text-ink font-semibold focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-ink block mb-1">
                      Short Name (Home screen badge)
                    </label>
                    <input
                      type="text"
                      value={form.shortName || ''}
                      onChange={(e) => setForm({ ...form, shortName: e.target.value })}
                      placeholder="e.g. PDFMiniFly"
                      className="w-full bg-page border border-line rounded-2xl px-4 py-2.5 text-xs text-ink focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-ink block mb-1">
                      URL Slug (Unique path) *
                    </label>
                    <input
                      type="text"
                      data-build-field="slug"
                      value={form.slug}
                      onChange={(e) => setForm({ ...form, slug: e.target.value })}
                      placeholder="e.g. pdfminifly"
                      className="w-full bg-page border border-line rounded-2xl px-4 py-2.5 text-xs font-mono text-ink focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-ink block mb-1">
                      Developer / Studio *
                      <span className="text-[10px] font-normal text-mut">
                        (the blue &quot;Verified Publisher&quot; badge is granted at the repository level via data/publishers.json — it cannot be self-assigned from this form)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={form.developer}
                      onChange={(e) => setForm({ ...form, developer: e.target.value })}
                      placeholder="e.g. PKD"
                      className="w-full bg-page border border-line rounded-2xl px-4 py-2.5 text-xs text-ink focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-ink block mb-1">
                      Category *
                    </label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="w-full bg-page border border-line rounded-2xl px-4 py-2.5 text-xs text-ink font-semibold focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-ink block mb-1">
                      Internal Distribution Type *
                    </label>
                    <select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value as AppType })}
                      className="w-full bg-page border border-line rounded-2xl px-4 py-2.5 text-xs text-ink font-semibold focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
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
                    <label className="text-xs font-bold text-ink block mb-1">
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
                      className="w-full bg-page border border-line rounded-2xl px-4 py-2.5 text-xs text-ink font-semibold focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    >
                      <option value="published">Published (Live across public marketplace)</option>
                      <option value="draft">Draft (Staged, hidden from marketplace)</option>
                      <option value="archived">Archived (Deprecated, hidden publicly)</option>
                    </select>
                    <p className="text-[10px] text-mut mt-1">
                      Only &ldquo;Published&rdquo; apps appear on Home, Explore, Categories, and Search.
                    </p>
                  </div>
                </div>

                {/* Flags: Featured / Original */}
                <div className="border-t border-line pt-6 flex items-center gap-6 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-ink">
                    <input
                      type="checkbox"
                      checked={form.featured || false}
                      onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                      className="w-4 h-4 rounded-md accent-[#E52B32]"
                    />
                    <span>Highlight as Featured App</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-ink">
                    <input
                      type="checkbox"
                      checked={form.original || false}
                      onChange={(e) => setForm({ ...form, original: e.target.checked })}
                      className="w-4 h-4 rounded-md accent-[#F7B928]"
                    />
                    <span>AppMintly Original</span>
                  </label>
                </div>

                <div className="flex justify-between pt-4 border-t border-line">
                  <button
                    type="button"
                    onClick={() => guardedSetWorkflowStep('links')}
                    className="px-5 py-2.5 rounded-full bg-page text-ink text-xs font-bold hover:bg-line transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => guardedSetWorkflowStep('icon')}
                    className="px-6 py-2.5 rounded-full bg-inkbg hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
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
                    onClick={() => guardedSetWorkflowStep('basic')}
                    className="px-5 py-2.5 rounded-full bg-page text-ink text-xs font-bold hover:bg-line transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => guardedSetWorkflowStep('apk')}
                    className="px-6 py-2.5 rounded-full bg-inkbg hover:bg-[#16A765] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
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
                onNext={() => guardedSetWorkflowStep('screenshots')}
                onPrev={() => guardedSetWorkflowStep('icon')}
                onCatalogRefresh={refreshCatalog}
                onAuthRequired={requestPublisherAuth}
              />
            )}

            {/* STEP 5: SCREENSHOT MANAGER */}
            {workflowStep === 'screenshots' && (
              <div className="space-y-6">
                <ScreenshotManager
                  screenshots={form.screenshots || []}
                  coverScreenshot={form.banner}
                  detectedManifestScreenshots={detectedData?.screenshots || []}
                  slug={form.slug || form.id}
                  onAuthRequired={requestPublisherAuth}
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
                    onClick={() => guardedSetWorkflowStep('apk')}
                    className="px-5 py-2.5 rounded-full bg-page text-ink text-xs font-bold hover:bg-line transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous: APK Build</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => guardedSetWorkflowStep('description')}
                    className="px-6 py-2.5 rounded-full bg-inkbg hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Next: Features &amp; Copy</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5: DESCRIPTION & FEATURES */}
            {workflowStep === 'description' && (
              <div className="bg-card border border-line rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
                <div>
                  <h3 className="text-base font-black text-ink">
                    Step 5: Description &amp; Key Features
                  </h3>
                  <p className="text-xs text-mut">
                    Draft authentic copy describing the application&apos;s capabilities and value proposition.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-ink block mb-1">
                      Short Description (Card summary, max 90 chars)
                    </label>
                    <input
                      type="text"
                      value={form.shortDescription || ''}
                      onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
                      placeholder="e.g. Private PDF Tools. Powerful. Fast. Local."
                      maxLength={120}
                      className="w-full bg-page border border-line rounded-2xl px-4 py-2.5 text-xs text-ink focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-ink block mb-1">
                      Full Description (Detail Page Overview) *
                    </label>
                    <textarea
                      rows={5}
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Describe what the app does, who it's for, and why users will love it..."
                      className="w-full bg-page border border-line rounded-2xl p-4 text-xs text-ink leading-relaxed focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    />
                  </div>
                </div>

                {/* Key Features List Builder */}
                <div className="border-t border-line pt-6 space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-mut">
                    Key Features Checklist ({form.features?.length || 0})
                  </h4>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newFeatureInput}
                      onChange={(e) => setNewFeatureInput(e.target.value)}
                      placeholder="Add key capability (e.g. '100% offline local processing')"
                      className="flex-1 bg-page border border-line rounded-2xl px-4 py-2 text-xs text-ink focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
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
                      className="px-4 py-2 rounded-2xl bg-inkbg hover:bg-[#E52B32] text-white text-xs font-bold transition cursor-pointer"
                    >
                      Add Feature
                    </button>
                  </div>

                  <div className="space-y-2 pt-2">
                    {form.features?.map((feat, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-2xl bg-page border border-line text-xs font-semibold"
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
                          className="text-mut hover:text-[#E52B32] p-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between pt-4 border-t border-line">
                  <button
                    type="button"
                    onClick={() => guardedSetWorkflowStep('screenshots')}
                    className="px-5 py-2.5 rounded-full bg-page text-ink text-xs font-bold hover:bg-line transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => guardedSetWorkflowStep('version')}
                    className="px-6 py-2.5 rounded-full bg-inkbg hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Next: Version &amp; Updates</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 6: VERSION & UPDATES */}
            {workflowStep === 'version' && (
              <div className="bg-card border border-line rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
                <div>
                  <h3 className="text-base font-black text-ink">
                    Step 6: Versioning &amp; Release Notes
                  </h3>
                  <p className="text-xs text-mut">
                    Track version history and announce improvements in the &quot;What&apos;s New&quot; section.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-bold text-ink block mb-1">
                      Current Version *
                    </label>
                    <input
                      type="text"
                      data-build-field="version"
                      value={form.version}
                      readOnly={isProtectedRelease}
                      onChange={(e) => setForm({ ...form, version: e.target.value })}
                      placeholder="1.0.0"
                      className={`w-full bg-page border border-line rounded-2xl px-4 py-2 text-xs font-mono text-ink focus:outline-hidden focus:ring-1 focus:ring-[#1976F3] ${isProtectedRelease ? 'opacity-60 cursor-not-allowed' : ''}`}
                    />
                    {isProtectedRelease && (
                      <p className="text-[10px] text-mut mt-1">
                        Read-only: this version belongs to the verified production APK release and is managed by the release pipeline.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-ink block mb-1">
                      Previous Version
                    </label>
                    <input
                      type="text"
                      value={form.previousVersion || ''}
                      onChange={(e) => setForm({ ...form, previousVersion: e.target.value })}
                      placeholder="0.9.0"
                      className="w-full bg-page border border-line rounded-2xl px-4 py-2 text-xs font-mono text-ink focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-ink block mb-1">
                      Last Updated Date
                    </label>
                    <input
                      type="date"
                      value={form.lastUpdated || new Date().toISOString().split('T')[0]}
                      onChange={(e) => setForm({ ...form, lastUpdated: e.target.value })}
                      className="w-full bg-page border border-line rounded-2xl px-4 py-2 text-xs text-ink focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
                    />
                  </div>
                </div>

                {/* Release notes builder */}
                <div className="border-t border-line pt-6 space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-mut">
                    Release Notes for v{form.version}
                  </h4>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newReleaseNoteInput}
                      onChange={(e) => setNewReleaseNoteInput(e.target.value)}
                      placeholder="e.g. Added dark mode toggle and client-side PDF compression"
                      className="flex-1 bg-page border border-line rounded-2xl px-4 py-2 text-xs text-ink focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
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
                      className="px-4 py-2 rounded-2xl bg-inkbg hover:bg-[#E52B32] text-white text-xs font-bold transition cursor-pointer"
                    >
                      Add Note
                    </button>
                  </div>

                  <div className="space-y-2 pt-2">
                    {form.releaseNotes?.map((note, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-2xl bg-page border border-line text-xs font-semibold"
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
                          className="text-mut hover:text-[#E52B32] p-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between pt-4 border-t border-line">
                  <button
                    type="button"
                    onClick={() => guardedSetWorkflowStep('description')}
                    className="px-5 py-2.5 rounded-full bg-page text-ink text-xs font-bold hover:bg-line transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => guardedSetWorkflowStep('preview')}
                    className="px-6 py-2.5 rounded-full bg-inkbg hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Next: Store Preview</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 7: STORE PREVIEW */}
            {workflowStep === 'preview' && (
              <div className="bg-card border border-line rounded-3xl p-6 sm:p-8 space-y-8 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
                  <div>
                    <h3 className="text-base font-black text-ink">
                      Step 7: Live App Store Listing Preview
                    </h3>
                    <p className="text-xs text-mut">
                      Verify how this application card and detail view will render to marketplace visitors.
                    </p>
                  </div>

                  {(form.url || form.webUrl) && (
                    <a
                      href={form.url || form.webUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-full bg-page hover:bg-line text-ink text-xs font-bold border border-line transition flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Live Destination</span>
                    </a>
                  )}
                </div>

                {/* Marketplace Card Preview */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-mut">
                    Marketplace Card Layout
                  </h4>
                  <div className="max-w-sm">
                    <AppCard app={form} variant="grid" />
                  </div>
                </div>

                {/* Detail Page Top Header Preview */}
                <div className="space-y-3 border-t border-line pt-6">
                  <h4 className="text-xs font-black uppercase tracking-wider text-mut">
                    Detail Page Header Preview
                  </h4>
                  <div className="p-6 rounded-3xl bg-page border border-line flex flex-col sm:flex-row items-center sm:items-start gap-4">
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
                        <span className="text-xs font-semibold text-mut">
                          {form.category} &bull; v{form.version}
                        </span>
                      </div>
                      <h3 className="text-xl font-black text-ink">{form.name || 'Untitled Application'}</h3>
                      <p className="text-xs text-mut">{form.developer}</p>
                      <p className="text-xs text-ink/80 line-clamp-2 pt-1">
                        {form.shortDescription || form.description}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-4 border-t border-line">
                  <button
                    type="button"
                    onClick={() => guardedSetWorkflowStep('version')}
                    className="px-5 py-2.5 rounded-full bg-page text-ink text-xs font-bold hover:bg-line transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => guardedSetWorkflowStep('publish')}
                    className="px-6 py-2.5 rounded-full bg-inkbg hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Next: Publish &amp; Deploy</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 8: PUBLISH & DEPLOY */}
            {workflowStep === 'publish' && (
              <div className="bg-card border border-line rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
                <div>
                  <h3 className="text-base font-black text-ink">
                    Step 8: Publish &amp; Repository Deployment
                  </h3>
                  <p className="text-xs text-mut">
                    Validate configuration, commit to the static catalog buffer, and export updated records for GitHub deployment.
                  </p>
                </div>

                {/* Validation Checklist */}
                <div className="p-5 rounded-2xl bg-page border border-line space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-mut">
                    Pre-Publish Quality Checklist
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        className={`w-4 h-4 ${form.name ? 'text-[#16A765]' : 'text-mut'}`}
                      />
                      <span>App Name Configured: {form.name || 'Missing'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        className={`w-4 h-4 ${
                          form.url || form.apkUrl ? 'text-[#16A765]' : 'text-mut'
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
                        className={`w-4 h-4 ${form.description ? 'text-[#16A765]' : 'text-mut'}`}
                      />
                      <span>Description &amp; Overview Populated</span>
                    </div>
                  </div>
                </div>

                {/* Full validation (Phase 5) */}
                <div className="p-5 rounded-2xl bg-page border border-line space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h4 className="text-xs font-black uppercase tracking-wider text-mut">
                      Validate for Publish
                    </h4>
                    <button
                      type="button"
                      onClick={handleValidateForPublish}
                      disabled={isValidating}
                      className="px-5 py-2.5 rounded-full bg-inkbg hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                      aria-label="Validate this application for publishing"
                    >
                      {isValidating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5" />
                      )}
                      <span>{isValidating ? 'Validating…' : 'Validate Application'}</span>
                    </button>
                  </div>

                  {validationReport && (
                    <div role="alert" className="space-y-2">
                      {validationReport.valid ? (
                        <div className="p-3 rounded-xl bg-[#16A765]/10 border border-[#16A765]/30 text-[#16A765] text-xs font-bold flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          Validation passed — this app is ready to save or publish.
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-[#E52B32]/10 border border-[#E52B32]/30 space-y-1.5">
                          <div className="text-xs font-black text-[#E52B32] flex items-center gap-1.5">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {validationReport.errors.length} validation issue{validationReport.errors.length > 1 ? 's' : ''} must be fixed:
                          </div>
                          <ul className="text-xs text-ink list-disc pl-9 space-y-0.5">
                            {validationReport.errors.map((e, idx) => (
                              <li key={idx}>{e}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {validationReport.warnings.length > 0 && (
                        <ul className="text-xs text-[#F7B928] list-disc pl-9 space-y-0.5">
                          {validationReport.warnings.map((w, idx) => (
                            <li key={idx}>{w}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {/* Save as a device draft (NOT production) */}
                <div className="p-5 rounded-2xl bg-[#1976F3]/10 border border-[#1976F3]/25 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h4 className="font-black text-sm text-[#1976F3]">Save Draft (This Device)</h4>
                    <p className="text-xs text-ink/80 mt-0.5">
                      Validates and stores &quot;{form.name}&quot; as a <span className="font-semibold">device draft</span> — it reopens in this console and in the Store Preview step on <span className="font-semibold">this device only</span>. Public marketplace pages always show the published catalog. This is <span className="font-semibold">not</span> a production publish.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveAppToCatalog}
                    className="px-6 py-3 rounded-full bg-[#1976F3] hover:bg-[#135bbd] text-white text-xs font-black transition flex items-center gap-2 cursor-pointer shadow-xs shrink-0"
                    aria-label="Save this application as a device draft on this device"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save Draft</span>
                  </button>
                </div>

                {/* Production publish through the authorized publishing layer */}
                <div className="p-5 rounded-2xl bg-[#16A765]/10 border border-[#16A765]/25 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="font-black text-sm text-[#16A765] flex items-center gap-1.5">
                        <CloudUpload className="w-4 h-4" />
                        Publish to Production
                      </h4>
                      <p className="text-xs text-ink/80 mt-0.5">
                        Commits <code className="font-mono font-bold">data/apps.json</code> on <code className="font-mono">main</code> through the authorized publishing layer (server-side validated, protected release fields enforced), then the repository deploy workflow publishes it live.
                      </p>
                    </div>
                    {/* Publish lifecycle state chip */}
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider shrink-0">
                      {['VALIDATED', 'PUBLISHING', 'PUBLISHED', 'LIVE'].map((st, idx) => {
                        const order = ['idle', 'validated', 'publishing', 'published', 'live'];
                        const currentIdx = order.indexOf(publishStage);
                        const active = currentIdx > idx;
                        return (
                          <span key={st} className={`px-2 py-1 rounded-full border ${active ? 'bg-[#16A765] text-white border-[#16A765]' : 'bg-card text-mut border-line'}`}>
                            {st}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {serviceStatus && !serviceStatus.available && (
                    <div className="p-3 rounded-xl bg-[#F7B928]/10 border border-[#F7B928]/40 text-xs text-ink flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-[#F7B928] shrink-0 mt-0.5" />
                      <span>
                        <span className="font-bold">Publishing service unavailable.</span>{' '}
                        {serviceStatus.message || 'The authorized publishing layer is not reachable.'} Production publish is disabled — use the manual JSON export path below, or configure the publishing service credentials.
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5 items-end">
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5" />
                        Publisher Authentication
                      </span>
                      {publisherKey.trim() ? (
                        <p className="text-[11px] font-semibold text-[#11844f] flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          ✓ Publisher authenticated — the key is held in memory for this session only and is never stored on this device.
                        </p>
                      ) : (
                        <p className="text-[11px] font-semibold text-mut flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5" />
                          Not authenticated — click Publish to Production to authenticate with your AppMintly Publisher Key (memory-only, never stored on this device).
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handlePublishToProduction}
                      disabled={publishStage === 'publishing'}
                      className="px-6 py-3 rounded-full bg-[#16A765] hover:bg-[#11844f] text-white text-xs font-black transition flex items-center gap-2 cursor-pointer shadow-xs shrink-0 disabled:opacity-50"
                      aria-label="Publish this application to the authoritative production catalog"
                    >
                      {publishStage === 'publishing' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Publishing…</span>
                        </>
                      ) : (
                        <>
                          <CloudUpload className="w-4 h-4" />
                          <span>{publishStage === 'failed' ? 'Retry Publish to Production' : 'Publish to Production'}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {publishStage === 'published' && publishResult?.success && (
                    <div role="status" className="p-4 rounded-2xl bg-[#16A765]/15 border border-[#16A765]/40 space-y-2">
                      <div className="text-xs font-black text-[#16A765] flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        Published to the authoritative production catalog
                      </div>
                      <p className="text-xs text-ink/80">
                        {publishResult.message}
                      </p>
                      {publishResult.commitSha && (
                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-ink">
                          <GitCommitHorizontal className="w-4 h-4 text-[#16A765]" />
                          <span className="font-bold">{publishResult.commitSha.slice(0, 7)}</span>
                          {publishResult.commitUrl && (
                            <a href={publishResult.commitUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1 rounded-full bg-card border border-line hover:bg-line transition cursor-pointer font-sans font-bold" style={{ fontSize: 10 }}>
                              View Commit
                            </a>
                          )}
                          {publishResult.actionsUrl && (
                            <a href={publishResult.actionsUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1 rounded-full bg-card border border-line hover:bg-line transition cursor-pointer font-sans font-bold" style={{ fontSize: 10 }}>
                              Watch Deployment
                            </a>
                          )}
                          {publishResult.deployedUrl && (
                            <a href={publishResult.deployedUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1 rounded-full bg-card border border-line hover:bg-line transition cursor-pointer font-sans font-bold" style={{ fontSize: 10 }}>
                              Open Live App
                            </a>
                          )}
                        </div>
                      )}
                      <p className="text-[10px] text-mut">
                        LIVE status: GitHub Pages finishes deploying typically within 1–2 minutes after the commit.
                      </p>
                    </div>
                  )}

                  {publishStage === 'failed' && publishResult && !publishResult.success && (
                    <div role="alert" className="p-4 rounded-2xl bg-[#E52B32]/10 border border-[#E52B32]/40 space-y-1.5">
                      <div className="text-xs font-black text-[#E52B32] flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4" />
                        PUBLISH FAILED — the authoritative catalog was not changed
                      </div>
                      <p className="text-xs text-ink/80">{publishResult.message}</p>
                      <p className="text-[10px] text-mut">
                        Nothing was committed. Fix the issue or retry above; the manual JSON export path below always works.
                      </p>
                    </div>
                  )}

                  <p className="text-[10px] text-mut flex items-start gap-1.5">
                    <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Security: your publish key never enters the repository, and no GitHub credentials ever run in the browser. The publishing layer enforces server-side validation, protected release fields, and can only ever write <code className="font-mono">data/apps.json</code>.
                  </p>
                </div>

                {/* Git-backed Static Architecture Instructions */}
                <div className="space-y-3 border-t border-line pt-6">
                  <h4 className="text-xs font-black uppercase tracking-wider text-mut flex items-center gap-1.5">
                    <GitBranch className="w-4 h-4 text-[#1976F3]" />
                    <span>Manual Publishing Fallback (No Publish Key Required)</span>
                  </h4>
                  <p className="text-xs text-mut leading-relaxed">
                    AppMintly operates as an ultra-fast, independent static marketplace with no cloud database dependency. To publish your updates to production:
                  </p>

                  <div className="bg-inkbg text-white p-4 rounded-2xl font-mono text-xs space-y-2 overflow-x-auto">
                    <p className="text-mut"># 1. Download or copy your updated catalog JSON</p>
                    <p className="text-[#16A765]">cp downloaded_apps.json data/apps.json</p>
                    <p className="text-mut"># 2. Stage changes and commit</p>
                    <p className="text-white">git add data/apps.json</p>
                    <p className="text-white">git commit -m &quot;feat(catalog): publish {form.slug || 'app'}&quot;</p>
                    <p className="text-mut"># 3. Push to main branch (triggers auto-build)</p>
                    <p className="text-[#1976F3]">git push origin main</p>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleDownloadJson}
                      className="px-5 py-2.5 rounded-full bg-inkbg hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download apps.json</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyJson}
                      className="px-5 py-2.5 rounded-full bg-card hover:bg-white text-ink text-xs font-bold border border-line transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy JSON to Clipboard</span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-between pt-4 border-t border-line">
                  <button
                    type="button"
                    onClick={() => guardedSetWorkflowStep('preview')}
                    className="px-5 py-2.5 rounded-full bg-page text-ink text-xs font-bold hover:bg-line transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous: Preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLeaveEditor}
                    className="px-6 py-2.5 rounded-full bg-inkbg hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Finish &amp; View Catalog</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Discard Changes Confirmation Modal */}
        {showDiscardConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div role="alertdialog" aria-modal="true" aria-label="Confirm discarding unsaved changes" className="bg-card border border-line rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5 text-center animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-[#E52B32]/10 text-[#E52B32] flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-ink">Discard unsaved changes?</h3>
                <p className="text-xs sm:text-sm text-mut mt-2 leading-relaxed">
                  All edits in this session that have not been saved or published will be discarded, and the form restores the last saved state. This cannot be undone.
                </p>
              </div>
              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(false)}
                  className="flex-1 py-3 px-4 rounded-full bg-page hover:bg-line text-ink font-bold text-xs sm:text-sm border border-line transition cursor-pointer"
                  aria-label="Keep editing and cancel discarding"
                >
                  Keep Editing
                </button>
                <button
                  type="button"
                  onClick={handleDiscardChanges}
                  className="flex-1 py-3 px-4 rounded-full bg-[#E52B32] hover:bg-[#c1171d] text-white font-bold text-xs sm:text-sm transition cursor-pointer shadow-xs"
                  aria-label="Confirm discarding all unsaved changes"
                >
                  Discard Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Publisher Success Modal */}
        {publishedAppSuccess && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-card border border-line rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5 text-center animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-[#16A765]/15 text-[#16A765] flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-ink">Published successfully</h3>
                <p className="text-xs sm:text-sm text-mut mt-2 leading-relaxed">
                  Your app <span className="font-bold text-ink">{publishedAppSuccess.name}</span> is now available across the AppMintly marketplace.
                </p>
              </div>

              <div className="space-y-2.5 pt-2">
                <Link
                  href={`/app/${publishedAppSuccess.slug}`}
                  target="_blank"
                  className="w-full py-3 px-4 rounded-full bg-inkbg hover:bg-[#E52B32] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition"
                >
                  <Eye className="w-4 h-4" />
                  <span>View App</span>
                </Link>
                <Link
                  href={`/explore?q=${encodeURIComponent(publishedAppSuccess.name)}`}
                  target="_blank"
                  className="w-full py-3 px-4 rounded-full bg-page hover:bg-line text-ink font-bold text-xs sm:text-sm flex items-center justify-center gap-2 border border-line transition"
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
                  className="w-full py-2.5 px-4 rounded-full text-mut hover:text-ink font-semibold text-xs transition cursor-pointer"
                >
                  View in Catalog
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PUBLISHER AUTHENTICATION DIALOG — memory-only key entry.
            The key is never displayed back, never persisted, and is sent
            only to the Cloudflare Worker over HTTPS. */}
        {authDialogOpen && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 box-border"
            style={{ backgroundColor: 'rgba(23, 25, 28, 0.45)' }}
            role="dialog"
            aria-modal="true"
            aria-label="Publisher Authentication"
          >
            <div className="w-full max-w-[min(28rem,calc(100vw-2rem))] max-h-[90dvh] overflow-y-auto rounded-3xl bg-card border border-line shadow-2xl p-5 sm:p-6 space-y-4 box-border">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-full bg-inkbg flex items-center justify-center">
                    <KeyRound className="w-5 h-5 text-white" />
                  </span>
                  <div>
                    <h2 className="text-sm font-black text-ink">Publisher Authentication</h2>
                    <p className="text-[11px] font-semibold text-mut">Enter your AppMintly Publisher Key</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAuthCancel}
                  className="p-1.5 rounded-full hover:bg-page text-mut hover:text-ink transition cursor-pointer"
                  aria-label="Cancel authentication"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <input
                id="publisher-key-input"
                type="password"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                value={authKeyInput}
                onChange={(e) => {
                  setAuthKeyInput(e.target.value);
                  setAuthError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAuthenticate();
                }}
                placeholder="••••••••••••••••••••"
                className="w-full bg-white border border-line rounded-2xl px-4 py-3 text-sm font-mono tracking-widest text-ink focus:outline-hidden focus:ring-1 focus:ring-[#16A765]"
                aria-label="AppMintly Publisher Key"
              />

              {authError && (
                <p className="text-xs font-bold text-[#E52B32] flex items-center gap-1.5" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{authError}</span>
                </p>
              )}

              <p className="text-[10px] font-semibold text-mut leading-relaxed">
                The key is kept in memory for this session only and is sent only to the AppMintly publishing service. It is never stored in this browser, in the repository, or in the catalog, and it is cleared on refresh or sign out.
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleAuthCancel}
                  className="px-5 py-2.5 rounded-full bg-page hover:bg-line text-xs font-bold text-ink border border-line transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAuthenticate}
                  disabled={authVerifying}
                  className="px-6 py-2.5 rounded-full bg-[#16A765] hover:bg-[#11844f] text-white text-xs font-black transition flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {authVerifying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Verifying…</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Authenticate</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PHASE 10.2 — DESTRUCTIVE DELETE CONFIRMATION DIALOG.
            Auth-gated, typed-confirmation, identity resolved from the
            canonical catalog, production apps permanently protected, and
            NO fake success when the server-side backend lacks a delete
            endpoint. */}
        {deleteDialogOpen && deleteTarget && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 box-border"
            style={{ backgroundColor: 'rgba(23, 25, 28, 0.55)' }}
            role="dialog"
            aria-modal="true"
            aria-label="Delete Application"
          >
            <div className="w-full max-w-[min(28rem,calc(100vw-2rem))] max-h-[90dvh] overflow-y-auto rounded-3xl bg-card border border-line shadow-2xl p-5 sm:p-6 space-y-4 box-border">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-full bg-[#E52B32] flex items-center justify-center">
                    <Trash2 className="w-5 h-5 text-white" />
                  </span>
                  <div>
                    <h2 className="text-sm font-black text-ink">DELETE APPLICATION</h2>
                    <p className="text-[11px] font-semibold text-mut">This action cannot be undone.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteDialogCancel}
                  disabled={deleteRunning}
                  className="p-1.5 rounded-full hover:bg-page text-mut hover:text-ink transition cursor-pointer disabled:opacity-40"
                  aria-label="Cancel deletion"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {deleteStep === 'protected' && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-[#E52B32]">
                    This production application is PROTECTED and can never be deleted from the console.
                  </p>
                  <div className="rounded-xl bg-page border border-line p-3 text-[11px] font-semibold text-mut space-y-1">
                    <div>Application: {deleteTarget.name}</div>
                    <div>Package: {deleteTarget.apk?.packageId || '—'}</div>
                    <div>Version: {deleteTarget.version}</div>
                  </div>
                  <p className="text-[11px] text-mut font-medium">
                    Studyria and PDFMiniFly are protected production releases (403). Their catalog records,
                    APK binaries, tags and assets are permanently locked.
                  </p>
                </div>
              )}

              {(deleteStep === 'confirming' || deleteStep === 'authenticating' || deleteStep === 'validating') && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-ink">
                    This permanently removes this application from the AppMintly catalog and its
                    associated release metadata. This action cannot be undone.
                  </p>
                  <div className="rounded-xl bg-page border border-line p-3 text-[11px] font-semibold text-mut space-y-1">
                    <div>Application: {deleteTarget.name}</div>
                    <div>Package: {deleteTarget.apk?.packageId || '—'}</div>
                    <div>Version: {deleteTarget.version}{deleteTarget.apk?.versionCode ? ` (code ${deleteTarget.apk.versionCode})` : ''}</div>
                  </div>
                  <label className="block text-[11px] font-bold text-ink">
                    Type DELETE to confirm
                    <input
                      type="text"
                      value={deleteConfirmInput}
                      onChange={(e) => setDeleteConfirmInput(e.target.value)}
                      placeholder="DELETE"
                      autoComplete="off"
                      spellCheck={false}
                      className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-page border border-line text-xs font-bold text-ink placeholder:text-mut focus:outline-none focus:ring-2 focus:ring-ink"
                    />
                  </label>
                  {deleteError && <p className="text-[11px] font-bold text-[#E52B32]">{deleteError}</p>}
                  <div className="rounded-xl bg-page border border-line p-3 text-[11px] font-semibold text-mut space-y-1">
                    <div className={deleteStep !== 'confirming' ? 'text-mut' : 'text-ink'}>• CONFIRMING {deleteStep === 'confirming' ? '← current step' : '✓'}</div>
                    <div className={deleteStep === 'authenticating' ? 'text-ink' : 'text-mut'}>• AUTHENTICATING {deleteStep === 'authenticating' ? '← current step' : ''}</div>
                    <div className={deleteStep === 'validating' ? 'text-ink' : 'text-mut'}>• VALIDATING SERVER-SIDE SUPPORT {deleteStep === 'validating' ? '← current step' : ''}</div>
                    <div className="text-mut">• REMOVING RELEASE ASSET / RELEASE / TAG</div>
                    <div className="text-mut">• UPDATING CATALOG / DEPLOYING / VERIFYING</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDeleteDialogConfirm}
                    disabled={deleteRunning || deleteConfirmInput.trim() !== 'DELETE'}
                    className="w-full py-3 rounded-xl bg-[#E52B32] hover:bg-[#c62228] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    {deleteRunning ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{deleteStep === 'authenticating' ? 'AUTHENTICATING…' : deleteStep === 'validating' ? 'VALIDATING…' : 'CONFIRMING…'}</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4" />
                        <span>Permanently Delete</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {deleteStep === 'failed' && (
                <div className="space-y-3">
                  <p className="text-xs font-black text-[#E52B32]">FAILED</p>
                  <p className="text-[11px] font-semibold text-mut">{deleteError}</p>
                  <p className="text-[11px] text-mut font-medium">
                    Verified safe state: no release asset, release, tag, or catalog record was modified.
                  </p>
                  <button
                    type="button"
                    onClick={handleDeleteDialogCancel}
                    className="w-full py-2.5 rounded-xl bg-inkbg hover:bg-page text-white text-xs font-bold transition cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
