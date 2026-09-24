import { NextRequest, NextResponse } from 'next/server';

export interface DetectedMetadata {
  url: string;
  name: string;
  shortName: string;
  developer: string;
  description: string;
  shortDescription: string;
  icon: string;
  icons: { src: string; sizes?: string; type?: string; purpose?: string }[];
  screenshots: string[];
  themeColor: string;
  backgroundColor: string;
  type: 'PWA' | 'Web App' | 'Website' | 'Android APK' | 'Web Game' | 'Tool';
  category: string;
  version: string;
  manifestUrl: string;
  startUrl: string;
  scope: string;
  pwa: {
    detected: boolean;
    installable: boolean;
    manifestDetected: boolean;
    serviceWorkerDetected: boolean | null;
    statusSummary: 'PWA Ready' | 'PWA Metadata Found' | 'Web App Only' | 'Unable to Verify';
  };
  detectionSummary: {
    nameDetected: boolean;
    descriptionDetected: boolean;
    iconDetected: boolean;
    manifestFound: boolean;
    screenshotsFound: boolean;
    serviceWorkerIndicator: boolean;
  };
}

function resolveUrl(relativeOrAbsolute: string, baseUrl: string): string {
  try {
    return new URL(relativeOrAbsolute, baseUrl).toString();
  } catch {
    return relativeOrAbsolute;
  }
}

function extractTagAttribute(html: string, tagName: string, attribute: string, matchAttribute?: { name: string; value: string }): string | null {
  const tagRegex = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const fullTag = match[0];
    if (matchAttribute) {
      const matchRegex = new RegExp(`${matchAttribute.name}\\s*=\\s*["']?${matchAttribute.value}["']?`, 'i');
      if (!matchRegex.test(fullTag)) continue;
    }
    const attrRegex = new RegExp(`${attribute}\\s*=\\s*["']([^"']*)["']`, 'i');
    const attrMatch = fullTag.match(attrRegex);
    if (attrMatch && attrMatch[1]) {
      return attrMatch[1].trim();
    }
  }
  return null;
}

function extractMetaContent(html: string, nameOrProperty: string): string | null {
  // Check property="..." first, then name="..."
  return (
    extractTagAttribute(html, 'meta', 'content', { name: 'property', value: nameOrProperty }) ||
    extractTagAttribute(html, 'meta', 'content', { name: 'name', value: nameOrProperty }) ||
    extractTagAttribute(html, 'meta', 'content', { name: 'http-equiv', value: nameOrProperty })
  );
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match && match[1] ? match[1].trim() : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const targetUrl = (body.url || '').trim();

    if (!targetUrl) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (!targetUrl.startsWith('https://') && !targetUrl.startsWith('http://localhost')) {
      return NextResponse.json(
        { error: 'Only secure HTTPS URLs are permitted for app distribution.' },
        { status: 400 }
      );
    }

    let parsedTargetUrl: URL;
    try {
      parsedTargetUrl = new URL(targetUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    // 1. Fetch destination HTML
    let html = '';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(parsedTargetUrl.toString(), {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 AppMintly/1.0',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return NextResponse.json({
          success: false,
          error: `The destination server returned HTTP ${res.status}: ${res.statusText}`,
          corsRestricted: false,
        });
      }

      html = await res.text();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      return NextResponse.json({
        success: false,
        error: `Unable to inspect destination: ${message}. Automatic metadata access might be restricted by the website.`,
        corsRestricted: true,
      });
    }

    // 2. Parse HTML Metadata
    const pageTitle = extractTitle(html) || '';
    const ogTitle = extractMetaContent(html, 'og:title') || '';
    const appNameMeta = extractMetaContent(html, 'application-name') || extractMetaContent(html, 'apple-mobile-web-app-title') || '';
    const metaDesc = extractMetaContent(html, 'description') || '';
    const ogDesc = extractMetaContent(html, 'og:description') || '';
    const ogImage = extractMetaContent(html, 'og:image') || '';
    const themeColorMeta = extractMetaContent(html, 'theme-color') || '';

    // Check for Service Worker indicators in HTML
    const swRegex = /navigator\.serviceWorker\.register|serviceWorker|sw\.js|\/sw\b/i;
    const hasServiceWorkerIndicator = swRegex.test(html);

    // 3. Locate Manifest
    let manifestUrl = '';
    const manifestHref =
      extractTagAttribute(html, 'link', 'href', { name: 'rel', value: 'manifest' }) ||
      extractTagAttribute(html, 'link', 'href', { name: 'rel', value: 'manifest.webmanifest' });

    if (manifestHref) {
      manifestUrl = resolveUrl(manifestHref, parsedTargetUrl.toString());
    } else {
      // Fallback check common manifest paths
      const commonPaths = ['/manifest.json', '/manifest.webmanifest', '/app.webmanifest'];
      for (const p of commonPaths) {
        try {
          const testUrl = resolveUrl(p, parsedTargetUrl.toString());
          const checkRes = await fetch(testUrl, { method: 'HEAD' });
          if (checkRes.ok) {
            manifestUrl = testUrl;
            break;
          }
        } catch {
          // ignore
        }
      }
    }

    // 4. Fetch & Parse Manifest if found
    let manifestData: Record<string, unknown> | null = null;
    if (manifestUrl) {
      try {
        const mRes = await fetch(manifestUrl, {
          headers: {
            'User-Agent': 'AppMintly/1.0 Manifest Inspector',
            Accept: 'application/manifest+json,application/json,*/*',
          },
        });
        if (mRes.ok) {
          const text = await mRes.text();
          manifestData = JSON.parse(text);
        }
      } catch {
        // Manifest fetch failed or invalid JSON
      }
    }

    // 5. Gather Names, Descriptions, Icons, Screenshots
    const manifestName = typeof manifestData?.name === 'string' ? manifestData.name : '';
    const manifestShortName = typeof manifestData?.short_name === 'string' ? manifestData.short_name : '';
    const manifestDesc = typeof manifestData?.description === 'string' ? manifestData.description : '';
    const manifestThemeColor = typeof manifestData?.theme_color === 'string' ? manifestData.theme_color : '';
    const manifestBgColor = typeof manifestData?.background_color === 'string' ? manifestData.background_color : '';
    const manifestStartUrl = typeof manifestData?.start_url === 'string' ? resolveUrl(manifestData.start_url, manifestUrl || targetUrl) : targetUrl;
    const manifestScope = typeof manifestData?.scope === 'string' ? resolveUrl(manifestData.scope, manifestUrl || targetUrl) : targetUrl;
    const manifestDisplay = typeof manifestData?.display === 'string' ? manifestData.display : '';

    // Final Name Resolution
    let cleanName = manifestName || appNameMeta || ogTitle || pageTitle || parsedTargetUrl.hostname;
    // Strip common suffixes from titles like "App Name — Tagline"
    if (cleanName.includes(' — ')) cleanName = cleanName.split(' — ')[0].trim();
    if (cleanName.includes(' | ')) cleanName = cleanName.split(' | ')[0].trim();

    const cleanShortName = manifestShortName || appNameMeta || cleanName.slice(0, 15);
    const cleanDescription = manifestDesc || ogDesc || metaDesc || 'Modern application accessible in your web browser.';
    
    // Create a concise short description
    let cleanShortDescription = cleanDescription;
    if (cleanShortDescription.includes('.')) {
      cleanShortDescription = cleanShortDescription.split('.')[0] + '.';
    }
    if (cleanShortDescription.length > 90) {
      cleanShortDescription = cleanShortDescription.slice(0, 87) + '...';
    }

    // Developer Resolution (check copyright or og:site_name or domain)
    let developer = '';
    const authorMeta = extractMetaContent(html, 'author');
    const siteName = extractMetaContent(html, 'og:site_name');
    if (authorMeta) {
      developer = authorMeta;
    } else if (siteName && siteName !== cleanName) {
      developer = siteName;
    } else {
      developer = parsedTargetUrl.hostname.replace(/^www\./, '');
    }

    // Icons Extraction
    const resolvedIcons: { src: string; sizes?: string; type?: string; purpose?: string }[] = [];
    if (Array.isArray(manifestData?.icons)) {
      for (const ic of manifestData.icons) {
        if (ic && typeof ic.src === 'string') {
          resolvedIcons.push({
            src: resolveUrl(ic.src, manifestUrl || targetUrl),
            sizes: ic.sizes,
            type: ic.type,
            purpose: ic.purpose,
          });
        }
      }
    }

    // Additional icons from HTML
    const appleTouchIcon = extractTagAttribute(html, 'link', 'href', { name: 'rel', value: 'apple-touch-icon' });
    if (appleTouchIcon) {
      resolvedIcons.push({
        src: resolveUrl(appleTouchIcon, targetUrl),
        sizes: '180x180',
        purpose: 'apple-touch-icon',
      });
    }
    const iconHref = extractTagAttribute(html, 'link', 'href', { name: 'rel', value: 'icon' });
    if (iconHref) {
      resolvedIcons.push({
        src: resolveUrl(iconHref, targetUrl),
        sizes: 'any',
        purpose: 'favicon',
      });
    }

    // Pick highest quality suitable icon
    let chosenIcon = '';
    // Priority: 512 -> 384 -> 192 -> 180 -> svg -> appleTouchIcon -> any
    const icon512 = resolvedIcons.find((i) => i.sizes?.includes('512x512'));
    const icon384 = resolvedIcons.find((i) => i.sizes?.includes('384x384'));
    const icon192 = resolvedIcons.find((i) => i.sizes?.includes('192x192'));
    const icon180 = resolvedIcons.find((i) => i.sizes?.includes('180x180') || i.purpose === 'apple-touch-icon');
    const iconSvg = resolvedIcons.find((i) => i.src.endsWith('.svg'));

    if (icon512) chosenIcon = icon512.src;
    else if (icon384) chosenIcon = icon384.src;
    else if (icon192) chosenIcon = icon192.src;
    else if (icon180) chosenIcon = icon180.src;
    else if (iconSvg) chosenIcon = iconSvg.src;
    else if (resolvedIcons[0]) chosenIcon = resolvedIcons[0].src;
    else if (ogImage) chosenIcon = resolveUrl(ogImage, targetUrl);

    // Screenshots Extraction
    const screenshots: string[] = [];
    if (Array.isArray(manifestData?.screenshots)) {
      for (const sc of manifestData.screenshots) {
        if (sc && typeof sc.src === 'string') {
          screenshots.push(resolveUrl(sc.src, manifestUrl || targetUrl));
        }
      }
    }
    if (ogImage && !screenshots.includes(resolveUrl(ogImage, targetUrl))) {
      screenshots.push(resolveUrl(ogImage, targetUrl));
    }

    // PWA Evaluation
    const manifestDetected = Boolean(manifestData);
    const hasStandaloneDisplay = ['standalone', 'fullscreen', 'minimal-ui'].includes(manifestDisplay.toLowerCase());
    const hasAppropriateIcons = resolvedIcons.some((i) => (i.sizes && (i.sizes.includes('192') || i.sizes.includes('512'))) || i.src.endsWith('.svg'));
    const isHttps = parsedTargetUrl.protocol === 'https:';

    const isInstallable = manifestDetected && hasStandaloneDisplay && hasAppropriateIcons && isHttps;

    let pwaStatus: 'PWA Ready' | 'PWA Metadata Found' | 'Web App Only' | 'Unable to Verify' = 'Web App Only';
    if (isInstallable && hasServiceWorkerIndicator) {
      pwaStatus = 'PWA Ready';
    } else if (manifestDetected) {
      pwaStatus = 'PWA Metadata Found';
    } else if (cleanName) {
      pwaStatus = 'Web App Only';
    } else {
      pwaStatus = 'Unable to Verify';
    }

    // Category Suggestion
    let suggestedCategory = 'Tools';
    const textCorpus = `${cleanName} ${cleanDescription} ${JSON.stringify(manifestData?.categories || '')}`.toLowerCase();
    if (/game|arcade|play|puzzle|rpg|shooter/i.test(textCorpus)) suggestedCategory = 'Games';
    else if (/pdf|convert|compress|editor|generator|format|code|util/i.test(textCorpus)) suggestedCategory = 'Tools';
    else if (/task|note|plan|habit|todo|calendar|manage|work/i.test(textCorpus)) suggestedCategory = 'Productivity';
    else if (/finance|budget|money|wallet|crypto|expense/i.test(textCorpus)) suggestedCategory = 'Finance';
    else if (/health|workout|fitness|timer|meditat|water/i.test(textCorpus)) suggestedCategory = 'Health';
    else if (/education|learn|study|school|math|science/i.test(textCorpus)) suggestedCategory = 'Education';
    else if (/music|audio|sound|drum|video|movie|media/i.test(textCorpus)) suggestedCategory = 'Entertainment';

    // Type Suggestion
    const suggestedType: 'PWA' | 'Web App' | 'Website' | 'Android APK' | 'Web Game' | 'Tool' =
      isInstallable ? 'PWA' : (suggestedCategory === 'Games' ? 'Web Game' : 'Web App');

    const result: DetectedMetadata = {
      url: targetUrl,
      name: cleanName,
      shortName: cleanShortName,
      developer: developer || 'Independent Developer',
      description: cleanDescription,
      shortDescription: cleanShortDescription,
      icon: chosenIcon,
      icons: resolvedIcons,
      screenshots: screenshots.slice(0, 6),
      themeColor: manifestThemeColor || themeColorMeta || '#17191C',
      backgroundColor: manifestBgColor || '#FFFFFF',
      type: suggestedType,
      category: suggestedCategory,
      version: typeof manifestData?.version === 'string' ? manifestData.version : '1.0.0',
      manifestUrl,
      startUrl: manifestStartUrl,
      scope: manifestScope,
      pwa: {
        detected: manifestDetected,
        installable: isInstallable,
        manifestDetected,
        serviceWorkerDetected: hasServiceWorkerIndicator ? true : null,
        statusSummary: pwaStatus,
      },
      detectionSummary: {
        nameDetected: Boolean(cleanName),
        descriptionDetected: Boolean(cleanDescription),
        iconDetected: Boolean(chosenIcon),
        manifestFound: manifestDetected,
        screenshotsFound: screenshots.length > 0,
        serviceWorkerIndicator: hasServiceWorkerIndicator,
      },
    };

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error during analysis';
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
