'use client';

import React, { useState, useRef } from 'react';
import {
  Upload,
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Star,
  Eye,
  X,
  Sparkles,
  Check,
  AlertCircle,
  Image as ImageIcon
} from 'lucide-react';

interface ScreenshotItem {
  url: string;
  label?: string;
  isCover?: boolean;
}

interface ScreenshotManagerProps {
  screenshots: string[];
  coverScreenshot?: string;
  detectedManifestScreenshots?: string[];
  onScreenshotsChange: (newScreenshots: string[], newCover?: string) => void;
}

export const ScreenshotManager: React.FC<ScreenshotManagerProps> = ({
  screenshots = [],
  coverScreenshot,
  detectedManifestScreenshots = [],
  onScreenshotsChange,
}) => {
  const [newUrl, setNewUrl] = useState('');
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload handler for multiple screenshots
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: string[] = [];
    let processed = 0;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        newItems.push(dataUrl);
        processed++;
        if (processed === files.length) {
          onScreenshotsChange([...screenshots, ...newItems]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleAddUrl = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newUrl.trim();
    if (!clean) return;
    if (screenshots.includes(clean)) return;

    onScreenshotsChange([...screenshots, clean]);
    setNewUrl('');
  };

  const handleDelete = (index: number) => {
    const target = screenshots[index];
    const updated = screenshots.filter((_, i) => i !== index);
    const newCover = coverScreenshot === target ? updated[0] || '' : coverScreenshot;
    onScreenshotsChange(updated, newCover);
  };

  const handleMoveLeft = (index: number) => {
    if (index === 0) return;
    const updated = [...screenshots];
    const temp = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = temp;
    onScreenshotsChange(updated);
  };

  const handleMoveRight = (index: number) => {
    if (index >= screenshots.length - 1) return;
    const updated = [...screenshots];
    const temp = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = temp;
    onScreenshotsChange(updated);
  };

  const handleSetCover = (url: string) => {
    onScreenshotsChange(screenshots, url);
  };

  const handleImportManifestScreenshot = (url: string) => {
    if (screenshots.includes(url)) return;
    onScreenshotsChange([...screenshots, url]);
  };

  return (
    <div className="bg-[#FFFDF8] border border-[#E8DED0] rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E8DED0] pb-4">
        <div>
          <h3 className="text-base font-black text-[#17191C]">
            Screenshots &amp; App Previews ({screenshots.length}/10)
          </h3>
          <p className="text-xs text-[#6F6F6F]">
            Upload or import authentic screenshots showing real app interface. No stock photos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 rounded-full bg-[#17191C] hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload Screenshots</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* Manifest Detected Screenshots Quick Import */}
      {detectedManifestScreenshots.length > 0 && (
        <div className="p-4 rounded-2xl bg-[#1976F3]/10 border border-[#1976F3]/25 space-y-2">
          <p className="text-xs font-bold text-[#1976F3] flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" />
            <span>Discovered in App Manifest ({detectedManifestScreenshots.length})</span>
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {detectedManifestScreenshots.map((url, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleImportManifestScreenshot(url)}
                disabled={screenshots.includes(url)}
                className="px-3 py-1.5 rounded-xl bg-white border border-[#1976F3]/30 hover:border-[#1976F3] text-[11px] font-bold text-[#17191C] disabled:opacity-50 transition shrink-0 cursor-pointer flex items-center gap-1.5"
              >
                {screenshots.includes(url) ? (
                  <Check className="w-3 h-3 text-[#16A765]" />
                ) : (
                  <Plus className="w-3 h-3 text-[#1976F3]" />
                )}
                <span>Import Screenshot {idx + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add Screenshot by URL */}
      <form onSubmit={handleAddUrl} className="flex gap-2">
        <input
          type="url"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://.../screenshot1.png"
          className="flex-1 bg-[#F8F2E7] border border-[#E8DED0] rounded-2xl px-4 py-2.5 text-xs font-mono text-[#17191C] focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
        />
        <button
          type="submit"
          className="px-5 py-2.5 rounded-2xl bg-[#F8F2E7] hover:bg-[#E8DED0] border border-[#E8DED0] text-xs font-bold text-[#17191C] transition cursor-pointer shrink-0"
        >
          Add URL
        </button>
      </form>

      {/* Thumbnail Gallery & Management */}
      {screenshots.length === 0 ? (
        <div className="p-8 text-center bg-[#F8F2E7] rounded-3xl border-2 border-dashed border-[#E8DED0] space-y-2">
          <ImageIcon className="w-8 h-8 text-[#6F6F6F] mx-auto" />
          <h4 className="font-bold text-sm text-[#17191C]">No screenshots attached yet</h4>
          <p className="text-xs text-[#6F6F6F] max-w-sm mx-auto">
            Real screenshots help users understand what the application does before installing.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {screenshots.map((url, idx) => {
            const isCover = coverScreenshot === url || (!coverScreenshot && idx === 0);
            return (
              <div
                key={idx}
                className={`relative rounded-2xl border overflow-hidden bg-white shadow-2xs group flex flex-col justify-between transition-all ${
                  isCover ? 'border-[#1976F3] ring-2 ring-[#1976F3]/20' : 'border-[#E8DED0]'
                }`}
              >
                {/* Image preview */}
                <div
                  onClick={() => setPreviewModalUrl(url)}
                  className="h-44 bg-[#17191C] flex items-center justify-center overflow-hidden cursor-pointer relative"
                >
                  <img
                    src={url}
                    alt={`Screenshot ${idx + 1}`}
                    className="w-full h-full object-contain group-hover:scale-102 transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="p-2 rounded-full bg-white text-[#17191C] shadow-md">
                      <Eye className="w-4 h-4" />
                    </span>
                  </div>

                  {isCover && (
                    <span className="absolute top-2 left-2 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#1976F3] text-white shadow-sm flex items-center gap-1">
                      <Star className="w-3 h-3 fill-white" /> Cover
                    </span>
                  )}
                </div>

                {/* Footer Controls */}
                <div className="p-2.5 bg-[#FFFDF8] border-t border-[#E8DED0] flex items-center justify-between gap-1 text-xs">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveLeft(idx)}
                      className="p-1 rounded-lg text-[#6F6F6F] hover:text-[#17191C] hover:bg-[#F8F2E7] disabled:opacity-30 transition cursor-pointer"
                      title="Move left"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx >= screenshots.length - 1}
                      onClick={() => handleMoveRight(idx)}
                      className="p-1 rounded-lg text-[#6F6F6F] hover:text-[#17191C] hover:bg-[#F8F2E7] disabled:opacity-30 transition cursor-pointer"
                      title="Move right"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    {!isCover && (
                      <button
                        type="button"
                        onClick={() => handleSetCover(url)}
                        className="px-2 py-1 rounded-lg text-[11px] font-bold text-[#6F6F6F] hover:text-[#1976F3] hover:bg-[#1976F3]/10 transition cursor-pointer"
                      >
                        Set as Cover
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(idx)}
                      className="p-1 rounded-lg text-[#6F6F6F] hover:text-[#E52B32] hover:bg-[#E52B32]/10 transition cursor-pointer"
                      title="Delete screenshot"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox Preview Modal */}
      {previewModalUrl && (
        <div
          onClick={() => setPreviewModalUrl(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-4xl max-h-[85vh] relative rounded-2xl overflow-hidden bg-black shadow-2xl"
          >
            <button
              onClick={() => setPreviewModalUrl(null)}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/60 text-white hover:bg-black transition cursor-pointer z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewModalUrl}
              alt="Screenshot preview"
              className="max-w-full max-h-[80vh] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
