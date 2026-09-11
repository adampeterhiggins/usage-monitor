#!/usr/bin/env python3
"""Write the app's PNG icons: the 1024×1024 app icon (chart bars on a rounded
square) and the menu-bar template icon (the same bars, alone, on transparency).

macOS treats a status-item template image as a mask — only alpha matters, and
the system paints it black or white to match the menu bar. So the tray icon
cannot reuse the app icon (its opaque squircle would render as a solid square);
it needs a glyph-only rendition. The tray PNG is authored at 2× (Retina) with
every edge on an even pixel so it also downsamples crisply to 1×.
"""

import struct
import zlib
from pathlib import Path
from typing import Callable

RGBA = tuple[int, int, int, int]
TRANSPARENT: RGBA = (0, 0, 0, 0)

# ── App icon ────────────────────────────────────────────────────────────────

APP_SIZE = 1024
APP_CORNER = 220
APP_BARS = [
    (260, 560, 180),  # x, height, width
    (460, 720, 180),
    (660, 420, 180),
]
APP_BASELINE = APP_SIZE - 220


def app_pixel(x: int, y: int) -> RGBA:
    # Rounded-rect mask
    r = APP_CORNER
    cx = min(x, APP_SIZE - 1 - x)
    cy = min(y, APP_SIZE - 1 - y)
    if cx < r and cy < r:
        dx, dy = r - cx, r - cy
        if dx * dx + dy * dy > r * r:
            return TRANSPARENT

    # Background gradient
    t = y / APP_SIZE
    bg = (
        int(36 + (70 - 36) * t),
        int(99 + (140 - 99) * t),
        int(180 + (210 - 180) * t),
        255,
    )

    for bx, bh, bw in APP_BARS:
        top = APP_BASELINE - bh
        if bx <= x < bx + bw and top <= y < APP_BASELINE:
            return (255, 255, 255, 255)
    return bg


# ── Menu-bar template icon ──────────────────────────────────────────────────
#
# tray-icon scales whatever it is given to 18pt tall, so this is a 36px-tall
# canvas (18pt @2x). The glyph keeps the app icon's bar proportions
# (560 : 720 : 420) at 30px tall with 3px of breathing room above and below;
# the status item adds its own horizontal padding.

TRAY_WIDTH = 34
TRAY_HEIGHT = 36
TRAY_PAD = 3
TRAY_BAR_WIDTH = 8
TRAY_BAR_GAP = 2
TRAY_BAR_HEIGHTS = [24, 30, 18]  # ≈ app icon heights scaled to 30px, kept even


def tray_pixel(x: int, y: int) -> RGBA:
    baseline = TRAY_HEIGHT - TRAY_PAD
    bx = TRAY_PAD
    for bh in TRAY_BAR_HEIGHTS:
        top = baseline - bh
        if bx <= x < bx + TRAY_BAR_WIDTH and top <= y < baseline:
            return (0, 0, 0, 255)
        bx += TRAY_BAR_WIDTH + TRAY_BAR_GAP
    return TRANSPARENT


# ── PNG writer ──────────────────────────────────────────────────────────────


def write_png(path: Path, width: int, height: int, pixel: Callable[[int, int], RGBA]) -> None:
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            raw.extend(pixel(x, y))

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


if __name__ == "__main__":
    icons = Path("src-tauri/icons")
    icons.mkdir(parents=True, exist_ok=True)

    assert TRAY_PAD * 2 + 3 * TRAY_BAR_WIDTH + 2 * TRAY_BAR_GAP == TRAY_WIDTH
    assert max(TRAY_BAR_HEIGHTS) + 2 * TRAY_PAD == TRAY_HEIGHT

    app_out = icons / "icon-1024.png"
    write_png(app_out, APP_SIZE, APP_SIZE, app_pixel)
    print(f"wrote {app_out}")

    tray_out = icons / "tray-template.png"
    write_png(tray_out, TRAY_WIDTH, TRAY_HEIGHT, tray_pixel)
    print(f"wrote {tray_out}")
