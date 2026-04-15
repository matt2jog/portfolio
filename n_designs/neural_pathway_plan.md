# Neural Pathway Plan

## Concept
Mimic a biological neural network or lightning strike using a closest-neighbor tree approach, rather than a web.

## Structure
1.  **Node Placement:** Keep a general spaced-out 3D cluster (fibonacci sphere or randomized cloud).
2.  **Connections (Edges):** 
    - Every node finds its absolute *closest* neighbor and connects to it, and *only* it.
    - To prevent isolated pairs, we can build a Minimum Spanning Tree (MST) so all nodes connect together via minimum path without forming dense triangles/webbing.
3.  **Edge Count:** Exactly N - 1 lines for the whole graph.

## Implementation Steps
- [ ] Retain existing Fibonacci sphere generation.
- [ ] Replace edge generation with Prim's or Kruskal's algorithm, or a simpler nearest-neighbor forced tree logic.