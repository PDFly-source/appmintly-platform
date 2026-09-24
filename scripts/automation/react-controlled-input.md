# React Controlled-Input Automation Contract — AppMintly Publisher Console

Phase 7.6. REQUIRED reading before any automated interaction with the
Publisher Console form fields (app name, slug, package ID, version, URL).

## What went wrong in Phase 7.5

Browser automation wrote values directly into DOM inputs (`el.value = '...'`)
without triggering React's controlled-input state updates. The visible input
showed `AppMintly Smoke Test`, but React state — and therefore the build
payload — still held the wizard default `AppMintly`. The accidental build
(`appmintly-v1.0.0`) was the result.

## The only correct way to fill a React controlled input

Always set the value through the native `value` property descriptor and then
dispatch an `input` event. This is exactly what real typing does:

```js
function setReactInputValue(input, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  nativeSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// For non-React pages, also dispatch a change event:
input.dispatchEvent(new Event('change', { bubbles: true }));
```

Keyboard-level typing (`page.keyboard.type`) is also acceptable and preferred
where available — it produces real input events.

## Mandatory verification after filling each field

Automation MUST, after setting each field:

1. Re-read `input.value` and assert it equals the intended value.
2. Assert the React state accepted the change. Observable signals:
   - the target line under "APK Generation & Release Signing" shows the
     intended version (`Target: <packageId> • Version <version>`),
   - or the app listing/preview text shows the intended name/slug.
3. Read the controlled value back AFTER the UI has re-rendered (await the
   next paint), not synchronously.

## The pre-dispatch safety gate (do not try to bypass it)

Every payload-relevant input is tagged `data-build-field`
(`launchUrl`, `name`, `slug`, `version`, `packageId`). The console now enforces:

1. **Step-transition gate** — navigating away from a step is BLOCKED if any
   visible `data-build-field` input's DOM value differs from React state.
   A blocked navigation means the state never accepted the typed value.
2. **Pre-dispatch gate** — before calling the build service, the console
   asserts `UI value == React state == outgoing payload`. On ANY mismatch it
   blocks: no build service call, no workflow dispatch, no release creation.

The gate is a production safety feature. It must NEVER be weakened, bypassed,
or mocked out to force a dispatch through.

## Pre-dispatch verification example (correct flow)

Fill the wizard with:

| Field      | Value                          |
| ---------- | ------------------------------ |
| Name       | AppMintly Smoke Test           |
| Slug       | smoketest                      |
| Package    | com.appforge.smoketest         |
| Version    | 1.0.0                          |
| VersionCode| 10000                          |
| URL        | https://pdfly-source.github.io/appmintly-platform/ |

Before pressing "Generate Android APK", automation MUST assert that all three
representations agree per field: visible input text, React state (reflected in
rendered target line / listing preview) and payload preview. If any assertion
fails, STOP — do not dispatch.
