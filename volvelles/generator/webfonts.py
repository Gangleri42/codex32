#!/usr/bin/env python3
"""Subset DejaVu into the two small webfonts the app embeds.

The codex32 symbols (aleph, Greek letters, typographic marks) are missing from
many system fonts, so the wheels would render tofu on those machines.  Shipping
a ~20KB subset is more reliable than guessing at platform fonts.  Needs
fonttools: pip install fonttools brotli.

    python3 generator/webfonts.py
"""

from pathlib import Path

from fontTools import subset

FONT_DIRS = [
    Path("/usr/share/fonts/truetype/dejavu"),
    Path("/usr/share/fonts/TTF"),
    Path("/usr/local/share/fonts"),
    Path.home() / ".local/share/fonts",
    Path("/System/Library/Fonts/Supplemental"),
]


def find_dejavu() -> Path:
    for directory in FONT_DIRS:
        if (directory / "DejaVuSans-Bold.ttf").exists():
            return directory
    raise SystemExit("DejaVu Bold not found; install fonts-dejavu-core or set FONT_DIRS")

SYMBOLS = (
    list(range(0x20, 0x7F))  # printable ASCII, so the symbol face is self-contained
    + list(range(0x0391, 0x03CA))  # Greek capitals + small letters
    + [0x00D7, 0x2135, 0x00A2, 0x00A5, 0x20AC, 0x00A4, 0x2295, 0x2020, 0x2021,
       0x00A7, 0x00B6, 0x25C6, 0x2665, 0x2194, 0x2192, 0x00B7, 0x2014, 0x2212,
       0x00B1]
    + list(range(0x2680, 0x2686))  # die faces
)

MONO = list(range(0x20, 0x7F))  # full printable ASCII


def build(source: Path, unicodes: list[int], out: Path, text: str) -> None:
    args = [
        str(source),
        f"--unicodes={','.join(hex(u) for u in unicodes)}",
        f"--text={text}",
        "--layout-features=",
        "--flavor=woff2",
        f"--output-file={out}",
    ]
    subset.main(args)


def main():
    root = Path(__file__).resolve().parents[1]
    dejavu = find_dejavu()
    out = root / "web/fonts"
    out.mkdir(parents=True, exist_ok=True)
    build(dejavu / "DejaVuSans-Bold.ttf", SYMBOLS, out / "codex32-symbols.woff2",
          "qrpzry9x8gf2tvdw0s3jn54khce6mua7lACDEFGHJKLMNPQRSTUVWXYZ023456789⊕→↔·")
    build(dejavu / "DejaVuSansMono-Bold.ttf", MONO, out / "codex32-mono.woff2",
          "qrpzry9x8gf2tvdw0s3jn54khce6mua7lACDEFGHJKLMNPQRSTUVWXYZ023456789⊕→↔")
    for f in sorted(out.iterdir()):
        print(f"wrote {f.relative_to(root)} ({f.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
