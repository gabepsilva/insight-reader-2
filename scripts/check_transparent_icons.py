#!/usr/bin/env python3
"""Fail CI if required app icons do not preserve transparent background."""

from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
REQUIRED_ICON_FILES = [
    Path("src-tauri/icons/32x32.png"),
    Path("src-tauri/icons/128x128.png"),
    Path("src-tauri/icons/128x128@2x.png"),
    Path("src-tauri/icons/logo.png"),
]


def _paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def png_has_transparency(path: Path) -> bool:
    data = path.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError(f"{path} is not a PNG file")

    i = len(PNG_SIGNATURE)
    width = height = bit_depth = color_type = None
    trns_chunk = None
    idat = bytearray()

    while i < len(data):
        if i + 8 > len(data):
            raise ValueError(f"{path} is truncated (invalid chunk header)")

        length = struct.unpack(">I", data[i : i + 4])[0]
        chunk_type = data[i + 4 : i + 8]
        chunk_start = i + 8
        chunk_end = chunk_start + length
        crc_end = chunk_end + 4
        if crc_end > len(data):
            raise ValueError(f"{path} is truncated (invalid chunk length)")

        chunk_data = data[chunk_start:chunk_end]
        i = crc_end

        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, *_ = struct.unpack(">IIBBBBB", chunk_data)
        elif chunk_type == b"tRNS":
            trns_chunk = chunk_data
        elif chunk_type == b"IDAT":
            idat.extend(chunk_data)
        elif chunk_type == b"IEND":
            break

    if width is None or height is None or bit_depth is None or color_type is None:
        raise ValueError(f"{path} is missing IHDR")
    if bit_depth != 8:
        raise ValueError(f"{path} has unsupported bit depth: {bit_depth}")

    if color_type == 6:  # RGBA
        bpp = 4
    elif color_type == 3:  # Indexed
        bpp = 1
    elif color_type in (0, 2, 4):
        # Grayscale / RGB variants with no meaningful alpha channel for this check.
        return False
    else:
        raise ValueError(f"{path} has unsupported color type: {color_type}")

    raw = zlib.decompress(bytes(idat))
    row_len = width * bpp
    expected_len = height * (1 + row_len)
    if len(raw) != expected_len:
        raise ValueError(f"{path} has unexpected decompressed size")

    out = bytearray(height * row_len)
    raw_index = 0
    for y in range(height):
        filter_type = raw[raw_index]
        raw_index += 1

        row = bytearray(raw[raw_index : raw_index + row_len])
        raw_index += row_len

        prev = out[(y - 1) * row_len : y * row_len] if y > 0 else bytes(row_len)

        if filter_type == 0:
            pass
        elif filter_type == 1:
            for x in range(row_len):
                left = row[x - bpp] if x >= bpp else 0
                row[x] = (row[x] + left) & 0xFF
        elif filter_type == 2:
            for x in range(row_len):
                row[x] = (row[x] + prev[x]) & 0xFF
        elif filter_type == 3:
            for x in range(row_len):
                left = row[x - bpp] if x >= bpp else 0
                row[x] = (row[x] + ((left + prev[x]) // 2)) & 0xFF
        elif filter_type == 4:
            for x in range(row_len):
                left = row[x - bpp] if x >= bpp else 0
                up = prev[x]
                up_left = prev[x - bpp] if x >= bpp else 0
                row[x] = (row[x] + _paeth(left, up, up_left)) & 0xFF
        else:
            raise ValueError(f"{path} has unknown PNG filter type: {filter_type}")

        out[y * row_len : (y + 1) * row_len] = row

    if color_type == 6:
        alpha = out[3::4]
        return any(a < 255 for a in alpha)

    # color_type == 3
    if trns_chunk is None:
        return False
    return any(a < 255 for a in trns_chunk)


def main() -> int:
    failures: list[str] = []

    for icon_path in REQUIRED_ICON_FILES:
        if not icon_path.exists():
            failures.append(f"Missing icon file: {icon_path}")
            continue

        try:
            if not png_has_transparency(icon_path):
                failures.append(f"No transparent pixels found in {icon_path}")
        except Exception as exc:  # pylint: disable=broad-except
            failures.append(f"Failed to validate {icon_path}: {exc}")

    if failures:
        print("Icon transparency check failed:")
        for item in failures:
            print(f"- {item}")
        return 1

    print("Icon transparency check passed for required PNGs.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
