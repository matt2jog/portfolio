# Fix Proposal 4: Overlapping Keyframe Animations & GPU Bottleneck (Framer Motion)

## The Issue
Changing the category triggers heavy CSS operations mapped to keyframes simultaneously with the component loading drastically different datasets.

## Location in Code
```tsx
// client/src/components/SkillsConstellation.tsx

// Inside SkillsConstellation component:
  const handleNavClick = (index: number) => {
    if (activeTextIndex === index) return;
    setActiveTextIndex(index);
    setTimeout(() => setActiveDataIndex(index), 500); // 0.5s glitch overlap wait!
  };

// Down inside ConstellationScene under <group position={[0, 0, 0]}> :
            <motion.h1 
              key={groupName} // Automatically resets the text glitch animations!
              initial={{ 
                opacity: 0,
                // ...
                filter: "blur(20px) contrast(300%) grayscale(100%)", // <--- GPU HEAVY
              }}
              animate={{ 
                // ...
                filter: [
                  "blur(10px) contrast(200%) hue-rotate(90deg)", // <--- MULTIPLE GPU RE-RENDERS
                  // ...
                  "blur(0px) contrast(100%) hue-rotate(0deg)"
                ],
              }}
              // ...
```

## Why it causes lag
The category text relies heavily strictly on GPU-rendered CSS operations (`blur()`, `hue-rotate()`, `mix-blend-screen`, and `conic-gradient()` masking). When you change pages, `key={groupName}` deletes and forcefully mounts a new animating component exactly 0.5s before the `activeDataIndex` pushes the `useMemo` Kruskal Math inside `ConstellationScene`. React blocks rendering frames overlapping these complex node allocations, which stalls Framer Motion frames resulting in "hitchy" screen tearing effects.

## Proposed Strategy
Extend the stagger delay to provide independent processing windowing (0.5s may be too tight), simplify the filter chaining, or use a much tighter `will-change` hardware acceleration CSS hint on the `motion.h1` rendering target.