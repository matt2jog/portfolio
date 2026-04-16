# Fix Proposal 5: `useFrame` Math Race Condition Against `useEffect` Target Reset

## The Issue
Between the `path` recalculating and the `setCurrentTargetIndex(0)` resetting, `useFrame` will run with out-of-sync values.

## Location in Code
```tsx
// client/src/components/SkillsConstellation.tsx
// Inside ConstellationScene

  const [currentTargetIndex, setCurrentTargetIndex] = useState(0);

  useEffect(() => {
    setCurrentTargetIndex(0); // Reset targeting to head whenever the path chain physically updates!
  }, [path]);

  // Interpolate camera rotation to trace the MST chain
  useFrame((state, delta) => {
    if (!groupRef.current || path.length === 0) return;
    if (isInteracting.current) return; 

    const targetId = path[currentTargetIndex]; // <--- BUGGY READ
    const targetPosArray = positions.get(targetId);
    if (!targetPosArray) return;

    // Use the exact node's coordinates in the sphere
    const localPos = new THREE.Vector3(...targetPosArray).normalize();
    // ...
```

## Why it causes lag
`useEffect` schedules an update that will be processed *after* the next DOM flush. `useFrame` gets called continuously via WebGL RequestAnimationFrame. When the user navigates, `path` replaces the old array length with the new arrays (e.g. from a group of 20 down to 3). `currentTargetIndex` might currently be `18`, but the new array only has `3` elements. `targetId = path[18]` resolves to `undefined`. `targetPosArray` evaluates `undefined`, bailing early. This generates invisible error loop hiccup latency that stops the engine from properly optimizing WebGL batching before `setCurrentTargetIndex(0)` actually resolves on the next CPU tick.

## Proposed Strategy
Inside `useFrame`, secure the index with bounds checking.
```tsx
const safeIndex = Math.min(currentTargetIndex, path.length - 1);
const targetId = path[safeIndex];
```