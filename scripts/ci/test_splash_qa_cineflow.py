#!/usr/bin/env python3
"""Self-test for the CineFlow design profile in splash_qa_analyze.py.

Builds synthetic frames with a dependency-free PNG encoder (the analyzer is
pure python on purpose, so this test may not use PIL) and asserts that the
profile judges them correctly:

  * a faithful CineFlow frame (light canvas, #141a4a strips at 13.5%, light
    stripes, artwork, nothing in the loader strip) passes every CineFlow check;
  * the same frame with the strips at the OLD fixed 66px anchor fails 'bands'
    (the approved design is 13.5% of the viewport, not 66px);
  * a frame without the light stripe band fails 'stripe';
  * the legacy dark launch surface fails the light-canvas gate.

Run: SPLASH_DESIGN is set by the test itself.
"""
import math
import os
import struct
import subprocess
import sys
import tempfile
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ANALYZER = os.path.join(HERE, 'splash_qa_analyze.py')
W, H = 412, 915
C1, C2 = (245, 247, 255), (237, 232, 255)
BAND = (0x14, 0x1A, 0x4A)
STRIPE = (0xEE, 0xF0, 0xFF)


def write_png(path, w, h, pixel):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw.extend(pixel(x, y))
    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(bytes(raw), 6))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as fh:
        fh.write(png)


def gradient_at(x, y, w, h):
    rad = math.radians(160.0)
    dx, dy = math.sin(rad), -math.cos(rad)
    half = (abs(w * dx) + abs(h * dy)) / 2.0
    t = min(1.0, max(0.0, 0.5 + ((x - w / 2) * dx + (y - h / 2) * dy) / (2 * half)))
    return tuple(round(C1[i] + (C2[i] - C1[i]) * t) for i in range(3))


def cineflow_frame(anchor=0.135, stripes=True):
    u = min(W / 228, H / 488)
    top_band = anchor * H
    bot_band = H - anchor * H - 26 * u
    bands = ((top_band, top_band + 26 * u), (bot_band, bot_band + 26 * u))
    # artwork boxes from the same geometry the profile uses; a dark block stands
    # in for the JPEG so the composition checks have ink to find
    mark_w, mark_h = 135 * u, 135 * u * 426 / 420
    word_w, word_h = 215 * u, 215 * u * 155 / 620
    col_h = mark_h + 12 * u + word_h
    oy = (H - 488 * u) / 2
    top = oy + ((488 * u - 44 * u) - col_h) / 2
    boxes = [((W - mark_w) / 2, top, (W + mark_w) / 2, top + mark_h),
             ((W - word_w) / 2, top + mark_h + 12 * u, (W + word_w) / 2, top + mark_h + 12 * u + word_h)]

    def pixel(x, y):
        for (t0, t1) in bands:
            if t0 <= y < t1:
                if stripes and t0 + 9 * u <= y < t0 + 17 * u:
                    if ((x + 1) % (20 * u)) < 10 * u:
                        return STRIPE
                return BAND
        # mostly white artwork with dark strokes: real JPEGs are white-background
        # marks, so the frame stays a light canvas while still carrying ink
        for i, (x0, y0, x1, y1) in enumerate(boxes):
            if x0 + 8 <= x <= x1 - 8 and y0 + 8 <= y <= y1 - 8:
                bar_h = 14 if i == 0 else 9
                if (y - y0) % 40 < bar_h:
                    return (24, 26, 40)
                return (252, 252, 253)
        return gradient_at(x, y, W, H)
    return pixel


def legacy_frame():
    def pixel(x, y):
        f = y / H
        return (int(30 - 12 * f), int(32 - 14 * f), int(39 - 7 * f))
    return pixel


def settled_frame():
    def pixel(x, y):
        if 120 <= y < 180:
            return (38, 42, 66)
        if 300 <= y < 306:
            return (70, 120, 255)
        f = y / H
        return (int(10 + 14 * f), int(13 + 16 * f), int(20 + 20 * f))
    return pixel


def run(frames):
    tmp = tempfile.mkdtemp(prefix='cfqa-')
    for ms, painter in frames:
        write_png(os.path.join(tmp, f'cold_{ms}.png'), W, H, painter)
    env = dict(os.environ, SPLASH_DESIGN='cineflow')
    out = subprocess.run([sys.executable, ANALYZER, tmp, 'cold', '420'],
                         capture_output=True, text=True, env=env)
    return out.stdout + out.stderr


failures = []


def expect(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond:
        failures.append(msg)


# 1. faithful frame: everything passes
good = run([(700, cineflow_frame()), (1500, cineflow_frame()), (2500, cineflow_frame()),
            (3400, cineflow_frame()), ('settled', settled_frame())])
expect('PASS  [cold] both film strips sit at 13.5% of the viewport' in good,
       'faithful frame: the 13.5% film strips are accepted')
expect('PASS  [cold] the light stripe band is drawn inside both strips' in good,
       'faithful frame: the light stripe band is accepted')
expect('PASS  [cold] nothing is drawn in the loader strip' in good,
       'faithful frame: the loader strip is empty (no progress bar)')
expect('[cold] FAIL' not in good,
       'faithful frame: no CineFlow check fails')

# 2. the OLD 66px anchoring must be rejected
old = run([(700, cineflow_frame(anchor=None or (66.0 / H))), (1500, cineflow_frame(anchor=66.0 / H)),
           (2500, cineflow_frame(anchor=66.0 / H)), (3400, cineflow_frame(anchor=66.0 / H)),
           ('settled', settled_frame())])
expect('FAIL  [cold] the 13.5% film strips are missing or misplaced' in old,
       'strips anchored at the old fixed 66px are rejected')

# 3. missing stripes must be rejected
nostripe = run([(700, cineflow_frame(stripes=False)), (1500, cineflow_frame(stripes=False)),
                (2500, cineflow_frame(stripes=False)), (3400, cineflow_frame(stripes=False)),
                ('settled', settled_frame())])
expect('FAIL  [cold] the stripe band is missing from a strip' in nostripe,
       'a frame without the light stripe band is rejected')

# 4. the legacy dark surface must be rejected
legacy = run([(700, legacy_frame()), (1500, legacy_frame()), (2500, legacy_frame()),
              (3400, legacy_frame()), ('settled', settled_frame())])
expect('FAIL  [cold] a launch frame is a dark surface' in legacy,
       'the legacy dark launch surface is rejected')

print()
print('FAILED' if failures else 'PASSED', '-', len(failures), 'failure(s)')
sys.exit(1 if failures else 0)
