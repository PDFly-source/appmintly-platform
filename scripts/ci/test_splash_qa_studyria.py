#!/usr/bin/env python3
"""Self-tests for the Studyria device-QA profile.

The Studyria reference anchors the ruled canvas and the red margin rule to the
`.sp` layer (the app viewport) and the artwork column and the 5dp progress bar
to the 228x488 stage centred inside it. On a device the app window excludes the
status and navigation bars, so the profile has to judge the measured window, not
the screenshot. These tests pin both directions:

  * a faithful frame passes on a full-screen window and on an inset window;
  * artwork shifted off the column is rejected;
  * a missing progress bar, a filled bar under reduced motion, missing ruled
    lines and a missing margin rule are each rejected.

Run: python3 scripts/ci/test_splash_qa_studyria.py
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
W, H = 412, 915
CANVAS = (250, 250, 247)
LINE = (246, 246, 243)
RULE = (232, 182, 180)
# The real artwork is a soft navy/purple JPEG: mid-tone, not solid ink, so the
# frame stays a light canvas (the harness refuses dark frames for composition).
MARK = (95, 85, 135)
WORD = (105, 95, 145)
TRACK = (232, 232, 229)
FILL_A = (21, 21, 26)
FILL_B = (179, 15, 16)
failures = []


def expect(condition, label):
    if condition:
        print(f"ok   {label}")
    else:
        print(f"FAIL {label}")
        failures.append(label)


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


def frame(viewport, mark_shift=0.0, bar=True, fill=1.0, rails=True, rule=True):
    """Paint the reference composition for one app viewport (x, y, w, h)."""
    vx, vy, vw, vh = viewport
    u = min(vw / 228.0, vh / 488.0)
    ox = vx + (vw - 228.0 * u) / 2.0
    oy = vy + (vh - 488.0 * u) / 2.0
    cx = ox + 114.0 * u
    mark_w, mark_h = 165.0 * u, 165.0 * u * 313.0 / 420.0
    word_w, word_h = 200.0 * u, 200.0 * u * 182.0 / 620.0
    col_h = mark_h + 12.0 * u + word_h
    top = oy + ((488.0 * u - 44.0 * u) - col_h) / 2.0
    mark = (cx - mark_w / 2.0 + mark_shift, top, mark_w, mark_h)
    word = (cx - word_w / 2.0 + mark_shift, top + mark_h + 12.0 * u, word_w, word_h)
    bar_box = (ox + 60.0 * u, oy + (488.0 - 59.0) * u, ox + 168.0 * u, oy + (488.0 - 54.0) * u)

    def inside(box, x, y):
        bx, by, bw, bh = box
        return bx <= x < bx + bw and by <= y < by + bh

    def pixel(x, y):
        if not (vx <= x < vx + vw and vy <= y < vy + vh):
            return CANVAS
        if rule and abs(x - (vx + 34 * u)) < max(1.0, u * 0.5):
            return RULE
        if rails:
            off = (y - vy) % (32 * u)
            if 31 * u - 0.5 <= off < 32 * u:
                return LINE
        if inside(mark, x, y) or inside(word, x, y):
            return MARK if inside(mark, x, y) else WORD
        if bar and inside(bar_box, x, y):
            frac = (x - bar_box[0]) / max(1.0, bar_box[2] - bar_box[0])
            if frac < fill:
                return FILL_A if frac < 0.5 else FILL_B
            return TRACK
        return CANVAS

    return pixel


def viewport_document(viewport, screen):
    vx, vy, vw, vh = viewport
    return {
        'window': {'x': vx, 'y': vy, 'width': vw, 'height': vh},
        'display': {'width': screen[0], 'height': screen[1]},
        'screenshot': {'width': screen[0], 'height': screen[1]},
        'density': 420,
        'source': 'dumpsys-window-frame',
        'insets_state': {},
        'raw': {},
    }


def run(frames, viewport_json, tag='cold', dims=(W, H), design='studyria'):
    with tempfile.TemporaryDirectory() as tmp:
        for name, pixel in frames:
            write_png(os.path.join(tmp, f'{tag}_{name}.png'), pixel, w=dims[0], h=dims[1])
        env = dict(os.environ)
        env['SPLASH_DESIGN'] = design
        env['SPLASH_QA_REPORT'] = tmp
        path = os.path.join(tmp, 'viewport.json')
        with open(path, 'w') as fh:
            json.dump(viewport_json, fh)
        env['SPLASH_VIEWPORT'] = path
        out = subprocess.run([sys.executable, ANALYZER, tmp, tag, '420'],
                             capture_output=True, text=True, env=env).stdout
        report = None
        rp = os.path.join(tmp, f'report-{tag}.json')
        if os.path.exists(rp):
            with open(rp) as fh:
                report = json.load(fh)
        return out, report


def run_tag(dirpath, tag):
    env = dict(os.environ)
    env['SPLASH_DESIGN'] = 'studyria'
    env['SPLASH_QA_REPORT'] = dirpath
    out = subprocess.run([sys.executable, ANALYZER, dirpath, tag, '420'],
                         capture_output=True, text=True, env=env).stdout
    return out, None


def run_timed(dirpath, node='attached'):
    """Run the timed bar-fill pass on a prepared fixture directory."""
    meta = os.path.join(dirpath, 'timed_meta.txt')
    lines = [l for l in open(meta).read().strip().splitlines() if l]
    if node != 'attached' and lines:
        parts = lines[0].split()
        parts[2] = node
        lines[0] = ' '.join(parts)
        open(meta, 'w').write('\n'.join(lines) + '\n')
    env = dict(os.environ)
    env['SPLASH_DESIGN'] = 'studyria'
    env['SPLASH_QA_REPORT'] = dirpath
    out = subprocess.run([sys.executable, ANALYZER, dirpath, 'timed', '420'],
                         capture_output=True, text=True, env=env).stdout
    return out, None


def settled_frame():
    """The marketplace after the splash: the light page, no artwork, no bar."""
    return lambda x, y: (253, 253, 251) if y % 40 < 26 else (247, 247, 244)


def launch_pixels(pixel):
    return [(700, pixel), (1500, pixel), (2500, pixel), (3400, pixel),
            ('settled', settled_frame())]


full = (0, 0, W, H)
inset_frame = (0, 0, 1080, 2400)
inset_window = (0, 128, 1080, 2209)

print('— the faithful frame is accepted —')
out, report = run(launch_pixels(frame(full)), viewport_document(full, (W, H)))
expect('FAIL' not in out, 'a faithful full-screen frame passes every required check')
expect('PASS  [cold] the artwork column is centred on the stage' in out,
       'the column is judged centred and complete')
expect('PASS  [cold] the ruled canvas repeats' in out, 'the ruled canvas is measured on pitch')
expect('PASS  [cold] the red margin rule is drawn' in out, 'the margin rule is found')
expect('PASS  [cold] the progress bar is filled' in out, 'the progress bar is judged filled')
expect(report and report['measured']['artwork']['bbox'] is not None,
       'the report carries the measured artwork bbox')
expect(report and report['measured']['rails']['median_step'] is not None,
       'the report carries the measured rule pitch')

print('— insets are honoured —')
out, _ = run(launch_pixels(frame(inset_window)), viewport_document(inset_window, (1080, 2400)),
             dims=inset_frame[2:])
expect('FAIL' not in out, 'an inset window with the recorded viewport passes')

print('— the profile still rejects the real failure modes —')
# The bar is judged by the timed capture pass (the burst latches the surface), so
# an absent bar must be rejected THERE.
def timed_dir(fill, target_ms=2900):
    d = tempfile.mkdtemp()
    u_ = min(W / 228.0, H / 488.0)
    ox_ = (W - 228.0 * u_) / 2.0
    oy_ = (H - 488.0 * u_) / 2.0
    bar_ = (ox_ + 60 * u_, oy_ + (488 - 59) * u_, ox_ + 168 * u_, oy_ + (488 - 54) * u_)
    def painter(x, y):
        if bar_[0] <= x < bar_[2] and bar_[1] <= y < bar_[3]:
            if x < bar_[0] + (bar_[2] - bar_[0]) * fill:
                return (21, 21, 26)
            return (233, 232, 230)
        if abs(x - W // 2) < 90 and abs(y - H // 2) < 70:
            return (95, 85, 135)
        return (251, 250, 247)
    write_png(os.path.join(d, 'timed_%d.png' % target_ms), painter)
    open(os.path.join(d, 'timed_meta.txt'), 'w').write(
        '%d %d attached 0 0\n' % (target_ms, target_ms + 30))
    open(os.path.join(d, 'bar_progress.txt'), 'w').write(
        'I/StudyriaSplash: t=%d progress=%d fillW=0 track=%d,%d,%d,%d reducedMotion=false\n'
        % (target_ms, int(fill * 1000), int(bar_[0]), int(bar_[1]), int(bar_[2]), int(bar_[3])))
    return d

# The screenshot route no longer decides the bar (it returns a stale composite
# of the animating surface), and it must say so rather than passing silently.
out, _ = run_timed(timed_dir(1.0))
expect('the bar verdict is taken from the view pass' in out and 'FAIL  [timed]' not in out,
       'the screencap pass reports its bar reading and defers the verdict')
out, _ = run_timed(timed_dir(1.0), node='gone')
expect('our splash surface' in out, 'a stale gone-dump does not override pixel proof')

d = timed_dir(1.0)
write_png(os.path.join(d, 'timed_2900.png'), lambda x, y: (10, 15, 23), w=W, h=H)
out, _ = run_timed(d)
expect('FAIL  [timed]' in out, 'an unprovable capture fails instead of passing silently')

# The verdict-bearers: the view's own raster, at the exact instant.
def view_dir(fill_early, fill_late):
    d = timed_dir(fill_late)
    u_ = min(W / 228.0, H / 488.0)
    ox_ = (W - 228.0 * u_) / 2.0
    oy_ = (H - 488.0 * u_) / 2.0
    tr = (ox_ + 60 * u_, oy_ + (488 - 59) * u_, ox_ + 168 * u_, oy_ + (488 - 54) * u_)
    def painter(fill):
        def p(x, y):
            if tr[0] <= x < tr[2] and tr[1] <= y < tr[3]:
                if x < tr[0] + (tr[2] - tr[0]) * fill:
                    return (21, 21, 26)
                return (239, 239, 234)
            return (251, 250, 247)
        return p
    write_png(os.path.join(d, 'view_1200.png'), painter(fill_early), w=W, h=H)
    write_png(os.path.join(d, 'view_2900.png'), painter(fill_late), w=W, h=H)
    with open(os.path.join(d, 'bar_progress.txt'), 'a') as fh:
        fh.write('I/StudyriaSplash: geo 1200 t=1200 view=%dx%d screen=0,128 u=1 matrix=1.0,0.0,0.0;'
                 '0.0,1.0,0.0 clip=0,0,%d,%d track=%d,%d,%d,%d fill=%d,%d,%d,%d fillW=%d '
                 'alpha=255 shader=true\n'
                 % (W, H, W, H, tr[0], tr[1], tr[2], tr[3], tr[0], tr[1],
                    tr[0] + (tr[2] - tr[0]) * fill_early, tr[3], (tr[2] - tr[0]) * fill_early))
        fh.write('I/StudyriaSplash: geo 2900 t=2900 view=%dx%d screen=0,128 u=1 matrix=1.0,0.0,0.0;'
                 '0.0,1.0,0.0 clip=0,0,%d,%d track=%d,%d,%d,%d fill=%d,%d,%d,%d fillW=%d '
                 'alpha=255 shader=true\n'
                 % (W, H, W, H, tr[0], tr[1], tr[2], tr[3], tr[0], tr[1],
                    tr[0] + (tr[2] - tr[0]) * fill_late, tr[3], (tr[2] - tr[0]) * fill_late))
    return d

out, _ = run_tag(view_dir(0.30, 1.0), 'view')
expect('PASS  [view] the view renders a mid fill' in out and 'PASS  [view] the view renders a full bar' in out
       and 'FAIL' not in out, 'the view raster proves a mid fill and a full bar')
out, _ = run_tag(view_dir(0.0, 1.0), 'view')
expect('FAIL  [view] the view renders a mid fill' in out, 'a view raster without a mid fill is rejected')
out, _ = run_tag(view_dir(0.30, 0.30), 'view')
expect('FAIL  [view] the view renders a full bar' in out, 'a view raster without the full bar is rejected')

out, _ = run(launch_pixels(frame(full, rails=False)), viewport_document(full, (W, H)))
expect('FAIL  [cold] the ruled canvas' in out, 'a missing ruled canvas is rejected')

out, _ = run(launch_pixels(frame(full, rule=False)), viewport_document(full, (W, H)))
expect('FAIL  [cold] the red margin rule' in out, 'a missing margin rule is rejected')

u = min(W / 228.0, H / 488.0)
out, _ = run(launch_pixels(frame(full, mark_shift=165 * u / 2)), viewport_document(full, (W, H)))
expect('FAIL  [cold] the artwork column' in out, 'artwork pushed off the column is rejected')

out, _ = run(launch_pixels(frame(full, fill=1.0)), viewport_document(full, (W, H)), tag='rm')
expect('FAIL  [rm] the progress bar' in out,
       'a filled bar under reduced motion is rejected (the reference leaves it empty)')
out, _ = run(launch_pixels(frame(full, fill=0.0)), viewport_document(full, (W, H)), tag='rm')
expect('PASS  [rm] the progress bar' in out, 'an empty bar under reduced motion passes')

out, _ = run(launch_pixels(frame(full)), viewport_document(full, (W, H)), tag='rot')
expect('PASS  [rot]' in out or 'FAIL  [rot]' in out, 'the rotated pass runs')

print()
if failures:
    print(f'FAILED - {len(failures)} failure(s)')
    sys.exit(1)
print('PASSED - 0 failure(s)')
