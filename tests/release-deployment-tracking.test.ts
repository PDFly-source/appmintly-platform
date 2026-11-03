import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const REPO = path.resolve(__dirname, "..");
const load = (f: string) =>
  yaml.load(fs.readFileSync(path.join(REPO, ".github", "workflows", f), "utf8")) as any;

/**
 * Regression guard for the 2026-11-02 release incident: the release workflow
 * dispatched deploy.yml with a fire-and-forget curl (HTTP 204 only), so a
 * release reported success while the dispatched deployment had been cancelled
 * by a later Pages deployment. These assertions keep the tracked pattern.
 */
describe("Android release dispatches the production deployment with tracking", () => {
  const release = load("release-android-apk.yml");
  const steps: any[] = release.jobs.release.steps;
  const catalog = steps.find((s) => s.id === "catalog");
  const verify = steps.find((s) => /Verify the production deployment/.test(s.name ?? ""));

  it("exports the exact catalogue commit SHA", () => {
    expect(catalog).toBeDefined();
    expect(catalog.run).toContain('echo "committed=true"');
    expect(catalog.run).toContain("commit_sha=$(git rev-parse HEAD)");
  });

  it("no longer fire-and-forgets the dispatch with curl", () => {
    expect(catalog.run).not.toMatch(/curl[\s\S]*dispatches/);
    expect(String(verify?.run)).not.toMatch(/curl[\s\S]*dispatches/);
  });

  it("runs only for a genuine release that committed catalogue data", () => {
    expect(verify).toBeDefined();
    expect(verify.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(verify.if).toContain("steps.catalog.outputs.committed == 'true'");
  });

  it("dispatches deploy.yml on main and waits for the result", () => {
    expect(verify.run).toContain("gh workflow run deploy.yml --ref main");
    expect(verify.run).toContain("gh run watch");
    expect(verify.run).toContain("--exit-status");
    expect(verify.run).toContain('--json databaseId,headSha,event');
  });

  it("verifies the run really built the intended commit", () => {
    expect(verify.run).toContain("compare/${COMMIT}...main");
    expect(verify.run).toContain("compare/${COMMIT}...${actual_sha}");
    expect(verify.run).toContain("does not contain");
  });

  it("never reuses a duplicate deployment for the same commit", () => {
    // The jq filter is written with escaped quotes inside the YAML block
    // scalar, so assert on fragments rather than the exact quoted expression.
    expect(verify.run).toContain("not dispatching a duplicate");
    expect(verify.run).toContain("headSha==");
    expect(verify.run).toContain("conclusion==");
    expect(verify.run).toContain("--json databaseId,headSha,status");
  });

  it("retries a cancelled deployment but never a failed one", () => {
    expect(verify.run).toContain('[ "${conclusion}" = "cancelled" ]');
    expect(verify.run).toContain("Re-dispatching");
    expect(verify.run).toContain('echo "::error::deployment');
  });

  it("keeps deploys and scans in different concurrency groups", () => {
    const deploy = load("deploy.yml");
    const feed = load("events-static-feed.yml");
    const sync = load("sync-lab.yml");
    // deploy + feed share one group so two direct uploads never race, and only
    // one run is pending at a time; the release step above absorbs the
    // resulting cancellation. Scans must stay out of that group.
    expect(deploy.concurrency.group).toBe("pages");
    // The feed's production slot now lives on its gated publish job, so a
    // no-change run never enters the group at all.
    expect(feed.concurrency).toBeUndefined();
    expect(feed.jobs.publish.concurrency.group).toBe("pages");
    expect(deploy.concurrency["cancel-in-progress"]).toBe(false);
    expect(feed.jobs.publish.concurrency["cancel-in-progress"]).toBe(false);
    expect(sync.concurrency.group).not.toBe("pages");
  });
});
