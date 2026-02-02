import { motion } from "framer-motion";
import { ArrowDown } from "lucide-react";

function HexagonalMesh() {
  const size = 60; // hexagon radius
  const hexHeight = size * Math.sqrt(3);
  const hexWidth = size * 2;
  
  const Hexagon = ({ x, y }: { x: number; y: number }) => {
    const points = Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI / 3) * i;
      return `${x + size * Math.cos(angle)},${y + size * Math.sin(angle)}`;
    }).join(' ');
    
    return (
      <polygon
        points={points}
        fill="none"
        stroke="url(#metalGradient)"
        strokeWidth="2.5"
        opacity="0.3"
      />
    );
  };

  // Create honeycomb pattern filling upside-down triangle
  const hexagons = [];
  const cols = 25;
  const rows = 20;
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * (size * 3) - size;
      const y = row * (hexHeight / 2);
      const offsetX = row % 2 === 0 ? 0 : size * 1.5;
      
      hexagons.push(
        <Hexagon 
          key={`${row}-${col}`} 
          x={x + offsetX} 
          y={y} 
        />
      );
    }
  }

  return (
    <svg 
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ mixBlendMode: 'screen' }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="metalGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#808080', stopOpacity: 1 }} />
          <stop offset="50%" style={{ stopColor: '#d0d0d0', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: '#505050', stopOpacity: 1 }} />
        </linearGradient>
        <clipPath id="triangleClip" clipPathUnits="objectBoundingBox">
          <polygon points="0,0 1,0 1,1" />
        </clipPath>
      </defs>
      <g clipPath="url(#triangleClip)">
        {hexagons}
      </g>
    </svg>
  );
}

export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col justify-center px-6 md:px-20 pt-20 overflow-hidden">
      <HexagonalMesh />
      
      <div className="relative z-10 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="space-y-6"
        >

          <h1 className="relative text-6xl md:text-8xl lg:text-9xl font-display font-bold tracking-tighter text-white leading-[0.9]">
            FULL STACK <br />
            <span className="relative inline-block text-transparent bg-clip-text bg-linear-to-r from-gray-500 via-gray-200 to-white">
              ARCHITECT
            </span>
          </h1>

          <p className="max-w-xl text-lg md:text-xl text-gray-400 font-light leading-relaxed border-l-2 border-primary/20 pl-6">
            Designing resilient digital ecosystems. 
            Bridging the gap between conceptual schematics and deployed reality.
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="mt-12 flex flex-col sm:flex-row gap-4 sm:gap-6"
        >
          <button className="group relative px-4 py-2 sm:px-6 sm:py-3 bg-white text-black font-bold tracking-wide text-sm sm:text-base overflow-hidden">
             <span className="relative z-10">EXPLORE WORK</span>
             <div className="absolute inset-0 bg-primary transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
          </button>
          <button className="px-4 py-2 sm:px-6 sm:py-3 border border-white/20 text-white hover:bg-white/5 transition-colors font-mono text-sm">
             REACH OUT
          </button>
        </motion.div>
      </div>

      <motion.div 
        className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/30 animate-bounce"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
      >
        <ArrowDown size={24} />
      </motion.div>
    </section>
  );
}
