# Fix Proposal 2: High-Frequency `setTimeout` Spam from `OrbitControls`

## The Issue
In `client/src/components/SkillsConstellation.tsx`, we are hooking into `OrbitControls` events to track user interaction, specifically inside `onChange`. This triggers a debounced `setTimeout` routine.

## Location in Code
```tsx
// client/src/components/SkillsConstellation.tsx
// Top of ConstellationScene:
  const resetInteractionTimeout = () => {
    isInteracting.current = true;
    if (interactionTimeout.current) clearTimeout(interactionTimeout.current);
    interactionTimeout.current = setTimeout(() => { // <--- OVERWHELMING TIMEOUT SPAM
      if (!isPointerDown.current) {
        isInteracting.current = false;
      }
    }, 1500); 
  };

// Bottom of ConstellationScene inside JSX:
      <OrbitControls 
        enableZoom={false} 
        enablePan={false}
        onChange={() => {
          // Triggers during user drag AND during inertia/damping slide
          resetInteractionTimeout(); // <--- FIRES EVERY MICRO-PIXEL MOVEMENT
        }}
        // ...
```

## Why it causes lag
`onChange` on `OrbitControls` fires excessively rapidly—multiple times per frame while the camera is moving. Consecutively calling `clearTimeout` and `setTimeout` hundreds of times per second hogs the main JavaScript thread, locking up the UI thread and causing severe lag.

## Proposed Strategy
Remove `resetInteractionTimeout` from `onChange`. Instead, only flag `isInteracting.current = true` / `false` using `onStart` and `onEnd`. If we need to wait for damping to stop, we should track accumulated time offsets natively within the `useFrame` delta parameter (no timeouts required).