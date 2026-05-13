import { useEffect, useRef, useState, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useIsMobile } from "../hooks/use-mobile";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";

interface ConstellationNode {
  portfolio_skill_id: string;
  skill_id: string;
  skill_name: string;
  group_id: string | null;
  group_name: string | null;
}

interface StarProps {
  node: ConstellationNode;
  position: [number, number, number];
  isActive?: boolean;
  isMobile: boolean;
}

function Star({ node, position, isActive, isMobile }: StarProps) {
  // Use solid background instead of backdrop-blur to prevent WebKit edge-clipping shine
  const boxClass = isActive
    ? isMobile
      ? "border-cyan-400 bg-cyan-950 shadow-[0_0_16px_rgba(0,240,255,0.75)] scale-105 z-50"
      : "border-cyan-400 bg-cyan-950 shadow-[0_0_20px_rgba(0,240,255,0.8)] scale-110 z-50"
    : isMobile
      ? "border-gray-700 bg-[#0a0a0a] shadow-sm scale-95"
      : "border-gray-700 bg-[#0a0a0a] shadow-sm scale-100";
      
  const textClass = isActive
    ? isMobile
      ? "text-cyan-300 font-semibold"
      : "text-cyan-300 font-bold"
    : "text-gray-400";
  const boxPaddingClass = isMobile ? "border px-2 py-1 rounded-sm" : "border px-4 py-2 rounded-md";
  const textSizeClass = isMobile ? "text-[0.72rem] tracking-wide" : "text-xl tracking-wide";

  return (
    <group position={position}>
      <Html center distanceFactor={isMobile ? 18 : 15}>
        <div 
          className={`${boxPaddingClass} whitespace-nowrap flex items-center justify-center select-none transition-all duration-500 ${boxClass}`}
        >
          <p className={`transition-colors duration-500 ${textSizeClass} ${textClass}`}>{node.skill_name}</p>
        </div>
      </Html>
    </group>
  );
}

function ConstellationScene({ 
  data, 
  positions,
  edges,
  path,
  groupName, 
  isMobile,
  onPathComplete 
}: { 
  data: ConstellationNode[], 
  positions: Map<string, [number, number, number]>,
  edges: { source: [number, number, number], target: [number, number, number], groupId: string | null }[],
  path: string[],
  groupName: string, 
  isMobile: boolean,
  onPathComplete: () => void 
}) {
  const { gl, camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const targetQuaternion = useRef(new THREE.Quaternion());
  const reusableLocalPos = useRef(new THREE.Vector3());
  const reusableCameraDir = useRef(new THREE.Vector3());
  const [currentTargetIndex, setCurrentTargetIndex] = useState(0);
  const titleInitial = isMobile
    ? { opacity: 0, scale: 1.15, filter: "blur(8px)", skewX: -18 }
    : { opacity: 0, scale: 1.5, filter: "blur(10px)", skewX: -30 };
  const titleAnimate = isMobile
    ? {
        opacity: [0, 0.45, 0, 0.75, 0.25, 0.9],
        scale: [1.05, 1, 1.08, 0.97, 1.01, 1],
        filter: [
          "blur(6px)",
          "blur(0px)",
          "blur(3px)",
          "blur(0px)",
          "blur(2px)",
          "blur(0px)"
        ],
        skewX: [-18, 8, -6, 3, -1, 0],
        x: [-8, 5, -4, 2, -1, 0]
      }
    : {
        opacity: [0, 0.4, 0, 0.8, 0.2, 0.9],
        scale: [1.2, 1.1, 1.3, 0.9, 1.05, 1],
        filter: [
          "blur(8px)",
          "blur(0px)",
          "blur(4px)",
          "blur(0px)",
          "blur(2px)",
          "blur(0px)"
        ],
        skewX: [-40, 20, -10, 5, -2, 0],
        x: [-20, 15, -10, 5, -2, 0]
      };
  const titleClassName = isMobile
    ? "w-[66vw] max-w-[280px] text-center text-[clamp(1.4rem,9vw,2rem)] font-black uppercase tracking-normal text-cyan-500 leading-[0.92] whitespace-normal break-normal overflow-visible drop-shadow-[0_0_20px_rgba(0,240,255,0.8)]"
    : "text-4xl md:text-5xl lg:text-5xl font-black uppercase tracking-[0.2em] text-cyan-500 whitespace-nowrap drop-shadow-[0_0_30px_rgba(0,240,255,0.8)]";

  const isInteracting = useRef(false);
  const isPointerDown = useRef(false);
  // Cooldown accumulates delta time (in seconds) within useFrame rather than spamming macro DOM setTimeouts
  const interactionCooldown = useRef(0);

  const registerInteraction = () => {
    isInteracting.current = true;
    interactionCooldown.current = 1; // Reset the 1.2s countdown every micro-tick
  };

  // Configuration for visual element procession speed
  const MAX_TRAVERSAL_SECONDS = 20;
  const MIN_TRAVERSAL_SECONDS = 2;
  const ELEMENTS_PER_SECOND = 2.0;
  const PAUSE_AFTER_ROTATION_MS = 150; // Milliseconds to pause on each element, independent of traversal speed
  const TRAVERSAL_START_DELAY_MS = 1000; // Delay animation tracing loop after box change

  useEffect(() => {
    setCurrentTargetIndex(0); // Reset targeting to head whenever the path chain physically updates!
    
    // Instantly snap the group rotation to point the new head node exactly where the user/camera is currently looking.
    // This prevents wild initial spinning swings when the dataset physically regenerates underneath.
    if (groupRef.current && path.length > 0) {
      const startId = path[0];
      const startPosArr = positions.get(startId);
      if (startPosArr) {
        reusableLocalPos.current.set(...startPosArr).normalize();
        reusableCameraDir.current.copy(camera.position).normalize();
        
        // Offset the target direction so active box sits diagonally (top-right) from the center category text
        const camRight = new THREE.Vector3().crossVectors(camera.up, reusableCameraDir.current).normalize();
        const camUp = new THREE.Vector3().crossVectors(reusableCameraDir.current, camRight).normalize();
        reusableCameraDir.current.addScaledVector(camRight, 0.5).addScaledVector(camUp, 0.4).normalize();

        targetQuaternion.current.setFromUnitVectors(reusableLocalPos.current, reusableCameraDir.current);
        groupRef.current.quaternion.copy(targetQuaternion.current);
      }
    }
  }, [path, camera, positions]);

  // Cycle the targeted node based on dynamic traversal physics
  useEffect(() => {
    if (path.length === 0) return;

    let interval: ReturnType<typeof setInterval>;

    // Wait before starting the sequence logic to let title glitch animation and user focus settle
    const startTimeout = setTimeout(() => {
      // Calculate visual procession times dynamically based on chain length
      const unclampedDuration = path.length / ELEMENTS_PER_SECOND;
      const totalDurationSeconds = Math.max(MIN_TRAVERSAL_SECONDS, Math.min(MAX_TRAVERSAL_SECONDS, unclampedDuration));
      
      // MS per element (total time allocated / number of points in chain)
      const timePerElementMs = (totalDurationSeconds / path.length) * 1000;

      // Add exactly the rigid pause buffer after rotation calculation completes
      interval = setInterval(() => {
        if (isInteracting.current) return; // Pause procession if the user is interacting
        
        setCurrentTargetIndex(i => {
          if (i + 1 >= path.length) {
            onPathComplete();
            return 0;
          }
          return i + 1;
        });
      }, timePerElementMs + PAUSE_AFTER_ROTATION_MS);
    }, TRAVERSAL_START_DELAY_MS);
    
    return () => {
      clearTimeout(startTimeout);
      if (interval) clearInterval(interval);
    };
  }, [path, onPathComplete]); // Key change: trace physical path recalculation!

  // Interpolate camera rotation to trace the MST chain
  useFrame((state, delta) => {
    if (!groupRef.current || path.length === 0) return;

    // Run the native interaction cooldown math tracking here per-frame instead of DOM macro-tasks
    if (isInteracting.current) {
      if (!isPointerDown.current) {
        interactionCooldown.current -= delta;
        if (interactionCooldown.current <= 0) {
          isInteracting.current = false;
          interactionCooldown.current = 0;
        }
      }
      return; // Cease math/rotation completely while the user is inside the interaction/cooldown window!
    }

    const safeIndex = Math.min(currentTargetIndex, path.length - 1);
    const targetId = path[safeIndex];
    const targetPosArray = positions.get(targetId);
    if (!targetPosArray) return;

    // Use the exact node's coordinates in the sphere
    reusableLocalPos.current.set(...targetPosArray).normalize();
    
    // Demand that node be pointed outwards (+Z axis) towards the camera's dynamically shifted viewpoint!
    reusableCameraDir.current.copy(state.camera.position).normalize();

    // Offset the target direction so active box sits diagonally (top-right) from the center category text
    const camRight = new THREE.Vector3().crossVectors(state.camera.up, reusableCameraDir.current).normalize();
    const camUp = new THREE.Vector3().crossVectors(reusableCameraDir.current, camRight).normalize();
    reusableCameraDir.current.addScaledVector(camRight, 0.5).addScaledVector(camUp, 0.4).normalize();

    // Calculate rotation via unit vectors
    targetQuaternion.current.setFromUnitVectors(reusableLocalPos.current, reusableCameraDir.current);

    // Calculate dynamic slerp speed
    const baseSlerpStep = 3.5;
    groupRef.current.quaternion.slerp(targetQuaternion.current, delta * baseSlerpStep);
  });

  return (
    <group ref={groupRef}>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      
      {/* Center Group Name Anchor */}
      <group position={[0, 0, 0]}>
        <Html center distanceFactor={15}>
          <div className="select-none pointer-events-none flex flex-col items-center justify-center mix-blend-screen">
            <motion.h1 
              key={groupName} // Automatically resets the text glitch animations!
              initial={titleInitial}
              animate={titleAnimate}
              transition={{ 
                duration: 1.5, 
                ease: "circOut",
                times: [0, 0.2, 0.4, 0.6, 0.8, 1] 
              }}
              className={titleClassName}
              style={{
                willChange: "transform, filter, opacity",
                ...(isMobile
                  ? {}
                  : {
                      WebkitMaskImage: 'conic-gradient(black 25%, transparent 25% 50%, black 50% 75%, transparent 75%)',
                      WebkitMaskSize: '4px 4px',
                      maskImage: 'conic-gradient(black 25%, transparent 25% 50%, black 50% 75%, transparent 75%)',
                      maskSize: '4px 4px'
                    })
              }}
            >
              {groupName}
            </motion.h1>
          </div>
        </Html>
      </group>

      {edges.map((edge, i) => {
        let opacity = 0.3;
        let color = "#ffffff";
        
        return (
          <Line
            key={i}
            points={[edge.source, edge.target]}
            color={color}
            opacity={opacity}
            transparent
            lineWidth={1.5}
          />
        );
      })}

      {data.map((node) => (
        <Star
          key={node.skill_id}
          node={node}
          position={positions.get(node.skill_id)!}
          isMobile={isMobile}
          isActive={node.skill_id === path[currentTargetIndex]}
        />
      ))}
      
      {!isMobile && (
        <OrbitControls 
          enableZoom={false} 
          enablePan={false}
          onChange={() => {
            // Track 1.5s target resets entirely in memory via useFrame
            registerInteraction();
          }}
          onStart={() => {
            isPointerDown.current = true;
            registerInteraction();
          }}
          onEnd={() => {
            isPointerDown.current = false;
            registerInteraction();
          }}
        />
      )}
    </group>
  );
}

export function SkillsConstellation() {
  const { data, isLoading } = useQuery<ConstellationNode[]>({
    queryKey: ["/api/skills-constellation"],
  });

  const isMobile = useIsMobile();
  const [activeTextIndex, setActiveTextIndex] = useState(0);
  const [activeDataIndex, setActiveDataIndex] = useState(0);
  const constellationRadius = isMobile ? 11 : 8.5;
  const cameraFov = isMobile ? 50 : 60;
  const cameraPosition: [number, number, number] = isMobile ? [0, 0, 26] : [0, 0, 22];

  // Derive groups from data
  const groups = useMemo(() => {
    if (!data) return [];
    
    // Group all nodes by group_id
    const groupedMap = new Map<string, ConstellationNode[]>();
    // Need a way to track the group name for UI purposes
    const groupNames = new Map<string, string>();
    
    data.forEach(node => {
      const gid = node.group_id || 'ungrouped';
      if (!groupedMap.has(gid)) {
        groupedMap.set(gid, []);
      }
      groupedMap.get(gid)!.push(node);
      if (node.group_name) {
        groupNames.set(gid, node.group_name);
      }
    });

    const result = Array.from(groupedMap.entries()).map(([id, nodes]) => {
      const posMap = new Map<string, [number, number, number]>();
      
      // Fibonacci sphere layout
      const goldenRatio = (1 + Math.sqrt(5)) / 2;
      const totalNodes = nodes.length;
  
      nodes.forEach((node, index) => {
        const theta = 2 * Math.PI * index / goldenRatio;
        const phi = Math.acos(1 - 2 * (index + 0.5) / totalNodes);
        
        // Multiplier controls radius of the entire constellation
        const r = constellationRadius;
        
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        
        posMap.set(node.skill_id, [x, y, z]);
      });
  
      // --- NEURAL PATHWAY PLAN (Nearest Neighbor Chain) ---
      // To ensure a single continuous path with no branches (max degree 2),
      // we use a Nearest Neighbor algorithm to build one long chain.
      const links: { source: [number, number, number], target: [number, number, number], groupId: string | null }[] = [];
      const allIds = Array.from(posMap.keys());
      const path: string[] = [];
      
      if (allIds.length > 0) {
        const unvisited = new Set(allIds);
        let curr = allIds[0];
        path.push(curr);
        unvisited.delete(curr);
        
        while (unvisited.size > 0) {
          let bestDist = Infinity;
          let bestNode = "";
          const p1 = posMap.get(curr)!;
          
          for (const candidate of Array.from(unvisited)) {
            const p2 = posMap.get(candidate)!;
            const dist = Math.sqrt((p1[0]-p2[0])**2 + (p1[1]-p2[1])**2 + (p1[2]-p2[2])**2);
            if (dist < bestDist) {
              bestDist = dist;
              bestNode = candidate;
            }
          }
          
          links.push({
            source: posMap.get(curr)!,
            target: posMap.get(bestNode)!,
            groupId: id
          });
          
          curr = bestNode;
          path.push(curr);
          unvisited.delete(curr);
        }
      }

      return {
        id,
        name: groupNames.get(id) || "Other Skills",
        nodes,
        positions: posMap,
        edges: links,
        path
      };
    });

    // Sort by largest group first, or just alphabetically by name
    return result.sort((a, b) => b.nodes.length - a.nodes.length);
  }, [data, constellationRadius]);

  if (isLoading || !data || data.length === 0 || groups.length === 0) return null;

  const currentTextGroup = groups[activeTextIndex];
  const currentDataGroup = groups[activeDataIndex];
  
  const handlePathComplete = () => {
    setActiveTextIndex((prev) => {
      const next = prev < groups.length - 1 ? prev + 1 : 0;
      setTimeout(() => setActiveDataIndex(next), 1200); // Wait earlier before flipping data (after bulk of glitch anim)
      return next;
    });
  };

  const handleNavClick = (index: number) => {
    if (activeTextIndex === index) return;
    setActiveTextIndex(index);
    setTimeout(() => setActiveDataIndex(index), 1200); // 1.2s glitch overlap wait to avoid GPU choke
  };

  const handleStep = (direction: 1 | -1) => {
    const next = (activeTextIndex + direction + groups.length) % groups.length;
    handleNavClick(next);
  };
  
  return (
    <div className="relative w-full h-full pointer-events-none flex flex-col items-center justify-center md:block">
      {/* Desktop Navigation Dots */}
      <div className="hidden md:flex absolute top-1/2 right-8 xl:right-12 -translate-y-1/2 flex-col justify-center items-center gap-3 pointer-events-auto z-40">
        <button
          type="button"
          onClick={() => handleStep(-1)}
          aria-label="Previous skills group"
          className="grid h-8 w-8 place-items-center text-white/55 transition-colors hover:text-cyan-300"
        >
          <ChevronUp className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex flex-col justify-center items-center gap-4 py-1">
          {groups.map((group, index) => (
            <button
              key={group.id}
              type="button"
              onClick={() => handleNavClick(index)}
              aria-label={`Go to ${group.name} skills`}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                index === activeTextIndex 
                  ? "bg-cyan-400 scale-150 shadow-[0_0_12px_rgba(0,240,255,0.8)]" 
                  : "bg-white/30 hover:bg-white/70 hover:scale-125"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => handleStep(1)}
          aria-label="Next skills group"
          className="grid h-8 w-8 place-items-center text-white/55 transition-colors hover:text-cyan-300"
        >
          <ChevronDown className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Canvas */}
      <div className="relative w-[80vw] max-w-[420px] aspect-square shrink-0 z-10 pointer-events-none md:pointer-events-auto md:absolute md:top-0 md:inset-y-0 md:right-0 md:h-full md:w-[65vw] md:max-w-none md:aspect-auto xl:w-[55vw]">
        <Canvas
          camera={{ position: cameraPosition, fov: cameraFov }}
          style={{ pointerEvents: isMobile ? "none" : "auto" }}
        >
          {/* Note: Intentionally omitting key parameter so R3F recycles meshes instead of fully remounting the scene, preserving camera/orientation during the data swap */}
          <ConstellationScene 
            data={currentDataGroup.nodes}
            positions={currentDataGroup.positions}
            edges={currentDataGroup.edges}
            path={currentDataGroup.path}
            groupName={currentTextGroup.name}
            isMobile={isMobile}
            onPathComplete={handlePathComplete} 
          />
        </Canvas>
      </div>

      {/* Mobile Navigation Dots */}
      <div className="mt-3 flex md:hidden w-[80vw] max-w-[420px] items-center justify-center gap-3 pointer-events-auto z-40">
        <button
          type="button"
          onClick={() => handleStep(-1)}
          aria-label="Previous skills group"
          className="grid h-8 w-8 shrink-0 place-items-center text-white/55 transition-colors active:text-cyan-300"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex min-w-0 flex-wrap justify-center items-center gap-3">
          {groups.map((group, index) => (
            <button
              key={group.id}
              type="button"
              onClick={() => handleNavClick(index)}
              aria-label={`Go to ${group.name} skills`}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                index === activeTextIndex 
                  ? "bg-cyan-400 scale-150 shadow-[0_0_12px_rgba(0,240,255,0.8)]" 
                  : "bg-white/30 active:bg-white/70"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => handleStep(1)}
          aria-label="Next skills group"
          className="grid h-8 w-8 shrink-0 place-items-center text-white/55 transition-colors active:text-cyan-300"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
