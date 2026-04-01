import { useCallback, useEffect, useRef, useState } from "react";
import ThreeDCard from "./ThreeDCard";
import { Phone, Mail, Globe } from "lucide-react";
import { usePersonalInformation } from "@/hooks/use-personal-information";
import { useBio } from "@/hooks/use-bio";
import headshotImg from "@/assets/images/headshot.jpg";

interface BusinessCardProps {
  isOpen?: boolean;
}

const PROFESSIONAL_SUMMARY_EASTER_EGG = "// :)";
const PROFESSIONAL_SUMMARY_EASTER_EGG_DELAY_MS = 10000;
const PROFESSIONAL_SUMMARY_EASTER_EGG_TYPE_MS = 90;

export default function BusinessCard({ isOpen = false }: BusinessCardProps) {
  const { data: info } = usePersonalInformation();
  const { data: bioData } = useBio();
  const bioParagraphs = bioData?.paragraphs?.map((p) => p.content) ?? [];
  const [easterEggText, setEasterEggText] = useState("");
  const [dogearState, setDogearState] = useState<'idle' | 'hovered' | 'releasing' | 'resuming'>('idle');
  const dogearRef = useRef<HTMLDivElement>(null);

  const handleDogearMouseEnter = useCallback(() => setDogearState('hovered'), []);
  const handleDogearMouseLeave = useCallback(() => setDogearState('releasing'), []);

  useEffect(() => {
    if (dogearState !== 'releasing') return;
    const el = dogearRef.current?.querySelector('.bcard-dogear__back');
    if (!el) return;
    const onEnd = () => setDogearState('resuming');
    el.addEventListener('transitionend', onEnd, { once: true });
    return () => el.removeEventListener('transitionend', onEnd);
  }, [dogearState]);

  useEffect(() => {
    let revealTimeout: ReturnType<typeof setTimeout> | undefined;
    let revealInterval: ReturnType<typeof setInterval> | undefined;

    setEasterEggText("");

    if (!isOpen) {
      return;
    }

    revealTimeout = setTimeout(() => {
      let nextIndex = 0;

      revealInterval = setInterval(() => {
        nextIndex += 1;
        setEasterEggText(PROFESSIONAL_SUMMARY_EASTER_EGG.slice(0, nextIndex));

        if (nextIndex >= PROFESSIONAL_SUMMARY_EASTER_EGG.length && revealInterval) {
          clearInterval(revealInterval);
        }
      }, PROFESSIONAL_SUMMARY_EASTER_EGG_TYPE_MS);
    }, PROFESSIONAL_SUMMARY_EASTER_EGG_DELAY_MS);

    return () => {
      if (revealTimeout) {
        clearTimeout(revealTimeout);
      }

      if (revealInterval) {
        clearInterval(revealInterval);
      }
    };
  }, [isOpen]);

  return (
    <ThreeDCard
      className="w-full h-full"
      roundedClass="rounded-2xl"
      isFlipped={isOpen}
      maxRotation={12}
      glowOpacity={0.15}
      shadowBlur={40}
      parallaxOffset={0}
      enableGlow={true}
      enableShadow={false}
    >
      <div className="w-full h-full bg-[#0B0C10] text-white overflow-visible rounded-2xl relative">
        <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-white/5 to-transparent pointer-events-none z-20" />
        <div className="absolute top-8 left-8 right-0 flex items-center z-30 pointer-events-none">
          <img
            src="/logo-flat.png"
            alt="Ouroboros Logo"
            className="w-12 h-auto object-contain mix-blend-screen opacity-50"
          />
        </div>

        <div className="absolute inset-0 bg-[#0B0C10] overflow-hidden rounded-2xl">
        
        {/* Front Face Wrapper */}
        <div 
          className={`absolute flex justify-center top-0 left-0 w-full h-full transition-opacity ${
            isOpen 
              ? "opacity-0 duration-300 delay-0 pointer-events-none" 
              : "opacity-100 duration-500 delay-[600ms] pointer-events-auto"
          }`}
        >
          {/* Inner explicitly sized content to prevent layout squish */}
          <div className="w-[340px] h-full flex flex-col items-center px-10 py-10 relative">
            {/* Dog-ear peel — bottom-right corner */}
            <div
              ref={dogearRef}
              className={`bcard-dogear${dogearState !== 'idle' ? ` bcard-dogear--${dogearState}` : ''}`}
              aria-hidden="true"
              onMouseEnter={handleDogearMouseEnter}
              onMouseLeave={handleDogearMouseLeave}
            >
              <div className="bcard-dogear__paper" />
              <div className="bcard-dogear__shadow" />
              <div className="bcard-dogear__back" />
            </div>
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
              <h1 className="font-semibold text-white text-[24px] leading-none drop-shadow-[0_2px_10px_rgba(255,255,255,0.15)] uppercase whitespace-nowrap">
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
              <div className="grid grid-cols-[16px_1fr] gap-x-3 gap-y-4 text-[11px] text-gray-300 items-center">
                <Phone size={14} className="text-[#00FFFF] opacity-70" />
                <a href={`tel:${info?.phone || "7326393889"}`} onClick={e => e.stopPropagation()} className="tracking-widest hover:text-[#00FFFF] transition-colors">{info?.phoneFormatted || "(732) 639-3889"}</a>

                <Mail size={14} className="text-[#00FFFF] opacity-70" />
                <a href={`mailto:${info?.email || "matthew@2jog.dev"}`} onClick={e => e.stopPropagation()} className="tracking-widest hover:text-[#00FFFF] transition-colors">{info?.email || "matthew@2jog.dev"}</a>

                <Globe size={14} className="text-[#00FFFF] opacity-70" />
                <a href={info?.portfolioUrl || "https://2jog.dev"} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="tracking-widest hover:text-[#00FFFF] transition-colors">{info?.portfolioUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '') || "2jog.dev"}</a>
              </div>
            </div>
          </div>
        </div>

        {/* Back Face Wrapper */}
        <div 
          className={`absolute flex justify-center top-0 left-0 w-full h-full transition-opacity ${
            isOpen 
              ? "opacity-100 duration-500 delay-[600ms] pointer-events-auto" 
              : "opacity-0 duration-300 delay-0 pointer-events-none"
          }`}
        >
          {/* Inner explicitly sized content */}
          <div
            className="relative w-[340px] md:w-[760px] h-[640px] flex flex-col overflow-y-auto px-8 pt-20 pb-10 md:px-12 md:justify-center"
            style={{ transform: "rotateY(180deg)" }}
          >
            {/* Accent bar on left seam (which appears on right side when rotated, but since we are looking at the back, we can just align it conceptually) */}
            <div className="absolute top-0 left-0 w-[1px] h-full bg-gradient-to-b from-[#00FFFF]/20 via-[#00FFFF]/10 to-transparent md:block hidden" />

            <div className="max-w-2xl mx-auto w-full">
              <h2 className="font-sans text-xs uppercase tracking-[0.2em] text-[#00FFFF] mb-6 opacity-90 text-center md:text-left">
                Professional Summary
              </h2>

              <div className="text-sm md:text-base leading-7 md:leading-8 text-gray-300">
                {bioParagraphs.length > 0 ? bioParagraphs.map((paragraph, index) => (
                  <span key={index}>
                    {paragraph}
                    {index === bioParagraphs.length - 1 && easterEggText.length === 0 ? (
                      <span className="business-card-vim-cursor" aria-hidden="true" />
                    ) : null}
                    {index < bioParagraphs.length - 1 && <><br /><br /></>}
                  </span>
                )) : (
                  <p>Loading summary...</p>
                )}
                {easterEggText.length > 0 ? (
                  <p className="font-mono text-[#00FFFF]/85 business-card-summary-easter-egg">
                    {easterEggText}
                    <span className="business-card-vim-cursor" aria-hidden="true" />
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        </div>

      </div>
    </ThreeDCard>
  );
}
