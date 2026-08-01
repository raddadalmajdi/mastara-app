#!/usr/bin/env python3
"""Remove outer white background from Esalak logo via edge-connected flood fill."""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SRC = ROOT / "public" / "logo-source.png"
DEFAULT_OUT = ROOT / "public" / "logo.png"


def remove_edge_white_background(src: Path, out: Path, tolerance: int = 28) -> None:
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    pixels = img.load()
    visited = bytearray(w * h)
    queue: deque[tuple[int, int]] = deque()

    def near_white(r: int, g: int, b: int) -> bool:
        return r >= 255 - tolerance and g >= 255 - tolerance and b >= 255 - tolerance

    for x in range(w):
        for y in (0, h - 1):
            if near_white(*pixels[x, y][:3]):
                queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if near_white(*pixels[x, y][:3]):
                queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        idx = y * w + x
        if visited[idx]:
            continue
        r, g, b, _a = pixels[x, y]
        if not near_white(r, g, b):
            continue
        visited[idx] = 1
        pixels[x, y] = (r, g, b, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx]:
                queue.append((nx, ny))

    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, optimize=True)


if __name__ == "__main__":
    src = DEFAULT_SRC if DEFAULT_SRC.exists() else DEFAULT_OUT
    remove_edge_white_background(src, DEFAULT_OUT)
    print(f"Wrote transparent logo to {DEFAULT_OUT}")
