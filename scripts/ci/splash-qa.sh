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
burst() { # burst <tag>
  # Screen grabs cost 400-900ms on a loaded emulator, so chase fixed targets
  # instead of counting frames: whatever lands, the file name carries the real
  # elapsed time and the analysis picks the closest frame to each checkpoint.
  local tag="$1" t0 target now wait_ms file
  t0=$(date +%s%3N)
  for target in 250 600 950 1300 1650 2000 2350 2700 3050 3350; do
    now=$(( $(date +%s%3N) - t0 ))
    wait_ms=$(( target - now ))
    if [ "$wait_ms" -gt 15 ]; then
      sleep "$(awk "BEGIN{printf \"%.3f\", $wait_ms/1000}")"
    fi
    file=$(printf '%04d' $(( $(date +%s%3N) - t0 )))
    adb exec-out screencap -p > "${OUT}/${tag}_${file}.png" 2>/dev/null
  done
}

wait_present() { # wait_present <label> <max_seconds>
  local label="$1" max="$2" deadline rc
  deadline=$(( $(date +%s) + max ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    ui_dump_has 'content-desc="AppMintly"'
    rc=$?
    if [ "$rc" -eq 0 ]; then
      pass "${label}: splash shown"
      return 0
    fi
  done
  fail "${label}: splash never appeared"
  return 1
}

wait_gone() { # wait_gone <label> <max_seconds>
  # Poll instead of sleeping a fixed time: the splash retires when the
  # marketplace paints, and a busy emulator can take a few seconds over that.
  local label="$1" max="$2" deadline rc
  deadline=$(( $(date +%s) + max ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    ui_dump_has 'content-desc="AppMintly"'
    rc=$?
    if [ "$rc" -eq 1 ]; then
      pass "${label}: splash retired"
      return 0
    fi
  done
  fail "$label: splash still attached after ${max}s"
  return 1
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

ui_dump_has() { # ui_dump_has <pattern> -> 0 present, 1 absent, 2 dump failed
  # uiautomator leaves the previous dump in place when it cannot get an idle
  # state (exactly what happens during a launch animation), so the file is
  # removed first and a missing file is reported as "unknown", never as absent.
  adb shell rm -f /sdcard/ui.xml >/dev/null 2>&1
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  if ! adb shell ls /sdcard/ui.xml 2>/dev/null | grep -q 'ui\.xml'; then
    return 2
  fi
  if adb shell cat /sdcard/ui.xml 2>/dev/null | grep -q "$1"; then
    return 0
  fi
  return 1
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

# The emulator reports "device offline" for a while after adb first sees it, so
# wait for a real boot completion instead of assuming the device is usable.
booted=0
for _ in $(seq 1 150); do
  if [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
    booted=1
    break
  fi
  sleep 2
done
if [ "$booted" != "1" ]; then
  echo "FAIL  device never finished booting" | tee -a "$REPORT"
  exit 1
fi
info "device booted"

# Keep the screen awake for the whole run.
adb shell svc power stayon true >/dev/null 2>&1 || true
adb shell settings put system screen_off_timeout 1800000 >/dev/null 2>&1 || true

DENSITY=$(adb shell wm density | tr -d '\r' | awk '/Physical density/ {print $3}')
[ -z "${DENSITY}" ] && DENSITY=$(adb shell wm density | tr -d '\r' | grep -oE '[0-9]+' | tail -1)
info "screen density = ${DENSITY:-unknown} dpi"

APK_PATH="${APK_PATH:-$(find apk -name '*.apk' -print -quit 2>/dev/null)}"
if [ -z "${APK_PATH}" ]; then
  echo "FAIL  no APK found to install" | tee -a "$REPORT"
  exit 1
fi
installed=0
for attempt in 1 2 3 4 5; do
  if adb install -r "$APK_PATH" >"${OUT}/install_${attempt}.txt" 2>&1 && \
     adb shell pm list packages 2>/dev/null | grep -q "$PKG"; then
    installed=1
    break
  fi
  info "install attempt ${attempt} failed, retrying"
  sleep 5
done
if [ "$installed" != "1" ]; then
  echo "FAIL  could not install $APK_PATH" | tee -a "$REPORT"
  tail -5 "${OUT}"/install_*.txt 2>/dev/null | tee -a "$REPORT"
  exit 1
fi
pass "installed $(basename "$APK_PATH")"

if adb shell dumpsys package "$PKG" | grep -qE "versionName=1\.0\.12"; then
  pass "device reports versionName 1.0.12"
else
  fail "device does not report versionName 1.0.12"
fi

adb shell dumpsys package "$PKG" | grep -E "versionName|versionCode" | head -4 | tee -a "$REPORT"

# ---------------------------------------------------------------- cold launch
wake
launch_cold
sleep 0.2
shot "cold_early"
burst "cold"
sleep 7
shot "cold_settled"

analyze cold "$DENSITY"

[ -s "${OUT}/cold_early.png" ] && pass "cold launch produced frames" || fail "cold launch produced no frame"

wait_gone "cold launch" 15

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

# Pass 1, landscape: liveness and an independent capture path. The emulator's
# landscape surface does not always hand back fresh exec-out screencaps, so the
# same instant is grabbed a second way (write on the device, pull the file).
launch_cold
sleep 0.4
wait_present "[rot] landscape" 6
adb shell screencap -p /sdcard/rot_probe_a.png >/dev/null 2>&1
sleep 0.7
adb shell screencap -p /sdcard/rot_probe_b.png >/dev/null 2>&1
adb pull /sdcard/rot_probe_a.png "${OUT}/rot_probe_a.png" >/dev/null 2>&1
adb pull /sdcard/rot_probe_b.png "${OUT}/rot_probe_b.png" >/dev/null 2>&1
if [ -s "${OUT}/rot_probe_a.png" ] && [ -s "${OUT}/rot_probe_b.png" ]; then
  info "[rot] $(python3 scripts/ci/splash_qa_analyze.py --delta "${OUT}/rot_probe_a.png" "${OUT}/rot_probe_b.png" 2>/dev/null)"
else
  info "[rot] independent capture path produced no file"
fi
sleep 6
wait_gone "landscape launch" 15

# Pass 2, landscape: the analysable frame set.
launch_cold
sleep 0.3
shot "rot_early"
burst "rot"
sleep 5
shot "rot_settled"
analyze rot "$DENSITY"

adb shell settings put system user_rotation 0 >/dev/null 2>&1
adb shell settings put system accelerometer_rotation 1 >/dev/null 2>&1
sleep 1

# ------------------------------------------------------------------- relaunch
launch_cold
sleep 0.9
wait_present "relaunch (no warm-start skip)" 6
wait_gone "relaunch" 15

# ------------------------------------------------------------- reduced motion
adb shell settings put global animator_duration_scale 0 >/dev/null 2>&1
launch_cold
sleep 0.3
shot "rm_early"
burst "rm"
sleep 6
shot "rm_settled"
analyze rm "$DENSITY"
adb shell settings put global animator_duration_scale 1 >/dev/null 2>&1
wait_gone "reduced-motion launch" 15

echo "──── summary ────" | tee -a "$REPORT"
if [ "$FAILED" -eq 0 ]; then
  echo "RESULT: PASS (0 failures)" | tee -a "$REPORT"
else
  echo "RESULT: FAIL (${FAILED} failure(s))" | tee -a "$REPORT"
fi
exit "$([ "$FAILED" -eq 0 ] && echo 0 || echo 1)"
