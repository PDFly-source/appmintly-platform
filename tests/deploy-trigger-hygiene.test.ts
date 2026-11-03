import { describe, expect, it } from "vitest";
import fs from "node:fs";
import yaml from "js-yaml";

const load = (f: string): any => yaml.load(fs.readFileSync(`.github/workflows/${f}`, "utf8"));

describe("production deploy trigger hygiene", () => {
  const deploy = load("deploy.yml");

  it("never triggers a deployment on its own workflow file", () => {
    // 8841390 edited deploy.yml, matched its own push paths and shipped an
    // unintended production deployment. CI edits do not change the site.
    expect(deploy.on.push.paths).not.toContain(".github/workflows/deploy.yml");
  });

  it("keeps every genuine app, component, library and data trigger", () => {
    const paths: string[] = deploy.on.push.paths;
    for (const p of [
      "data/**",
      "app/**",
      "components/**",
      "lib/**",
      "public/**",
      "next.config.ts",
      "package.json",
      "package-lock.json",
    ]) {
      expect(paths).toContain(p);
    }
  });

  it("stays scoped to main and keeps manual dispatch", () => {
    expect(deploy.on.push.branches).toEqual(["main"]);
    expect(deploy.on).toHaveProperty("workflow_dispatch");
  });

  it("no workflow lists its own file as a push trigger", () => {
    for (const f of fs.readdirSync(".github/workflows")) {
      if (!f.endsWith(".yml")) continue;
      const paths = load(f)?.on?.push?.paths;
      if (!Array.isArray(paths)) continue;
      expect(paths).not.toContain(`.github/workflows/${f}`);
    }
  });

  it("keeps the deployment safety checks intact", () => {
    const cf = deploy.jobs["deploy-cloudflare"];
    const names = cf.steps.map((s: any) => s.name || "");
    expect(names).toContain("Verify Cloudflare Actions Secrets");
    const upload = cf.steps.find((s: any) => /Deploy to existing Cloudflare/.test(s.name));
    expect(upload.run).toContain("--commit-hash");
    expect(upload.run).toContain("git status --porcelain");
    expect(upload.run).toContain("uncommitted source changes present");
  });
});
