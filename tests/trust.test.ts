import { describe, expect, it } from 'vitest';
import appsData from '@/data/apps.json';
import type { AppItem } from '@/data/apps';
import {
  CHECKSUM_DOES_NOT_PROVE,
  findForbiddenClaim,
  findUnqualifiedOutcomeClaim,
  CHECKSUM_PROVES,
  FORBIDDEN_SECURITY_CLAIMS,
  RECEIPT_TEXT,
  RECEIPT_TEXT_PRIVATE,
  REPORT_CATEGORIES,
  REPORT_CATEGORY_IDS,
  REPORT_MESSAGE_MAX,
  REPORT_MESSAGE_MIN,
  describeReportFailure,
  formatIntegrityBytes,
  isValidReportCategory,
  releaseIntegrityFacts,
  sanitizeReportText,
  validateReportDraft,
} from '@/lib/trust/reports';

const apps = appsData as unknown as AppItem[];
const cineflow = apps.find((a) => a.slug === 'cineflow')!;
const validDraft = {
  slug: 'cineflow',
  category: 'broken-download',
  message: 'The APK download stops at 40 percent in a clean browser profile.',
  contact: '',
};

describe('report categories', () => {
  it('exposes exactly the six published categories', () => {
    expect(REPORT_CATEGORIES).toHaveLength(6);
    expect(REPORT_CATEGORY_IDS).toEqual([
      'suspicious-app',
      'broken-download',
      'incorrect-info',
      'suspicious-redirect',
      'release-integrity',
      'other-safety',
    ]);
  });
  it('rejects categories outside the allowlist', () => {
    expect(isValidReportCategory('broken-download')).toBe(true);
    expect(isValidReportCategory('malware')).toBe(false);
    expect(isValidReportCategory('')).toBe(false);
    expect(isValidReportCategory(undefined)).toBe(false);
  });
});

describe('report validation', () => {
  it('accepts a genuine report', () => {
    expect(validateReportDraft(validDraft).ok).toBe(true);
  });
  it('rejects invalid slugs', () => {
    for (const slug of ['../../etc/passwd', 'Cine Flow', '', '-leading', 'a'.repeat(80), 'cine_flow', 'cine.flow']) {
      expect(validateReportDraft({ ...validDraft, slug }).ok).toBe(false);
    }
  });
  it('normalises an uppercase slug instead of rejecting it', () => {
    // Catalog slugs are lowercase; the worker lowercases before validating, so an
    // uppercase paste is normalised rather than refused. Asserted explicitly so
    // the earlier wrong expectation cannot creep back in.
    const result = validateReportDraft({ ...validDraft, slug: ' CineFlow ' });
    expect(result.ok).toBe(true);
    expect(result.value.slug).toBe('cineflow');
  });
  it('rejects an unknown category', () => {
    const result = validateReportDraft({ ...validDraft, category: 'malware' });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/categor/i);
  });
  it('enforces the minimum description length', () => {
    expect(validateReportDraft({ ...validDraft, message: 'x'.repeat(REPORT_MESSAGE_MIN - 1) }).ok).toBe(false);
    expect(validateReportDraft({ ...validDraft, message: 'x'.repeat(REPORT_MESSAGE_MIN) }).ok).toBe(true);
  });
  it('trims nothing away from a long report silently', () => {
    const long = 'detail '.repeat(400);
    const result = validateReportDraft({ ...validDraft, message: long });
    expect(result.ok).toBe(true);
    expect(result.value.message.length).toBeLessThanOrEqual(REPORT_MESSAGE_MAX);
    expect(result.value.message.length).toBe(REPORT_MESSAGE_MAX);
  });
  it('handles null and non-object input', () => {
    expect(validateReportDraft(null).ok).toBe(false);
    expect(validateReportDraft(undefined).ok).toBe(false);
  });
  it('validates the optional contact address', () => {
    expect(validateReportDraft({ ...validDraft, contact: 'owner@example.com' }).ok).toBe(true);
    expect(validateReportDraft({ ...validDraft, contact: 'not-an-email' }).ok).toBe(false);
    expect(validateReportDraft({ ...validDraft, contact: '' }).ok).toBe(true);
  });
});

describe('XSS payloads cannot survive validation', () => {
  const payloads = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '"><svg onload=alert(1)>',
    'javascript:alert(1)',
    '<iframe src=javascript:alert(1)>',
  ];
  it('strips markup from the stored value', () => {
    for (const payload of payloads) {
      const result = validateReportDraft({ ...validDraft, message: `${payload} The download fails immediately every time.` });
      expect(result.ok).toBe(true);
      // No angle brackets, no scheme, no handler attributes survive.
      expect(result.value.message).not.toMatch(/<|>/);
      expect(result.value.message).not.toMatch(/javascript:|onerror|onload/i);
    }
  });
  it('removes control and zero-width characters', () => {
    expect(sanitizeReportText('a\u0000b\u200Bc')).toBe('abc');
  });
  it('keeps ordinary punctuation and quotes intact', () => {
    expect(sanitizeReportText('It said "file not found" & stopped.')).toBe('It said "file not found" & stopped.');
  });
});

describe('duplicate and failure messaging stays honest', () => {
  it('explains a duplicate without accusing anyone', () => {
    expect(describeReportFailure(409)).toMatch(/already received/i);
  });
  it('explains rate limiting with a timeframe', () => {
    expect(describeReportFailure(429)).toMatch(/wait/i);
  });
  it('never claims an outcome', () => {
    const messages = [
      describeReportFailure(0), describeReportFailure(400), describeReportFailure(404),
      describeReportFailure(409), describeReportFailure(429), RECEIPT_TEXT, RECEIPT_TEXT_PRIVATE,
    ];
    for (const message of messages) {
      expect(findUnqualifiedOutcomeClaim(message)).toBeNull();
    }
    expect(RECEIPT_TEXT).toMatch(/nothing has been investigated or resolved yet/i);
  });
  it('outcome guard catches a real claim but allows a disclaimer', () => {
    expect(findUnqualifiedOutcomeClaim('This report was resolved by the owner.')).toMatch(/resolved/);
    expect(findUnqualifiedOutcomeClaim('Nothing has been investigated or resolved yet.')).toBeNull();
    // 'verified' is a release-integrity fact, not a moderation outcome; safety
    // phrasing like "verified safe" is covered by findForbiddenClaim instead.
    expect(findUnqualifiedOutcomeClaim('The release record was verified by the pipeline.')).toBeNull();
    expect(findForbiddenClaim('The app is verified safe.')).not.toBeNull();
  });
});

describe('release integrity uses only pipeline facts', () => {
  it('returns facts for a verified release', () => {
    const facts = releaseIntegrityFacts(cineflow)!;
    expect(facts).not.toBeNull();
    expect(facts.verified).toBe(true);
    expect(facts.sha256).toHaveLength(64);
    expect(facts.source).toBe('Official AppMintly GitHub release');
    expect(facts.officialAsset).toBe(true);
    expect(facts.signatureSchemes).toEqual(expect.arrayContaining(['V2', 'V3']));
    expect(facts.version).toBe('0.2.2');
  });
  it('returns null for an unverified release instead of a fake panel', () => {
    const unverified = { ...cineflow, apk: { ...cineflow.apk!, verified: false } } as AppItem;
    expect(releaseIntegrityFacts(unverified)).toBeNull();
    const disabled = { ...cineflow, apk: { ...cineflow.apk!, enabled: false } } as AppItem;
    expect(releaseIntegrityFacts(disabled)).toBeNull();
    expect(releaseIntegrityFacts(null)).toBeNull();
  });
  it('never labels a non-official asset as official', () => {
    const other = { ...cineflow, apk: { ...cineflow.apk!, apkUrl: 'https://example.com/app.apk' } } as AppItem;
    const facts = releaseIntegrityFacts(other)!;
    expect(facts.officialAsset).toBe(false);
    expect(facts.source).toBe('Publisher-supplied release asset');
  });
  it('formats sizes without inventing one', () => {
    expect(formatIntegrityBytes(276334)).toBe('269.9 KB');
    expect(formatIntegrityBytes(0)).toBeNull();
    expect(formatIntegrityBytes(null)).toBeNull();
  });
});

describe('no fabricated security claims', () => {
  it('lists what a checksum does not prove', () => {
    expect(CHECKSUM_DOES_NOT_PROVE.join(' ')).toMatch(/malware/i);
    expect(CHECKSUM_DOES_NOT_PROVE.join(' ')).toMatch(/does not run antivirus scans/i);
    expect(CHECKSUM_PROVES.join(' ')).not.toMatch(FORBIDDEN_SECURITY_CLAIMS);
  });
  it('forbidden-claim guard catches prohibitions in the affirmative', () => {
    const prohibited = [
      'This APK is malware-free.',
      '100% virus-free, guaranteed.',
      'It is 100% secure.',
      'The app is guaranteed safe.',
      'The file was antivirus scanned before publishing.',
      'AppMintly security score: 98/100.',
      'This app has no viruses.',
      'The app is free of malware.',
    ];
    for (const copy of prohibited) {
      expect(findForbiddenClaim(copy), copy).not.toBeNull();
    }
  });
  it('forbidden-claim guard allows truthful negative disclosures', () => {
    const allowed = [
      'AppMintly does not scan APKs for malware.',
      'SHA-256 verification does not prove an APK is malware-free.',
      'A checksum match does not mean the app is virus-free.',
      'AppMintly has no antivirus results to show.',
      'It does not prove the app is malware-free, or free of unwanted behaviour.',
      'No malware scan is performed, so this is unproven.',
    ];
    for (const copy of allowed) {
      expect(findForbiddenClaim(copy), copy).toBeNull();
    }
  });
  it('a truthfully negated sentence cannot smuggle a claim after it', () => {
    // Negation must come BEFORE the claim to count as a disclaimer.
    expect(findForbiddenClaim('This app is malware-free and does not show ads.')).not.toBeNull();
  });
  it('the shipped trust copy contains no affirmative security claim', () => {
    const fs = require('fs');
    const files = ['app/trust/page.tsx', 'components/trust/ReleaseIntegrity.tsx', 'components/trust/ReportAppDialog.tsx'];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      for (const raw of source.split('\n')) {
        const line = raw.replace(/<[^>]+>/g, ' ').replace(/\{[^}]*\}/g, ' ').trim();
        if (line.length < 12) continue;
        expect(findForbiddenClaim(line), `${file}: ${line.slice(0, 80)}`).toBeNull();
      }
    }
    for (const constant of [...CHECKSUM_PROVES, ...CHECKSUM_DOES_NOT_PROVE]) {
      expect(findForbiddenClaim(constant), constant).toBeNull();
    }
  });
  it('reports are never described as public', () => {
    const fs = require('fs');
    const copy = fs.readFileSync('app/trust/page.tsx', 'utf8');
    expect(copy).toMatch(/Reports\s+are private|Reports are private/i);
  });
});
