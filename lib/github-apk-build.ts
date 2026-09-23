/** Private GitHub Actions artifact builds. This does not publish APKs to the marketplace. */
const REPO = 'PDFly-source/appmintly-platform';
const WORKFLOW = 'build-android-apk.yml';

async function github(endpoint: string, init?: RequestInit) {
  const token = process.env.GITHUB_ACTIONS_TOKEN;
  if (!token) throw new Error('GITHUB_ACTIONS_TOKEN server secret is missing. APK builds cannot be dispatched.');
  const response = await fetch(`https://api.github.com/repos/${REPO}${endpoint}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`GitHub Actions API ${response.status}: ${(await response.text()).slice(0, 350)}`);
  return response.status === 204 ? null : response.json();
}

export async function requestAndroidBuild(input: {
  app_name: string; source_url: string; package_id: string; version_name: string;
  icon_url?: string; theme_color?: string; background_color?: string; build_id: string;
}) {
  await github(`/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: 'main', inputs: { ...input, signing_mode: 'release' } }),
  });
}

export async function readAndroidBuild(buildId: string) {
  const data = await github(`/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&branch=main&per_page=100`);
  const run = data.workflow_runs.find((r: any) => r.display_title === `APK build ${buildId}`);
  if (!run) return { status: 'queued', currentStep: 'Waiting for GitHub Actions runner', progress: 5 };
  if (run.status !== 'completed') {
    return { status: 'building', currentStep: 'Building APK in GitHub Actions', progress: 40, runUrl: run.html_url };
  }
  if (run.conclusion !== 'success') {
    return { status: 'failed', currentStep: 'Build failed', progress: 0,
      error: `GitHub Actions run ${run.conclusion || 'failed'}. Inspect ${run.html_url}`, runUrl: run.html_url };
  }
  const artifacts = await github(`/actions/runs/${run.id}/artifacts`);
  const artifact = artifacts.artifacts.find((a: any) => a.name === `android-apk-${buildId}-release` && !a.expired);
  if (!artifact) return { status: 'failed', currentStep: 'Build failed', progress: 0,
    error: `GitHub Actions succeeded but the verified release artifact was not found: ${run.html_url}` };
  return { status: 'completed', currentStep: 'Validated artifact (not publicly published)', progress: 100,
    artifactName: artifact.name, runUrl: run.html_url,
    artifactNotice: 'Private Actions artifact. No public marketplace URL has been published.' };
}
