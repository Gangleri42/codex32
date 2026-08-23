#!/usr/bin/env python3
"""Fab package: gerbers and Excellon drills, one zip per board.

Plots whatever generate.py left in out/, so the files a board house receives
cannot drift from the artwork they came from. Needs KiCad 7 on PATH."""

import argparse
import subprocess
import zipfile
from pathlib import Path

LAYERS = "F.Cu,B.Cu,F.Mask,B.Mask,F.Silkscreen,B.Silkscreen,Edge.Cuts"


def plot(board, out_dir):
    """Plot one board's gerbers and drills into out_dir and return the files."""
    if out_dir.exists():
        for stale in out_dir.iterdir():
            stale.unlink()
    out_dir.mkdir(parents=True, exist_ok=True)
    for step in (["gerbers", "--layers", LAYERS], ["drill"]):
        subprocess.run(["kicad-cli", "pcb", "export", *step,
                        "--output", f"{out_dir}/", str(board)],
                       check=True, capture_output=True)
    files = sorted(p for p in out_dir.iterdir() if p.is_file())
    want = len(LAYERS.split(",")) + 2  # the plotted layers, plus job file and drills
    if len(files) != want:
        raise RuntimeError(f"{board.stem}: expected {want} files, plotted {len(files)}")
    return files


def main():
    root = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--boards", type=Path, default=root / "out",
                    help="directory holding the .kicad_pcb files")
    ap.add_argument("--out", type=Path, default=root / "out/gerbers")
    args = ap.parse_args()

    boards = sorted(args.boards.glob("*.kicad_pcb"))
    if not boards:
        raise SystemExit(f"no .kicad_pcb under {args.boards}; run generate.py first")

    for board in boards:
        files = plot(board, args.out / board.stem)
        archive = args.out / f"{board.stem}-gerbers.zip"
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
            for f in files:
                z.write(f, f.name)
        print(f"{archive.name}: {len(files)} files, {archive.stat().st_size // 1024}kB")

    print(f"{len(boards)} boards; 2-layer FR4, black mask, ENIG, "
          "1.6mm stators and 1.0mm rotors")


if __name__ == "__main__":
    main()
