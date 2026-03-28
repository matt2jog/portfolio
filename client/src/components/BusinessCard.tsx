import ThreeDCard from "./ThreeDCard";
import { Phone, Mail, Globe } from "lucide-react";
import { usePersonalInformation } from "@/hooks/use-personal-information";
import headshotImg from "@/assets/images/headshot.jpg";

interface BusinessCardProps {
  isOpen?: boolean;
}

export default function BusinessCard({ isOpen = false }: BusinessCardProps) {
  const { data: info } = usePersonalInformation();

  const roundedClass = isOpen
    ? "rounded-l-2xl rounded-r-none"
    : "rounded-2xl";

  const innerRoundedClass = isOpen
    ? "rounded-l-2xl rounded-r-none"
    : "rounded-2xl";

  const firstName = info?.name?.split(" ")[0] || "Matthew";
  const lastName = info?.name?.split(" ").slice(1).join(" ") || "Tujague";

  return (
    <ThreeDCard
      className="w-[340px] h-[640px]"
      roundedClass={roundedClass}
      maxRotation={isOpen ? 0 : 12}
      glowOpacity={0.15}
      shadowBlur={40}
      parallaxOffset={isOpen ? 0 : 40}
      enableGlow={!isOpen}
      enableShadow={false}
    >
      <div className={`w-full h-full bg-[#0B0C10] text-white flex flex-col items-center px-10 py-10 font-sans border border-white/10 ${innerRoundedClass} relative overflow-hidden transition-[border-radius] duration-500`}>
        
        {/* Top subtle gradient */}
        <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />

        {/* Top-left subtle logo */}
        <img 
          src="/logo-flat.png" 
          alt="Ouroboros Logo"
          className="absolute top-8 left-8 w-12 h-auto object-contain mix-blend-screen opacity-50 z-20"
        />

        {/* Center Headshot */}
        <div className="flex flex-col items-center w-full z-10 relative mt-8">
          <div className="w-44 h-44 rounded-full overflow-hidden border-2 border-[#00FFFF]/30 shadow-[0_0_20px_rgba(0,255,255,0.15)] relative">
            <img 
              src={headshotImg} 
              alt="Matthew Tujague"
              className="w-full h-full object-cover"
            />
            {/* Inner glow overlay */}
            <div className="absolute inset-0 rounded-full shadow-[inset_0_0_15px_rgba(0,255,255,0.3)] pointer-events-none" />
          </div>
        </div>

        {/* Flexible spacer */}
        <div className="flex-1 min-h-8" />

        {/* Name / Title */}
        <div className="text-center w-full z-10 flex flex-col items-center">
          <h1 className="font-display font-semibold text-white text-[24px] leading-none tracking-tight drop-shadow-[0_2px_10px_rgba(255,255,255,0.15)] uppercase whitespace-nowrap">
            {info?.name || "Matthew Tujague"}
          </h1>
          <h2 className="text-[#e2e2e2] font-sans tracking-[0.15em] text-[10px] uppercase font-light mt-4 mb-5 text-center leading-[1.6]">
            {info?.title || "Software Engineer"}
            <br />
            <span className="text-[8px] text-[#00FFFF]/80">{info?.location || "NJ-NY-PA"}</span>
          </h2>
          
          {/* Divider */}
          <div className="w-[80%] h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent relative">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[25%] h-[1px] bg-[#00FFFF] shadow-[0_0_8px_rgba(0,255,255,0.8)]" />
          </div>
        </div>

        {/* Flexible spacer */}
        <div className="flex-1 min-h-8" />

        {/* Contact Info — grid for perfect icon alignment */}
        <div className="z-10 w-full max-w-[220px] mx-auto">
          <div className="grid grid-cols-[16px_1fr] gap-x-3 gap-y-4 font-sans text-[11px] text-gray-300 items-center">
            <Phone size={14} className="text-[#00FFFF] opacity-70" />
            <span className="tracking-widest">{info?.phoneFormatted || "(732) 639-3889"}</span>
            
            <Mail size={14} className="text-[#00FFFF] opacity-70" />
            <span className="tracking-widest">{info?.email || "matthew@2jog.dev"}</span>
            
            <Globe size={14} className="text-[#00FFFF] opacity-70" />
            <span className="tracking-widest">{info?.portfolioUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '') || "2jog.dev"}</span>
          </div>
        </div>
      </div>
    </ThreeDCard>
  );
}
