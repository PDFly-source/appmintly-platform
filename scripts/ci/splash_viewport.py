#!/usr/bin/env python3
"""Record the exact app viewport the splash is drawn into.

The splash design pins its film strips to 13.5% of the `.sp` layer, and the
reference's `inset:0` makes that layer the *app viewport*, not the screenshot.
On a device the app window is usually smaller than the screen (status bar on top,
navigation bar at the bottom), so the strips sit at 13.5% of the window and a
screenshot-relative reading is off by the insets.

This module asks the device instead of guessing from pixels:

  adb shell wm size                     -> physical / override screen size
  adb shell wm density                  -> density
  adb shell dumpsys window windows      -> per-window frame + insets state
  adb shell dumpsys window displays     -> app bounds / display cutout

and writes one machine-readable JSON document:

  {
    "screenshot": {"width": 1080, "height": 2400},
    "window":     {"x": 0, "y": 129, "width": 1080, "height": 2206},
    "insets":     {"top": 129, "right": 0, "bottom": 65, "left": 0},
    "density": 420,
    "source": "dumpsys-window-mFrame",
    "raw": {...}
  }

Every parser is a pure function so the QA self-tests can feed it real dumpsys
text without a device.

Usage:
  splash_viewport.py --package com.appforge.cineflow --out viewport.json
  splash_viewport.py --parse-window dump.txt   (debug: print the parsed frame)
"""
import argparse
import json
import os
import re
import subprocess
import sys


# --------------------------------------------------------------------- parsing
def parse_wm_size(text):
    """Return (width, height) from `wm size` output, override first."""
    if not text:
        return None
    for label in ('Override size:', 'Physical size:'):
        match = re.search(re.escape(label) + r'\s*(\d+)\s*x\s*(\d+)', text)
        if match:
            width, height = int(match.group(1)), int(match.group(2))
            if width > 0 and height > 0:
                return width, height
    return None


def parse_wm_density(text):
    """Return the effective density from `wm density` output."""
    if not text:
        return None
    for pattern in (r'Override density:\s*(\d+)', r'Physical density:\s*(\d+)'):
        match = re.search(pattern, text)
        if match:
            return int(match.group(1))
    match = re.search(r'(\d+)', text)
    return int(match.group(1)) if match else None


def _rect_from(text):
    """Parse any Android rect spelling: `Rect(l, t - r, b)` or `[l,t][r,b]`."""
    if not text:
        return None
    match = re.search(r'Rect\(\s*(-?\d+)\s*,\s*(-?\d+)\s*-\s*(-?\d+)\s*,\s*(-?\d+)\s*\)', text)
    if match:
        left, top, right, bottom = (int(v) for v in match.groups())
        return left, top, right, bottom
    match = re.search(r'\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]\s*\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]', text)
    if match:
        left, top, right, bottom = (int(v) for v in match.groups())
        return left, top, right, bottom
    return None


def window_blocks(dumpsys):
    """Split `dumpsys window windows` into one text block per window."""
    if not dumpsys:
        return []
    blocks, current = [], []
    for line in dumpsys.splitlines():
        if re.match(r'\s*Window #\d+', line) and current:
            blocks.append('\n'.join(current))
            current = [line]
        else:
            current.append(line)
    if current:
        blocks.append('\n'.join(current))
    return blocks


def window_frame(block):
    """The window's own frame: `Frames: ... frame=[l,t][r,b]` first, then mFrame."""
    match = re.search(r'^\s*Frames:.*?\bframe=(\[[^\]]*\]\[[^\]]*\])', block, re.M)
    if match:
        rect = _rect_from(match.group(1))
        if rect:
            return rect
    for pattern in (r'mFrame=(\S.*?)\s*$', r'mBounds=(\S.*?)\s*$'):
        match = re.search(pattern, block, re.M)
        if match:
            rect = _rect_from(match.group(1))
            if rect:
                return rect
    return None


def find_app_window(dumpsys, package):
    """Return (frame, block, source) for the package's app window."""
    header = re.compile(r'^\s*Window #\d+ Window\{[^}]*?\b' + re.escape(package) + r'/')
    for block in window_blocks(dumpsys):
        first = block.splitlines()[0] if block else ''
        if not header.match(first):
            continue
        frame = window_frame(block)
        if frame:
            return frame, block, 'dumpsys-window-frame'
    return None, None, None


# Windows that do not belong to the app but define where its content has to stop.
BAR_WINDOWS = ('StatusBar', 'NavigationBar', 'Taskbar', 'ScreenDecorOverlayBottom',
               'ScreenDecorOverlay', 'NavigationBar0', 'StatusBar0')


def system_bar_insets(dumpsys, display):
    """Inset sizes the system UI windows impose on the app content area."""
    insets = {'top': 0, 'right': 0, 'bottom': 0, 'left': 0}
    if not dumpsys or not display:
        return insets
    width, height = display
    for block in window_blocks(dumpsys):
        first = block.splitlines()[0] if block else ''
        if not any(name in first for name in BAR_WINDOWS):
            continue
        frame = window_frame(block)
        if not frame:
            continue
        left, top, right, bottom = frame
        if right <= left or bottom <= top:
            continue
        # A system bar is a strip pinned to one display edge. It only counts
        # when it spans most of the opposite axis, so floating gesture handles
        # and pills cannot be mistaken for an inset.
        spans_width = right - left >= width * 0.8
        spans_height = bottom - top >= height * 0.8
        if top <= 0 and spans_width and bottom < height:
            insets['top'] = max(insets['top'], bottom)
        elif bottom >= height and spans_width and top > 0:
            insets['bottom'] = max(insets['bottom'], height - top)
        elif left <= 0 and spans_height and right < width:
            insets['left'] = max(insets['left'], right)
        elif right >= width and spans_height and left > 0:
            insets['right'] = max(insets['right'], width - left)
    return insets


def content_viewport(frame, insets):
    """The app window minus the system bars: exactly what `inset:0` sees."""
    if not frame:
        return None
    left, top, right, bottom = frame
    return (max(left, insets.get('left') or 0),
            max(top, insets.get('top') or 0),
            right - max(0, insets.get('right') or 0),
            bottom - max(0, insets.get('bottom') or 0))


def find_app_bounds(displays_dumpsys):
    """Fallback: the display's app bounds, which exclude the system bars."""
    if not displays_dumpsys:
        return None
    match = re.search(r'mAppBounds=(\S.*?)\s*$', displays_dumpsys, re.M)
    if match:
        return _rect_from(match.group(1))
    for match in re.finditer(r'app bounds\s*[:\-]\s*(\S.*?)\s*$', displays_dumpsys, re.M | re.I):
        rect = _rect_from(match.group(1))
        if rect:
            return rect
    return None


def find_insets_state(dumpsys):
    """Return the status/navigation inset sizes the window reports, if any."""
    insets = {}
    if not dumpsys:
        return insets
    for name in ('statusBars', 'navigationBars'):
        match = re.search(name + r'.*?frame=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]', dumpsys, re.S)
        if match:
            left, top, right, bottom = (int(v) for v in match.groups())
            insets[name] = {'left': left, 'top': top, 'right': right, 'bottom': bottom}
    return insets


def build_document(screen, window, density, source, raw, dumpsys=''):
    """Assemble the JSON document the analyzer consumes."""
    width, height = screen if screen else (None, None)
    document = {
        'screenshot': {'width': width, 'height': height},
        'window': None,
        'insets': {'top': None, 'right': None, 'bottom': None, 'left': None},
        'density': density,
        'source': source,
        'insets_state': find_insets_state(dumpsys),
        'raw': raw,
    }
    if window:
        bars = system_bar_insets(dumpsys, screen)
        document['system_insets'] = bars
        content = content_viewport(window, bars)
        if width and height:
            # The app window may be edge to edge (targetSdk 36 enforces it), in
            # which case only the content area - the window minus the system
            # bars - matches the reference's `inset:0` viewport.
            document['app_window'] = {
                'x': window[0], 'y': window[1],
                'width': window[2] - window[0], 'height': window[3] - window[1],
            }
        window = content
        left, top, right, bottom = window
        if right <= left or bottom <= top:
            return document
        document['window'] = {
            'x': left,
            'y': top,
            'width': right - left,
            'height': bottom - top,
        }
        if width and height:
            # Insets are what the window leaves out on each screen edge. Negative
            # values mean the window runs past that edge (edge-to-edge drawing),
            # which is recorded as 0 so the report never shows a bogus inset.
            document['insets'] = {
                'top': max(0, top),
                'right': max(0, width - right),
                'bottom': max(0, height - bottom),
                'left': max(0, left),
            }
    return document


# ------------------------------------------------------------------- collection
def adb(*args):
    try:
        completed = subprocess.run(['adb'] + list(args), capture_output=True, text=True, timeout=30)
        return completed.stdout or ''
    except Exception:
        return ''


def collect(package, out_dir, screenshot=None):
    """Ask the device for its geometry and write the JSON document."""
    raw = {
        'wm_size': adb('shell', 'wm', 'size'),
        'wm_density': adb('shell', 'wm', 'density'),
    }
    dumpsys_windows = adb('shell', 'dumpsys', 'window', 'windows')
    dumpsys_displays = adb('shell', 'dumpsys', 'window', 'displays')
    raw['dumpsys_window_windows'] = dumpsys_windows
    raw['dumpsys_window_displays'] = dumpsys_displays

    screen = parse_wm_size(raw['wm_size'])
    density = parse_wm_density(raw['wm_density'])

    frame, _block, source = find_app_window(dumpsys_windows, package)
    if not frame:
        frame = find_app_bounds(dumpsys_displays)
        source = 'dumpsys-displays-mAppBounds' if frame else 'fallback-screenshot'

    document = build_document(screen, frame, density, source, raw, dumpsys_windows)

    # A screenshot taken by the harness is the ground truth for frame size; keep
    # it in the document so the analyzer can detect a scaled capture.
    if screenshot:
        document['frame_file'] = os.path.basename(screenshot)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
        for name, text in (('dumpsys-window-windows.txt', dumpsys_windows),
                           ('dumpsys-window-displays.txt', dumpsys_displays),
                           ('wm-size.txt', raw['wm_size']),
                           ('wm-density.txt', raw['wm_density'])):
            with open(os.path.join(out_dir, name), 'w') as fh:
                fh.write(text)
        with open(os.path.join(out_dir, 'viewport.json'), 'w') as fh:
            json.dump(document, fh, indent=2, sort_keys=True)
    return document


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--package', default=os.environ.get('PKG', 'com.appforge.cineflow'))
    parser.add_argument('--out', default=None, help='directory for viewport.json and raw dumps')
    parser.add_argument('--screenshot', default=None, help='frame the harness captured')
    parser.add_argument('--print', action='store_true', dest='echo')
    parser.add_argument('--parse-window', dest='parse_window', default=None,
                        help='parse a saved dumpsys window text instead of the device')
    args = parser.parse_args()

    if args.parse_window:
        with open(args.parse_window) as fh:
            text = fh.read()
        frame, _block, source = find_app_window(text, args.package)
        print(json.dumps({'frame': frame, 'source': source}, indent=2))
        return 0

    document = collect(args.package, args.out, args.screenshot)
    window = document.get('window')
    if args.echo:
        print(json.dumps(document, indent=2, sort_keys=True))
    if not window:
        print(f"no app window found ({document['source']}); geometry falls back to the frame")
        return 3
    bars = document.get('system_insets') or {}
    print(f"viewport {window['width']}x{window['height']} at "
          f"({window['x']},{window['y']}) from {document['source']} "
          f"bars top={bars.get('top', 0)} bottom={bars.get('bottom', 0)} "
          f"left={bars.get('left', 0)} right={bars.get('right', 0)}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
