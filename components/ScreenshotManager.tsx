'use client';

import React, { useState, useRef, useCallback } from 'react';
import { checkHttpsUrl } from '@/lib/url-safety';
import {
  uploadScreenshotToProduction,
  ScreenshotUploadResult
} from '@/lib/production-publish';
import {
  normalizeScreenshotInput,
  resolveAssetDisplayUrl,
  verifyHttpsImageLoads,
  REPO_SCREENSHOT_PATH_RE,
  detectImageType
} from '@/lib/screenshot-assets';
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
  Image as ImageIcon,
  Loader2
} from 'lucide-react';

const MAX_SCREENSHOTS = 10;
// Supported image types. NOTE: File.type alone is NOT used to accept or
// reject files — Android providers often deliver real images with an empty
// or "image/jpg" MIME. Actual bytes are validated in detectImageType().
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024; // 10 MB

interface ScreenshotManagerProps {
  screenshots: string[];
  coverScreenshot?: string;
  detectedManifestScreenshots?: string[];
  /** App slug used for the canonical repository asset path. */
  slug: string;
  /** Resolves the memory-only publisher key (opens the auth dialog when needed). */
  onAuthRequired: () => Promise<string>;
  onScreenshotsChange: (newScreenshots: string[], newCover?: string) => void;
}

interface PendingUpload {
  id: number;
  tempUrl: string; // blob: preview — ONLY while the upload/deploy is in flight
  fileName: string;
  status: 'uploading' | 'deploying' | 'failed';
  error?: string;
}

/**
 * Phase 10.8 — production screenshot management.
 *
 * Local files are uploaded through the authenticated Cloudflare Worker
 * (POST /upload-screenshot), which commits a permanent repository asset
 * under public/assets/apps/<slug>/screenshots/ via the GitHub Contents API.
 * Only the canonical repository asset path is ever stored in the draft —
 * temporary blob: previews exist purely while an upload is in progress and
 * are revoked as soon as the permanent asset is live.
 *
 * URL paste supports direct HTTPS image URLs, repository-relative asset
 * paths, deployed AppMintly URLs and GitHub blob/raw URLs of this
 * repository (auto-converted to the canonical asset path — never stored as
 * GitHub page URLs).
 */

export const ScreenshotManager: React.FC<ScreenshotManagerProps> = ({
  screenshots = [],
  coverScreenshot,
  detectedManifestScreenshots = [],
  slug,
  onAuthRequired,
  onScreenshotsChange,
}) => {
  const [newUrl, setNewUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlVerifying, setUrlVerifying] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);
  /** blob: preview per canonical path while the Pages deployment goes live. */
  const [tempPreviews, setTempPreviews] = useState<Record<string, string>>({});
  /** canonical paths whose permanent asset is not deployed yet. */
  const [deployingPaths, setDeployingPaths] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextIdRef = useRef(1);

  const effectiveSlug = (slug || '').trim().toLowerCase();

  /** Swap the temp blob preview for the permanent asset once Pages serves it. */
  const waitForAssetLive = useCallback((canonicalPath: string) => {
    const displayUrl = resolveAssetDisplayUrl(canonicalPath);
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const img = new Image();
      const finish = (live: boolean) => {
        window.clearInterval(timer);
        setTempPreviews((prev) => {
          const next = { ...prev };
          const temp = next[canonicalPath];
          delete next[canonicalPath];
          if (temp) URL.revokeObjectURL(temp);
          return next;
        });
        setDeployingPaths((prev) => {
          const next = new Set(prev);
          next.delete(canonicalPath);
          return next;
        });
        if (!live) {
          setUploadError(
            'Screenshot was uploaded, but the marketplace has not deployed it yet. Reload the console in a minute to see it.'
          );
        }
      };
      img.onload = () => finish(true);
      img.onerror = () => {
        if (attempts >= 60) finish(false); // ~5 minutes of polling
      };
      img.src = `${displayUrl}${displayUrl.includes('?') ? '&' : '?'}_livecheck=${Date.now()}`;
    }, 5000);
  }, []);

  // Phase 10.8 (permanent screenshot upload): local files are uploaded to
  // PERMANENT AppMintly asset storage through the authenticated Worker.
  // A temporary blob: preview exists only while the upload is in flight and
  // is revoked once the canonical repository asset path is live.
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    // Allow repeated selection of the same file.
    e.target.value = '';

    setUploadError(null);
    setUploadNotice(null);

    if (!effectiveSlug) {
      setUploadError(
        'Set the application URL/slug first (Analyze URL) so screenshots have a permanent storage location.'
      );
      return;
    }

    const slots = MAX_SCREENSHOTS - screenshots.length - pending.length;
    if (slots <= 0) {
      setUploadError(`Maximum ${MAX_SCREENSHOTS} screenshots allowed.`);
      return;
    }

    // Phase 10.8.1: Android file providers often deliver REAL images with an
    // empty or unusual File.type (e.g. "image/jpg"), which previously caused
    // valid screenshots to be rejected with "Only PNG, JPEG and WebP images
    // are supported." Selection is therefore NEVER filtered by File.type:
    // every selected file is validated by its actual byte signature (magic
    // bytes) with a filename-extension fallback, and the authorized Worker
    // independently re-sniffs the bytes before committing anything.
    const queue = Array.from(files).slice(0, slots);
    if (queue.length === 0) {
      setUploadError(`Maximum ${MAX_SCREENSHOTS} screenshots allowed.`);
      return;
    }

    for (const file of queue) {
      if (file.size > MAX_SCREENSHOT_BYTES) {
        setUploadError(`"${file.name}" is larger than 10 MB. Screenshot was NOT added.`);
        continue;
      }

      // Validate by actual bytes, not by the (often empty/incorrect on
      // Android) File.type. Falls back to the filename extension only when
      // the signature cannot be read; the Worker re-verifies regardless.
      const detectedType = await detectImageType(file);
      if (!detectedType) {
        setUploadError(`"${file.name}" is not a supported image. Only PNG, JPEG and WebP screenshots are accepted.`);
        continue;
      }

      const id = nextIdRef.current++;
      const tempUrl = URL.createObjectURL(file);
      setPending((prev) => [...prev, { id, tempUrl, fileName: file.name, status: 'uploading' }]);

      try {
        const publishKey = await onAuthRequired();
        if (!publishKey.trim()) {
          throw new Error('Authentication required to upload screenshots.');
        }
        // Send the REAL file as multipart/form-data; the browser generates
        // the multipart boundary (Content-Type is never set manually).
        const result: ScreenshotUploadResult = await uploadScreenshotToProduction({
          slug: effectiveSlug,
          image: file,
          fileName: file.name,
          publishKey,
        });
        if (!result.success || !result.path) {
          throw new Error(result.message || 'Screenshot upload failed.');
        }
        if (screenshots.includes(result.path)) {
          // Identical image already attached — drop the duplicate honestly.
          URL.revokeObjectURL(tempUrl);
          setPending((prev) => prev.filter((p) => p.id !== id));
          setUploadNotice('That screenshot is already attached to this app.');
          continue;
        }
        // Success: the canonical repository path is the ONLY stored value.
        onScreenshotsChange([...screenshots, result.path]);
        setTempPreviews((prev) => ({ ...prev, [result.path!]: tempUrl }));
        setDeployingPaths((prev) => new Set(prev).add(result.path!));
        setPending((prev) => prev.filter((p) => p.id !== id));
        setUploadNotice(
          result.uploaded === false
            ? 'Screenshot already existed in secure AppMintly asset storage — reused the permanent repository asset.'
            : 'Screenshot uploaded successfully. Your image was committed to the permanent AppMintly asset repository.'
        );
        waitForAssetLive(result.path);
      } catch (err) {
        URL.revokeObjectURL(tempUrl);
        setPending((prev) => prev.filter((p) => p.id !== id));
        setUploadError(
          `${err instanceof Error && err.message ? err.message : 'Screenshot upload failed.'} Your screenshot was NOT added to the published draft.`
        );
      }
    }
  };

  const handleAddUrl = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newUrl.trim();
    if (!clean) return;
    setUrlError(null);
    if (screenshots.length + pending.length >= MAX_SCREENSHOTS) {
      setUrlError(`Maximum ${MAX_SCREENSHOTS} screenshots allowed.`);
      return;
    }

    const normalized = normalizeScreenshotInput(clean);
    if (normalized.kind === 'error') {
      setUrlError(normalized.error);
      return;
    }

    // Repository asset paths: verify the asset exists on the deployed site.
    if (normalized.kind === 'repo') {
      if (!REPO_SCREENSHOT_PATH_RE.test(normalized.value)) {
        setUrlError('Invalid AppMintly screenshot asset path.');
        return;
      }
      if (screenshots.includes(normalized.value)) {
        setUrlError('That screenshot is already attached.');
        return;
      }
      setUrlVerifying(true);
      try {
        const displayUrl = resolveAssetDisplayUrl(normalized.value);
        const res = await fetch(displayUrl, { method: 'HEAD' });
        const type = res.headers.get('content-type') || '';
        if (!res.ok || !type.startsWith('image/')) {
          setUrlError(
            'Image URL could not be verified. Use an AppMintly repository asset or upload the image.'
          );
          setUrlVerifying(false);
          return;
        }
        onScreenshotsChange([...screenshots, normalized.value]);
        setNewUrl('');
        setUploadNotice('Screenshot attached from the permanent AppMintly asset repository.');
      } catch {
        setUrlError(
          'Image URL could not be verified. Use an AppMintly repository asset or upload the image.'
        );
      }
      setUrlVerifying(false);
      return;
    }

    // Direct HTTPS URL: Phase 9 URL-safety guard, then verify it loads as
    // an image (rejects HTML/JSON pages and broken links honestly).
    const safety = checkHttpsUrl(normalized.value);
    if (!safety.safe) {
      setUrlError(safety.reason || 'Screenshot URL must be a valid https:// URL.');
      return;
    }
    if (screenshots.includes(normalized.value)) {
      setUrlError('That screenshot is already attached.');
      return;
    }
    setUrlVerifying(true);
    const loads = await verifyHttpsImageLoads(normalized.value);
    setUrlVerifying(false);
    if (!loads) {
      setUrlError(
        'Image URL could not be verified. Use an AppMintly repository asset or upload the image.'
      );
      return;
    }
    onScreenshotsChange([...screenshots, normalized.value]);
    setNewUrl('');
    setUploadNotice('Screenshot attached from the verified HTTPS image URL.');
  };

  const handleDelete = (index: number) => {
    const target = screenshots[index];
    // Draft-only removal: repository files are never deleted (Phase 10.8).
    const temp = tempPreviews[target];
    if (temp) {
      URL.revokeObjectURL(temp);
      setTempPreviews((prev) => {
        const next = { ...prev };
        delete next[target];
        return next;
      });
    }
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

  const displayFor = (url: string) => tempPreviews[url] || resolveAssetDisplayUrl(url);

  return (
    <div className="bg-card border border-line rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <h3 className="text-base font-black text-ink">
            Screenshots &amp; App Previews ({screenshots.length}/{MAX_SCREENSHOTS})
          </h3>
          <p className="text-xs text-mut">
            Upload authentic screenshots to permanent AppMintly asset storage, or add a permanent https:// image URL. No stock photos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 rounded-full bg-inkbg hover:bg-[#E52B32] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
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

      {/* Upload status / errors */}
      {pending.length > 0 && (
        <div className="p-4 rounded-2xl bg-[#1976F3]/10 border border-[#1976F3]/25 space-y-3">
          {pending.map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              <div className="w-14 h-10 rounded-lg overflow-hidden border border-[#1976F3]/30 bg-inkbg shrink-0">
                <img src={p.tempUrl} alt="Uploading screenshot preview" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-[#1976F3]">Uploading screenshot…</p>
                <p className="text-[11px] text-mut truncate">
                  Uploading to secure AppMintly asset storage…
                </p>
              </div>
              <Loader2 className="w-4 h-4 text-[#1976F3] animate-spin shrink-0" />
            </div>
          ))}
        </div>
      )}
      {uploadError && (
        <p role="alert" className="flex items-start gap-2 text-xs text-[#E52B32] font-bold">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{uploadError}</span>
        </p>
      )}
      {uploadNotice && !uploadError && (
        <p className="flex items-start gap-2 text-xs text-[#16A765] font-bold">
          <Check className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{uploadNotice}</span>
        </p>
      )}

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
                className="px-3 py-1.5 rounded-xl bg-white border border-[#1976F3]/30 hover:border-[#1976F3] text-[11px] font-bold text-ink disabled:opacity-50 transition shrink-0 cursor-pointer flex items-center gap-1.5"
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
          onChange={(e) => {
            setNewUrl(e.target.value);
            setUrlError(null);
          }}
          placeholder="https://.../screenshot1.png  or  /assets/apps/<slug>/screenshots/..."
          aria-label="Screenshot URL (https or AppMintly repository asset path)"
          className="flex-1 bg-page border border-line rounded-2xl px-4 py-2.5 text-xs font-mono text-ink focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
        />
        <button
          type="submit"
          disabled={urlVerifying}
          className="px-5 py-2.5 rounded-2xl bg-page hover:bg-line border border-line text-xs font-bold text-ink transition cursor-pointer shrink-0 disabled:opacity-50 flex items-center gap-1.5"
        >
          {urlVerifying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>Add URL</span>
        </button>
      </form>
      {urlError && (
        <p role="alert" className="text-xs text-[#E52B32] font-bold -mt-4">
          {urlError}
        </p>
      )}
      <p className="text-[11px] text-mut -mt-4">
        GitHub blob URLs and deployed AppMintly URLs are converted to the permanent repository asset
        path automatically. Uploaded screenshots are committed to permanent AppMintly asset storage —
        temporary previews are never saved.
      </p>

      {/* Thumbnail Gallery & Management */}
      {screenshots.length === 0 && pending.length === 0 ? (
        <div className="p-8 text-center bg-page rounded-3xl border-2 border-dashed border-line space-y-2">
          <ImageIcon className="w-8 h-8 text-mut mx-auto" />
          <h4 className="font-bold text-sm text-ink">No screenshots attached yet</h4>
          <p className="text-xs text-mut max-w-sm mx-auto">
            Real screenshots help users understand what the application does before installing.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {screenshots.map((url, idx) => {
            const isCover = coverScreenshot === url || (!coverScreenshot && idx === 0);
            const deploying = deployingPaths.has(url);
            return (
              <div
                key={idx}
                className={`relative rounded-2xl border overflow-hidden bg-white shadow-2xs group flex flex-col justify-between transition-all ${
                  isCover ? 'border-[#1976F3] ring-2 ring-[#1976F3]/20' : 'border-line'
                }`}
              >
                {/* Image preview */}
                <div
                  onClick={() => !deploying && setPreviewModalUrl(displayFor(url))}
                  className="h-44 bg-inkbg flex items-center justify-center overflow-hidden cursor-pointer relative"
                >
                  <img
                    src={displayFor(url)}
                    alt={`Screenshot ${idx + 1}`}
                    className="w-full h-full object-contain group-hover:scale-102 transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="p-2 rounded-full bg-white text-ink shadow-md">
                      <Eye className="w-4 h-4" />
                    </span>
                  </div>

                  {isCover && (
                    <span className="absolute top-2 left-2 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#1976F3] text-white shadow-sm flex items-center gap-1">
                      <Star className="w-3 h-3 fill-white" /> Cover
                    </span>
                  )}
                  {deploying && (
                    <span className="absolute bottom-2 left-2 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-black/70 text-white flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" /> Deploying
                    </span>
                  )}
                </div>

                {/* Footer Controls */}
                <div className="p-2.5 bg-card border-t border-line flex items-center justify-between gap-1 text-xs">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveLeft(idx)}
                      className="p-1 rounded-lg text-mut hover:text-ink hover:bg-page disabled:opacity-30 transition cursor-pointer"
                      title="Move left"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx >= screenshots.length - 1}
                      onClick={() => handleMoveRight(idx)}
                      className="p-1 rounded-lg text-mut hover:text-ink hover:bg-page disabled:opacity-30 transition cursor-pointer"
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
                        className="px-2 py-1 rounded-lg text-[11px] font-bold text-mut hover:text-[#1976F3] hover:bg-[#1976F3]/10 transition cursor-pointer"
                      >
                        Set as Cover
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(idx)}
                      className="p-1 rounded-lg text-mut hover:text-[#E52B32] hover:bg-[#E52B32]/10 transition cursor-pointer"
                      title="Remove screenshot from this draft (the repository asset is kept)"
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
