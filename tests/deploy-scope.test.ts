import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

/**
 * Regression guard for the 2026-11-02 production outage.
 *
 * Cloudflare Pages serves project `appmintly` at the site root (`/_next/...`),
 * while the GitHub Pages mirror is served under `/appmintly-platform/`
 * (`/appmintly-platform/_next/...`). Any workflow that deploys to Cloudflare
 * must therefore deploy a ROOT-SCOPED build. events-static-feed.yml reused the
 * base-path export, so appmintly.pages.dev served HTML asking for
 * `/appmintly-platform/_next/*` while the files sat at `/_next/*`: every
 * stylesheet, chunk and image 404'd and the public site rendered as unstyled
 * HTML with broken logos.
 */
const feed = fs.readFileSync('.github/workflows/events-static-feed.yml', 'utf8');
const deploy = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');

function stepIndex(src: string, name: string): number {
  return src.indexOf(`- name: ${name}`);
}

describe('deployment build scope', () => {
  it('feed workflow builds a base-path bundle for the GitHub Pages mirror', () => {
    expect(feed).toContain('NEXT_OUTPUT=export NEXT_PUBLIC_BASE_PATH=/appmintly-platform npm run build');
    expect(stepIndex(feed, 'Build static export (GitHub Pages scope)')).toBeGreaterThan(-1);
  });

  it('feed workflow builds a root-scoped bundle for Cloudflare Pages', () => {
    expect(stepIndex(feed, 'Build static export (Cloudflare root scope)')).toBeGreaterThan(-1);
    const cfBuild = feed.slice(feed.indexOf('Build static export (Cloudflare root scope)'));
    expect(cfBuild).toMatch(/NEXT_OUTPUT=export npm run build/);
    expect(cfBuild).not.toMatch(/NEXT_PUBLIC_BASE_PATH/);
  });

  it('the Cloudflare deploy follows the root-scoped build, never the base-path one', () => {
    const pagesBuild = stepIndex(feed, 'Build static export (GitHub Pages scope)');
    const cfBuild = stepIndex(feed, 'Build static export (Cloudflare root scope)');
    const cfDeploy = stepIndex(feed, 'Deploy to Cloudflare Pages');
    expect(cfDeploy).toBeGreaterThan(cfBuild);
    expect(cfBuild).toBeGreaterThan(pagesBuild);
  });

  it('both feed builds fail closed on the wrong scope', () => {
    expect(feed).toContain('FATAL: GitHub Pages build is not base-path scoped');
    expect(feed).toContain('FATAL: Cloudflare build is base-path scoped');
    expect(feed).toContain("grep -q 'href=\"/_next/static/css/' out/index.html");
  });

  it('deploy.yml keeps its dedicated root-scoped Cloudflare build', () => {
    const cfJob = deploy.slice(deploy.indexOf('Deploy to Cloudflare Pages (appmintly)'));
    expect(cfJob).toMatch(/NEXT_OUTPUT=export npm run build/);
    expect(cfJob.indexOf('pages deploy out')).toBeGreaterThan(-1);
  });
});
