import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Float, Html, PresentationControls, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { Phone, Mail, Globe } from "lucide-react";

function CardGeometry() {
  const meshRef = useRef<THREE.Mesh>(null);

  // Subtle pulsing rotation effect added to the float
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.05;
    }
  });

  return (
    <Float rotationIntensity={0.2} floatIntensity={0.5} speed={1.5}>
      <mesh ref={meshRef}>
        <RoundedBox args={[3.4, 5.8, 0.04]} radius={0.05} smoothness={4}>
          <meshStandardMaterial color="#0b0b0d" roughness={0.8} metalness={0.2} />
        </RoundedBox>

        {/* Front Face HTML Overlay (perfectly matching the business card image constraints) */}
        <Html
          transform
          position={[0, 0, 0.021]}
          zIndexRange={[100, 0]}
          occlude="blending"
          className="pointer-events-none select-none"
        >
          <div
            className="flex flex-col items-center justify-start bg-[#0b0b0d] rounded-sm overflow-hidden"
            style={{ width: "340px", height: "580px", padding: "40px" }}
          >
            {/* Top Logo Area */}
            <div className="flex flex-col items-center mt-6 w-full gap-5">
              <div className="relative w-36 h-36 flex items-center justify-center">
                {/* Dynamically generated Logo */}
                <img 
                  src="/logo.png" 
                  alt="System Core Logo" 
                  className="w-full h-full object-contain filter drop-shadow-[0_0_12px_rgba(0,255,255,0.6)] mix-blend-screen"
                />
              </div>
              
              <div className="text-[#00ffff] font-sans text-center text-[9px] tracking-[0.2em] uppercase leading-tight mt-2 opacity-90 drop-shadow-[0_0_8px_rgba(0,255,255,0.5)]">
                Continuous Improvement
                <br />
                Continuous Development
              </div>
            </div>

            {/* Name / Title */}
            <div className="text-center w-full mt-12">
              <h1 className="font-display font-medium text-[#00FFFF] text-[34px] leading-[1.05] tracking-tight drop-shadow-[0_0_12px_rgba(0,255,255,0.3)] uppercase">
                Matthew
                <br />
                Tujague
              </h1>
              <div className="flex flex-col items-center mt-3 w-full relative">
                <h2 className="text-[#e2e2e2] font-sans tracking-[0.15em] text-[11px] uppercase font-normal mb-3">
                  Software Engineer
                </h2>
                <div className="w-[85%] h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                <div className="absolute bottom-[0px] w-[30%] h-[1px] bg-[#00FFFF] shadow-[0_0_8px_rgba(0,255,255,1)]" />
              </div>
            </div>

            {/* Contact Info */}
            <div className="w-full flex-1 flex flex-col justify-end gap-3 font-sans text-xs text-gray-300 mt-auto pb-4 pl-4 pr-1">
              <div className="flex items-center gap-4">
                <Phone size={14} className="text-[#00FFFF] stroke-[2px]" />
                <span className="tracking-wide">(732) 639-3889</span>
              </div>
              <div className="flex items-center gap-4">
                <Mail size={14} className="text-[#00FFFF] stroke-[2px]" />
                <span className="tracking-wide">matthew@2jog.dev</span>
              </div>
              <div className="flex items-center gap-4">
                <Globe size={14} className="text-[#00FFFF] stroke-[2px]" />
                <span className="tracking-wide tracking-wider">https://2jog.dev</span>
              </div>
            </div>
          </div>
        </Html>
        
        {/* Back Face */}
        <Html
          transform
          position={[0, 0, -0.021]}
          rotation={[0, Math.PI, 0]}
          zIndexRange={[100, 0]}
          occlude="blending"
          className="pointer-events-none select-none"
        >
          <div
            className="flex flex-col items-center justify-center bg-[#0b0b0d] rounded-sm"
            style={{ width: "340px", height: "580px" }}
          >
            <div className="relative w-24 h-24 mb-6 opacity-40">
                <img 
                  src="/logo.png" 
                  alt="Matthew Tujague Logo" 
                  className="w-full h-full object-contain mix-blend-screen"
                />
            </div>
            <div className="font-sans text-[9px] text-[#00FFFF]/50 tracking-[0.4em] uppercase">Matthew Tujague // 2jog.dev</div>
          </div>
        </Html>
      </mesh>
    </Float>
  );
}

export default function BusinessCard3D() {
  return (
    <div className="w-full h-full min-h-[500px] lg:min-h-[640px] cursor-grab active:cursor-grabbing flex items-center justify-center relative">
      <Canvas camera={{ position: [0, 0, 7.5], fov: 45 }}>
        <color attach="background" args={["transparent"]} />
        <ambientLight intensity={0.4} />
        <spotLight position={[5, 10, 10]} angle={0.25} penumbra={1} intensity={1} castShadow />
        <directionalLight position={[-5, -5, -5]} intensity={0.2} />
        <Environment preset="city" />
        
        <PresentationControls
          global
          rotation={[0.0, -0.15, 0]}
          polar={[-0.4, 0.4]}
          azimuth={[-Math.PI / 4, Math.PI / 4]}
          snap
        >
          <CardGeometry />
        </PresentationControls>
      </Canvas>
    </div>
  );
}
