# Fix Proposal 1: Vector Allocation inside `useFrame`

## The Issue
Inside `client/src/components/SkillsConstellation.tsx`, within the `useFrame` hook, we are instantiating a new `THREE.Vector3` object on every single frame rendering step by using `.clone()`.

## Location in Code
```tsx
// client/src/components/SkillsConstellation.tsx
// Inside ConstellationScene component

  // Interpolate camera rotation to trace the MST chain
  useFrame((state, delta) => {
    // ...
    // Demand that node be pointed outwards (+Z axis) towards the camera's dynamically shifted viewpoint!
    const cameraDir = state.camera.position.clone().normalize(); // <--- INSTANTIATION ON EVERY FRAME

    // Calculate rotation via unit vectors
    targetQuaternion.current.setFromUnitVectors(localPos, cameraDir);
    // ...
  });
```

## Why it causes lag
`useFrame` executes at the refresh rate of the monitor (e.g., 60-120 times per second). Calling `clone()` creates a new object in memory every time. This rapidly fills the browser's memory, forcing the Garbage Collector (GC) to run constantly, resulting in micro-stutters and dropped frames, which is especially noticeable on lower-end/mobile devices.

## Proposed Strategy
Define a static `THREE.Vector3` outside the render loop, and mutate it in-place using `.copy()` or `.getWorldDirection(targetVector)`.

```tsx
const cameraDir = useMemo(() => new THREE.Vector3(), []);

useFrame((state, delta) => {
  // Mutates existing vector, 0 allocations
  cameraDir.copy(state.camera.position).normalize(); 
  targetQuaternion.current.setFromUnitVectors(localPos, cameraDir);
});
```