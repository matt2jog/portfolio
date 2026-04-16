# Fix Proposal 3: O(N²) Minimum Spanning Tree Recalculation on the Main Thread

## The Issue
Inside `client/src/components/SkillsConstellation.tsx`, `useMemo` runs Kruskal's Algorithm (Minimum Spanning Tree) with an expensive O(N^2) comparison calculation whenever `[data]` changes.

## Location in Code
```tsx
// client/src/components/SkillsConstellation.tsx
// ConstellationScene Component
  // Generate static positions based on groupings
  const { positions, edges, path } = useMemo(() => {
    // ...
    // 1. Generate all possible edges internally within the group
    const possibleEdges: Edge[] = [];
    for (let i = 0; i < allIds.length; i++) { // <--- EXPENSIVE NESTED LOOPS
      const p1 = posMap.get(allIds[i])!;
      for (let j = i + 1; j < allIds.length; j++) {
        const p2 = posMap.get(allIds[j])!;
        const dist = Math.sqrt((p1[0]-p2[0])**2 + (p1[1]-p2[1])**2 + (p1[2]-p2[2])**2);
        possibleEdges.push({ u: allIds[i], v: allIds[j], dist });
      }
    }

    // 2. Sort by Euclidean distance (for Kruskal's algorithm)
    possibleEdges.sort((a, b) => a.dist - b.dist); // <--- EXPENSIVE ARRAY SORT
    // ...
  }, [data]);
```

## Why it causes lag
Since we changed the implementation to no longer fully remount the `<ConstellationScene>` component (removing the `key` prop) to preserve camera orientation, React hot-swaps `data` in real-time. This forces the browser to run heavy mathematics, DFS sorting, and graph diameter analysis concurrently over the single JS execution thread. The CPU bottleneck starves the UI thread out of available rendering frames precisely when it needs smooth animations most.

## Proposed Strategy
All permutations and MST math should be computed *a priori* inside the top-level outer `<SkillsConstellation>` array logic using a single loop that generates multiple scenes' paths, effectively caching the data object. The `ConstellationScene` would just passively receive a finalized set of points ready to render.