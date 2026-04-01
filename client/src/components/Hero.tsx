import { motion } from "framer-motion";
import { useLocation } from "wouter";

export function Hero() {
  const [, setLocation] = useLocation();

  return (
    <section className="relative min-h-screen flex flex-col justify-center px-6 md:px-20 pt-20 overflow-hidden">

      <div className="relative z-10 max-w-4xl">
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

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="mt-12 flex flex-col sm:flex-row gap-4 sm:gap-6"
        >
          <button
            onClick={() => setLocation("/portfolio")}
            className="px-4 py-2 sm:px-6 sm:py-3 border border-white/20 text-white hover:bg-white/5 transition-colors font-bold tracking-wide text-sm sm:text-base"
          >
            Explore work
          </button>
          <button
            onClick={() => setLocation("/tree")}
            className="px-4 py-2 sm:px-6 sm:py-3 border border-white/20 text-white hover:bg-white/5 transition-colors font-bold tracking-wide text-sm sm:text-base"
          >
            Reach out
          </button>
          <button
            onClick={() => setLocation("/activity")}
            className="px-4 py-2 sm:px-6 sm:py-3 border border-white/20 text-white hover:bg-white/5 transition-colors font-bold tracking-wide text-sm sm:text-base"
          >
            What I'm doing
          </button>
          <button
            onClick={() => setLocation("/about")}
            className="px-4 py-2 sm:px-6 sm:py-3 border border-white/20 text-white hover:bg-white/5 transition-colors font-bold tracking-wide text-sm sm:text-base"
          >
            About me
          </button>
        </motion.div>
      </div>

    </section>
  );
}
