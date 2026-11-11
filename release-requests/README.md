# Release requests

Committing a JSON file here dispatches a CI workflow (`.github/workflows/release-request.yml`
runs on `release-requests/*.json` and calls `gh workflow run` with the repository token).

```json
{
  "workflow": "release-android-apk.yml",
  "ref": "main",
  "inputs": { "app_name": "AppMintly", "version_name": "1.0.12" }
}
```

Allow-listed workflows: `release-android-apk.yml`, `build-android-apk.yml`,
`test-appmintly-launch-visual-qa.yml`. Delete a request file once its run finished;
re-adding the same file name re-dispatches.
