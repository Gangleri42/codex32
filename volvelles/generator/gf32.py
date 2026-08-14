"""GF(32) arithmetic as defined in SSS32.ps: alpha = 2, reduction 0b101001."""


def mul(x: int, y: int) -> int:
    acc = 0
    for _ in range(5):
        if x & 1:
            acc ^= y
        x >>= 1
        y <<= 1
        if y >= 32:
            y ^= 0b101001
    return acc


def inv(x: int) -> int:
    """Multiplicative inverse; 0 for 0, matching gf32inv in the PS."""
    if x == 0:
        return 0
    return next(y for y in range(1, 32) if mul(x, y) == 1)


def powers(base: int) -> list[int]:
    """[base^0 .. base^30]; requires base to generate the whole group, which
    is what makes the fusion, translation and recovery rims work."""
    seq = [1]
    for _ in range(30):
        seq.append(mul(seq[-1], base))
    if sorted(seq) != list(range(1, 32)):
        raise ValueError(f"{base} does not generate GF(32)*")
    return seq


def lagrange(x: int, xj: int, xs: list[int]) -> int:
    """Basis polynomial l_j evaluated at x, ported verbatim from the PS."""
    acc = 1
    for xi in xs:
        if xi == xj:
            continue
        acc = mul(mul(acc, inv(xj ^ xi)), x ^ xi)
    return acc
