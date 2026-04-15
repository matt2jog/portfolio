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
  // Use CSS styles to determine the box and text appearance
  const boxClass = "border-gray-700 bg-black/60 shadow-sm scale-100";
      
  const textClass = "text-gray-400";

  return (
    <group position={position}>
      <Html center distanceFactor={15}>
        <div 
          className={`border px-4 py-2 rounded-md backdrop-blur-sm whitespace-nowrap flex items-center justify-center select-none ${boxClass}`}
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
        const r = 5.5; 
        
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        
        posMap.set(node.skill_id, [x, y, z]);
        index++;
      });
    });

    // Create edges connecting members of the same group, plus some random cross-links for the constellation shape
    const links: { source: [number, number, number], target: [number, number, number], groupId: string | null }[] = [];
    Object.entries(groups).forEach(([gid, groupNodes]) => {
      // Connect group members closely if they share a structural grouping
      if (gid !== 'ungrouped' && groupNodes.length > 1) {
        for (let i = 0; i < groupNodes.length; i++) {
          for (let j = i + 1; j < groupNodes.length; j++) {
            links.push({
              source: posMap.get(groupNodes[i].skill_id)!,
              target: posMap.get(groupNodes[j].skill_id)!,
              groupId: gid
            });
          }
        }
      }
    });

    // Create a base mesh network so every node connects to its 2 nearest Euclidean neighbors regardless of group
    const allIds = Array.from(posMap.keys());
    for (let i = 0; i < allIds.length; i++) {
      const p1 = posMap.get(allIds[i])!;
      // find nearest neighbors
      const dists = allIds.map(id => {
        if (id === allIds[i]) return { id, d: Infinity };
        const p2 = posMap.get(id)!;
        const d = Math.sqrt((p1[0]-p2[0])**2 + (p1[1]-p2[1])**2 + (p1[2]-p2[2])**2);
        return { id, d };
      }).sort((a,b) => a.d - b.d);

      // Connect to nearest 2
      for(let k = 0; k < 2; k++) {
        if(dists[k] && dists[k].d < Infinity) {
           const id2 = dists[k].id;
           // avoid duplicate opposite direction
           const exists = links.some(l => 
              (l.source === p1 && l.target === posMap.get(id2)!) || 
              (l.target === p1 && l.source === posMap.get(id2)!)
           );
           if (!exists) {
             const node2Gid = nodeConfigs.get(id2)?.group_id;
             const node1Gid = nodeConfigs.get(allIds[i])?.group_id;
             const sharedGid = node1Gid && node1Gid === node2Gid ? node1Gid : null;

             links.push({
               source: p1,
               target: posMap.get(id2)!,
               groupId: sharedGid
             });
           }
        }
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
      
      {edges.map((edge, i) => {
        let opacity = 0.2;
        let color = "#888888";
        
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
  
  const handlePrev = () => {
    setCurrentGroupIndex((prev) => (prev > 0 ? prev - 1 : groups.length - 1));
  };

  const handleNext = () => {
    setCurrentGroupIndex((prev) => (prev < groups.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className="w-full h-full min-h-[280px] sm:min-h-[400px] relative pt-8">
      {/* Title Centered at Top */}
      <div className="absolute top-0 left-0 right-0 flex justify-center w-full pointer-events-none z-20">
        <div className="flex flex-col items-center pointer-events-auto select-none bg-black/60 px-6 py-2 rounded-full border border-white/5 backdrop-blur-md">
          <h3 className="text-xl font-bold tracking-widest text-cyan-300">
            {currentGroup.name === "Other Skills" ? "Miscellaneous" : currentGroup.name}
          </h3>
          <p className="text-xs text-gray-400 font-medium tracking-wider">
            {currentGroupIndex + 1} / {groups.length}
          </p>
        </div>
      </div>

      {/* Navigation Buttons on Sides */}
      <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-2 sm:px-6 pointer-events-none z-20">
        <button 
          onClick={handlePrev}
          className="pointer-events-auto flex items-center justify-center p-2 sm:p-3 bg-black/40 hover:bg-white/10 border border-white/20 rounded-full transition-all text-white/70 hover:text-white"
          aria-label="Previous skill group"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>

        <button 
          onClick={handleNext}
          className="pointer-events-auto flex items-center justify-center p-2 sm:p-3 bg-black/40 hover:bg-white/10 border border-white/20 rounded-full transition-all text-white/70 hover:text-white"
          aria-label="Next skill group"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>

      <div className="absolute inset-0 z-10 w-full h-full">
        <Canvas camera={{ position: [0, 0, 15], fov: 60 }}>
          {/* Pass ONLY the active group's nodes to the scene to render a unique constellation per page */}
          <ConstellationScene data={currentGroup.nodes} key={currentGroup.id} />
        </Canvas>
      </div>
    </div>
  );
}