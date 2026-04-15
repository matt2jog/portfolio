# Hub & Spoke Plan

## Concept
Instead of connecting every node to multiple nearest neighbors, we introduce a central "anchor" coordinate for each category.

## Structure
1.  **Anchors:** Calculate a central point (hub) for each category.
2.  **Nodes:** Arrange the skills in a spherical or circular orbit around their respective category's hub.
3.  **Connections (Edges):** 
    - Each skill node draws a single line directly to its category hub.
    - The category hubs optionally draw lines connecting to each other.
4.  **Edge Count:** Drops drastically from O(N^2) to roughly N + C (where C is the number of categories).

## Implementation Steps
- [ ] Modify `positions` map in `SkillsConstellation.tsx` to group by `group_id` and compute a center point.
- [ ] Render the standard nodes based on these orbit radii.
- [ ] Adjust the `edges` generation logic to only link nodes to their hub.