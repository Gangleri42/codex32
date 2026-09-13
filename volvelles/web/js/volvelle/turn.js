// Shared wheel-turning math for the 2D bench and the 3D instrument.  A wheel
// has `detents` positions spaced `step` apart; `step` may be negative and its
// unit matches the angle (degrees for the SVG bench, radians for three.js).

// Shortest signed difference between two angles, in degrees.
export const wrap180 = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;

// The detent nearest an arbitrary angle, as a 0..detents-1 index.
export const detentFor = (angle, step, detents) => ((Math.round(angle / step) % detents) + detents) % detents;

// The angle a detent sits at.
export const angleFor = (detent, step) => detent * step;
