import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { SkillsConstellation } from "./SkillsConstellation";

export function Hero() {
  const [, setLocation] = useLocation();

  return (
    <section className="relative min-h-screen flex flex-col justify-center px-6 md:px-20 pt-20 overflow-hidden">
      <div className="relative z-10 w-full max-w-screen-2xl mx-auto flex flex-col lg:grid lg:grid-cols-2 lg:items-center gap-8 lg:gap-12">
        
        {/* Text Container: Order 1 on mobile, Left (Col 1, Row 1) on desktop */}
        <div className="max-w-4xl w-full order-1 lg:col-start-1 lg:row-start-1 lg:self-end pr-0 lg:pr-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="space-y-6"
          >
            <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tighter text-white leading-[0.9]">
              FULL STACK <br />
              <span className="text-transparent bg-clip-text bg-linear-to-r from-gray-500 via-gray-200 to-white">
                ENGINEER
              </span>
            </h1>

            <p className="max-w-xl text-lg md:text-xl text-gray-400 font-light leading-relaxed border-l-2 border-primary/20 pl-6">
              Be the change you want to see in the world<br />See a problem, commit a solution
            </p>
          </motion.div>
        </div>

        {/* Constellation Container: Order 2 on mobile, Right (Col 2, span 2 rows) on desktop */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.5 }}
          className="w-full h-[280px] sm:h-[400px] lg:h-[600px] order-2 lg:col-start-2 lg:row-start-1 lg:row-span-2"
        >
          <SkillsConstellation />
        </motion.div>

        {/* Actions Container: Order 3 on mobile, Left (Col 1, Row 2) on desktop */}
        <div className="w-full order-3 lg:col-start-1 lg:row-start-2 lg:self-start lg:pt-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 1 }}
            className="grid grid-cols-2 sm:flex sm:flex-row gap-4 sm:gap-6"
          >
            <button
              onClick={() => setLocation("/portfolio")}
              className="px-4 py-2 sm:px-6 sm:py-3 border border-white/20 text-white hover:bg-white/5 transition-colors font-bold tracking-wide text-sm sm:text-base text-center"
            >
              Explore work
            </button>
            <button
              onClick={() => setLocation("/tree")}
              className="px-4 py-2 sm:px-6 sm:py-3 border border-white/20 text-white hover:bg-white/5 transition-colors font-bold tracking-wide text-sm sm:text-base text-center"
            >
              Reach out
            </button>
            <button
              onClick={() => setLocation("/activity")}
              className="px-4 py-2 sm:px-6 sm:py-3 border border-white/20 text-white hover:bg-white/5 transition-colors font-bold tracking-wide text-sm sm:text-base text-center"
            >
              What I'm doing
            </button>
            <button
              onClick={() => setLocation("/about")}
              className="px-4 py-2 sm:px-6 sm:py-3 border border-white/20 text-white hover:bg-white/5 transition-colors font-bold tracking-wide text-sm sm:text-base text-center"
            >
              About me
            </button>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
