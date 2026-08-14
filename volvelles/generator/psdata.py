"""Extract the codex32 data arrays from the SSS32 PostScript source.

Every glyph on the wheels derives from these three arrays, so they are parsed
out of the canonical file rather than retyped, and the alphabet is cross-checked
against the independent rust-codex32 reference before anything is drawn.
"""

import re
from pathlib import Path

DIGIT_GLYPHS = {
    "zero": "0", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9",
}

SYMBOL_GLYPHS = {
    "multiply": "×", "aleph": "ℵ", "alpha": "α", "beta": "β", "Gamma": "Γ",
    "Delta": "Δ", "epsilon": "ε", "eta": "η", "Theta": "Θ", "Lambda": "Λ",
    "mu": "μ", "Xi": "Ξ", "Pi": "Π", "rho": "ρ", "Sigma": "Σ", "Phi": "Φ",
    "Psi": "Ψ", "Omega": "Ω", "at": "@", "numbersign": "#", "percent": "%",
    "cent": "¢", "yen": "¥", "Euro": "€", "currency": "¤", "circleplus": "⊕",
    "dagger": "†", "daggerdbl": "‡", "section": "§", "paragraph": "¶",
    "diamond": "◆", "heart": "♥", "space": " ",
}


def _permutation(ps: str, name: str) -> list[int]:
    m = re.search(rf"^/{name} \[([\d\s]+)\] def", ps, re.M)
    if not m:
        raise ValueError(f"/{name} array not found in PS source")
    values = [int(v) for v in m.group(1).split()]
    if sorted(values) != list(range(32)):
        raise ValueError(f"/{name} is not a permutation of 0..31: {values}")
    return values


def load(ps_path: Path, rust_gf32_path: Path) -> tuple[list[str], list[int], list[int]]:
    """Return (code, perm, perm_v): the bech32 alphabet indexed by GF(32) value,
    the rim display order, and the window-label order."""
    ps = ps_path.read_text()

    m = re.search(r"^/code \[((?:/\w+ ?)+)\] def", ps, re.M)
    if not m:
        raise ValueError("/code array not found in PS source")
    names = m.group(1).replace("/", "").split()
    code = [DIGIT_GLYPHS.get(n, n) for n in names if n != "space"]
    if len(code) != 32 or any(len(c) != 1 for c in code):
        raise ValueError(f"unexpected /code array: {names}")

    rust = rust_gf32_path.read_text()
    m = re.search(r"CHARS_LOWER: \[char; 32\] = \[(.*?)\];", rust, re.S)
    if not m:
        raise ValueError("CHARS_LOWER not found in rust reference")
    rust_chars = [c.upper() for c in re.findall(r"'(\w)'", m.group(1))]
    if rust_chars != code:
        raise ValueError(f"PS charset {code} disagrees with rust charset {rust_chars}")

    return code, _permutation(ps, "perm"), _permutation(ps, "permV")


def load_family_b(ps_path: Path) -> tuple[list[str], dict[str, int]]:
    """Return (code2 symbols indexed by GF(32) value, logbase per disc)."""
    ps = ps_path.read_text()

    m = re.search(r"^/code2 \[((?:/\w+ ?)+)\] def", ps, re.M)
    if not m:
        raise ValueError("/code2 array not found in PS source")
    names = m.group(1).replace("/", "").split()
    code2 = [SYMBOL_GLYPHS[n] for n in names]
    if len(code2) != 33 or len(set(code2)) != 33:
        raise ValueError(f"unexpected /code2 array: {names}")

    bases = [int(b) for b in re.findall(r"^  /logbase (\d+) def", ps, re.M)]
    if len(bases) != 3:
        raise ValueError(f"expected 3 /logbase definitions, found {bases}")
    return code2, dict(zip(("fusion", "translation", "recovery"), bases))
