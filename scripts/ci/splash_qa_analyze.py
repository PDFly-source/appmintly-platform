#!/usr/bin/env python3
"""Frame analysis for the AppMintly launch splash QA run.

Reimplements the reference geometry (stage 228x488, fit = min(w/228d, h/488d))
so the checks look exactly where the port draws:

  * brightness  - every launch frame is the light canvas, never the old dark
                  gradient (this is the regression that matters);
  * motion      - consecutive frames differ, so the animation really runs;
  * logo/word   - ink is present in the two reference rectangles;
  * rings       - both ring tints are on screen mid-animation;
  * dots        - the four palette dots sit on the reference row.

Usage: splash_qa_analyze.py <dir> <tag> <dpi>
"""
import sys
import glob
import os
from PIL import Image, ImageStat, ImageChops

OUT, TAG, DPI = sys.argv[1], sys.argv[2], float(sys.argv[3] or 420)
D = DPI / 160.0

PALETTE = {
    'green': (31, 157, 85),
    'blue': (37, 99, 235),
    'amber': (245, 166, 35),
    'red': (229, 57, 47),
}

failures = 0


def ok(msg):
    print(f"PASS  [{TAG}] {msg}")


def bad(msg):
    global failures
    failures += 1
    print(f"FAIL  [{TAG}] {msg}")


def note(msg):
    print(f"info  [{TAG}] {msg}")


def frames():
    """All frames of this tag: [(elapsed_ms or None, path)]."""
    out = []
    for path in sorted(glob.glob(os.path.join(OUT, f"{TAG}_*.png"))):
        name = os.path.basename(path)[len(TAG) + 1:-4]
        ms = int(name) if name.isdigit() else None
        out.append((ms, path))
    return out


def mean_lum(img):
    return ImageStat.Stat(img.convert('L')).mean[0]


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
    return {
        'u': u, 'cx': ox + 114 * u, 'oy': oy,
        'logo': (ox + 114 * u - logo_w / 2, top, ox + 114 * u + logo_w / 2, top + logo_h),
        'word': (ox + 114 * u - word_w / 2, top + logo_h + gap,
                 ox + 114 * u + word_w / 2, top + logo_h + gap + word_h),
        'dots_y': oy + (488 - 52 - 4.5) * u,
        'dots_x0': ox + 114 * u - (4 * 9 * u + 3 * 9 * u) / 2 + 4.5 * u,
        'dot_pitch': 18 * u,
        'dot_r': 4.5 * u,
        'ring_centre': (ox + 114 * u, oy + 190 * u),
        'ring_r': 100 * u,
    }


def ink_count(img, box, threshold=140):
    crop = img.crop(tuple(int(v) for v in box)).convert('L')
    hist = crop.histogram()
    return sum(hist[:threshold])


def dot_matches(img, g):
    px = img.convert('RGB').load()
    width, height = img.size
    matches = 0
    for i, name in enumerate(['green', 'blue', 'amber', 'red']):
        cx = int(g['dots_x0'] + i * g['dot_pitch'])
        cy = int(g['dots_y'])
        target = PALETTE[name]
        best = None
        radius = int(max(10, g['dot_r'] * 1.6))
        for y in range(max(0, cy - radius), min(height, cy + radius)):
            for x in range(max(0, cx - radius), min(width, cx + radius)):
                r, gg, b = px[x, y][:3]
                dist = (r - target[0]) ** 2 + (gg - target[1]) ** 2 + (b - target[2]) ** 2
                if best is None or dist < best:
                    best = dist
        if best is not None and best < 110 ** 2:
            matches += 1
    return matches


def ring_tint(img, g):
    """Count blue-ish and green-ish pixels in the ring annulus."""
    px = img.convert('RGB').load()
    width, height = img.size
    cx, cy = g['ring_centre']
    r0, r1 = 0.30 * g['ring_r'], 1.75 * g['ring_r']
    blue = green = 0
    step = 3
    for y in range(max(0, int(cy - r1)), min(height, int(cy + r1)), step):
        for x in range(max(0, int(cx - r1)), min(width, int(cx + r1)), step):
            dx, dy = x - cx, y - cy
            d2 = dx * dx + dy * dy
            if d2 < r0 * r0 or d2 > r1 * r1:
                continue
            r, gg, b = px[x, y][:3]
            if b - r > 10 and b - gg > 1:
                blue += 1
            elif gg - r > 6 and gg - b > 0:
                green += 1
    return blue, green


def main():
    items = frames()
    if not items:
        bad("no frames captured")
        return 1

    numeric = [(ms, p) for ms, p in items if ms is not None]
    named = {os.path.basename(p)[len(TAG) + 1:-4]: p for ms, p in items if ms is None}

    # ---- brightness on every launch frame (the old dark splash must be gone)
    lums = []
    for ms, path in items:
        try:
            img = Image.open(path)
        except Exception:
            continue
        lums.append((mean_lum(img), os.path.basename(path)))
    if lums:
        dimmest = min(lums)
        if dimmest[0] > 190:
            ok(f"all {len(lums)} launch frames are the light canvas (dimmest mean {dimmest[0]:.1f})")
        else:
            bad(f"a launch frame is dark (mean {dimmest[0]:.1f} in {dimmest[1]}) - old splash or flash")
    else:
        bad("no readable frames")

    # ---- motion
    if len(numeric) >= 3:
        first = Image.open(numeric[0][1]).convert('RGB')
        mid = Image.open(numeric[len(numeric) // 2][1]).convert('RGB')
        if first.size == mid.size:
            diff = ImageStat.Stat(ImageChops.difference(first, mid)).mean
            level = sum(diff) / len(diff)
            if level > 4:
                ok(f"animation runs (frame delta {level:.1f})")
            else:
                bad(f"frames barely differ (delta {level:.1f}) - splash is static")
    else:
        note("not enough numeric frames for the motion check")

    # ---- pick checkpoint frames
    def nearest(target):
        if not numeric:
            return None
        ms, path = min(numeric, key=lambda t: abs(t[0] - target))
        return path if abs(ms - target) < 1400 else None

    mid_frame = nearest(2400) or (numeric[-1][1] if numeric else None)
    ring_frame = nearest(1100)
    dot_frame = nearest(2900) or mid_frame

    if mid_frame:
        img = Image.open(mid_frame).convert('RGB')
        g = geometry(*img.size)
        logo_ink = ink_count(img, g['logo'])
        word_ink = ink_count(img, g['word'])
        if logo_ink > 2000:
            ok(f"logo artwork drawn in the reference box ({logo_ink} ink px)")
        else:
            bad(f"logo missing from its box ({logo_ink} ink px)")
        if word_ink > 200:
            ok(f"wordmark drawn in the reference box ({word_ink} ink px)")
        else:
            bad(f"wordmark missing from its box ({word_ink} ink px)")
    else:
        bad("no mid-animation frame to inspect")

    if ring_frame:
        img = Image.open(ring_frame).convert('RGB')
        g = geometry(*img.size)
        blue, green = ring_tint(img, g)
        if blue > 150:
            ok(f"blue ring visible mid-animation ({blue} tinted px)")
        else:
            bad(f"blue ring not visible ({blue} tinted px)")
        if green > 150:
            ok(f"green ring visible mid-animation ({green} tinted px)")
        else:
            bad(f"green ring not visible ({green} tinted px)")
    else:
        note("no frame near 1.1s for the ring check")

    if dot_frame:
        img = Image.open(dot_frame).convert('RGB')
        g = geometry(*img.size)
        matches = dot_matches(img, g)
        if matches >= 3:
            ok(f"{matches}/4 palette dots on the reference row")
        else:
            bad(f"only {matches}/4 palette dots found on the reference row")
    else:
        bad("no late frame for the dots check")

    # ---- settled frame must no longer be the splash overlay
    settled = named.get('settled')
    if settled and mid_frame:
        a = Image.open(settled).convert('RGB')
        b = Image.open(mid_frame).convert('RGB')
        if a.size == b.size:
            diff = ImageStat.Stat(ImageChops.difference(a, b)).mean
            level = sum(diff) / len(diff)
            if level > 8:
                ok(f"content replaced the splash (settled frame delta {level:.1f})")
            else:
                bad(f"settled frame still looks like the splash (delta {level:.1f})")
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
