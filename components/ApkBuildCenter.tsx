'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Download,
  ExternalLink,
  RefreshCw,
  Copy,
  Check,
  ArrowRight,
  ArrowLeft,
  Terminal,
  Cpu,
  Globe,
  Settings,
  Flame,
} from 'lucide-react';
import { AppItem, ApkMetadata } from '@/data/apps';
import { useToast } from '@/lib/ToastContext';
import { apiUrl } from '@/lib/api-path';
import {
  BUILD_SERVICE_ENDPOINT,
  ANALYZE_SERVICE_ENDPOINT,
  serviceFetchJson,
} from '@/lib/production-publish';
import {
  BuildUiState,
  assertDispatchTargets,
  collectDomFieldValues,
  extractGitHubRunApiUrl,
  mapGitHubRunStatus,
} from '@/lib/build-dispatch-gate';

interface ApkBuildCenterProps {
  form: AppItem;
  onUpdateForm: (fields: Partial<AppItem>) => void;
  onNext: () => void;
  onPrev: () => void;
  onCatalogRefresh: () => Promise<void>;
  /**
   * Requests publisher authentication. Opens the authentication dialog
   * automatically when no key is held in memory; resolves with the
   * authenticated key, or an empty string if authentication did not happen.
   * The key lives only in runtime memory for the page session and is never
   * persisted on the device.
   */
  onAuthRequired: () => Promise<string>;
}

export function ApkBuildCenter({
  form,
  onUpdateForm,
  onNext,
  onPrev,
  onCatalogRefresh,
  onAuthRequired,
}: ApkBuildCenterProps) {
  const { toast } = useToast();

  // Settings
  const [authorized, setAuthorized] = useState(form.apk?.authorized ?? true);
  const [buildMode, setBuildMode] = useState<'webview' | 'twa'>(form.apk?.buildMode || 'webview');
  const [packageIdInput, setPackageIdInput] = useState(
    form.apk?.packageId || `com.appmintly.${(form.slug || 'app').toLowerCase().replace(/[^a-z0-9]/g, '')}`
  );
  const [packageIdError, setPackageIdError] = useState<string | null>(null);

  // Build state
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildJob, setBuildJob] = useState<any | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [copiedSha, setCopiedSha] = useState(false);

  // Update Detection State
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [detectedVersion, setDetectedVersion] = useState<string | null>(null);
  const [hasNewVersion, setHasNewVersion] = useState(false);

  // Validate package ID syntax
  const validatePackageId = (id: string): boolean => {
    const pkgRegex = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
    if (!pkgRegex.test(id.toLowerCase())) {
      setPackageIdError('Must be valid Android format: lowercase, dot-separated (e.g. com.appmintly.myapp)');
      return false;
    }
    setPackageIdError(null);
    return true;
  };

  const handlePackageIdChange = (val: string) => {
    const clean = val.toLowerCase().trim();
    setPackageIdInput(clean);
    validatePackageId(clean);
  };

  const handleStartBuild = async () => {
    if (!authorized) {
      toast('Distribution authorization is required before generating an Android APK.', 'error');
      return;
    }

    if (!validatePackageId(packageIdInput)) {
      toast('Invalid Android Package ID. Please correct the format.', 'error');
      return;
    }

    const launchUrl = form.launchUrl || form.webUrl || form.url;
    if (!launchUrl) {
      toast('Application launch URL is required.', 'error');
      return;
    }

    setIsBuilding(true);
    setBuildError(null);

    try {
      // Authentication gate: never call the build endpoint without an
      // authenticated publisher. onAuthRequired opens the authentication
      // dialog automatically when no key is in memory and resolves with
      // the key ('' if not authenticated). The key stays memory-only.
      const key = await onAuthRequired();
      if (!key) {
        setIsBuilding(false);
        setBuildError(null);
        toast('Publisher authentication is required to start a production build.', 'info');
        return;
      }

      // -----------------------------------------------------------------
      // PRE-DISPATCH SAFETY GATE (Phase 7.6)
      // The exact payload that would be sent is built FIRST, then verified
      // against the React state and the visible UI inputs. UI target must
      // equal React state must equal payload. Any mismatch BLOCKS the
      // dispatch before any network call — no build service request, no
      // workflow dispatch, no release creation.
      // -----------------------------------------------------------------
      const payload = {
        slug: form.slug,
        name: form.name,
        versionName: form.version || '1.0.0',
        launchUrl,
        packageId: packageIdInput.trim(),
      };
      const gate = assertDispatchTargets(payload, {
        slug: form.slug,
        name: form.name,
        versionName: form.version || '1.0.0',
        launchUrl,
        packageId: packageIdInput.trim(),
      }, collectDomFieldValues());
      if (!gate.pass) {
        setIsBuilding(false);
        setBuildError(gate.message);
        toast(gate.message, 'error');
        console.error('[AppMintly] Pre-dispatch gate blocked the build:', gate.mismatches);
        return; // HARD STOP — nothing is dispatched
      }

      const result = await serviceFetchJson(BUILD_SERVICE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          publishKey: key,
          app: {
            slug: payload.slug,
            name: payload.name,
            versionName: payload.versionName,
            launchUrl: payload.launchUrl,
            iconUrl: form.icon,
            themeColor: form.themeColor || '#17191C',
            backgroundColor: form.backgroundColor || '#FFFDF8',
            buildMode,
            packageId: payload.packageId,
          },
        }),
      });

      if (!result.ok || !result.data?.success) {
        throw new Error(
          result.unavailable
            ? 'Build service temporarily unavailable. Please try again.'
            : result.data?.error || result.data?.message || 'Failed to start APK build process'
        );
      }

      // A REAL build has been accepted: the service dispatched the GitHub
      // Actions production workflow and returned its actual run id.
      const buildId = result.data.buildId as string;
      setBuildJob({
        status: 'queued',
        state: 'QUEUED',
        runUrl: result.data.runUrl,
        error: null,
      });

      // -----------------------------------------------------------------
      // BUILD STATUS POLLING (Phase 7.6)
      // GitHub Actions is the ONLY authoritative source of build state.
      // Polling order of truth:
      //   1. The build service (Worker) status — used when it returns a
      //      usable, GitHub-backed state.
      //   2. The public, unauthenticated GitHub Actions run API
      //      (https://api.github.com/repos/<owner>/<repo>/actions/runs/<id>)
      //      — checked at least once a minute and whenever the service
      //      status is unusable. No token or secret is needed; the repo is
      //      public and the browser only reads run status.
      // The UI NEVER invents progress or success from a local timer. It
      // stops polling exactly when GitHub reports a terminal state.
      // -----------------------------------------------------------------
      const serviceStateToJob = (data: any) => {
        // GitHub-native fields are authoritative when the service returns them.
        const ghStatus = data?.githubRunStatus ?? data?.runStatus ?? null;
        const ghConclusion = data?.githubRunConclusion ?? data?.runConclusion ?? null;
        let state: BuildUiState;
        if (ghStatus) {
          state = mapGitHubRunStatus(ghStatus, ghConclusion);
        } else if (['QUEUED', 'BUILDING', 'SUCCESS', 'FAILED'].includes(data?.status)) {
          state = data.status;
        } else if (typeof data?.status === 'string' && data.status) {
          // raw GitHub status (queued / in_progress / completed + conclusion)
          state = mapGitHubRunStatus(data.status, data.conclusion);
        } else {
          state = 'QUEUED';
        }
        return {
          status: state === 'SUCCESS' ? 'completed' : state === 'FAILED' ? 'failed' : 'building',
          state,
          runUrl: data?.runUrl,
          apkMetadata: data?.apkMetadata || null,
          apkUrl: data?.apkMetadata?.apkUrl || null,
          error: data?.error || null,
        };
      };

      const githubRunApi = extractGitHubRunApiUrl(result.data.runUrl);
      const pollStartedAt = Date.now();
      const MAX_POLL_MS = 30 * 60 * 1000; // stop polling after 30 minutes
      let workerFailureCount = 0;
      let tick = 0;
      let finished = false;

      const finishWithSuccess = async (job: ReturnType<typeof serviceStateToJob>) => {
        clearInterval(pollTimer);
        finished = true;
        setIsBuilding(false);
        setBuildJob({ ...job, state: 'SUCCESS', status: 'completed', error: null });
        if (job.apkMetadata) {
          onUpdateForm({
            apkUrl: job.apkUrl,
            apk: job.apkMetadata,
            version: job.apkMetadata.versionName || form.version,
            type: 'Android APK',
          });
          await onCatalogRefresh();
          toast(`APK for ${form.name} built, signed and published successfully!`, 'success');
        } else {
          // GitHub says the run completed with success but the service did not
          // return release metadata yet — refresh the catalog so the console
          // loads the published release from the repository.
          await onCatalogRefresh();
          toast('Build completed successfully on GitHub Actions. Refresh the catalog to load the release details.', 'info');
        }
      };

      const finishWithFailure = (job: ReturnType<typeof serviceStateToJob> | null, message: string) => {
        clearInterval(pollTimer);
        finished = true;
        setIsBuilding(false);
        setBuildError(message);
        setBuildJob((prev: any) => ({ ...(job ?? prev), state: 'FAILED', status: 'failed', error: message }));
        toast(`Build failed: ${message}`, 'error');
      };

      const pollGithubOnce = async (): Promise<{ state: BuildUiState; url: string } | null> => {
        if (!githubRunApi) return null;
        try {
          const res = await fetch(githubRunApi.apiBaseUrl, {
            headers: { Accept: 'application/vnd.github+json' },
          });
          if (!res.ok) return null;
          const run = await res.json();
          const state = mapGitHubRunStatus(run.status, run.conclusion);
          return { state, url: run.html_url || githubRunApi.runUrl };
        } catch {
          return null;
        }
      };

      const pollTimer = setInterval(async () => {
        if (finished) return;
        tick += 1;

        // Absolute stop: never poll forever.
        if (Date.now() - pollStartedAt > MAX_POLL_MS) {
          finishWithFailure(
            null,
            'Build status could not be confirmed within 30 minutes. Check the GitHub Actions run for the real result.'
          );
          return;
        }

        try {
          // 1. Poll the build service (Worker).
          let job: ReturnType<typeof serviceStateToJob> | null = null;
          try {
            const pollRes = await serviceFetchJson(`${BUILD_SERVICE_ENDPOINT}?buildId=${encodeURIComponent(buildId)}`);
            if (pollRes.ok && pollRes.data?.success) {
              workerFailureCount = 0;
              job = serviceStateToJob(pollRes.data);
              setBuildJob(job);
              if (job.status === 'completed') {
                await finishWithSuccess(job);
                return;
              }
              if (job.status === 'failed') {
                finishWithFailure(job, job.error || 'GitHub Actions run completed without success');
                return;
              }
            } else {
              workerFailureCount += 1;
            }
          } catch (pollErr) {
            console.error('Build service polling error:', pollErr);
            workerFailureCount += 1;
          }

          // 2. Authoritative cross-check against the GitHub Actions API —
          //    every minute, and immediately whenever the service status was
          //    unusable (this is exactly how a stale QUEUED gets corrected).
          const serviceUnusable = !job || workerFailureCount > 0;
          if (githubRunApi && (tick % 6 === 0 || serviceUnusable)) {
            const gh = await pollGithubOnce();
            if (gh) {
              workerFailureCount = 0; // GitHub is authoritative and reachable.
              if (gh.state === 'SUCCESS') {
                await finishWithSuccess(job ?? { status: 'completed', state: 'SUCCESS', runUrl: gh.url, apkMetadata: null, apkUrl: null, error: null });
                return;
              }
              if (gh.state === 'FAILED') {
                finishWithFailure(job, 'GitHub Actions run completed with a non-success conclusion');
                return;
              }
              setBuildJob({ status: 'building', state: gh.state, runUrl: gh.url, apkMetadata: job?.apkMetadata ?? null, apkUrl: job?.apkUrl ?? null, error: null });
            }
          }

          // 3. Truthful unavailability notice: the service is unreachable and
          //    no GitHub state could be read. Show the run link; never
          //    fabricate a state from a timer.
          if (workerFailureCount >= 6) {
            setBuildJob((prev: any) => ({
              ...prev,
              state: prev?.state === 'SUCCESS' || prev?.state === 'FAILED' ? prev.state : 'QUEUED',
              runUrl: githubRunApi?.runUrl || prev?.runUrl,
              error: 'Live build status is temporarily unavailable. Follow the run on GitHub for the authoritative result.',
            }));
          }
        } catch (pollErr) {
          console.error('Build polling error:', pollErr);
        }
      }, 10000);
    } catch (err: any) {
      setIsBuilding(false);
      setBuildError(err.message || 'Build initialization failed');
      toast(err.message || 'Build error', 'error');
    }
  };

  const handleRefreshMetadata = async () => {
    const launchUrl = form.launchUrl || form.webUrl || form.url;
    if (!launchUrl) {
      toast('Configure launch URL first.', 'error');
      return;
    }

    setIsCheckingUpdates(true);
    setHasNewVersion(false);

    try {
      const result = await serviceFetchJson(ANALYZE_SERVICE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: launchUrl }),
      });
      if (!result.ok && result.unavailable) {
        toast('Metadata analysis service temporarily unavailable. Please try again.', 'error');
        return;
      }
      const json = result.ok ? result.data : null;
      if (json && json.success && json.data) {
        const foundVer = json.data.version || '1.0.0';
        setDetectedVersion(foundVer);
        if (foundVer !== form.version) {
          setHasNewVersion(true);
          toast(`New version detected on web: v${foundVer} (Catalog: v${form.version})`, 'info');
        } else {
          toast(`Catalog version (v${form.version}) is synchronized with live web app.`, 'success');
        }
      } else {
        toast('No updated version detected from web manifest.', 'info');
      }
    } catch (e) {
      toast('Failed to inspect remote web app.', 'error');
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const handleApplyNewVersion = () => {
    if (detectedVersion) {
      onUpdateForm({
        previousVersion: form.version,
        version: detectedVersion,
      });
      setHasNewVersion(false);
      toast(`Updated form to version ${detectedVersion}. Ready to build updated APK.`, 'success');
    }
  };

  const handleCopySha = (sha: string) => {
    navigator.clipboard.writeText(sha);
    setCopiedSha(true);
    setTimeout(() => setCopiedSha(false), 2000);
  };

  const handleDownloadVerifiedApk = async () => {
    if (!currentApk) return;
    const fileName =
      currentApk.fileName ||
      `${form.name.replace(/[^a-zA-Z0-9]/g, '') || 'App'}-${form.version}.apk`;

    try {
      const endpoints = [
        apiUrl(`/api/download-apk/${encodeURIComponent(fileName)}`),
        currentApk.apkUrl,
        `/downloads/apks/${encodeURIComponent(fileName)}`,
        `/downloads/apks/${form.slug}-v${form.version}.apk`,
      ].filter(Boolean) as string[];

      let response: Response | null = null;
      for (const ep of endpoints) {
        try {
          const res = await fetch(ep);
          if (res.ok) {
            response = res;
            break;
          }
        } catch (ignored) {}
      }

      if (!response || !response.ok) {
        throw new Error('APK download unavailable: File could not be retrieved from build server.');
      }

      const ct = response.headers.get('content-type') || '';
      if (ct.includes('text/html') || ct.includes('application/json')) {
        throw new Error('Server returned an authentication or cookie-check page instead of the APK binary.');
      }

      const arrayBuf = await response.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuf);
      if (uint8.length < 4 || uint8[0] !== 0x50 || uint8[1] !== 0x4b) {
        throw new Error('Retrieved file is not a valid Android APK binary.');
      }

      const blob = new Blob([arrayBuf], { type: 'application/vnd.android.package-archive' });
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60000);
      toast(`Saved ${fileName} to Downloads successfully.`, 'success');
    } catch (err: any) {
      toast(err.message || 'Download failed', 'error');
    }
  };

  const currentApk = form.apk;
  const isApkReady = !!(currentApk?.enabled && currentApk?.apkUrl);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#FFFDF8] border border-[#E8DED0] rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-2xl bg-[#16A765]/15 text-[#16A765]">
                <Smartphone className="w-5 h-5" />
              </span>
              <h3 className="text-xl font-black text-[#17191C] tracking-tight">
                Android App Build Pipeline
              </h3>
            </div>
            <p className="text-xs text-[#6F6F6F] mt-1.5 max-w-2xl leading-relaxed">
              Generate an official, signed, standalone Android APK directly from{' '}
              <strong className="text-[#17191C]">{form.name || 'your application'}</strong>. The resulting binary installs as a native Android launcher app with its own icon, identity, and splash branding.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefreshMetadata}
              disabled={isCheckingUpdates}
              className="px-3.5 py-1.5 rounded-full bg-[#F8F2E7] hover:bg-[#E8DED0] text-xs font-bold text-[#17191C] border border-[#E8DED0] transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdates ? 'animate-spin text-[#1976F3]' : ''}`} />
              <span>Refresh Web Metadata</span>
            </button>
          </div>
        </div>

        {/* Update Notification Banner */}
        {hasNewVersion && detectedVersion && (
          <div className="p-4 rounded-2xl bg-[#F7B928]/20 border border-[#F7B928]/40 flex items-center justify-between gap-4 flex-wrap animate-in fade-in">
            <div className="flex items-center gap-3">
              <Flame className="w-5 h-5 text-[#8C6000] shrink-0" />
              <div>
                <p className="font-black text-xs text-[#8C6000]">NEW VERSION DETECTED</p>
                <p className="text-xs text-[#17191C] mt-0.5">
                  Remote web app published version <strong>v{detectedVersion}</strong> (Current catalog: v{form.version}).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleApplyNewVersion}
              className="px-4 py-2 rounded-xl bg-[#17191C] hover:bg-[#8C6000] text-white text-xs font-bold transition cursor-pointer"
            >
              Update to v{detectedVersion} &amp; Rebuild
            </button>
          </div>
        )}

        {/* Configuration Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[#E8DED0]">
          {/* Section 1: Authorization & Package ID */}
          <div className="space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#6F6F6F] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#16A765]" />
              <span>1. Distribution Authorization</span>
            </h4>

            <div className="p-4 rounded-2xl bg-[#F8F2E7] border border-[#E8DED0] space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={authorized}
                  onChange={(e) => setAuthorized(e.target.checked)}
                  className="w-4 h-4 rounded-md accent-[#16A765] mt-0.5"
                />
                <div className="text-xs">
                  <span className="font-bold text-[#17191C]">
                    I own/control this application or have permission to distribute it.
                  </span>
                  <p className="text-[#6F6F6F] text-[11px] leading-relaxed mt-1">
                    AppMintly operates as a verified app marketplace. Direct APK wrappers will only be compiled for authorized first-party web apps, PWAs, and tools.
                  </p>
                </div>
              </label>
            </div>

            <div>
              <label className="text-xs font-bold text-[#17191C] block mb-1">
                Android Package ID (Application ID) *
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={packageIdInput}
                  onChange={(e) => handlePackageIdChange(e.target.value)}
                  placeholder="com.appmintly.myapp"
                  data-build-field="packageId"
                  className={`w-full bg-[#F8F2E7] border rounded-2xl px-4 py-2.5 text-xs font-mono text-[#17191C] focus:outline-hidden focus:ring-1 ${
                    packageIdError
                      ? 'border-[#E52B32] focus:ring-[#E52B32]'
                      : 'border-[#E8DED0] focus:ring-[#16A765]'
                  }`}
                />
              </div>
              {packageIdError ? (
                <p className="text-[11px] text-[#E52B32] mt-1 font-semibold">{packageIdError}</p>
              ) : (
                <p className="text-[11px] text-[#6F6F6F] mt-1">
                  Unique Android package syntax: lowercase, dot-separated identifier.
                </p>
              )}
            </div>
          </div>

          {/* Section 2: Build Mode */}
          <div className="space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#6F6F6F] flex items-center gap-1.5">
              <Settings className="w-4 h-4 text-[#1976F3]" />
              <span>2. Build Strategy Mode</span>
            </h4>

            <div className="space-y-3">
              {/* Mode B: Hardened WebView Wrapper */}
              <div
                onClick={() => setBuildMode('webview')}
                className={`p-4 rounded-2xl border cursor-pointer transition ${
                  buildMode === 'webview'
                    ? 'bg-[#16A765]/10 border-[#16A765]'
                    : 'bg-[#F8F2E7] border-[#E8DED0] hover:border-[#17191C]/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-xs text-[#17191C]">
                      MODE B — Native WebView Engine
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#16A765]/20 text-[#16A765]">
                      Recommended Fallback
                    </span>
                  </div>
                  <input
                    type="radio"
                    name="buildMode"
                    checked={buildMode === 'webview'}
                    onChange={() => setBuildMode('webview')}
                    className="accent-[#16A765]"
                  />
                </div>
                <p className="text-[11px] text-[#6F6F6F] mt-1.5 leading-relaxed">
                  Hardened origin-confined native Android WebView. Safe Browsing enabled, DOM storage, download listeners, file upload support, no native API leakage. Only allowed origin: configured application host.
                </p>
              </div>

              {/* Mode A: TWA */}
              <div
                onClick={() => setBuildMode('twa')}
                className={`p-4 rounded-2xl border cursor-pointer transition ${
                  buildMode === 'twa'
                    ? 'bg-[#1976F3]/10 border-[#1976F3]'
                    : 'bg-[#F8F2E7] border-[#E8DED0] hover:border-[#17191C]/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-xs text-[#17191C]">
                      MODE A — Trusted Web Activity (TWA)
                    </span>
                  </div>
                  <input
                    type="radio"
                    name="buildMode"
                    checked={buildMode === 'twa'}
                    onChange={() => setBuildMode('twa')}
                    className="accent-[#1976F3]"
                  />
                </div>
                <p className="text-[11px] text-[#6F6F6F] mt-1.5 leading-relaxed">
                  Uses Chrome Custom Tabs TWA architecture. Requires full HTTPS, valid Web App Manifest, Service Worker, and remote <code className="font-mono text-[#17191C]">.well-known/assetlinks.json</code> domain verification.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Build Pipeline Execution UI */}
        <div className="pt-4 border-t border-[#E8DED0] space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-[#6F6F6F]">
                3. APK Generation &amp; Release Signing
              </h4>
              <p className="text-xs text-[#6F6F6F] mt-0.5">
                Target: <code className="font-mono text-[#17191C]">{packageIdInput}</code> • Version{' '}
                <strong className="text-[#17191C]">{form.version}</strong>
              </p>
            </div>

            <button
              type="button"
              onClick={handleStartBuild}
              disabled={isBuilding || !authorized || !!packageIdError}
              className="px-6 py-3 rounded-2xl bg-[#17191C] hover:bg-[#16A765] text-white text-xs font-black shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
            >
              <Cpu className={`w-4 h-4 ${isBuilding ? 'animate-spin' : ''}`} />
              <span>{isBuilding ? 'Building APK...' : isApkReady ? 'Rebuild Android APK' : 'Generate Android APK'}</span>
            </button>
          </div>

          {/* Live Build Progress — REAL GitHub Actions run states only */}
          {buildJob && (
            <div className="bg-[#F8F2E7] border border-[#E8DED0] rounded-2xl p-5 space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between text-xs font-bold text-[#17191C] gap-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full animate-ping ${buildJob.state === 'FAILED' ? 'bg-[#E52B32]' : 'bg-[#16A765]'}`} />
                  <span>Production Build: {buildJob.state === 'QUEUED' ? 'QUEUED — waiting for a GitHub Actions runner' : buildJob.state === 'BUILDING' ? 'BUILDING — compiling, signing and validating on GitHub Actions' : buildJob.state === 'SUCCESS' ? 'SUCCESS — APK built, signed and published' : 'FAILED'}</span>
                </div>
                {buildJob.runUrl && (
                  <a
                    href={buildJob.runUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1 rounded-full bg-white border border-[#E8DED0] hover:bg-[#E8DED0] text-[#17191C] text-[10px] font-bold transition flex items-center gap-1 shrink-0"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>View run on GitHub</span>
                  </a>
                )}
              </div>

              {/* Truthful state chips: no invented percentages, no fake stages */}
              <div className="flex flex-wrap gap-1.5">
                {['QUEUED', 'BUILDING', 'SUCCESS'].map((st) => {
                  const order = ['QUEUED', 'BUILDING', 'SUCCESS'];
                  const failed = buildJob.state === 'FAILED';
                  const active = !failed && order.indexOf(buildJob.state) >= order.indexOf(st);
                  return (
                    <span
                      key={st}
                      className={`px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${
                        failed && st !== 'QUEUED'
                          ? 'bg-[#E52B32]/10 text-[#E52B32] border-[#E52B32]/40'
                          : active
                          ? 'bg-[#16A765] text-white border-[#16A765]'
                          : 'bg-white/50 text-[#6F6F6F] border-[#E8DED0]'
                      }`}
                    >
                      {st}
                    </span>
                  );
                })}
                {buildJob.state === 'FAILED' && (
                  <span className="px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider bg-[#E52B32] text-white border-[#E52B32]">
                    FAILED
                  </span>
                )}
              </div>

              {buildJob.state === 'BUILDING' && (
                <p className="text-[11px] text-[#6F6F6F]">
                  The run updates in near real time; you can follow every step on GitHub. This page only reports what the build service actually observes.
                </p>
              )}
            </div>
          )}

          {/* Build Error Alert */}
          {buildError && (
            <div className="p-4 rounded-2xl bg-[#E52B32]/10 border border-[#E52B32]/30 flex items-start gap-3 text-xs text-[#E52B32]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">APK Build Failed</p>
                <p className="text-[#17191C]/80 mt-0.5">{buildError}</p>
              </div>
            </div>
          )}

          {/* Active / Saved APK Release Banner */}
          {isApkReady && currentApk && (
            <div className="p-5 rounded-2xl bg-white border border-[#16A765]/40 shadow-xs space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-2xl bg-[#16A765]/15 text-[#16A765] flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </span>
                  <div>
                    <h5 className="font-extrabold text-sm text-[#17191C]">
                      Production Android APK Ready
                    </h5>
                    <p className="text-xs text-[#6F6F6F]">
                      {currentApk.packageId} • Version {currentApk.versionName} (Code: {currentApk.versionCode})
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadVerifiedApk}
                    className="px-4 py-2 rounded-xl bg-[#17191C] hover:bg-[#16A765] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download APK</span>
                  </button>

                  <Link
                    href={`/app/${form.slug}`}
                    target="_blank"
                    className="px-4 py-2 rounded-xl bg-[#F8F2E7] hover:bg-[#E8DED0] text-[#17191C] text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>View App Listing</span>
                  </Link>
                </div>
              </div>

              {/* Technical Specifications */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs border-t border-[#E8DED0]">
                <div>
                  <span className="text-[#6F6F6F] block text-[11px]">Artifact Size:</span>
                  <span className="font-mono font-bold text-[#17191C]">
                    {(currentApk.fileSizeBytes / 1024).toFixed(1)} KB ({currentApk.fileSizeBytes.toLocaleString()} bytes)
                  </span>
                </div>

                <div>
                  <span className="text-[#6F6F6F] block text-[11px]">Signature Status:</span>
                  <span className="font-bold text-[#16A765] flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Signed (v1, v2, v3 schemes)</span>
                  </span>
                </div>

                <div>
                  <span className="text-[#6F6F6F] block text-[11px]">Build Strategy:</span>
                  <span className="font-bold text-[#17191C] uppercase text-[11px]">
                    {currentApk.buildMode === 'twa' ? 'Trusted Web Activity' : 'Native WebView Engine'}
                  </span>
                </div>
              </div>

              {/* SHA-256 Checksum */}
              {currentApk.sha256 && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-[#F8F2E7] border border-[#E8DED0] text-xs gap-3">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-[#6F6F6F] text-[11px] font-bold shrink-0">SHA-256:</span>
                    <span className="font-mono text-[#17191C] text-[11px] truncate">
                      {currentApk.sha256}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopySha(currentApk.sha256)}
                    className="p-1 rounded-md hover:bg-white text-[#17191C] shrink-0 cursor-pointer"
                    title="Copy Checksum"
                  >
                    {copiedSha ? <Check className="w-3.5 h-3.5 text-[#16A765]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step Navigation Buttons */}
        <div className="flex justify-between pt-4 border-t border-[#E8DED0]">
          <button
            type="button"
            onClick={onPrev}
            className="px-5 py-2.5 rounded-full bg-[#F8F2E7] text-[#17191C] text-xs font-bold hover:bg-[#E8DED0] transition flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Previous: Icon Manager</span>
          </button>
          <button
            type="button"
            onClick={onNext}
            className="px-6 py-2.5 rounded-full bg-[#17191C] hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <span>Next: Screenshots</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
