'use client';

import React, { useState, useRef } from 'react';
import {
  Upload,
  Link as LinkIcon,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Eye,
  Layers,
  Sparkles,
  ShieldCheck,
  Check,
  Smartphone,
  Globe
} from 'lucide-react';
import { AppIcon } from './AppIcon';

interface IconManagerProps {
  appName: string;
  appSlug: string;
  currentIcon: string;
  themeColor: string;
  manifestUrl?: string;
  detectedIcons?: { src: string; sizes?: string; type?: string; purpose?: string }[];
  onIconChange: (newIconUrl: string) => void;
  onThemeColorChange?: (color: string) => void;
}

export const IconManager: React.FC<IconManagerProps> = ({
  appName,
  appSlug,
  currentIcon,
  themeColor,
  manifestUrl,
  detectedIcons = [],
  onIconChange,
  onThemeColorChange,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'url' | 'manifest' | 'preview'>('upload');
  const [pastedUrl, setPastedUrl] = useState(currentIcon);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    dimensions?: string;
    message?: string;
  } | null>(null);

  const [previewMode, setPreviewMode] = useState<'standard' | 'squircle' | 'circle' | 'checkered'>('standard');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle local file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setValidationResult({ valid: false, message: 'Please upload an image file (PNG, JPG, WEBP, or SVG).' });
      return;
    }

    setIsValidating(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setIsValidating(false);
        const dimensions = `${img.width}x${img.height}`;
        setValidationResult({
          valid: true,
          dimensions,
          message: `Verified: ${dimensions} px ${file.type.replace('image/', '').toUpperCase()}`,
        });
        onIconChange(dataUrl);
      };
      img.onerror = () => {
        setIsValidating(false);
        setValidationResult({ valid: false, message: 'Failed to decode image file.' });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Handle URL validation
  const handleTestUrl = () => {
    const url = pastedUrl.trim();
    if (!url) {
      setValidationResult({ valid: false, message: 'Please enter an icon URL.' });
      return;
    }
    if (!url.startsWith('https://') && !url.startsWith('/')) {
      setValidationResult({
        valid: false,
        message: 'Icon URL must use https:// (or a repository asset path starting with "/").',
      });
      return;
    }

    setIsValidating(true);
    const img = new Image();
    img.onload = () => {
      setIsValidating(false);
      const dimensions = `${img.width}x${img.height}`;
      setValidationResult({
        valid: true,
        dimensions,
        message: `Verified: ${dimensions} px accessible icon`,
      });
      onIconChange(url);
    };
    img.onerror = () => {
      setIsValidating(false);
      setValidationResult({
        valid: false,
        message: 'Icon URL could not be loaded. Verify the URL is publicly reachable.',
      });
    };
    img.src = url;
  };

  const previewSizes = [
    { label: '48px (Taskbar)', size: 'xs', px: 48 },
    { label: '96px (Android)', size: 'sm', px: 96 },
    { label: '192px (PWA Standard)', size: 'md', px: 192 },
    { label: '512px (Store / Splash)', size: 'xl', px: 512 },
  ];

  return (
    <div className="bg-card border border-line rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <h3 className="text-base font-black text-ink">Application Icon Manager</h3>
          <p className="text-xs text-mut">
            Configure verified, high-resolution icons for marketplace listings, PWA installation &amp; home screens.
          </p>
        </div>

        {/* Navigation Mode Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
              activeTab === 'upload'
                ? 'bg-inkbg text-white'
                : 'bg-page text-ink hover:bg-line'
            }`}
          >
            Upload
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manifest')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
              activeTab === 'manifest'
                ? 'bg-inkbg text-white'
                : 'bg-page text-ink hover:bg-line'
            }`}
          >
            From Manifest ({detectedIcons.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('url')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
              activeTab === 'url'
                ? 'bg-inkbg text-white'
                : 'bg-page text-ink hover:bg-line'
            }`}
          >
            Paste URL
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
              activeTab === 'preview'
                ? 'bg-inkbg text-white'
                : 'bg-page text-ink hover:bg-line'
            }`}
          >
            Multi-Size Previews
          </button>
        </div>
      </div>

      {/* 1. UPLOAD TAB */}
      {activeTab === 'upload' && (
        <div className="space-y-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-line hover:border-[#1976F3] rounded-3xl p-8 text-center bg-page/60 hover:bg-page transition-all cursor-pointer group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="w-14 h-14 rounded-2xl bg-white shadow-2xs border border-line flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform">
              <Upload className="w-6 h-6 text-[#1976F3]" />
            </div>
            <h4 className="font-black text-sm text-ink">Click to Upload Icon File</h4>
            <p className="text-xs text-mut mt-1 max-w-sm mx-auto">
              PNG, WEBP, JPG or SVG. <strong>512x512 px</strong> or <strong>1024x1024 px</strong> square recommended for sharp rendering across all platforms.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-page border border-line text-xs text-mut flex items-center justify-between">
            <span>Recommended asset repository location:</span>
            <code className="font-mono text-[#1976F3] bg-white px-2 py-0.5 rounded-md border border-line">
              /assets/apps/{appSlug || 'app'}/icons/icon-512.png
            </code>
          </div>
        </div>
      )}

      {/* 2. MANIFEST ICONS TAB */}
      {activeTab === 'manifest' && (
        <div className="space-y-4">
          {detectedIcons.length === 0 ? (
            <div className="p-6 text-center bg-page rounded-2xl border border-line">
              <p className="text-xs text-mut">
                No manifest icons detected yet. Run the URL Analyzer in Step 1 to auto-discover icons from the web app manifest.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {detectedIcons.map((ic, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    onIconChange(ic.src);
                    setValidationResult({
                      valid: true,
                      dimensions: ic.sizes,
                      message: `Selected manifest icon (${ic.sizes || 'any'})`,
                    });
                  }}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
                    currentIcon === ic.src
                      ? 'border-[#16A765] bg-[#16A765]/5 shadow-xs'
                      : 'border-line bg-page/70 hover:bg-white'
                  }`}
                >
                  <img
                    src={ic.src}
                    alt="Manifest icon"
                    className="w-12 h-12 rounded-xl object-cover bg-white border border-line shrink-0"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-xs text-ink truncate">
                      {ic.sizes || 'Adaptive Icon'}
                    </p>
                    <p className="text-[10px] text-mut truncate mt-0.5">
                      {ic.purpose || ic.type || 'Standard icon'}
                    </p>
                    {currentIcon === ic.src && (
                      <span className="text-[10px] font-bold text-[#16A765] flex items-center gap-1 mt-1">
                        <Check className="w-3 h-3" /> Active Icon
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. PASTE URL TAB */}
      {activeTab === 'url' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="url"
              value={pastedUrl}
              onChange={(e) => setPastedUrl(e.target.value)}
              placeholder="https://.../pwa-512x512.png"
              className="flex-1 bg-page border border-line rounded-2xl px-4 py-2.5 text-xs font-mono text-ink focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
            />
            <button
              type="button"
              onClick={handleTestUrl}
              disabled={isValidating}
              className="px-5 py-2.5 rounded-2xl bg-[#1976F3] text-white text-xs font-bold hover:bg-[#135bbd] transition flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              {isValidating ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>Verify &amp; Apply</span>
            </button>
          </div>
        </div>
      )}

      {/* Validation status notification */}
      {validationResult && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-center gap-2 ${
            validationResult.valid
              ? 'bg-[#16A765]/10 border-[#16A765]/30 text-[#16A765]'
              : 'bg-[#E52B32]/10 border-[#E52B32]/30 text-[#E52B32]'
          }`}
        >
          {validationResult.valid ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span className="font-semibold">{validationResult.message}</span>
        </div>
      )}

      {/* 4. MULTI-SIZE & MASKABLE LIVE PREVIEWS */}
      <div className="border-t border-line pt-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-mut">
            Live Multi-Size Previews (Cross-Platform)
          </h4>

          {/* Mask shape controls */}
          <div className="flex items-center gap-1 bg-page p-1 rounded-full border border-line">
            <button
              type="button"
              onClick={() => setPreviewMode('standard')}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition cursor-pointer ${
                previewMode === 'standard' ? 'bg-inkbg text-white' : 'text-mut'
              }`}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('squircle')}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition cursor-pointer ${
                previewMode === 'squircle' ? 'bg-inkbg text-white' : 'text-mut'
              }`}
            >
              Maskable Squircle
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('circle')}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition cursor-pointer ${
                previewMode === 'circle' ? 'bg-inkbg text-white' : 'text-mut'
              }`}
            >
              Circular Mask
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {previewSizes.map((spec) => (
            <div
              key={spec.px}
              className="p-4 rounded-2xl bg-page border border-line flex flex-col items-center justify-center text-center space-y-3"
            >
              <AppIcon
                src={currentIcon}
                name={appName || 'App'}
                size={spec.size as any}
                themeColor={themeColor}
                isMaskable={previewMode !== 'standard'}
                maskShape={previewMode === 'circle' ? 'circle' : 'squircle'}
              />
              <div>
                <p className="font-bold text-xs text-ink">{spec.px} &times; {spec.px} px</p>
                <p className="text-[10px] text-mut mt-0.5">{spec.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
