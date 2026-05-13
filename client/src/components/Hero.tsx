import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { SkillsConstellation } from "./SkillsConstellation";
import { usePersonalInformation } from "../hooks/use-personal-information";

export function Hero() {
  const [, setLocation] = useLocation();
  const { data: personalInfo } = usePersonalInformation();
  const name = personalInfo?.name ? personalInfo.name : 'Matt';
  const navButtons = [
    { label: "Explore work", href: "/portfolio" },
    { label: "Reach out", href: "/tree" },
    { label: "What I'm doing", href: "/activity" },
    { label: "About me", href: "/about" },
  ];

  return (
    <section className="relative min-h-screen overflow-visible md:overflow-hidden">
      
      {/* Desktop background constellation */}
      <div className="absolute inset-0 z-0 hidden md:block">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.5 }}
          className="w-full h-full"
        >
          <SkillsConstellation />
        </motion.div>
      </div>

      {/* Desktop foreground */}
      <div className="relative z-20 hidden min-h-screen w-full max-w-screen-2xl mx-auto px-6 md:px-20 pt-24 pb-8 md:flex flex-col pointer-events-none lg:justify-center lg:pt-20 lg:gap-12">
        <div className="max-w-4xl w-full pointer-events-auto pr-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex flex-col gap-6 lg:gap-8 mt-4 lg:mt-8"
          >
            <div className="flex flex-col gap-0 lg:gap-1">
              <div className="flex flex-col justify-center pl-2 w-full max-w-4xl">
                <h2 className="text-xs md:text-sm lg:text-base font-mono font-medium tracking-wide text-gray-200 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] mb-1">
                  Hey! My name is {name}, and I am an
                </h2>
              </div>

              <div className="flex flex-col justify-center flex-1 w-full max-w-5xl pl-2">
                <h1 className="text-6xl md:text-[5.5rem] lg:text-[7.5rem] font-black tracking-tighter text-white leading-[0.9] drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] w-full">
                  FULL STACK
                </h1>
                <h1 className="text-6xl md:text-[5.5rem] lg:text-[7.5rem] font-black tracking-tighter text-transparent bg-clip-text bg-linear-to-r from-gray-400 via-gray-200 to-white leading-[0.9] drop-shadow-[0_4px_8px_rgba(255,255,255,0.1)] w-full">
                  ENGINEER
                </h1>
              </div>
            </div>

            <div className="flex flex-row items-stretch justify-start gap-4 md:gap-6 lg:gap-8 mx-2 pl-2 w-full max-w-4xl py-2">
              <img 
                src="/assets/headshot.png" 
                alt="Matthew Tujague" 
                className="w-24 h-24 md:w-32 md:h-32 lg:w-40 lg:h-40 aspect-square object-cover shadow-2xl shrink-0 border border-white/10"
              />
              <div className="flex flex-col justify-center gap-2 pl-4 md:pl-6 py-2 border-l-2 border-cyan-400">
                <span className="text-[10px] md:text-xs font-mono tracking-widest uppercase text-cyan-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                  My Motto
                </span>
                <blockquote className="text-sm md:text-base lg:text-lg font-medium leading-relaxed drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] italic flex flex-col">
                  <span className="text-gray-200">"Be the change you want to see in the world,</span>
                  <span className="text-gray-200">see a problem, commit the solution."</span>
                </blockquote>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="w-full pointer-events-auto mt-4 mb-4 lg:pt-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 1 }}
            className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-6 w-full lg:w-fit"
          >
            {navButtons.map((button) => (
              <button
                key={button.href}
                onClick={() => setLocation(button.href)}
                className="px-4 py-2 sm:px-6 sm:py-3 bg-black/40 backdrop-blur-md border border-white/20 text-white hover:bg-white/10 transition-colors font-bold tracking-wide text-sm sm:text-base text-center rounded-sm"
              >
                {button.label}
              </button>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Mobile foreground */}
      <div className="relative z-10 flex md:hidden min-h-screen w-full flex-col px-5 pt-24 pb-6 overflow-x-hidden">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="flex flex-col gap-4"
        >
          <h2 className="text-[0.78rem] font-mono font-medium tracking-wide text-gray-200 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
            Hey! I'm {name}, and I am an
          </h2>

          <div className="grid grid-cols-[minmax(0,1fr)_clamp(3.9rem,21vw,5.25rem)] items-center gap-3">
            <div className="min-w-0">
              <h1 className="text-[clamp(2.35rem,11.6vw,3.25rem)] font-black tracking-normal text-white leading-[0.9] whitespace-nowrap drop-shadow-[0_4px_8px_rgba(0,0,0,1)]">
                FULL STACK
              </h1>
              <h1 className="text-[clamp(2.35rem,11.6vw,3.25rem)] font-black tracking-normal text-transparent bg-clip-text bg-linear-to-r from-gray-400 via-gray-200 to-white leading-[0.9] whitespace-nowrap">
                ENGINEER
              </h1>
            </div>
            <img 
              src="/assets/headshot.png" 
              alt="Matthew Tujague" 
              className="w-full aspect-square object-cover shrink-0 shadow-[0_0_15px_rgba(0,0,0,0.3)] border border-white/10 self-center"
            />
          </div>

          <div className="flex flex-col justify-center gap-1 border-l-2 border-cyan-400 pl-3 py-1">
            <span className="text-[9px] font-mono tracking-widest uppercase text-cyan-400 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
              My Motto
            </span>
            <blockquote className="text-[0.78rem] font-medium leading-relaxed drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] italic text-gray-200">
              "Be the change you want to see in the world, see a problem, commit the solution."
            </blockquote>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.5 }}
          className="relative z-10 mt-5 w-full"
        >
          <SkillsConstellation />
        </motion.div>

        <div className="relative z-20 mt-5 w-full pointer-events-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 1 }}
            className="grid grid-cols-2 gap-2.5 w-full max-w-sm mx-auto"
          >
            {navButtons.map((button) => (
              <button
                key={button.href}
                onClick={() => setLocation(button.href)}
                className="min-h-11 px-3 py-2 bg-black/60 backdrop-blur-md border border-cyan-400/30 text-white hover:bg-white/10 transition-colors font-bold tracking-wide text-[0.72rem] text-center rounded-sm shadow-xl"
              >
                {button.label}
              </button>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
