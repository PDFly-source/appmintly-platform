#!/usr/bin/env python3
"""Self-tests for the CineFlow device-QA profile and its viewport geometry.

The strips are pinned to 13.5% of the `.sp` layer, and the reference's
`inset:0` makes that layer the app viewport. On a device the app window leaves
out the status and navigation bars, so the profile must judge 13.5% of the
measured window, not of the screenshot. These tests pin both directions:

  * a faithful frame on a full-screen window still passes (no regression for
    apps whose window covers the screen);
  * a faithful frame on an inset window passes when the device viewport is
    recorded, and fails when it is withheld - so the correction can never turn
    into "accept whatever is on screen";
  * status-bar-only, navigation-bar-only and no-inset configurations are all
    covered, plus the old 66px anchor, a missing stripe band, the legacy dark
    surface and artwork that bleeds into the loader strip.

Run: python3 scripts/ci/test_splash_qa_cineflow.py
"""
import json
import os
import struct
import subprocess
import sys
import tempfile
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ANALYZER = os.path.join(HERE, 'splash_qa_analyze.py')
VIEWPORT = os.path.join(HERE, 'splash_viewport.py')
W, H = 412, 915
C1, C2 = (245, 247, 255), (237, 232, 255)
BAND, STRIPE = (20, 26, 74), (238, 240, 255)
failures = []


def expect(condition, label):
    if condition:
        print(f"ok   {label}")
    else:
        print(f"FAIL {label}")
        failures.append(label)


# ------------------------------------------------------------------ frame paint
def write_png(path, pixel, w=W, h=H):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw.extend(pixel(x, y))
    def chunk(kind, body):
        return (struct.pack('>I', len(body)) + kind + body
                + struct.pack('>I', zlib.crc32(kind + body) & 0xFFFFFFFF))
    data = (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(raw), 6))
            + chunk(b'IEND', b''))
    with open(path, 'wb') as fh:
        fh.write(data)


def splash_frame(viewport, basis='viewport', anchor=0.135, stripes=True, art_shift=0.0,
                 mark_offset=(0.0, 0.0)):
    """Paint the reference composition for one app viewport."""
    vx, vy, vw, vh = viewport
    u = min(vw / 228.0, vh / 488.0)

    def band_edges():
        if basis == 'viewport':
            top = vy + anchor * vh
            bottom = vy + vh - anchor * vh
        else:                                    # the wrong, screenshot-relative read
            top = anchor * H
            bottom = H - anchor * H
        return top, bottom

    top_edge, bot_edge = band_edges()
    band_rects = ((top_edge, top_edge + 26 * u), (bot_edge - 26 * u, bot_edge))
    mark_w, mark_h = 135 * u, 135 * u * 426 / 420.0
    word_w, word_h = 215 * u, 215 * u * 155 / 620.0
    gap = 12 * u
    column = mark_h + gap + word_h
    oy = vy + (vh - 488 * u) / 2.0 + art_shift
    mark_top = oy + max(0.0, ((488 - 44) * u - column) / 2.0)
    word_top = mark_top + mark_h + gap
    # mark_offset reproduces the 0.3.1 defect: the flip drew the mark half its
    # own size right and down of the column, so it clipped at the right edge.
    art = ((vx + vw / 2 - mark_w / 2 + mark_offset[0], mark_top + mark_offset[1],
            mark_w, mark_h),
           (vx + vw / 2 - word_w / 2, word_top, word_w, word_h))

    def pixel(x, y):
        inside = vx <= x < vx + vw and vy <= y < vy + vh
        if not inside:
            return C1
        for (t0, t1) in band_rects:
            if t0 <= y < t1:
                if stripes and (y - t0) % 20 < 8:
                    return STRIPE if (x // 10) % 2 == 0 else BAND
                return BAND
        for i, (bx, by, bw, bh) in enumerate(art):
            if bx <= x < bx + bw and by <= y < by + bh:
                # white artwork with dark strokes: the JPEGs are white-background
                # marks, so the frame stays a light canvas while carrying ink
                bar = 14 if i == 0 else 9
                return (24, 26, 40) if (y - by) % 40 < bar and bx + 8 <= x <= bx + bw - 8 else (252, 252, 253)
        # 160deg gradient: red falls left to right, exactly like the reference
        t = (x - vx) / float(vw)
        return tuple(int(round(C1[c] + (C2[c] - C1[c]) * t)) for c in range(3))

    return pixel


def settled_frame():
    """The live app after the splash retires (dark marketplace surface)."""
    return lambda x, y: (12, 16, 30) if (x * 7 + y * 3) % 11 else (200, 205, 220)


def viewport_document(viewport, insets, screen=(W, H), source='dumpsys-window-mFrame'):
    vx, vy, vw, vh = viewport
    return {
        'screenshot': {'width': screen[0], 'height': screen[1]},
        'window': {'x': vx, 'y': vy, 'width': vw, 'height': vh},
        'insets': insets,
        'density': 420,
        'source': source,
        'insets_state': {},
        'raw': {},
    }


# ------------------------------------------------------------------------ runner
def run(frames, viewport_json=None, tag='cold', dims=(W, H)):
    with tempfile.TemporaryDirectory() as tmp:
        for name, pixel in frames:
            write_png(os.path.join(tmp, f'{tag}_{name}.png'), pixel, w=dims[0], h=dims[1])
        env = dict(os.environ)
        env['SPLASH_DESIGN'] = 'cineflow'
        env['SPLASH_QA_REPORT'] = tmp
        if viewport_json is not None:
            path = os.path.join(tmp, 'viewport.json')
            with open(path, 'w') as fh:
                json.dump(viewport_json, fh)
            env['SPLASH_VIEWPORT'] = path
        else:
            env.pop('SPLASH_VIEWPORT', None)
        out = subprocess.run([sys.executable, ANALYZER, tmp, tag, '420'],
                             capture_output=True, text=True, env=env).stdout
        report = None
        report_path = os.path.join(tmp, f'report-{tag}.json')
        if os.path.exists(report_path):
            with open(report_path) as fh:
                report = json.load(fh)
        return out, report


def launch_pixels(pixel):
    return [(700, pixel), (1500, pixel), (2500, pixel), (3400, pixel), ('settled', settled_frame())]


# ------------------------------------------------------------------------- cases
full = (0, 0, W, H)
status_nav = (0, 129, W, H - 129 - 65)
status_only = (0, 129, W, H - 129)
nav_only = (0, 0, W, H - 65)

print('— window geometry —')
out, report = run(launch_pixels(splash_frame(full)))
expect('PASS  [cold] both film strips sit at 13.5% of the 412x915 app viewport' in out,
       'full-screen window (no insets) is accepted')

out, report = run(launch_pixels(splash_frame(status_nav)),
                  viewport_document(status_nav, {'top': 129, 'right': 0, 'bottom': 65, 'left': 0}))
expect('PASS  [cold] both film strips sit at 13.5% of the 412x721 app viewport' in out,
       'status bar + navigation bar window is accepted')
expect(report is not None and report['viewport'] == {'x': 0, 'y': 129, 'width': W, 'height': H - 194},
       'the JSON report records the content viewport origin and size')
expect(report is not None and report['device']['insets']['top'] == 129
       and report['device']['insets']['bottom'] == 65,
       'the JSON report records the device insets')
expect(report is not None and abs(report['predictions']['top_band_top'] - (129 + 0.135 * 721)) < 0.01,
       'the JSON report records the calculated 13.5% band position (226.34)')
expect(report is not None and report['measured'].get('top_band_top') is not None,
       'the JSON report records where the strips actually landed')
expect(report is not None and report['frame']['width'] == W and report['frame']['height'] == H,
       'the JSON report records the screenshot dimensions')

out, report = run(launch_pixels(splash_frame(status_only)),
                  viewport_document(status_only, {'top': 129, 'right': 0, 'bottom': 0, 'left': 0}))
expect('PASS  [cold] both film strips sit at 13.5% of the 412x786 app viewport' in out,
       'status-bar-only window is accepted')

out, report = run(launch_pixels(splash_frame(nav_only)),
                  viewport_document(nav_only, {'top': 0, 'right': 0, 'bottom': 65, 'left': 0}))
expect('PASS  [cold] both film strips sit at 13.5% of the 412x850 app viewport' in out,
       'navigation-bar-only window is accepted')

print('— the correction cannot blanket-accept —')
out, report = run(launch_pixels(splash_frame(status_nav)))
expect('FAIL  [cold] the 13.5% film strips are missing or misplaced' in out,
       'the same inset frame is rejected when the device viewport is withheld')
expect('no device viewport was recorded' in out,
       'the analyzer says plainly that it fell back to the frame')

out, report = run(launch_pixels(splash_frame(status_nav, basis='frame')),
                  viewport_document(status_nav, {'top': 129, 'right': 0, 'bottom': 65, 'left': 0}))
expect('FAIL  [cold] the 13.5% film strips are missing or misplaced' in out,
       'strips anchored to the screenshot instead of the app viewport are rejected')

out, report = run(launch_pixels(splash_frame(full, anchor=0.085)))
expect('FAIL  [cold] the 13.5% film strips are missing or misplaced' in out,
       'strips anchored at the old fixed 66px position are rejected')

out, report = run(launch_pixels(splash_frame(full, stripes=False)))
expect('FAIL  [cold] the stripe band is missing from a strip' in out,
       'a frame without the light stripe band is rejected')

out, report = run(launch_pixels(lambda x, y: (26, 32, 52)))
expect('FAIL  [cold] a launch frame is a dark surface' in out,
       'the legacy dark launch surface is rejected')

print('— wordmark and loader strip use the same viewport —')
out, report = run(launch_pixels(splash_frame(status_nav, art_shift=20.0)),
                  viewport_document(status_nav, {'top': 129, 'right': 0, 'bottom': 65, 'left': 0}))
expect('PASS  [cold] nothing is drawn in the loader strip' in out,
       'artwork inside the viewport still leaves the loader strip empty')

out, report = run(launch_pixels(splash_frame(status_nav, art_shift=90.0)),
                  viewport_document(status_nav, {'top': 129, 'right': 0, 'bottom': 65, 'left': 0}))
expect('FAIL  [cold] something is drawn in the loader strip' in out,
       'artwork pushed into the loader strip is caught against the same viewport')

print('— artwork placement matches the reference column —')
# A full-size portrait frame with a real 1080x2209 app viewport, so the
# placement and clipping checks are exercised against device-sized artwork.
hrect = (0, 128, 1080, 2209)
hinsets = {'top': 129, 'right': 0, 'bottom': 65, 'left': 0}
out, _report = run(launch_pixels(splash_frame(hrect)),
                   viewport_document(hrect, hinsets, screen=(1080, 2400)), dims=(1080, 2400))
expect('PASS  [cold] the artwork column is centred' in out,
       'a centred reference frame is accepted by the placement check')
expect('PASS  [cold] the whole artwork fits inside the viewport' in out,
       'a fully visible reference frame is accepted by the fit check')

# CineFlow 0.3.1 defect: the Camera flip left the mark at +w/2, +h/2
_u = min(hrect[2] / 228.0, hrect[3] / 488.0)
_mark = (135 * _u, 135 * _u * 426 / 420.0)
out, _report = run(launch_pixels(splash_frame(hrect, mark_offset=(_mark[0] / 2, _mark[1] / 2))),
                   viewport_document(hrect, hinsets, screen=(1080, 2400)), dims=(1080, 2400))
expect('FAIL  [cold] the artwork is clipped' in out,
       'the 0.3.1 half-size offset is rejected as clipped artwork')
expect('FAIL  [cold] the artwork column is not centred' in out,
       'the 0.3.1 half-size offset is rejected as off-centre artwork')

out, _report = run(launch_pixels(splash_frame(hrect, art_shift=140.0)),
                   viewport_document(hrect, hinsets, screen=(1080, 2400)), dims=(1080, 2400))
expect('FAIL  [cold] the artwork column is displaced vertically' in out,
       'a vertically displaced column is rejected')

print('— device geometry from dumpsys window displays —')
import importlib.util
spec = importlib.util.spec_from_file_location('splash_viewport', VIEWPORT)
vpm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vpm)

FIXTURES = os.path.join(HERE, 'fixtures')


def fixture(name):
    if not name:
        return None
    path = os.path.join(FIXTURES, name)
    if not os.path.exists(path):
        return None
    with open(path) as fh:
        return fh.read()


def measure(windows_name, displays_name, screen, package='com.appforge.cineflow'):
    """Derive the content viewport exactly as the device pass does."""
    windows = fixture(windows_name) or ''
    displays = fixture(displays_name) or ''
    frame, block, source = vpm.find_app_window(windows, package)
    if not frame and windows and displays:
        frame = vpm.find_app_bounds(displays)
    if not frame and not windows:
        # synthetic display-only fixtures: an edge-to-edge window covering the screen
        frame, source = (0, 0, screen[0], screen[1]), 'synthetic-edge-to-edge'
    if not frame:
        frame = vpm.find_app_bounds(displays)
        source = 'dumpsys-displays-mAppBounds' if frame else 'fallback-screenshot'
    return vpm.build_document(screen, frame, 420, source, {}, windows,
                              displays_dumpsys=displays, window_block=block)


# ---- portrait and landscape, both taken from a real device
doc = measure('device-portrait-windows.txt', 'device-portrait-displays.txt', (1080, 2400))
expect(doc.get('insets_source') == 'dumpsys-window-displays',
       'portrait: insets come from the display InsetsSource frames')
expect(doc['system_insets'] == {'top': 128, 'right': 0, 'bottom': 63, 'left': 0},
       'portrait: status bar 128 and navigation bar 63 are read from the display dump')
expect(doc['window'] == {'x': 0, 'y': 128, 'width': 1080, 'height': 2209},
       'portrait: content viewport is 1080x2209 at (0,128)')

doc = measure('device-landscape-windows.txt', 'device-landscape-displays.txt', (1080, 2400))
expect(doc.get('display') == {'width': 2400, 'height': 1080},
       'landscape: the display size comes from the window parent rect, not wm size')
expect(doc['system_insets'] == {'top': 63, 'right': 0, 'bottom': 63, 'left': 128},
       'landscape: cutout left 128, status 63 and navigation 63 are all found')
expect(doc['window'] == {'x': 128, 'y': 63, 'width': 2272, 'height': 954},
       'landscape: content viewport is 2272x954 at (128,63)')

# ---- the exact failure mode of run 43234097536: window list without those windows
doc = measure('device-landscape-no-taskbar-windows.txt', 'device-landscape-displays.txt', (1080, 2400))
expect(doc.get('insets_source') == 'dumpsys-window-displays',
       'a window list missing Taskbar and ScreenDecorOverlay still gets display insets')
expect(doc['window'] == {'x': 128, 'y': 63, 'width': 2272, 'height': 954},
       'the missing-window case still resolves to 2272x954 at (128,63)')

# ... and the fallback it replaces would have been wrong, which is why it failed
doc = measure('device-landscape-no-taskbar-windows.txt', None, (1080, 2400))
expect(doc.get('insets_source') in ('dumpsys-window-windows', 'none'),
       'without the display dump the collector falls back to the window list')
expect(doc['window']['height'] == 1017,
       'the window-list fallback alone drops the bottom 63px (the old 1017 defect)')

# ---- synthetic inset configurations
doc = measure(None, 'cutout-right-displays.txt', (2400, 1080))
expect(doc['system_insets'] == {'top': 63, 'right': 128, 'bottom': 48, 'left': 0},
       'right cutout, top status bar and bottom navigation are each attributed to their edge')
expect(doc['window'] == {'x': 0, 'y': 63, 'width': 2272, 'height': 969},
       'a right cutout shortens the content width (2272x969 at 0,63)')

doc = measure(None, 'bottom-in-nav-displays.txt', (1080, 2400))
expect(doc['system_insets'] == {'top': 0, 'right': 0, 'bottom': 135, 'left': 0},
       'a display with only a navigation bar reports only a bottom inset')
expect(doc['window'] == {'x': 0, 'y': 0, 'width': 1080, 'height': 2265},
       'navigation-bar-only display keeps the full height above the bar')

doc = measure(None, 'mixed-insets-displays.txt', (2400, 1080))
expect(doc['system_insets'] == {'top': 60, 'right': 0, 'bottom': 48, 'left': 96},
       'mixed insets combine left cutout, top status bar and bottom navigation')
expect(doc['window'] == {'x': 96, 'y': 60, 'width': 2304, 'height': 972},
       'mixed insets produce the 2304x972 content area')
expect(all(abs(a - b) <= 1 for a, b in zip(doc['system_insets'].values(),
                                           {'top': 60, 'right': 0, 'bottom': 48, 'left': 96}.values())),
       'the hidden taskbar source is not counted while the visible bars are')

doc = measure(None, 'no-bars-displays.txt', (1080, 2400))
expect(doc['system_insets'] == {'top': 0, 'right': 0, 'bottom': 0, 'left': 0},
       'a display without bar sources invents no insets')
expect(doc['window'] == {'x': 0, 'y': 0, 'width': 1080, 'height': 2400},
       'a full-height window is not shrunk by the gesture handle')

# ---- the analyzer consumes whatever the collector measured, unchanged
for tag, rect, screen in (('cold', (0, 128, 1080, 2209), (1080, 2400)),
                          ('rot', (128, 63, 2272, 954), (2400, 1080)),
                          ('rm', (0, 128, 1080, 2209), (1080, 2400))):
    out, _report = run([('700', splash_frame(rect))],
                       viewport_document(rect, {'top': rect[1],
                                                'right': screen[0] - rect[0] - rect[2],
                                                'bottom': screen[1] - rect[1] - rect[3],
                                                'left': rect[0]}, screen=screen), tag=tag,
                       dims=screen)
    expect(f'app viewport {rect[2]}x{rect[3]}' in out,
           f'the {tag} pass judges against the measured {rect[2]}x{rect[3]} viewport')

print()
if failures:
    print(f"FAILED - {len(failures)} failure(s)")
    sys.exit(1)
print("PASSED - 0 failure(s)")
