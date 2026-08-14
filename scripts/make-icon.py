#!/usr/bin/env python3
"""Write a 1024×1024 PNG app icon (chart bars on a rounded square)."""

import struct
import zlib
from pathlib import Path

SIZE = 1024


def pixel(x: int, y: int) -> tuple[int, int, int, int]:
    # Rounded-rect mask
    r = 220
    cx = min(x, SIZE - 1 - x)
    cy = min(y, SIZE - 1 - y)
    if cx < r and cy < r:
        dx, dy = r - cx, r - cy
        if dx * dx + dy * dy > r * r:
            return (0, 0, 0, 0)

    # Background
    t = y / SIZE
    bg = (
        int(36 + (70 - 36) * t),
        int(99 + (140 - 99) * t),
        int(180 + (210 - 180) * t),
        255,
    )

    # Three bars
    bars = [
        (260, 560, 180),  # x, height, width
        (460, 720, 180),
        (660, 420, 180),
    ]
    for bx, bh, bw in bars:
        top = SIZE - 220 - bh
        if bx <= x < bx + bw and top <= y < SIZE - 220:
            return (255, 255, 255, 255)
    return bg


def write_png(path: Path) -> None:
    raw = bytearray()
    for y in range(SIZE):
        raw.append(0)
        for x in range(SIZE):
            raw.extend(pixel(x, y))

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


if __name__ == "__main__":
    out = Path("src-tauri/icons/icon-1024.png")
    out.parent.mkdir(parents=True, exist_ok=True)
    write_png(out)
    print(f"wrote {out}")
