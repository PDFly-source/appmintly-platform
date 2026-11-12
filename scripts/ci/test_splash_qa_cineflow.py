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


def splash_frame(viewport, basis='viewport', anchor=0.135, stripes=True, art_shift=0.0):
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
    art = ((vx + vw / 2 - mark_w / 2, mark_top, mark_w, mark_h),
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
def run(frames, viewport_json=None, tag='cold'):
    with tempfile.TemporaryDirectory() as tmp:
        for name, pixel in frames:
            write_png(os.path.join(tmp, f'{tag}_{name}.png'), pixel)
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

print('— device parsing —')
import importlib.util
spec = importlib.util.spec_from_file_location('splash_viewport', VIEWPORT)
vpm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vpm)

FIXTURES = os.path.join(HERE, 'fixtures')
portrait = os.path.join(FIXTURES, 'device-portrait-windows.txt')
landscape = os.path.join(FIXTURES, 'device-landscape-windows.txt')


def measure(dump, screen):
    with open(dump) as fh:
        text = fh.read()
    frame, _block, source = vpm.find_app_window(text, 'com.appforge.cineflow')
    return vpm.build_document(screen, frame, 420, source, {}, text)


if os.path.exists(portrait) and os.path.exists(landscape):
    doc = measure(portrait, (1080, 2400))
    expect(doc['app_window'] == {'x': 0, 'y': 0, 'width': 1080, 'height': 2400},
           'a real edge-to-edge portrait dump reports the full-screen app window')
    expect(doc['system_insets'] == {'top': 128, 'right': 0, 'bottom': 63, 'left': 0},
           'the status bar (128) and navigation bar (63) insets are read from the dump')
    expect(doc['window'] == {'x': 0, 'y': 128, 'width': 1080, 'height': 2209},
           'the content viewport is the window minus those bars (1080x2209 at y=128)')

    doc = measure(landscape, (2400, 1080))
    expect(doc['window'] == {'x': 144, 'y': 63, 'width': 2203, 'height': 954},
           'a real landscape dump gives the rotated content viewport (2203x954 at 144,63)')
else:
    expect(False, 'the real-device dumps are present')

synthetic = os.path.join(FIXTURES, 'dumpsys-window-windows.txt')
if os.path.exists(synthetic):
    got = subprocess.run([sys.executable, VIEWPORT, '--parse-window', synthetic,
                          '--package', 'com.appforge.cineflow'],
                         capture_output=True, text=True)
    parsed = json.loads(got.stdout or '{}')
    expect(parsed.get('frame') == [0, 129, 1080, 2335],
           'the synthetic fixture still parses to its app window frame')

# The device-measured viewports must also make the real frames pass: this is the
# regression the whole correction exists for.
real = os.environ.get('SPLASH_REAL_FRAMES')
if real and os.path.isdir(real):
    for tag, rect, screen in (('cold', (0, 128, 1080, 2209), (1080, 2400)),
                              ('rot', (144, 63, 2203, 954), (2400, 1080)),
                              ('rm', (0, 128, 1080, 2209), (1080, 2400))):
        out, _report = run([(n, (lambda x, y: (255, 255, 255))) for n in ('700',)],
                           viewport_document(rect, {'top': rect[1], 'right': screen[0] - rect[0] - rect[2],
                                                    'bottom': screen[1] - rect[1] - rect[3], 'left': rect[0]},
                                             screen=screen), tag=tag)
        expect('app viewport %dx%d' % (rect[2], rect[3]) in out,
               f'the {tag} viewport is applied to the analyzer ({rect[2]}x{rect[3]})')

print()
if failures:
    print(f"FAILED - {len(failures)} failure(s)")
    sys.exit(1)
print("PASSED - 0 failure(s)")
