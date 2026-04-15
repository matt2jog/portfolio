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
}

function Star({ node, position }: StarProps) {
  // Use solid background instead of backdrop-blur to prevent WebKit edge-clipping shine
  const boxClass = "border-gray-700 bg-[#0a0a0a] shadow-sm scale-100";
      
  const textClass = "text-gray-400";

  return (
    <group position={position}>
      <Html center distanceFactor={15}>
        <div 
          className={`border px-4 py-2 rounded-md whitespace-nowrap flex items-center justify-center select-none ${boxClass}`}
        >
          <p className={`text-xl tracking-wide ${textClass}`}>{node.skill_name}</p>
        </div>
      </Html>
    </group>
  );
}

function ConstellationScene({ data }: { data: ConstellationNode[] }) {
  // Generate static positions based on groupings
  const { positions, edges } = useMemo(() => {
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
    for (const edge of possibleEdges) {
      if (union(edge.u, edge.v)) {
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

    return { positions: posMap, edges: links };
  }, [data]);

  const groupRef = useRef<THREE.Group>(null);
  
  // Slowly rotate the entire constellation
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.001;
      groupRef.current.rotation.x += 0.0005;
    }
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
        />
      ))}
      
      <OrbitControls enableZoom={false} enablePan={false} autoRotate={true} autoRotateSpeed={0.5} />
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