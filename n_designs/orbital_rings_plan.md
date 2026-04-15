# Orbital Rings Plan

## Concept
Display categories as distinct, flat 3D circular rings floating in space, rather than clumping all points on the uniform surface of a sphere.

## Structure
1.  **Rings:** Each group gets its own localized circle equation (`x = r * cos(theta), y = r * sin(theta), z = offset`).
2.  **Tilting:** Rotate or offset each ring randomly or deterministically so they interlock like planetary rings or an atom.
3.  **Connections (Edges):** 
    - A skill only connects to `index - 1` and `index + 1` within its own ring.
    - Creates closed circular loops.
4.  **Edge Count:** Exactly N lines per ring. Extremely clean visually.

## Implementation Steps
- [ ] Update `useMemo` math to switch from Fibonacci sphere to multiple 2D circular placements displaced in 3D.
- [ ] Update edge generation to loop through a sorted array of the group's nodes and connect them sequentially.