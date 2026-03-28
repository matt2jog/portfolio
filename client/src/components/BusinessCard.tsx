import ThreeDCard from "./ThreeDCard";
import { Phone, Mail, Globe } from "lucide-react";

export default function BusinessCard() {
  return (
    <ThreeDCard
      className="w-[340px] h-[580px]"
      maxRotation={12}
      glowOpacity={0.15}
      shadowBlur={40}
      parallaxOffset={40}
      enableGlow={true}
      enableShadow={false}
    >
      <div className="w-full h-full bg-[#0B0C10] text-white flex flex-col items-center px-10 py-8 font-sans border border-white/10 rounded-2xl relative overflow-hidden">
        
        {/* Top subtle gradient */}
        <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />

        {/* Flat 2D Ouroboros Logo Vector */}
        <div className="flex flex-col items-center w-full gap-3 z-10 relative mt-6">
          <img 
            src="/logo-flat.png" 
            alt="Ouroboros Logo"
            className="w-36 h-auto object-contain mix-blend-screen"
          />
          
          <div className="text-[#00ffff] font-sans text-center text-[9px] tracking-[0.2em] uppercase leading-relaxed opacity-80">
            Continuous Improvement
            <br />
            Continuous Development
          </div>
        </div>

        {/* Name / Title */}
        <div className="text-center w-full mt-auto z-10 flex flex-col items-center">
          <h1 className="font-display font-medium text-[#00FFFF] text-[32px] leading-none tracking-tight drop-shadow-[0_0_10px_rgba(0,255,255,0.2)] uppercase">
            Matthew
            <br />
            Tujague
          </h1>
          <h2 className="text-[#e2e2e2] font-sans tracking-[0.15em] text-[10px] uppercase font-light mt-3 mb-4">
            Software Engineer
          </h2>
          
          {/* Divider */}
          <div className="w-[80%] h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent relative mb-6">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[25%] h-[1px] bg-[#00FFFF] shadow-[0_0_8px_rgba(0,255,255,0.8)]" />
          </div>
        </div>

        {/* Contact Info — grid for perfect icon alignment */}
        <div className="z-10 mb-4 w-full max-w-[220px] mx-auto">
          <div className="grid grid-cols-[16px_1fr] gap-x-3 gap-y-3 font-sans text-[11px] text-gray-300 items-center">
            <Phone size={14} className="text-[#00FFFF] opacity-70" />
            <span className="tracking-widest">(732) 639-3889</span>
            
            <Mail size={14} className="text-[#00FFFF] opacity-70" />
            <span className="tracking-widest">matthew@2jog.dev</span>
            
            <Globe size={14} className="text-[#00FFFF] opacity-70" />
            <span className="tracking-widest">https://2jog.dev</span>
          </div>
        </div>
      </div>
    </ThreeDCard>
  );
}
