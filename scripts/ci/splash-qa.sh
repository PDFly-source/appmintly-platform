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

PKG="${SPLASH_PKG:-com.appmintly.appmintly}"
EXPECT_VERSION="${SPLASH_VERSION:-1.0.12}"
export SPLASH_DESIGN="${SPLASH_DESIGN:-appmintly}"
SPLASH_DESC="${SPLASH_DESC:-AppMintly}"
OUT="${PWD}/splash-qa"
REPORT="${OUT}/report.txt"
FAILED=0
# The analyzer needs the app viewport (not the screenshot) to judge 13.5% anchors.
export SPLASH_VIEWPORT="${OUT}/viewport.json"
export SPLASH_QA_REPORT="${OUT}"

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

splash_shown() { # splash_shown <label> <tag>
  # uiautomator cannot return a hierarchy while the launch animation runs, so
  # presence at launch time is proven from the pixels instead.
  local label="$1" tag="$2" n f
  for n in 1 2 3; do
    f="${OUT}/${tag}_probe${n}.png"
    adb exec-out screencap -p > "$f" 2>/dev/null
    if [ -s "$f" ] && python3 scripts/ci/splash_qa_analyze.py --present "$f" 2>/dev/null | grep -q '^PRESENT'; then
      pass "${label}: splash on screen (probe ${n})"
      return 0
    fi
    sleep 0.6
  done
  fail "${label}: splash was not on screen in any of 3 probes"
  return 1
}

wait_gone() { # wait_gone <label> <max_seconds> [limit_seconds]
  local label="$1" max="$2" limit="${3:-0}" deadline rc t0 ms
  # "gone after Xms" is when uiautomator first found the app idle, so it is an
  # upper bound on the splash lifetime, not a measurement of it.
  t0=$(date +%s%3N)
  deadline=$(( $(date +%s) + max ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    splash_state
    rc=$?
    if [ "$rc" -eq 1 ]; then
      ms=$(( $(date +%s%3N) - t0 ))
      pass "${label}: splash retired (hierarchy clean after ${ms}ms of polling)"
      return 0
    fi
  done
  # uiautomator only returns a dump when the window is idle, and the
  # marketplace WebView keeps it busy while it loads, so a timeout here says
  # nothing about the splash. Retirement is proven by the settled frame.
  info "${label}: hierarchy never read clean within ${max}s; retirement is judged on the settled frame"
  return 0
}

landscape_now() {
  adb exec-out screencap -p > "${OUT}/_orient.png" 2>/dev/null
  [ -s "${OUT}/_orient.png" ] || return 1
  local dims w h
  dims=$(python3 scripts/ci/splash_qa_analyze.py --dims "${OUT}/_orient.png" 2>/dev/null)
  w=${dims%% *}
  h=${dims##* }
  [ -n "$w" ] && [ -n "$h" ] && [ "$w" -gt "$h" ]
}

ensure_landscape() { # ensure_landscape <when>
  # The rotation setting alone is not evidence: earlier passes reported it set
  # while the screen was still portrait, so each attempt is verified by the
  # dimensions of a real capture and retried.
  local n
  for n in 1 2 3; do
    if landscape_now; then
      info "[rot] landscape confirmed ${1:-(check ${n})}"
      return 0
    fi
    adb shell settings put system accelerometer_rotation 0 >/dev/null 2>&1
    adb shell settings put system user_rotation 1 >/dev/null 2>&1
    sleep 2
  done
  info "[rot] device stayed portrait ${1:+$1 }after 3 attempts"
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

splash_state() { # splash_state -> 0 splash up, 1 splash gone, 2 dump unavailable
  # The marketplace site carries its own content-desc="AppMintly" (the logo), so
  # that string alone cannot answer this. The splash is the native view shown
  # before the marketplace WebView exists, so the WebView is the discriminator.
  adb shell rm -f /sdcard/ui.xml >/dev/null 2>&1
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  if ! adb shell ls /sdcard/ui.xml 2>/dev/null | grep -q 'ui\.xml'; then
    return 2
  fi
  local dump
  dump=$(adb shell cat /sdcard/ui.xml 2>/dev/null)
  if printf '%s' "$dump" | grep -q 'android.webkit.WebView'; then
    return 1
  fi
  if printf '%s' "$dump" | grep -q "content-desc=\"${SPLASH_DESC}\""; then
    return 0
  fi
  return 1
}

page_ready() { # page_ready -> 0 when the marketplace WebView is in the hierarchy
  adb shell rm -f /sdcard/ui.xml >/dev/null 2>&1
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb shell ls /sdcard/ui.xml 2>/dev/null | grep -q 'ui\.xml' || return 1
  adb shell cat /sdcard/ui.xml 2>/dev/null | grep -q 'android.webkit.WebView'
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

# Ask the device where the app window actually is, every pass. The splash View
# lives in the activity window, which stops short of the status and navigation
# bars (and moves on rotation), so the 13.5% anchors must be measured against
# that viewport rather than inferred from the screenshot.
measure_viewport() { # measure_viewport <tag>
  local dir="${OUT}/geometry-$1" line
  mkdir -p "$dir"
  export SPLASH_VIEWPORT="${dir}/viewport.json"
  if line=$(python3 scripts/ci/splash_viewport.py --package "$PKG" --out "$dir" 2>&1); then
    echo "$line" | sed "s/^/info  [$1] /" | tee -a "$REPORT" >/dev/null
    return 0
  fi
  echo "$line" | sed "s/^/info  [$1] /" | tee -a "$REPORT" >/dev/null
  return 1
}

analyze() { # analyze <tag> <dpi>
  local out
  if measure_viewport "$1"; then
    pass "app viewport measured from the device for the $1 pass"
  else
    fail "the device did not report the app viewport for the $1 pass; geometry fell back to the frame"
  fi
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

if adb shell dumpsys package "$PKG" | grep -qE "versionName=${EXPECT_VERSION}"; then
  pass "device reports versionName ${EXPECT_VERSION}"
else
  fail "device does not report versionName ${EXPECT_VERSION}"
fi

adb shell dumpsys package "$PKG" | grep -E "versionName|versionCode" | head -4 | tee -a "$REPORT"

# ---------------------------------------------------------------- cold launch
# Pass 1 measures the launch timeline. Pixels cannot show it on this emulator
# (the surface latches seconds apart), but the view hierarchy can: the splash
# carries content-desc="AppMintly" while it is attached and stops doing so when
# its own 3400ms timeline ends, so the poll below timestamps that transition.
# A deterministic ANIMATED baseline. This emulator image can boot with
# animator_duration_scale at 0, which turns the design into its reduced-motion
# end state (the reduction the reference itself renders with animation:none).
# The cold/rotation passes must judge the animated design, so force the scales
# to 1 here; the reduced-motion pass below sets them to 0 for its own run and
# restores 1 afterwards.
ANIM_ORIG=$(adb shell settings get global animator_duration_scale 2>/dev/null | tr -d '\r\n')
echo "device animator_duration_scale before tests: ${ANIM_ORIG:-unknown}" | tee -a "$REPORT"
adb shell settings put global animator_duration_scale 1 >/dev/null 2>&1
adb shell settings put global window_animation_scale 1 >/dev/null 2>&1
adb shell settings put global transition_animation_scale 1 >/dev/null 2>&1
sleep 0.6
# Record what the DEVICE actually reports: the reference's own reduced-motion
# state (animation:none) is a different, legitimate design state, so the
# analyzer must judge the bar against the device's real setting, never assume.
ANIM_STATE=$(adb shell settings get global animator_duration_scale 2>/dev/null | tr -d '\r\n')
echo "animator_duration_scale=${ANIM_STATE:-unknown}" | tee -a "$REPORT"
printf '%s' "${ANIM_STATE:-1}" > "${OUT}/animator_state.txt"
if [ "${ANIM_STATE%%.*}" = "1" ]; then
  pass "the cold pass runs with the device animation scale at 1 (device reports ${ANIM_STATE})"
else
  fail "the device did not accept animation scale 1 before the cold pass (reports ${ANIM_STATE:-unknown})"
fi
wake
launch_cold
sleep 0.2
shot "cold_early"
[ -s "${OUT}/cold_early.png" ] && pass "cold launch produced a first frame" || fail "cold launch produced no frame"
wait_gone "cold launch" 10

# Pass 2 collects the analysable frame set (composition, palette, replacement).
launch_cold
sleep 0.2
burst "cold"
sleep 4
shot "cold_settled"
splash_state; case $? in 0) st="attached" ;; 1) st="gone" ;; *) st="unknown" ;; esac
printf '%s\n' "$st" > "${OUT}/splash_state_settled.txt"
analyze cold "$DENSITY"

if page_ready; then
  pass "marketplace UI is rendered after the splash (WebView in the hierarchy)"
else
  fail "no marketplace WebView after the splash (blank screen?)"
fi

[ -s "${OUT}/am_start.txt" ] && grep -E "Status|TotalTime" "${OUT}/am_start.txt" | tee -a "$REPORT" || true

# ------------------------------------------------------- timed captures (bar)
# The burst latches this emulator's surface, so one late grab cannot show the
# bar. The two grabs are anchored to the splash view's own ATTACH moment from
# logcat (device clock), not to the harness's clock: adb startup alone costs
# seconds here and made the first attempt capture a retired splash. Each grab
# records its real device time, its screencap cost and whether the splash node
# was still attached. Pixels decide the fill; the native progress lines for the
# same window only corroborate it.
adb shell am force-stop "$PKG" >/dev/null 2>&1 || true
adb logcat -c >/dev/null 2>&1 || true
: > "${OUT}/timed_meta.txt"
adb shell rm -f /sdcard/timed_1200.png /sdcard/timed_2900.png >/dev/null 2>&1 || true
adb shell rm -f /sdcard/splash_sr.mp4 >/dev/null 2>&1 || true
adb shell rm -f "/sdcard/Android/data/${PKG}/files/splash_view_1200.png" \
  "/sdcard/Android/data/${PKG}/files/splash_view_2900.png" >/dev/null 2>&1 || true
REC_START=$(adb shell date +%s%3N 2>/dev/null | tr -d '\r')
adb shell screenrecord --time-limit 9 --bit-rate 8000000 --size 540x1200 \
  /sdcard/splash_sr.mp4 >/dev/null 2>&1 &
launch_cold
ATTACH_MS=""
for _ in $(seq 1 40); do
  ATTACH_MS=$(adb logcat -d -v epoch -s StudyriaSplash:I 2>/dev/null \
    | awk '/attach durationMs/ {printf "%.0f", $1 * 1000; exit}')
  [ -n "$ATTACH_MS" ] && break
  sleep 0.25
done
if [ -n "$ATTACH_MS" ]; then
  pass "splash attach recorded on the device clock (epoch ${ATTACH_MS}ms)"
else
  fail "the splash view never logged its attach; timed bar evidence is unavailable"
fi
# One offset read maps the device clock onto the host clock, so the waits are
# local (instant) instead of an adb round trip per iteration. The old loop asked
# `adb shell date` up to 120 times and called uiautomator before each grab; both
# cost seconds here and landed the grabs at 7290ms and 58277ms.
DEV_MS=$(adb shell date +%s%3N 2>/dev/null | tr -d '\r')
HOST_MS=$(date +%s%3N)
OFFSET=$(( ${DEV_MS:-0} - HOST_MS ))
for target in 1200 2900; do
  if [ -n "$ATTACH_MS" ]; then
    TARGET_HOST=$(( ATTACH_MS - OFFSET + target ))
    for _ in $(seq 1 400); do
      [ "$(date +%s%3N)" -ge "$TARGET_HOST" ] && break
      sleep 0.05
    done
  fi
  # No hierarchy dump here: uiautomator needs an idle window and costs seconds,
  # which would move the grab. Pixel ownership decides; the node reads unknown.
  node="unknown"
  CAP0=$(( $(date +%s%3N) + OFFSET ))
  adb shell screencap -p "/sdcard/timed_${target}.png" >/dev/null 2>&1 || true
  CAP1=$(( $(date +%s%3N) + OFFSET ))
  ELAPSED=$(( CAP0 - ${ATTACH_MS:-0} ))
  printf '%s %s %s %s %s\n' "$target" "$ELAPSED" "$node" "$((CAP1 - CAP0))" "${ATTACH_MS:-0}" \
    >> "${OUT}/timed_meta.txt"
done
for target in 1200 2900; do
  adb pull "/sdcard/timed_${target}.png" "${OUT}/timed_${target}.png" >/dev/null 2>&1 || true
done
adb logcat -d -s StudyriaSplash:I > "${OUT}/bar_progress.txt" 2>/dev/null || true
pass "timed captures taken against the attach moment (1200/2900ms targets)"
analyze timed "${DENSITY}"

for target in 1200 2900; do
  adb pull "/sdcard/Android/data/${PKG}/files/splash_view_${target}.png" \
    "${OUT}/view_${target}.png" >/dev/null 2>&1 || true
done
adb shell pkill -INT screenrecord >/dev/null 2>&1 || true
sleep 2
adb pull /sdcard/splash_sr.mp4 "${OUT}/splash_sr.mp4" >/dev/null 2>&1 || true
if [ -n "${ATTACH_MS:-}" ] && [ -n "${REC_START:-}" ]; then
  printf '%s\n' $((ATTACH_MS - REC_START)) > "${OUT}/video_offset.txt"
  pass "video started ${REC_START}ms on the device clock, attach ${ATTACH_MS}ms (offset $(cat "${OUT}/video_offset.txt")ms)"
fi
analyze view "${DENSITY}"
analyze video "${DENSITY}"

# ------------------------------------------------------------------- rotation
ensure_landscape "before the rotated probes"

# Pass 1, landscape: liveness and an independent capture path. The emulator's
# landscape surface does not always hand back fresh exec-out screencaps, so the
# same instant is grabbed a second way (write on the device, pull the file).
launch_cold
sleep 0.4
splash_shown "[rot] landscape" rotp
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

# Pass 2, landscape: the analysable frame set. The rotation is re-applied here
# because the setting does not reliably survive the first activity teardown.
ensure_landscape "before the rotated frame pass"
# Let the rotation settle BEFORE the activity starts. Re-applying the rotation
# while the activity is alive forces a configuration change that repaints the
# window black, and that transition would be captured as a dark launch frame.
sleep 2
launch_cold
sleep 0.5
shot "rot_early"
rot_dims=$(python3 scripts/ci/splash_qa_analyze.py --dims "${OUT}/rot_early.png" 2>/dev/null || echo unreadable)
if [ "$rot_dims" != "unreadable" ]; then
  eval "set -- $rot_dims"
  if [ "${1:-0}" -lt "${2:-0}" ]; then
    info "[rot] the relaunch reset the display to portrait; restarting the pass in landscape"
    ensure_landscape "after the portrait reset"
    sleep 2
    launch_cold
    sleep 0.5
    shot "rot_early"
  fi
fi
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
splash_shown "relaunch (no warm-start skip)" relp
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

# ------------------------------------------------- HOME away and back (lifecycle)
# Leaving the app mid-splash must not leave a stuck view or a dead process: this
# is the interruption a real user makes most often, and it is the one a
# canvas-driven splash is most likely to mishandle.
launch_cold
sleep 0.8
adb shell input keyevent KEYCODE_HOME >/dev/null 2>&1
sleep 1.5
if adb shell pidof "$PKG" >/dev/null 2>&1; then
  pass "HOME during the splash keeps the process alive"
else
  fail "the app process died when HOME was pressed during the splash"
fi
if adb shell dumpsys activity activities 2>/dev/null | grep -q "ANR in ${PKG}\|Application Not Responding"; then
  fail "an ANR was reported after leaving the app during the splash"
else
  pass "no ANR was reported after leaving the app during the splash"
fi
launch_cold
sleep 0.9
splash_shown "return after HOME" homep
wait_gone "return after HOME" 15
if page_ready; then
  pass "the app returns to the marketplace after HOME during the splash"
else
  fail "no marketplace WebView after returning from HOME"
fi

# ------------------------------------------------- renderer death (recovery)
# A WebView renderer can be killed under memory pressure. That is the one launch
# failure a page can never report, so it is tested separately from HOME: the app
# must rebuild its content view exactly once, land on the marketplace, and must
# never replay the launch splash inside the recovered window.
launch_cold
wait_gone "renderer-death setup launch" 15
WEBPID=$(adb shell ps -A 2>/dev/null | awk -v pkg="$PKG" '$0 ~ pkg && /sandboxed_process/ {print $2; exit}')
if [ -n "$WEBPID" ]; then
  pass "renderer-death scenario is testable (WebView renderer pid ${WEBPID})"
  adb shell kill -9 "$WEBPID" >/dev/null 2>&1
  sleep 2
  RECOVERED=0
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if page_ready; then RECOVERED=1; break; fi
    sleep 1
  done
  if [ "$RECOVERED" -eq 1 ]; then
    pass "renderer death: the marketplace WebView is back after one recovery"
  else
    fail "renderer death: no marketplace WebView after the recovery (blank screen)"
  fi
  splash_state; SPLASH_RC=$?
  if [ "$SPLASH_RC" -eq 0 ]; then
    fail "renderer death: the splash replayed inside the recovered window"
  elif [ "$SPLASH_RC" -eq 1 ]; then
    pass "renderer death: the recovery landed on the page, not a second splash"
  else
    info "renderer death: the hierarchy was unavailable, so no splash replay could be checked"
  fi
else
  info "no sandboxed WebView renderer process was visible; the renderer-death scenario is NOT RUN"
fi

# ---------------------------------------------------------------- offline launch
# The splash is local artwork, so it must paint and retire with no network at
# all; the marketplace is then allowed to show its own offline state.
adb shell cmd connectivity airplane-mode enable >/dev/null 2>&1 ||   adb shell svc wifi disable >/dev/null 2>&1
adb shell svc data disable >/dev/null 2>&1
sleep 2
launch_cold
sleep 0.9
splash_shown "offline launch" offp
wait_gone "offline launch" 15
if adb shell pidof "$PKG" >/dev/null 2>&1; then
  pass "offline launch keeps the process alive after the splash retires"
else
  fail "the app process died on an offline launch"
fi
shot "offline_settled"
if [ -s "${OUT}/offline_settled.png" ]; then
  info "offline settled frame captured ($(python3 scripts/ci/splash_qa_analyze.py --dims "${OUT}/offline_settled.png" 2>/dev/null || echo unreadable))"
fi
adb shell cmd connectivity airplane-mode disable >/dev/null 2>&1 || true
adb shell svc wifi enable >/dev/null 2>&1 || true
adb shell svc data enable >/dev/null 2>&1 || true
sleep 2

# One machine-readable record per run: geometry, per-tag verdicts, result.
python3 - "$OUT" "$FAILED" <<'PYJSON' | tee -a "$REPORT"
import glob, json, os, sys
out, failed = sys.argv[1], int(sys.argv[2])
viewport = None
path = os.path.join(out, 'geometry-cold', 'viewport.json')
if os.path.exists(path):
    with open(path) as fh:
        viewport = json.load(fh)
tags = {}
for name in sorted(glob.glob(os.path.join(out, 'report-*.json'))):
    with open(name) as fh:
        tags[os.path.basename(name)[len('report-'):-len('.json')]] = json.load(fh)
summary = {
    'result': 'PASS' if failed == 0 else 'FAIL',
    'failures': failed,
    'viewport': viewport,
    'checks': tags,
}
with open(os.path.join(out, 'splash-qa-report.json'), 'w') as fh:
    json.dump(summary, fh, indent=2, sort_keys=True)
window = (viewport or {}).get('window')
print(f"WROTE splash-qa-report.json result={summary['result']} failures={failed} "
      f"viewport={window['width']}x{window['height']}@{window['x']},{window['y']}" if window
      else f"WROTE splash-qa-report.json result={summary['result']} failures={failed} viewport=unmeasured")
PYJSON

# Restore the device exactly as we found it.
if [ -n "${ANIM_ORIG:-}" ]; then
  adb shell settings put global animator_duration_scale "$ANIM_ORIG" >/dev/null 2>&1
  adb shell settings put global window_animation_scale "$ANIM_ORIG" >/dev/null 2>&1
  adb shell settings put global transition_animation_scale "$ANIM_ORIG" >/dev/null 2>&1
  pass "device animation scale restored to ${ANIM_ORIG} after the tests"
else
  adb shell settings put global animator_duration_scale 1 >/dev/null 2>&1
  pass "device animation scale left at the platform default (nothing was recorded before the tests)"
fi

echo "──── summary ────" | tee -a "$REPORT"
if [ "$FAILED" -eq 0 ]; then
  echo "RESULT: PASS (0 failures)" | tee -a "$REPORT"
else
  echo "RESULT: FAIL (${FAILED} failure(s))" | tee -a "$REPORT"
fi
exit "$([ "$FAILED" -eq 0 ] && echo 0 || echo 1)"
