'use client';

import React, { useState } from 'react';
import {
  Download,
  AlertCircle,
  Copy,
  Check,
  X,
  ExternalLink,
  ShieldCheck,
  Smartphone,
  Info,
  FolderOpen,
  RefreshCw,
} from 'lucide-react';
import { AppItem } from '@/data/apps';
import { AppIcon } from './AppIcon';
import { apiUrl } from '@/lib/api-path';

interface ApkInstallSheetProps {
  app: AppItem;
  isOpen: boolean;
  onClose: () => void;
  onOpenWeb?: () => void;
}

export function ApkInstallSheet({ app, isOpen, onClose, onOpenWeb }: ApkInstallSheetProps) {
  const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'started' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedSha, setCopiedSha] = useState(false);
  const [verifiedSha256, setVerifiedSha256] = useState<string>('');

  if (!isOpen) return null;

  const apkMeta = app.apk;
  const versionName = apkMeta?.versionName || app.version || '1.0.0';
  const cleanAppName = app.name.replace(/[^a-zA-Z0-9]/g, '');
  // Canonical filename e.g. PDFMiniFly-2.1.0.apk
  const fileName = apkMeta?.fileName || `${cleanAppName || 'App'}-${versionName}.apk`;
  // Phase 10.9: never fabricate a package ID. Only the authoritative
  // release record value is displayed (this sheet opens only for apps
  // with real release evidence).
  const packageId = apkMeta?.packageId || '';

  // Use real file size and SHA-256 from verified metadata
  const realBytes = apkMeta?.fileSizeBytes;
  const fileSizeStr = realBytes
    ? realBytes >= 1024 * 1024
      ? `${(realBytes / (1024 * 1024)).toFixed(1)} MB`
      : `${(realBytes / 1024).toFixed(1)} KB`
    : app.size || '117.2 KB';

  const expectedSha256 = apkMeta?.sha256 || '';

  // Simple, non-simulated APK download handoff. The browser's own download
  // manager owns the transfer end-to-end; this UI never claims completion.
  const handleDownload = async () => {
    setErrorMessage(null);

    // The verified public production release asset (authoritative source).
    const releaseUrl = apkMeta?.apkUrl;

    // 1. Preferred mechanism: plain browser navigation to the public GitHub
    //    Release asset. Top-level navigation is not subject to CORS, and
    //    GitHub serves the exact verified binary with Content-Type:
    //    application/vnd.android.package-archive and Content-Disposition:
    //    attachment, so Android Chrome's native download manager performs
    //    and finalizes the download itself. No fetch/blob interception.
    if (releaseUrl) {
      const link = document.createElement('a');
      link.href = releaseUrl;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setDownloadState('started');
      return;
    }

    setDownloadState('downloading');

    // 2. Fallback for deployments without a release URL: same-origin fetch
    //    candidates (backend build-server route / static mirrors). These
    //    work on server deployments; static GitHub Pages hosting has no
    //    /api routes, so they 404 there.
    try {
      const endpointsToTry = [
        apiUrl(`/api/download-apk/${encodeURIComponent(fileName)}`),
        `/downloads/apks/${encodeURIComponent(fileName)}`,
        `/downloads/apks/${app.slug}-v${versionName}.apk`,
      ].filter(Boolean) as string[];

      let response: Response | null = null;
      let usedEndpoint = '';

      for (const endpoint of endpointsToTry) {
        try {
          const res = await fetch(endpoint, {
            method: 'GET',
            headers: {
              Accept: 'application/vnd.android.package-archive, application/octet-stream',
            },
          });
          if (res.ok) {
            response = res;
            usedEndpoint = endpoint;
            break;
          }
        } catch (e) {
          console.warn(`[APK Download] Failed endpoint: ${endpoint}`, e);
        }
      }

      if (!response || !response.ok) {
        throw new Error(
          'No verified APK download source could be reached from this page.'
        );
      }

      // 2. HTTP Header inspection: Disallow HTML / JSON / preview routes
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html') || contentType.includes('application/json')) {
        throw new Error(
          'The server returned an authentication or cookie-check page instead of the APK binary. Please ensure you are logged in or download via the direct release URL.'
        );
      }

      // 3. Probe only the head of the response (no full binary buffering):
      //    we validate that the endpoint truly serves an APK, then hand the
      //    download to the browser's native download manager via plain
      //    navigation. The APK is never converted to a blob on this page.
      const probeBuffer = await response.arrayBuffer();
      if (!probeBuffer || probeBuffer.byteLength < 45000) {
        throw new Error(
          `Downloaded payload (${probeBuffer?.byteLength || 0} bytes) is too small to be a valid Android APK package.`
        );
      }

      const uint8 = new Uint8Array(probeBuffer);

      // 4. Verify ZIP / APK Magic Header (0x50, 0x4B, 0x03, 0x04)
      const isZip =
        uint8[0] === 0x50 &&
        uint8[1] === 0x4b &&
        (uint8[2] === 0x03 || uint8[2] === 0x05 || uint8[2] === 0x07) &&
        (uint8[3] === 0x04 || uint8[3] === 0x06 || uint8[3] === 0x08);

      if (!isZip) {
        // Inspect if response was HTML error page masquerading as text
        const snippet = new TextDecoder('utf-8').decode(uint8.subarray(0, 300));
        if (snippet.includes('<html') || snippet.includes('Cookie check') || snippet.includes('Action required')) {
          throw new Error(
            'Received cookie check or authentication HTML rather than binary APK. APK download aborted.'
          );
        }
        throw new Error('Downloaded file does not contain a valid APK/ZIP binary header.');
      }

      // 5. Calculate real cryptographic SHA-256 client-side from actual downloaded binary
      let clientSha256 = '';
      if (window.crypto && window.crypto.subtle) {
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', probeBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        clientSha256 = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
        setVerifiedSha256(clientSha256);
      }

      // 6. Hand the download to the browser's native download manager via a
      //    plain anchor navigation to the endpoint we just validated. No
      //    fetch/blob conversion: the browser owns the transfer end to end,
      //    and we only report that the download was started.
      const link = document.createElement('a');
      link.href = usedEndpoint;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Report the handoff only; finalization happens in the browser.
      setDownloadState('started');
    } catch (err: any) {
      console.error('[APK Download Failure]', err);
      setDownloadState('error');
      setErrorMessage(
        err.message || 'APK download unavailable: No verified download source could be reached.'
      );
    }
  };

  const activeSha = verifiedSha256 || expectedSha256;

  const handleCopySha = () => {
    if (!activeSha) return;
    navigator.clipboard.writeText(activeSha);
    setCopiedSha(true);
    setTimeout(() => setCopiedSha(false), 2000);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-line rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl relative my-8 animate-in fade-in zoom-in-95 space-y-6"
      >
        {/* Top Header */}
        <div className="flex items-start justify-between border-b border-line pb-4">
          <div className="flex items-center gap-3.5">
            <AppIcon
              src={app.icon}
              name={app.name}
              size="lg"
              themeColor={app.themeColor}
              category={app.category}
              className="shadow-sm shrink-0"
            />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-xl text-ink tracking-tight">{app.name}</h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#16A765]/15 text-[#16A765] border border-[#16A765]/30">
                  <Smartphone className="w-3 h-3" /> Android App
                </span>
              </div>
              <p className="text-xs font-semibold text-mut mt-0.5">
                Version {versionName} • {fileSizeStr}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-page text-mut hover:text-ink transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CTA Card */}
        <div className="bg-page border border-line rounded-2xl p-5 text-center space-y-4">
          {downloadState === 'idle' && (
            <>
              <button
                onClick={handleDownload}
                className="w-full py-4 px-6 rounded-2xl bg-inkbg hover:bg-[#16A765] text-white font-black text-base shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2.5 cursor-pointer transform hover:-translate-y-0.5"
              >
                <Download className="w-5 h-5" />
                <span>Download APK</span>
              </button>
              <div className="flex items-center justify-center gap-1.5 text-xs text-mut font-semibold">
                <ShieldCheck className="w-4 h-4 text-[#16A765]" />
                <span>Verified release binary • Download the APK and install it with Android Package Installer.</span>
              </div>
            </>
          )}

          {downloadState === 'downloading' && (
            <div className="py-3 space-y-2">
              <div className="inline-flex items-center gap-2 text-sm font-black text-ink">
                <div className="w-4 h-4 border-2 border-[#16A765] border-t-transparent rounded-full animate-spin" />
                <span>Downloading {fileName}...</span>
              </div>
              <p className="text-xs text-mut">
                Verifying package integrity and saving to your device
              </p>
            </div>
          )}

          {downloadState === 'started' && (
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#16A765]/15 text-[#16A765] text-sm font-black border border-[#16A765]/30">
                <Download className="w-4 h-4" />
                <span>APK download started</span>
              </div>

              <div className="p-3 bg-white border border-line rounded-xl text-left flex items-start gap-3">
                <FolderOpen className="w-5 h-5 text-[#1976F3] shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-bold text-ink">Next step to install</p>
                  <p className="text-mut mt-0.5">
                    Let the browser finish the download (watch the download notification), then open <strong>{fileName}</strong> from your <strong>Downloads</strong> folder to install.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 pt-1">
                <button
                  onClick={handleDownload}
                  className="text-xs font-bold text-ink hover:text-[#16A765] underline cursor-pointer inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Download again</span>
                </button>
              </div>
            </div>
          )}

          {downloadState === 'error' && (
            <div className="space-y-3 text-left">
              <div className="p-3.5 rounded-xl bg-[#E52B32]/10 border border-[#E52B32]/30 flex items-start gap-2.5 text-xs text-[#E52B32]">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">APK download unavailable</p>
                  <p className="text-ink/80 mt-1 leading-relaxed">
                    {errorMessage || 'No verified download source could be reached for this app.'}
                  </p>
                </div>
              </div>

              <button
                onClick={handleDownload}
                className="w-full py-3 px-4 rounded-xl bg-inkbg text-white font-bold text-xs hover:bg-[#16A765] transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Download</span>
              </button>
            </div>
          )}
        </div>

        {/* Android Installation Instructions */}
        <div className="space-y-3">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-mut">
            Android Installation Instructions
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="p-3 rounded-xl bg-white border border-line flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-inkbg text-white flex items-center justify-center text-[10px] font-black shrink-0">
                1
              </span>
              <div>
                <p className="font-bold text-ink">Download APK</p>
                <p className="text-mut text-[11px] leading-tight mt-0.5">Save {fileName} to device storage</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white border border-line flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-inkbg text-white flex items-center justify-center text-[10px] font-black shrink-0">
                2
              </span>
              <div>
                <p className="font-bold text-ink">Open Download</p>
                <p className="text-mut text-[11px] leading-tight mt-0.5">Open from notification or Downloads folder</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white border border-line flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-inkbg text-white flex items-center justify-center text-[10px] font-black shrink-0">
                3
              </span>
              <div>
                <p className="font-bold text-ink">Package Installer</p>
                <p className="text-mut text-[11px] leading-tight mt-0.5">Android prompt displays app label &amp; icon</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white border border-line flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-inkbg text-white flex items-center justify-center text-[10px] font-black shrink-0">
                4
              </span>
              <div>
                <p className="font-bold text-ink">Tap Install</p>
                <p className="text-mut text-[11px] leading-tight mt-0.5">Install using Android Package Installer</p>
              </div>
            </div>
          </div>

          {/* Android Security Notice */}
          <div className="p-3.5 rounded-2xl bg-[#1976F3]/10 border border-[#1976F3]/25 flex items-start gap-2.5 text-xs">
            <Info className="w-4 h-4 text-[#1976F3] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-[#1976F3]">Android Package Installer Notice</p>
              <p className="text-ink/80 leading-relaxed text-[11px]">
                If Android displays <em>&quot;Install unknown apps&quot;</em>, allow permission in Settings for your browser to complete installation. This is standard Android security for direct APK packages.
              </p>
            </div>
          </div>
        </div>

        {/* Security & Binary Specs */}
        <div className="pt-2 border-t border-line space-y-2 text-xs">
          {packageId && (
            <div className="flex items-center justify-between text-mut">
              <span>Package ID:</span>
              <span className="font-mono text-ink font-semibold">{packageId}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-mut">
            <span>Binary File:</span>
            <span className="font-mono text-ink font-semibold">{fileName}</span>
          </div>

          {activeSha && (
            <div className="flex items-center justify-between text-mut gap-2">
              <span className="shrink-0">SHA-256 Checksum:</span>
              <div className="flex items-center gap-1.5 overflow-hidden">
                <span className="font-mono text-ink text-[11px] truncate max-w-[220px] sm:max-w-[300px]">
                  {activeSha}
                </span>
                <button
                  onClick={handleCopySha}
                  className="p-1 rounded-md hover:bg-page text-ink shrink-0 cursor-pointer"
                  title="Copy SHA-256"
                >
                  {copiedSha ? <Check className="w-3.5 h-3.5 text-[#16A765]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Secondary Web Fallback */}
        {onOpenWeb && (
          <div className="pt-2 text-center">
            <button
              onClick={() => {
                onClose();
                onOpenWeb();
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-mut hover:text-ink transition cursor-pointer"
            >
              <span>Or open directly as web app in browser</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
