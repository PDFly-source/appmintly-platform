/**
 * Launcher-icon gate (CineFlow v0.2.1).
 *
 * Guards the two things that produced the shipped "generic C" icon:
 *  1. the release pipeline silently accepting a placeholder letter tile, and
 *  2. the wrapper manifest losing its icon/roundIcon references or the
 *     adaptive-icon resources going missing from the template.
 *
 * Static + pure-function checks only: this runs without the Android SDK.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { iconFallbackRefusal } from '../lib/apk-builder';

const root = process.cwd();
const builder = readFileSync(join(root, 'lib/apk-builder.ts'), 'utf8');
let checks = 0;
const ok = (label: string) => {
  checks += 1;
  console.log('ok    ' + label);
};

// Advisory manifest references
assert.match(builder, /android:icon="@mipmap\/ic_launcher"/, 'manifest must reference @mipmap/ic_launcher');
assert.match(builder, /android:roundIcon="@mipmap\/ic_launcher_round"/, 'manifest must reference roundIcon');
ok('manifest declares icon and roundIcon');

// All five densities plus anydpi adaptive resources are generated
for (const dir of ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi', 'mipmap-anydpi-v26']) {
  assert.ok(builder.includes(dir), `pipeline must generate ${dir}`);
}
ok('all mipmap densities and the adaptive-icon dir are generated');

// The icon decode path must still exist for png/jpg/webp/ico
for (const ext of ["ext = 'png'", "ext = 'ico'", "ext = 'jpg'", "ext = 'webp'"]) {
  assert.ok(builder.includes(ext), 'icon format sniffing must cover ' + ext);
}
ok('icon format sniffing intact');

// Fail-closed policy

assert.equal(iconFallbackRefusal({ packageId: 'com.appforge.cineflow', signingMode: 'release', hasIcon: true }), null);
assert.match(
  String(iconFallbackRefusal({ packageId: 'com.appforge.cineflow', signingMode: 'release', hasIcon: false })),
  /release build/i,
  'a release build without an icon must be refused'
);
assert.match(
  String(iconFallbackRefusal({ packageId: 'com.appmintly.appmintly', signingMode: 'debug', hasIcon: false })),
  /marketplace app/i,
  'the marketplace package must always refuse the placeholder'
);
assert.equal(
  iconFallbackRefusal({ packageId: 'com.appmintly.demo', signingMode: 'debug', hasIcon: false }),
  null,
  'debug builds keep the letter-tile fallback'
);
ok('icon fail-closed policy: release refused, marketplace always refused, debug allowed');

// Brand assets the marketplace serves must exist on disk
for (const asset of ['public/brand/cineflow-icon-384.png']) {
  assert.ok(existsSync(join(root, asset)), 'missing brand asset ' + asset);
}
ok('CineFlow brand icon asset present for the catalog');

console.log(`\n[apk-icons] ${checks}/5 checks passed`);
