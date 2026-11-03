/**
 * Minimal ambient types for js-yaml.
 *
 * js-yaml is present only as a transitive dev dependency (pulled in by eslint
 * and friends) and ships no type declarations, so `tsc --noEmit` failed on the
 * workflow-inspecting tests that parse `.github/workflows/*.yml`. Declaring the
 * two members those tests use keeps the repo type-clean without adding a
 * dependency or touching package.json (which would trigger a production
 * deployment).
 */
declare module "js-yaml" {
  export function load(input: string): unknown;
  const jsYaml: { load(input: string): unknown };
  export default jsYaml;
}
