# Floating Molecules Plan

## Concept
Categories are entirely isolated geometric shapes ("molecules") floating through the canvas.

## Structure
1.  **Geometric Groupings:** Calculate positions based on regular polyhedrons (tetrahedron, cube, etc.) depending on node count, or just localized tight spheres.
2.  **Connections (Edges):** 
    - Internal nodes only connect to a set number of internal peers to form wireframe geometry.
    - *No* cross-connections between categories.
3.  **Edge Count:** Low, well-defined by geometric polyhedrons.

## Implementation Steps
- [ ] Break down the global coordinate space into separate local origins.
- [ ] Render lines only if `nodeA.group_id === nodeB.group_id`.
- [ ] Add slow independent rotation to each molecule to enhance the "floating" aesthetic.