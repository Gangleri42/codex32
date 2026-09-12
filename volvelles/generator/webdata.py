#!/usr/bin/env python3
"""Emit the canonical codex32 data the web app consumes as JSON.

Nothing the app draws or computes is retyped: the alphabet, permutations and
rim order come from the repo's own SSS32.ps, the field and checksum constants
are cross-checked against the rust reference, and every derived wheel face is
the same output the physical-part emitters use (wheels.py).  Run after touching
either source; the web app re-verifies what it can at load time.

    python3 generator/webdata.py
"""

import json
import re
from pathlib import Path

import gf32
import psdata
from generate import RIM_ALPHABET, family_b_specs
from wheels import (B_GLYPH_SZ, B_RADIUS, B_STEP, B_TITLE_SZ, B_TAB_TOP,
                    B_HANDLE_W, DISC_R, HANDLE_R, MAGIC, PT_MM, RIM_R,
                    RIM_STEP, STATOR_EDGE_R, THICK, THIN, WINDOW,
                    addition_rotor, addition_stator, spiral_point)


def _int_array(ps: str, name: str) -> list[int]:
    m = re.search(rf"^/{name} \[([\d\s]+)\] def", ps, re.M)
    if not m:
        raise ValueError(f"/{name} array not found in PS source")
    return [int(v) for v in m.group(1).split()]


def load_all(repo: Path):
    ps_path = repo / "SSS32.ps"
    rust_path = repo / "reference/rust-codex32/src/gf32.rs"
    ref_path = repo / "reference/rust-codex32/src/checksum.rs"
    ps = ps_path.read_text()

    code, perm, perm_v = psdata.load(ps_path, rust_path)
    code2, bases = psdata.load_family_b(ps_path)

    # Short checksum generator: the PS /polymodulus is the same coefficient
    # list the rust reference spells out as Fe:: constants.
    short_gen = _int_array(ps, "polymodulus")
    if short_gen != [25, 27, 17, 8, 0, 25, 25, 25, 31, 27, 24, 16, 16]:
        raise ValueError(f"unexpected short checksum generator {short_gen}")

    # Long checksum: parse the rust reference (no PS counterpart in this edition).
    ref = ref_path.read_text()
    long_body = re.search(
        r"fn new_codex32_long.*?generator: vec!\[(.*?)\]", ref, re.S)
    if not long_body:
        raise ValueError("long checksum generator not found in rust reference")
    FE = {"Q": 0, "P": 1, "Z": 2, "R": 3, "Y": 4, "_9": 5, "X": 6, "_8": 7,
          "G": 8, "F": 9, "_2": 10, "T": 11, "V": 12, "D": 13, "W": 14,
          "_0": 15, "S": 16, "_3": 17, "J": 18, "N": 19, "_5": 20, "_4": 21,
          "K": 22, "H": 23, "C": 24, "E": 25, "_6": 26, "M": 27, "U": 28,
          "A": 29, "_7": 30, "L": 31}
    long_gen = [FE[n] for n in re.findall(r"Fe::(\w+)", long_body.group(1))]
    if long_gen != [15, 10, 25, 26, 9, 25, 21, 6, 23, 21, 6, 5, 22, 4, 23]:
        raise ValueError(f"unexpected long checksum generator {long_gen}")

    return ps, code, perm, perm_v, code2, bases, short_gen, long_gen


def addition_data(code, perm, perm_v):
    _, table = addition_stator(code, perm, perm_v, 0.0)
    return {
        "rim": list(RIM_ALPHABET),
        "table": table,
        "window_labels": [code[perm_v[31 - ring]] for ring in range(32)],
    }


def family_b_data(code, code2, bases):
    specs = family_b_specs(code, code2, bases)
    return {
        spec.name: {
            "title": spec.title,
            "rim": spec.rim,
            "inner": spec.inner,
            "rimSymbol": spec.rim_symbol,
            "innerSymbol": spec.inner_symbol,
            "rimPtr": spec.rim_ptr,
            "innerPtr": spec.inner_ptr,
            "handlePtr": spec.handle_ptr,
            "innerRadius": spec.inner_radius,
        }
        for spec in specs
    }


def main():
    root = Path(__file__).resolve().parents[1]
    repo = root.parent
    (ps, code, perm, perm_v, code2, bases,
     short_gen, long_gen) = load_all(repo)

    data = {
        "source": "SSS32.ps",
        "code": code,
        "code2": code2,
        "perm": perm,
        "permV": perm_v,
        "bases": bases,
        "checksum": {"short": short_gen, "long": long_gen},
        "geometry": {
            "ptToMm": PT_MM,
            "addition": {
                "magic": MAGIC,
                "rimStep": RIM_STEP,
                "rimR": RIM_R,
                "discR": DISC_R,
                "statorEdgeR": STATOR_EDGE_R,
                "handleR": HANDLE_R,
                "window": WINDOW,
                "thin": THIN,
                "thick": THICK,
                "spiral": [list(spiral_point(ring)) for ring in range(32)],
            },
            "familyB": {
                "radius": B_RADIUS,
                "step": B_STEP,
                "titleSize": B_TITLE_SZ,
                "glyphSize": B_GLYPH_SZ,
                "handleW": B_HANDLE_W,
                "tabTop": B_TAB_TOP,
            },
        },
        "addition": addition_data(code, perm, perm_v),
        "familyB": family_b_data(code, code2, bases),
    }

    out = root / "web/data/codex32.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {out.relative_to(root)} ({out.stat().st_size} bytes)")

    # Also emit the same payload as an ES module, so the page never has to
    # fetch the data at runtime.
    module = root / "web/js/data.js"
    module.write_text(
        "// generated by generator/webdata.py -- do not edit\n"
        "export default " + json.dumps(data, ensure_ascii=False) + ";\n")
    print(f"wrote {module.relative_to(root)} ({module.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
