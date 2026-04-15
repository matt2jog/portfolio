import { useEffect, useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { useQuery } from "@tanstack/react-query";

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
}

function Star({ node, position, isActive }: StarProps) {
  // Use solid background instead of backdrop-blur to prevent WebKit edge-clipping shine
  const boxClass = isActive
    ? "border-cyan-400 bg-cyan-950 shadow-[0_0_20px_rgba(0,240,255,0.8)] scale-110 z-50"
    : "border-gray-700 bg-[#0a0a0a] shadow-sm scale-100";
      
  const textClass = isActive ? "text-cyan-300 font-bold" : "text-gray-400";

  return (
    <group position={position}>
      <Html center distanceFactor={15}>
        <div 
          className={`border px-4 py-2 rounded-md whitespace-nowrap flex items-center justify-center select-none transition-all duration-500 ${boxClass}`}
        >
          <p className={`text-xl tracking-wide transition-colors duration-500 ${textClass}`}>{node.skill_name}</p>
        </div>
      </Html>
    </group>
  );
}

function ConstellationScene({ data }: { data: ConstellationNode[] }) {
  // Generate static positions based on groupings
  const { positions, edges, path } = useMemo(() => {
    const posMap = new Map<string, [number, number, number]>();
    const nodeConfigs = new Map<string, ConstellationNode>();
    
    // Group skills to keep them closer naturally
    const groups: Record<string, ConstellationNode[]> = {};
    data.forEach(node => {
      const gid = node.group_id || 'ungrouped';
      if (!groups[gid]) groups[gid] = [];
      groups[gid].push(node);
      nodeConfigs.set(node.skill_id, node);
    });

    // Fibonacci sphere layout
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    let index = 0;
    const totalNodes = data.length;

    // Distribute nodes roughly sequentially in a sphere (fibonacci sphere)
    Object.values(groups).forEach(groupNodes => {
      groupNodes.forEach(node => {
        const theta = 2 * Math.PI * index / goldenRatio;
        const phi = Math.acos(1 - 2 * (index + 0.5) / totalNodes);
        
        // Multiplier controls radius of the entire constellation
        const r = 8.5; 
        
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        
        posMap.set(node.skill_id, [x, y, z]);
        index++;
      });
    });

    // --- NEURAL PATHWAY PLAN (Minimum Spanning Tree) ---
    // Connect all nodes via an MST ensuring N - 1 total edges, avoiding dense overlapping webbing
    
    type Edge = { u: string, v: string, dist: number };
    const links: { source: [number, number, number], target: [number, number, number], groupId: string | null }[] = [];
    const allIds = Array.from(posMap.keys());
    
    // 1. Generate all possible edges internally within the group
    const possibleEdges: Edge[] = [];
    for (let i = 0; i < allIds.length; i++) {
      const p1 = posMap.get(allIds[i])!;
      for (let j = i + 1; j < allIds.length; j++) {
        const p2 = posMap.get(allIds[j])!;
        const dist = Math.sqrt((p1[0]-p2[0])**2 + (p1[1]-p2[1])**2 + (p1[2]-p2[2])**2);
        possibleEdges.push({ u: allIds[i], v: allIds[j], dist });
      }
    }

    // 2. Sort by Euclidean distance (for Kruskal's algorithm)
    possibleEdges.sort((a, b) => a.dist - b.dist);

    // 3. Create a Fast Union-Find/Disjoint Set structure
    const parent = new Map<string, string>();
    const find = (i: string): string => {
      let root = i;
      while (parent.has(root) && parent.get(root) !== root) {
        root = parent.get(root)!;
      }
      return root;
    };
    
    const union = (i: string, j: string) => {
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) {
        parent.set(rootI, rootJ);
        return true; 
      }
      return false; // Adding this edge would form a cycle
    };

    // 4. Trace the Spanning Tree pathway
    const adj = new Map<string, string[]>();
    allIds.forEach(id => adj.set(id, []));
    for (const edge of possibleEdges) {
      if (union(edge.u, edge.v)) {
        adj.get(edge.u)!.push(edge.v);
        adj.get(edge.v)!.push(edge.u);
        const node1Gid = nodeConfigs.get(edge.u)?.group_id;
        const node2Gid = nodeConfigs.get(edge.v)?.group_id;
        const sharedGid = node1Gid && node1Gid === node2Gid ? node1Gid : null;

        links.push({
          source: posMap.get(edge.u)!,
          target: posMap.get(edge.v)!,
          groupId: sharedGid
        });
      }
    }

    // 5. Create a traversal path (DFS on the MST adjacency list)
    const path: string[] = [];
    const visited = new Set<string>();
    const dfs = (node: string) => {
      visited.add(node);
      path.push(node);
      for (const neighbor of adj.get(node)!) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
          // Optional: Add `path.push(node)` here if you want it to visually string-backtrack 
          // instead of jumping across branches. We'll stick to a clean consecutive leap.
        }
      }
    };

    // To ensure the animation starts at the true "head" of the longest chain, 
    // we locate the graph's diameter (the two furthest leaf nodes).
    let startNode = allIds[0];
    if (allIds.length > 0) {
      // Step A: Find the furthest node from an arbitrary start (this will be Leaf 1)
      let furthestNode = allIds[0];
      let maxDist = -1;
      const findFurthest = (curr: string, currentDist: number, localVisited: Set<string>) => {
        localVisited.add(curr);
        if (currentDist > maxDist) {
          maxDist = currentDist;
          furthestNode = curr;
        }
        for (const neighbor of adj.get(curr)!) {
          if (!localVisited.has(neighbor)) {
            findFurthest(neighbor, currentDist + 1, localVisited);
          }
        }
      };
      findFurthest(allIds[0], 0, new Set<string>());
      
      // Step B: Set the guaranteed extremal leaf as our starting node
      startNode = furthestNode;
    }

    if (allIds.length > 0) dfs(startNode);

    return { positions: posMap, edges: links, path };
  }, [data]);

  const groupRef = useRef<THREE.Group>(null);
  const targetQuaternion = useRef(new THREE.Quaternion());
  const [currentTargetIndex, setCurrentTargetIndex] = useState(0);

  // Configuration for visual element procession speed
  const MAX_TRAVERSAL_SECONDS = 10;
  const MIN_TRAVERSAL_SECONDS = 2;
  const ELEMENTS_PER_SECOND = 2.0;
  const PAUSE_AFTER_ROTATION_MS = 80; // Milliseconds to pause on each element, independent of traversal speed

  // Cycle the targeted node based on dynamic traversal physics
  useEffect(() => {
    if (path.length === 0) return;

    // Calculate visual procession times dynamically based on chain length
    const unclampedDuration = path.length / ELEMENTS_PER_SECOND;
    const totalDurationSeconds = Math.max(MIN_TRAVERSAL_SECONDS, Math.min(MAX_TRAVERSAL_SECONDS, unclampedDuration));
    
    // MS per element (total time allocated / number of points in chain)
    const timePerElementMs = (totalDurationSeconds / path.length) * 1000;

    // Add exactly the rigid pause buffer after rotation calculation completes
    const interval = setInterval(() => {
      setCurrentTargetIndex(i => (i + 1) % path.length);
    }, timePerElementMs + PAUSE_AFTER_ROTATION_MS);
    
    return () => clearInterval(interval);
  }, [path.length]);

  // Interpolate camera rotation to trace the MST chain
  useFrame((state, delta) => {
    if (!groupRef.current || path.length === 0) return;

    const targetId = path[currentTargetIndex];
    const targetPosArray = positions.get(targetId);
    if (!targetPosArray) return;

    // Use the exact node's coordinates in the sphere
    const localPos = new THREE.Vector3(...targetPosArray).normalize();
    // Demand that node be pointed outwards (+Z axis) towards the camera
    const cameraDir = new THREE.Vector3(0, 0, 1);

    // Calculate rotation via unit vectors
    targetQuaternion.current.setFromUnitVectors(localPos, cameraDir);

    // Calculate dynamic slerp speed to match the procession timescale without overshooting
    const baseSlerpStep = 8;
    groupRef.current.quaternion.slerp(targetQuaternion.current, delta * baseSlerpStep);
  });

  return (
    <group ref={groupRef}>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      
      {/* Center Group Name Anchor */}
      <group position={[0, 0, 0]}>
        <Html center distanceFactor={15}>
          <div className="select-none pointer-events-none flex flex-col items-center justify-center opacity-90 mix-blend-screen">
            <h1 
              className="text-4xl md:text-5xl font-black uppercase tracking-[0.2em] text-cyan-500 whitespace-nowrap drop-shadow-[0_0_30px_rgba(0,240,255,0.8)]"
              style={{
                WebkitMaskImage: 'conic-gradient(black 25%, transparent 25% 50%, black 50% 75%, transparent 75%)',
                WebkitMaskSize: '4px 4px',
                maskImage: 'conic-gradient(black 25%, transparent 25% 50%, black 50% 75%, transparent 75%)',
                maskSize: '4px 4px'
              }}
            >
              {data[0]?.group_name || "Miscellaneous"}
            </h1>
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
          isActive={node.skill_id === path[currentTargetIndex]}
        />
      ))}
      
      {/* Removed autoRotate because useFrame handles smooth slerp to targets natively now! */}
      <OrbitControls enableZoom={false} enablePan={false} />
    </group>
  );
}

export function SkillsConstellation() {
  const { data, isLoading } = useQuery<ConstellationNode[]>({
    queryKey: ["/api/skills-constellation"],
  });

  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);

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

    const result = Array.from(groupedMap.entries()).map(([id, nodes]) => ({
      id,
      name: groupNames.get(id) || "Other Skills",
      nodes
    }));

    // Sort by largest group first, or just alphabetically by name
    return result.sort((a, b) => b.nodes.length - a.nodes.length);
  }, [data]);

  if (isLoading || !data || data.length === 0 || groups.length === 0) return null;

  const currentGroup = groups[currentGroupIndex];
  
  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none">
      {/* Navigation Dots */}
      <div className="absolute top-auto bottom-12 md:top-1/2 md:bottom-auto left-0 right-0 md:left-auto md:right-10 flex flex-row md:flex-col justify-center items-center gap-4 md:-translate-y-1/2 pointer-events-auto z-40">
        {groups.map((group, index) => (
          <button
            key={group.id}
            onClick={() => setCurrentGroupIndex(index)}
            aria-label={`Go to ${group.name} skills`}
            className={`w-3 h-3 rounded-full transition-all duration-300 ${
              index === currentGroupIndex 
                ? "bg-cyan-400 scale-150 shadow-[0_0_12px_rgba(0,240,255,0.8)]" 
                : "bg-white/30 hover:bg-white/70 hover:scale-125"
            }`}
          />
        ))}
      </div>

      <div className="absolute top-auto bottom-0 lg:top-0 h-[65vh] lg:h-full lg:inset-y-0 right-0 w-full lg:w-[65vw] xl:w-[55vw] z-10 pointer-events-auto">
        <Canvas camera={{ position: [0, 0, 22], fov: 60 }}>
          {/* Pass ONLY the active group's nodes to the scene to render a unique constellation per page */}
          <ConstellationScene data={currentGroup.nodes} key={currentGroup.id} />
        </Canvas>
      </div>
    </div>
  );
}