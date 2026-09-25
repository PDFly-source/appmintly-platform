'use client';

/**
 * Phase 11 — Interactive QR Code generator for app detail pages.
 *
 * QR content is derived dynamically from the CURRENT canonical app record:
 *   - default: the app's detail page URL
 *   - optional: the app's Web App URL
 *   - optional: the APK download URL — ONLY when real authoritative release
 *     evidence exists (lib/distribution.ts). Never fabricated.
 *
 * The qrcode library is dynamically imported so it is never part of the
 * initial page bundle. Generated images are ephemeral (canvas) — nothing is
 * stored in the catalog. Generation is event-driven: mount, target switch
 * and the explicit Generate button all run through the same async path.
 */

import React, { useEffect, useRef, useState } from 'react';
import { QrCode, Download, Copy, Share2, X, Globe, DownloadCloud, Link2, RefreshCw } from 'lucide-react';
import { AppItem } from '@/data/apps';
import { hasAuthoritativeApkRelease } from '@/lib/distribution';
import { BASE_PATH } from '@/lib/api-path';

interface QrTarget {
  id: string;
  label: string;
  icon: React.ReactNode;
  url: string;
}

function buildTargets(app: AppItem): QrTarget[] {
  const detailUrl = new URL(`${BASE_PATH}/app/${app.slug}`, window.location.origin).toString();
  const list: QrTarget[] = [
    { id: 'detail', label: 'App page on AppMintly', icon: <Link2 className="w-3.5 h-3.5" />, url: detailUrl },
  ];
  const webUrl = app.launchUrl || app.webUrl || app.pwaUrl || app.url;
  if (webUrl && webUrl !== detailUrl) {
    list.push({
      id: 'web',
      label: 'Open on Web (app itself)',
      icon: <Globe className="w-3.5 h-3.5" />,
      url: webUrl,
    });
  }
  // APK target ONLY from authoritative release evidence — never fabricated.
  if (hasAuthoritativeApkRelease(app) && app.apk?.apkUrl) {
    list.push({
      id: 'apk',
      label: 'Download APK (official release)',
      icon: <DownloadCloud className="w-3.5 h-3.5" />,
      url: app.apk.apkUrl,
    });
  }
  return list;
}

interface QrCodeDialogProps {
  app: AppItem;
  onClose: () => void;
  toast?: (message: string, type?: 'info' | 'success' | 'error') => void;
}

export function QrCodeDialog({ app, onClose, toast }: QrCodeDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [targets, setTargets] = useState<QrTarget[]>([]);
  const [selectedId, setSelectedId] = useState('detail');
  const [status, setStatus] = useState<'busy' | 'ready' | 'error'>('busy');
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [selectedUrl, setSelectedUrl] = useState('');

  // Generate onto the canvas. Every setState happens after the first await
  // or inside an event handler — never synchronously inside an effect body.
  const generate = async (url: string) => {
    setStatus('busy');
    try {
      const QRCode = await import('qrcode');
      const canvas = canvasRef.current;
      if (!canvas) return;
      await QRCode.toCanvas(canvas, url, {
        width: 256,
        margin: 2,
        color: { dark: '#17191C', light: '#FFFDF8' },
        errorCorrectionLevel: 'M',
      });
      setGeneratedUrl(url);
      setStatus('ready');
    } catch {
      setStatus('error')
    }
  };

  // Mount (the parent renders this dialog only while open, on the client):
  // build targets + generate the default QR, deferred off the effect body.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      const t = buildTargets(app);
      setTargets(t);
      if (t[0]) {
        setSelectedUrl(t[0].url);
        void generate(t[0].url);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape closes the dialog
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSelect = (t: QrTarget) => {
    setSelectedId(t.id);
    setSelectedUrl(t.url);
    void generate(t.url);
  };

  const selected = targets.find((t) => t.id === selectedId) || targets[0];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(selectedUrl || generatedUrl);
      toast?.('Link copied to clipboard', 'success');
    } catch {
      toast?.('Could not copy the link', 'error');
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${app.slug}-qr-${selectedId}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast?.('QR code image downloaded', 'success');
  };

  const handleShare = async () => {
    const url = selectedUrl || generatedUrl;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${app.name} on AppMintly`,
          text: app.shortDescription || app.name,
          url,
        });
      } catch {
        /* user dismissed the share sheet */
      }
    } else {
      await handleCopy();
    }
  };

  const disabled = status !== 'ready';

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`QR code for ${app.name}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-inkbg/45 backdrop-blur-sm" aria-hidden />
      <div className="relative w-full max-w-sm rounded-2xl bg-card border border-line shadow-2xl p-5 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95">
        <div className="flex items-center justify-between mb-4">
          <h3 className="flex items-center gap-2 text-ink font-bold">
            <QrCode className="w-4.5 h-4.5 text-[#E52B32]" aria-hidden />
            Share via QR code
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-mut hover:text-ink hover:bg-page transition-colors cursor-pointer"
            aria-label="Close QR dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target selector — the APK option exists ONLY when authoritative
            release evidence exists. */}
        <fieldset className="mb-4">
          <legend className="text-[10px] font-black uppercase tracking-wider text-mut mb-1.5">
            QR content
          </legend>
          <div className="flex flex-col gap-1.5">
            {targets.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelect(t)}
                aria-pressed={selectedId === t.id}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left text-xs font-semibold transition-colors cursor-pointer ${
                  selectedId === t.id
                    ? 'border-inkbg bg-inkbg text-white'
                    : 'border-line bg-page text-ink hover:border-ink/30'
                }`}
              >
                <span className={selectedId === t.id ? 'text-white' : 'text-mut'}>{t.icon}</span>
                <span className="flex-1 truncate">{t.label}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex justify-center">
          <div className="p-3 rounded-2xl bg-page border border-line shadow-inner">
            {status === 'busy' && (
              <div className="w-[256px] h-[256px] flex items-center justify-center text-mut text-xs" role="status">
                Generating…
              </div>
            )}
            <canvas
              ref={canvasRef}
              width={256}
              height={256}
              className={status === 'ready' ? 'block rounded-lg' : 'hidden'}
              role="img"
              aria-label={`QR code linking to ${selected?.label || 'app content'}`}
            />
            {status === 'error' && (
              <p className="w-[256px] h-[256px] flex items-center justify-center text-center text-destructive text-xs px-4">
                Could not generate the QR code. Please try again.
              </p>
            )}
          </div>
        </div>

        <p className="mt-3 text-[11px] text-mut text-center break-all px-2">{generatedUrl}</p>

        <div className="mt-4 grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => selected && generate(selected.url)}
            disabled={status === 'busy'}
            className="flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl bg-page border border-line text-ink text-xs font-bold hover:border-ink/30 transition-colors cursor-pointer disabled:opacity-40"
            aria-label="Regenerate QR code"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={disabled}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-inkbg text-white text-xs font-bold hover:bg-[#E52B32] transition-colors cursor-pointer disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" aria-hidden />
            Save
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={disabled}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-page border border-line text-ink text-xs font-bold hover:border-ink/30 transition-colors cursor-pointer disabled:opacity-40"
          >
            <Copy className="w-3.5 h-3.5" aria-hidden />
            Copy
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={disabled}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-page border border-line text-ink text-xs font-bold hover:border-ink/30 transition-colors cursor-pointer disabled:opacity-40"
          >
            <Share2 className="w-3.5 h-3.5" aria-hidden />
            Share
          </button>
        </div>
      </div>
    </div>
  );
}
