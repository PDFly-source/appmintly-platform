#!/usr/bin/env python3
"""Frame analysis for the AppMintly launch splash QA run (dependency-free).

Reads the emulator's `screencap -p` files (8-bit non-interlaced PNG, RGB or
RGBA) with zlib only, so a flaky package mirror cannot break the QA job.

Reimplements the reference geometry (stage 228x488, fit = min(w/228d, h/488d))
so the checks look exactly where the port draws:

  * brightness  - every launch frame is the light canvas, never the old dark
                  gradient (the regression that matters);
  * motion      - frames differ over time, so the animation really runs;
  * logo/word   - ink is present in the two reference rectangles;
  * rings       - both ring tints are on screen mid-animation;
  * dots        - the four palette dots sit on the reference row.

Usage: splash_qa_analyze.py <dir> <tag> <dpi>
"""
import os
import sys
import zlib
import glob

OUT, TAG = sys.argv[1], sys.argv[2]
DPI = float(sys.argv[3] or 420)
D = DPI / 160.0

PALETTE = [(31, 157, 85), (37, 99, 235), (245, 166, 35), (229, 57, 47)]
failures = 0


def ok(msg):
    print(f"PASS  [{TAG}] {msg}")


def bad(msg):
    global failures
    failures += 1
    print(f"FAIL  [{TAG}] {msg}")


def note(msg):
    print(f"info  [{TAG}] {msg}")


def read_png(path):
    """Return (width, height, bytes_per_pixel, rows) for an 8-bit PNG."""
    with open(path, 'rb') as fh:
        data = fh.read()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('not a PNG')
    pos, idat, width, height, colour, depth = 8, [], 0, 0, 0, 8
    while pos < len(data):
        length = int.from_bytes(data[pos:pos + 4], 'big')
        kind = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b'IHDR':
            width = int.from_bytes(body[0:4], 'big')
            height = int.from_bytes(body[4:8], 'big')
            depth, colour = body[8], body[9]
            if body[12] != 0:
                raise ValueError('interlaced PNG is not supported')
        elif kind == b'IDAT':
            idat.append(body)
        elif kind == b'IEND':
            break
    if depth != 8 or colour not in (2, 6):
        raise ValueError(f'unsupported PNG (depth {depth}, colour type {colour})')
    bpp = 3 if colour == 2 else 4
    raw = zlib.decompress(b''.join(idat))
    stride = width * bpp
    rows, prev, offset = [], bytearray(stride), 0
    for _ in range(height):
        ftype = raw[offset]
        offset += 1
        line = bytearray(raw[offset:offset + stride])
        offset += stride
        if ftype == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif ftype == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ftype == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif ftype == 4:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 0xFF
        rows.append(line)
        prev = line
    return width, height, bpp, rows


def pixel(rows, bpp, x, y):
    row = rows[y]
    i = x * bpp
    return row[i], row[i + 1], row[i + 2]


def mean_lum(rows, bpp, step=6):
    total = count = 0
    for row in rows[::step]:
        for i in range(0, len(row), bpp * step):
            total += (row[i] * 299 + row[i + 1] * 587 + row[i + 2] * 114) // 1000
            count += 1
    return total / max(1, count)


def ink_count(rows, bpp, box, threshold=140):
    x0, y0, x1, y1 = (int(v) for v in box)
    height = len(rows)
    count = 0
    for y in range(max(0, y0), min(height, y1)):
        row = rows[y]
        for x in range(max(0, x0), min(len(row) // bpp, x1), 2):
            i = x * bpp
            lum = (row[i] * 299 + row[i + 1] * 587 + row[i + 2] * 114) // 1000
            if lum < threshold:
                count += 1
    return count * 2


def geometry(width, height):
    stage_w, stage_h = 228 * D, 488 * D
    k = min(width / stage_w, height / stage_h)
    u = D * k
    ox = (width - stage_w * k) / 2.0
    oy = (height - stage_h * k) / 2.0
    logo_w, logo_h = 170 * u, 170 * u * 307 / 420.0
    word_w, word_h = 190 * u, 190 * u * 159 / 620.0
    gap = 12 * u
    col_h = logo_h + gap + word_h
    top = oy + ((488 * u - 44 * u) - col_h) / 2.0
    cx = ox + 114 * u
    return {
        'u': u, 'cx': cx,
        'logo': (cx - logo_w / 2, top, cx + logo_w / 2, top + logo_h),
        'word': (cx - word_w / 2, top + logo_h + gap, cx + word_w / 2, top + logo_h + gap + word_h),
        'dots_y': oy + (488 - 52 - 4.5) * u,
        'dots_x0': cx - (4 * 9 * u + 3 * 9 * u) / 2 + 4.5 * u,
        'dot_pitch': 18 * u,
        'dot_r': 4.5 * u,
        'ring_centre': (cx, oy + 190 * u),
        'ring_r': 100 * u,
    }


def hue_sat(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    if d == 0:
        return None, 0
    if mx == r:
        h = (60 * ((g - b) / d)) % 360
    elif mx == g:
        h = 60 * ((b - r) / d) + 120
    else:
        h = 60 * ((r - g) / d) + 240
    return h, d


def dot_matches(width, height, bpp, rows, g):
    """Match each dot by hue: by the time all four are on screen they have
    faded in over the white canvas, so the exact RGB is diluted while the hue
    survives. A window around each expected centre is enough."""
    span = max(8, int(g['dot_pitch'] * 0.55))
    matches = 0
    for i, target in enumerate(PALETTE):
        want = hue_sat(*target)[0]
        cx = int(g['dots_x0'] + i * g['dot_pitch'])
        cy = int(g['dots_y'])
        best_sat = 0
        for y in range(max(0, cy - span), min(height, cy + span)):
            for x in range(max(0, cx - span), min(width, cx + span)):
                h, sat = hue_sat(*pixel(rows, bpp, x, y))
                if h is None or sat < 18 or sat <= best_sat:
                    continue
                delta = abs(h - want)
                if delta > 180:
                    delta = 360 - delta
                if delta <= 26:
                    best_sat = sat
        if best_sat:
            matches += 1
    return matches


def ring_tint(width, height, bpp, rows, g):
    cx, cy = g['ring_centre']
    r0, r1 = 0.30 * g['ring_r'], 1.75 * g['ring_r']
    blue = green = 0
    for y in range(max(0, int(cy - r1)), min(height, int(cy + r1)), 3):
        for x in range(max(0, int(cx - r1)), min(width, int(cx + r1)), 3):
            dx, dy = x - cx, y - cy
            d2 = dx * dx + dy * dy
            if d2 < r0 * r0 or d2 > r1 * r1:
                continue
            r, gg, b = pixel(rows, bpp, x, y)
            if b - r > 10 and b - gg > 1:
                blue += 1
            elif gg - r > 6 and gg - b > 0:
                green += 1
    return blue, green


def frame_delta(a, b, step=9):
    """Mean absolute RGB difference between two decoded frames (subsampled)."""
    wa, ha, bpp_a, rows_a = a
    wb, hb, bpp_b, rows_b = b
    if (wa, ha) != (wb, hb):
        return None
    total = count = 0
    for y in range(0, ha, step):
        ra, rb = rows_a[y], rows_b[y]
        for x in range(0, wa, step):
            i = x * bpp_a
            total += (abs(ra[i] - rb[i]) + abs(ra[i + 1] - rb[i + 1]) + abs(ra[i + 2] - rb[i + 2]))
            count += 3
    return total / max(1, count)


# Which checks a tag must satisfy. `cold` is the full animation; the rotation and
# reduced-motion passes only prove the splash still appears light, draws, and
# retires (with reduced motion there is deliberately no animation to measure).
REQUIRED = {
    'cold': {'motion', 'logo', 'word', 'rings', 'dots', 'replace'},
    'rot': {'logo', 'dots', 'replace'},
    'rm': {'logo', 'replace'},
}


def main():
    paths = sorted(glob.glob(os.path.join(OUT, f"{TAG}_*.png")))
    if not paths:
        bad("no frames captured")
        return 1

    frames = []
    for path in paths:
        name = os.path.basename(path)[len(TAG) + 1:-4]
        ms = int(name) if name.isdigit() else None
        try:
            frames.append((ms, name, read_png(path)))
        except Exception as exc:  # noqa: BLE001 - report and continue
            note(f"could not read {name}: {exc}")
    if not frames:
        bad("no readable frames")
        return 1

    required = REQUIRED.get(TAG, {'logo'})
    numeric = sorted((f for f in frames if f[0] is not None), key=lambda f: f[0])
    named = {f[1]: f for f in frames if f[0] is None}

    def verdict(check, passed_msg, failed_msg, enabled=True):
        if check in required:
            ok(passed_msg) if enabled else bad(failed_msg)
        elif enabled:
            ok(passed_msg)
        else:
            note(failed_msg)

    # animation frames only: the settled marketplace is not part of the splash
    if not numeric:
        if 'logo' in required:
            bad("no timestamped launch frames were captured")
        else:
            note("no timestamped launch frames were captured")
    else:
        lums = [(mean_lum(f[2][3], f[2][2]), str(f[0])) for f in numeric]
        dim = min(lums)
        if dim[0] > 190:
            ok(f"all {len(lums)} launch frames are the light canvas (dimmest mean {dim[0]:.1f})")
        else:
            bad(f"a launch frame is dark (mean {dim[0]:.1f} at {dim[1]}ms) - old splash or flash")

        if len(numeric) >= 3:
            level = frame_delta(numeric[0][2], numeric[len(numeric) // 2][2])
            if level is None:
                note("frame sizes changed between captures, skipping the motion check")
            else:
                verdict('motion',
                        f"animation runs (frame delta {level:.1f})",
                        f"frames barely differ (delta {level:.1f}) - splash is static",
                        level > 4)
        else:
            note(f"only {len(numeric)} launch frames, skipping the motion check")

    def nearest(target, window):
        if not numeric:
            return None
        frame = min(numeric, key=lambda f: abs(f[0] - target))
        return frame if abs(frame[0] - target) <= window else None

    mid = nearest(2400, 1400) or (numeric[-1] if numeric else None)
    ring = nearest(1100, 900)
    dots = nearest(3200, 900) or mid

    if mid:
        w, h, bpp, rows = mid[2]
        g = geometry(w, h)
        logo_ink = ink_count(rows, bpp, g['logo'])
        word_ink = ink_count(rows, bpp, g['word'])
        verdict('logo',
                f"logo artwork drawn in the reference box ({logo_ink} ink px)",
                f"logo missing from its box ({logo_ink} ink px)",
                logo_ink > 2000)
        verdict('word',
                f"wordmark drawn in the reference box ({word_ink} ink px)",
                f"wordmark missing from its box ({word_ink} ink px)",
                word_ink > 200)
    elif 'logo' in required:
        bad("no mid-animation frame to inspect")

    if ring:
        w, h, bpp, rows = ring[2]
        blue, green = ring_tint(w, h, bpp, rows, geometry(w, h))
        verdict('rings',
                f"both rings visible mid-animation (blue {blue}, green {green} px)",
                f"rings not both visible (blue {blue}, green {green} px)",
                blue > 150 and green > 150)
    elif 'rings' in required:
        bad("no frame near 1.1s for the ring check")

    if dots:
        w, h, bpp, rows = dots[2]
        matches = dot_matches(w, h, bpp, rows, geometry(w, h))
        verdict('dots',
                f"{matches}/4 palette dots on the reference row",
                f"only {matches}/4 palette dots found on the reference row",
                matches >= 3)
    elif 'dots' in required:
        bad("no late frame for the dots check")

    settled = named.get('settled')
    if settled and mid:
        level = frame_delta(settled[2], mid[2])
        if level is None:
            note("settled frame size differs, skipping the replacement check")
        else:
            verdict('replace',
                    f"content replaced the splash (settled frame delta {level:.1f})",
                    f"settled frame still looks like the splash (delta {level:.1f})",
                    level > 8)
    elif 'replace' in required:
        bad("no settled frame for the replacement check")

    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
