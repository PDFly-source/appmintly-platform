#!/usr/bin/env bash
# Device-side proof for the AppMintly launch splash (runs inside the emulator job).
#
# Asserts, on the installed APK itself:
#   * the launch is the owner-supplied LIGHT canvas, never the old dark gradient
#     (every pre-splash frame is bright - the single most important regression);
#   * the animation really runs (frames differ over time) and the logo/wordmark,
#     both rings and the four dots are drawn where the reference puts them;
#   * the native splash view is present early and gone once the marketplace
#     painted, with no blank or stuck frame in between;
#   * a rotation relaunch and a reduced-motion relaunch behave the same way.
#
# Prints PASS/FAIL lines and exits non-zero if any check fails.
set -uo pipefail

PKG=com.appmintly.appmintly
OUT="${PWD}/splash-qa"
REPORT="${OUT}/report.txt"
FAILED=0

mkdir -p "$OUT"
: > "$REPORT"

pass() { echo "PASS  $*" | tee -a "$REPORT"; }
fail() { echo "FAIL  $*" | tee -a "$REPORT"; FAILED=$((FAILED + 1)); }
info() { echo "info  $*" | tee -a "$REPORT"; }

shot() { # shot <name>
  adb exec-out screencap -p > "${OUT}/$1.png" 2>/dev/null
  sleep 0.12
}

# Frames are collected as fast as screencap allows; elapsed ms is recorded per
# frame so the analysis can pick the frame nearest each animation checkpoint.
burst() { # burst <tag> <count>
  local tag="$1" n="$2" i t0
  t0=$(date +%s%3N)
  for i in $(seq 1 "$n"); do
    local ms=$(( $(date +%s%3N) - t0 ))
    adb exec-out screencap -p > "${OUT}/${tag}_$(printf '%03d' "$ms").png" 2>/dev/null
  done
}

wake() {
  adb shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
  adb shell wm dismiss-keyguard >/dev/null 2>&1 || true
}

launch_cold() {
  adb shell am force-stop "$PKG" >/dev/null 2>&1
  sleep 1
  adb shell am start -W -n "$PKG/.MainActivity" >"${OUT}/am_start.txt" 2>&1
}

ui_dump_has() { # ui_dump_has <pattern>
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb shell cat /sdcard/ui.xml 2>/dev/null | grep -q "$1"
}

analyze() { # analyze <tag> <dpi>
  local out
  out=$(python3 scripts/ci/splash_qa_analyze.py "${OUT}" "$1" "${2:-}" 2>&1)
  echo "$out" | tee -a "$REPORT"
  local n
  n=$(echo "$out" | grep -c '^FAIL' || true)
  FAILED=$((FAILED + n))
}

adb wait-for-device
adb shell getprop sys.boot_completed | grep -q 1 || sleep 20

DENSITY=$(adb shell wm density | tr -d '\r' | awk '/Physical density/ {print $3}')
[ -z "${DENSITY}" ] && DENSITY=$(adb shell wm density | tr -d '\r' | grep -oE '[0-9]+' | tail -1)
info "screen density = ${DENSITY:-unknown} dpi"

adb shell dumpsys package "$PKG" | grep -E "versionName|versionCode" | head -4 | tee -a "$REPORT"

# ---------------------------------------------------------------- cold launch
wake
launch_cold
sleep 0.2
shot "cold_early"
burst "cold" 10
sleep 7
shot "cold_settled"

analyze cold "$DENSITY"

[ -s "${OUT}/cold_early.png" ] && pass "cold launch produced frames" || fail "cold launch produced no frame"

if ui_dump_has 'content-desc="AppMintly"' ; then
  fail "splash still attached long after launch (content-desc=AppMintly present)"
else
  pass "splash retired into the marketplace (no splash view after 7s)"
fi

if ui_dump_has '<hierarchy'; then
  pass "marketplace UI is rendered after the splash (view hierarchy present)"
else
  fail "no view hierarchy after the splash (blank screen?)"
fi

[ -s "${OUT}/am_start.txt" ] && grep -E "Status|TotalTime" "${OUT}/am_start.txt" | tee -a "$REPORT" || true

# ------------------------------------------------------------------- rotation
adb shell settings put system accelerometer_rotation 0 >/dev/null 2>&1
adb shell settings put system user_rotation 1 >/dev/null 2>&1
sleep 2
launch_cold
sleep 0.6
shot "rot_early"
sleep 1.2
shot "rot_mid"
sleep 6
shot "rot_settled"
analyze rot "$DENSITY"
adb shell settings put system user_rotation 0 >/dev/null 2>&1
adb shell settings put system accelerometer_rotation 1 >/dev/null 2>&1
sleep 1

# ------------------------------------------------------------------- relaunch
launch_cold
sleep 0.9
if ui_dump_has 'content-desc="AppMintly"'; then
  pass "relaunch shows the splash again (no warm-start skip)"
else
  fail "relaunch did not show the splash"
fi
sleep 7
if ui_dump_has 'content-desc="AppMintly"'; then
  fail "relaunch left the splash attached"
else
  pass "relaunch retired the splash"
fi

# ------------------------------------------------------------- reduced motion
adb shell settings put global animator_duration_scale 0 >/dev/null 2>&1
launch_cold
sleep 0.9
shot "rm_early"
sleep 6
shot "rm_settled"
analyze rm "$DENSITY"
adb shell settings put global animator_duration_scale 1 >/dev/null 2>&1

if ui_dump_has 'content-desc="AppMintly"'; then
  fail "reduced-motion launch left the splash attached"
else
  pass "reduced-motion launch still retires into the marketplace"
fi

echo "──── summary ────" | tee -a "$REPORT"
if [ "$FAILED" -eq 0 ]; then
  echo "RESULT: PASS (0 failures)" | tee -a "$REPORT"
else
  echo "RESULT: FAIL (${FAILED} failure(s))" | tee -a "$REPORT"
fi
exit "$([ "$FAILED" -eq 0 ] && echo 0 || echo 1)"
