import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { SkillsConstellation } from "./SkillsConstellation";
import { usePersonalInformation } from "../hooks/use-personal-information";

export function Hero() {
  const [, setLocation] = useLocation();
  const { data: personalInfo } = usePersonalInformation();
  const name = personalInfo?.name ? personalInfo.name : 'Matt';

  return (
    <section className="relative min-h-[105vh] sm:min-h-screen flex flex-col px-6 md:px-20 pt-24 pb-12 sm:pb-0 lg:justify-center lg:pt-20 overflow-visible sm:overflow-hidden">
      
      {/* Background Constellation Container (Expanded full screen, sitting behind text) */}
      <div className="absolute inset-0 z-0 sm:pt-0">
        {/* Subtle gradient overlay on mobile to improve text readability */}
        <div className="absolute inset-0 bg-linear-to-b from-black/90 via-black/50 to-transparent lg:hidden z-10 pointer-events-none" />
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.5 }}
          className="w-full h-full translate-y-[8vh] sm:translate-y-0"
        >
          <SkillsConstellation />
        </motion.div>
      </div>

      <div className="relative z-20 w-full max-w-screen-2xl mx-auto flex flex-col h-full pointer-events-none gap-6 mt-4 lg:mt-0 lg:justify-center lg:gap-12">
        
        {/* Text Container: Foreground over background constellation */}
        <div className="max-w-4xl w-full pointer-events-auto pr-8 lg:pr-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="space-y-6 lg:space-y-8"
          >
            <div className="flex flex-col gap-1 sm:gap-2">
              <h2 className="text-xs sm:text-sm md:text-lg lg:text-xl font-mono font-medium tracking-tight sm:tracking-wide text-gray-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] pl-1 md:pl-2">
                Hey! My name is {name}, and I'm a
              </h2>
              <h1 className="text-5xl sm:text-6xl md:text-8xl lg:text-9xl font-bold tracking-tighter text-white leading-[0.9] drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]">
                FULL STACK <br />
                <span className="text-transparent bg-clip-text bg-linear-to-r from-gray-500 via-gray-200 to-white drop-shadow-[0_4px_8px_rgba(255,255,255,0.2)]">
                  ENGINEER
                </span>
              </h1>
            </div>

            <div className="flex flex-row items-center justify-start gap-2 sm:gap-6 max-w-2xl py-2 mb-2">
              <img 
                src="/assets/headshot.png" 
                alt="Matthew Tujague" 
                className="w-10 h-10 sm:w-24 sm:h-24 rounded-md object-cover shadow-lg border border-white/20 shrink-0"
              />
              <div className="flex flex-col gap-1 sm:gap-2 border-l-2 border-primary/40 pl-2 sm:pl-4 lg:pl-6 bg-black/40 lg:bg-black/10 py-1 sm:py-2">
                <span className="text-[9px] sm:text-sm font-mono tracking-widest uppercase text-gray-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                  My Motto?
                </span>
                <p className="text-xs sm:text-lg md:text-xl text-gray-200 font-medium leading-tight sm:leading-relaxed drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                  Be the change you want to see in the world<br className="hidden sm:block" />
                  <span className="sm:hidden"> </span>See a problem, commit the solution
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Actions Container: Foreground floating buttons */}
        <div className="w-full pointer-events-auto mt-4 mb-4 sm:mb-0 sm:mt-0 lg:pt-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 1 }}
            className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-6 w-full lg:w-fit"
          >
            <button
              onClick={() => setLocation("/portfolio")}
              className="px-4 py-2 sm:px-6 sm:py-3 bg-black/40 backdrop-blur-md border border-white/20 text-white hover:bg-white/10 transition-colors font-bold tracking-wide text-sm sm:text-base text-center rounded-sm"
            >
              Explore work
            </button>
            <button
              onClick={() => setLocation("/tree")}
              className="px-4 py-2 sm:px-6 sm:py-3 bg-black/40 backdrop-blur-md border border-white/20 text-white hover:bg-white/10 transition-colors font-bold tracking-wide text-sm sm:text-base text-center rounded-sm"
            >
              Reach out
            </button>
            <button
              onClick={() => setLocation("/activity")}
              className="px-4 py-2 sm:px-6 sm:py-3 bg-black/40 backdrop-blur-md border border-white/20 text-white hover:bg-white/10 transition-colors font-bold tracking-wide text-sm sm:text-base text-center rounded-sm"
            >
              What I'm doing
            </button>
            <button
              onClick={() => setLocation("/about")}
              className="px-4 py-2 sm:px-6 sm:py-3 bg-black/40 backdrop-blur-md border border-white/20 text-white hover:bg-white/10 transition-colors font-bold tracking-wide text-sm sm:text-base text-center rounded-sm"
            >
              About me
            </button>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
