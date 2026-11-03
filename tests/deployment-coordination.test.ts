import { describe, expect, it } from "vitest";
import fs from "node:fs";
import yaml from "js-yaml";

/**
 * Production deployment coordination (2026-11-03).
 *
 * AppMintly has exactly one production Pages project, delivered by Wrangler
 * Direct Upload. These tests pin the properties that keep two uploaders from
 * racing and keep a cancelled deployment from passing silently.
 */

const load = (f: string) =>
  yaml.load(fs.readFileSync(`.github/workflows/${f}`, "utf8")) as any;

const DEPLOY = load("deploy.yml");
const FEED = load("events-static-feed.yml");
const SYNC = load("sync-lab.yml");
const REFRESH = load("engineering-data-refresh.yml");
const RELEASE = load("release-android-apk.yml");

const allWorkflows = fs
  .readdirSync(".github/workflows")
  .filter((f) => f.endsWith(".yml"))
  .map((f) => [f, fs.readFileSync(`.github/workflows/${f}`, "utf8")] as const);

const uploadCount = (text: string) => (text.match(/wrangler@4 pages deploy/g) || []).length;

const stepBy = (job: any, pattern: RegExp) =>
  (job.steps || []).find((s: any) => pattern.test(s.name || s.uses || ""));

describe("production deployment coordination", () => {
  it("1. has exactly one Wrangler upload path in each intended workflow", () => {
    expect(uploadCount(allWorkflows.find(([f]) => f === "deploy.yml")![1])).toBe(1);
    expect(uploadCount(allWorkflows.find(([f]) => f === "events-static-feed.yml")![1])).toBe(1);
    // nothing else may upload to the production project
    const others = allWorkflows.filter(([f]) => f !== "deploy.yml" && f !== "events-static-feed.yml");
    for (const [f, text] of others) expect([f, uploadCount(text)]).toEqual([f, 0]);
  });

  it("2. both production workflows use the same Pages concurrency group", () => {
    expect(DEPLOY.concurrency.group).toBe("pages");
    expect(FEED.jobs.publish.concurrency.group).toBe("pages");
    expect(DEPLOY.concurrency["cancel-in-progress"]).toBe(false);
    expect(FEED.jobs.publish.concurrency["cancel-in-progress"]).toBe(false);
    // and no workflow-level group remains on the feed, which would fire on no-op runs
    expect(FEED.concurrency).toBeUndefined();
  });

  it("3. keeps the lab-sync writers sharing their own group", () => {
    expect(SYNC.concurrency.group).toBe("lab-sync");
    expect(REFRESH.concurrency.group).toBe("lab-sync");
    expect(SYNC.concurrency["cancel-in-progress"]).toBe(false);
    expect(REFRESH.concurrency["cancel-in-progress"]).toBe(false);
    expect(SYNC.concurrency.group).not.toBe("pages");
    expect(REFRESH.concurrency.group).not.toBe("pages");
  });

  it("4. keeps no-change feed runs out of the Pages group entirely", () => {
    // the group is on a separate job that only exists behind this gate
    expect(FEED.jobs.publish.needs).toBe("refresh-feed");
    expect(FEED.jobs.publish.if).toContain("needs.refresh-feed.outputs.changed == 'true'");
    expect(FEED.jobs["refresh-feed"].outputs.changed).toContain("steps.build.outputs.changed");
    // the refresh job itself must not hold the production slot
    expect(FEED.jobs["refresh-feed"].concurrency).toBeUndefined();
  });

  it("5. lets a genuine feed change enter the group and publish", () => {
    const publish = FEED.jobs.publish;
    expect(publish.steps.some((s: any) => /Deploy to Cloudflare Pages/.test(s.name))).toBe(true);
    // the gate is on a change flag produced inside the refresh job
    expect(stepBy(FEED.jobs["refresh-feed"], /Validate and write feed/).id).toBe("build");
    expect(FEED.jobs["refresh-feed"].outputs.changed).toBeTruthy();
  });

  it("6. cannot upload simultaneously from a release and the feed", () => {
    // the release never uploads itself; it dispatches the single uploader,
    // which shares one group with the feed, so the two can never overlap
    const releaseText = allWorkflows.find(([f]) => f === "release-android-apk.yml")![1];
    expect(uploadCount(releaseText)).toBe(0);
    const verify = stepBy(RELEASE.jobs.release, /Verify the production deployment/);
    expect(verify.run).toContain("gh workflow run deploy.yml");
    expect(verify.run).toContain("gh run watch");
    const deployCf = DEPLOY.jobs["deploy-cloudflare"];
    expect(deployCf.steps.some((s: any) => /Deploy to existing Cloudflare Pages/.test(s.name))).toBe(true);
    expect(stepBy(deployCf, /Deploy to existing Cloudflare Pages/).timeoutMinutes).toBeUndefined();
  });

  it("7. recovers a cancelled required deployment instead of silently passing", () => {
    const syncDeploy = stepBy(SYNC.jobs.sync, /Deploy the committed data/);
    expect(syncDeploy.run).toContain("attempts=3");
    expect(syncDeploy.run).toContain('[ "$conclusion" = "cancelled" ]');
    expect(syncDeploy.run).toContain("contains_commit");
    expect(syncDeploy.run).toContain("retrying");
    expect(syncDeploy.run).toContain("gh run watch");
    // never a bare success: the only success exits are the watch rc or a
    // deployment that provably contains the commit
    expect(syncDeploy.run).toContain('if [ "$watch_rc" -eq 0 ]');
    // the release workflow carries the same recovery
    const releaseVerify = stepBy(RELEASE.jobs.release, /Verify the production deployment/);
    expect(releaseVerify.run).toMatch(/\[ "\$\{?conclusion\}?" = "cancelled" \]/);
    expect(releaseVerify.run).toContain("Re-dispatching");
  });

  it("8. cannot let an older deployment overwrite newer content", () => {
    // the uploader rebuilds from the checkout at execution time, so whatever it
    // uploads is the main tip at that moment, never a stale queued tree
    const deployCf = DEPLOY.jobs["deploy-cloudflare"];
    const names = deployCf.steps.map((s: any) => s.name || "");
    expect(names).toContain("Checkout Repository");
    expect(names).toContain("Build Static Next.js Export (root scope)");
    const checkout = names.indexOf("Checkout Repository");
    const build = names.indexOf("Build Static Next.js Export (root scope)");
    const upload = names.indexOf("Deploy to existing Cloudflare Pages project");
    expect(checkout).toBeLessThan(build);
    expect(build).toBeLessThan(upload);
  });

  it("9. passes the exact SHA of the built checkout to both uploads", () => {
    for (const [job, pattern] of [
      [DEPLOY.jobs["deploy-cloudflare"], /Deploy to existing Cloudflare Pages/],
      [FEED.jobs.publish, /Deploy to Cloudflare Pages/],
    ] as const) {
      const step = stepBy(job as any, pattern as RegExp);
      expect(step.run).toContain("DEPLOYED_SHA=$(git rev-parse HEAD)");
      expect(step.run).toContain('--commit-hash "$DEPLOYED_SHA"');
      expect(step.run).toContain('--commit-message "$DEPLOYED_SHA');
      // provenance is refused when the tree does not correspond to a commit
      expect(step.run).toContain("uncommitted source changes present");
    }
  });
});
