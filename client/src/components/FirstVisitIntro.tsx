import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play } from "lucide-react";
import { IntroDither } from "./IntroDither";

export const INTRO_STORAGE_KEY = "__root_intro_seen_until";
export const INTRO_TTL_MS = 3 * 24 * 60 * 60 * 1000;

type IntroStage = "phrase" | "name";

function getTimePhrase() {
  const hour = new Date().getHours();
  const options =
    hour < 5
      ? ["It's late, but I'm happy to see you here", "Welcome!"]
      : hour < 12
        ? ["Good morning!", "Glad to see you here", "Welcome!"]
        : hour < 18
          ? ["Glad to see you here", "Salutations", "Welcome!"]
          : ["Salutations", "Glad to see you here", "Welcome!"];

  return options[Math.floor(Math.random() * options.length)];
}

export function shouldShowFirstVisitIntro() {
  if (typeof window === "undefined") return false;

  const expiresAt = Number(window.localStorage.getItem(INTRO_STORAGE_KEY));
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
}

function storeIntroVisit() {
  window.localStorage.setItem(INTRO_STORAGE_KEY, String(Date.now() + INTRO_TTL_MS));
}

interface FirstVisitIntroProps {
  onComplete: () => void;
}

export function FirstVisitIntro({ onComplete }: FirstVisitIntroProps) {
  const phrase = useMemo(() => getTimePhrase(), []);
  const [stage, setStage] = useState<IntroStage>("phrase");
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const nameTimer = window.setTimeout(() => setStage("name"), 4000);
    const promptTimer = window.setTimeout(() => setShowPrompt(true), 8000);

    return () => {
      window.clearTimeout(nameTimer);
      window.clearTimeout(promptTimer);
    };
  }, []);

  const speakName = () => {
    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("Matthew Too zhog");
    utterance.rate = 0.82;
    utterance.pitch = 0.96;
    window.speechSynthesis.speak(utterance);
  };

  const continueToSite = () => {
    storeIntroVisit();
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-black text-white">
      <div className="absolute inset-0 opacity-80">
        <IntroDither
          waveColor={[0.36, 0.74, 0.78]}
          enableMouseInteraction
          mouseRadius={0.3}
          colorNum={4}
          waveAmplitude={0.3}
          waveFrequency={3}
          waveSpeed={0.05}
          pixelSize={2}
        />
      </div>

      <div className="absolute inset-0 bg-black/55" />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <AnimatePresence>
          {stage === "phrase" ? (
            <motion.h1
              key="phrase"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 2, ease: "easeOut" }}
              className="max-w-4xl text-balance text-4xl font-black leading-tight tracking-normal text-white sm:text-6xl"
            >
              {phrase}
            </motion.h1>
          ) : (
            <motion.div
              key="name"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 2, ease: "easeOut" }}
              className="flex flex-col items-center"
            >
              <h1 className="max-w-5xl text-balance text-4xl font-black leading-tight tracking-normal text-white sm:text-6xl">
                My name is Matthew Tujague
              </h1>

              <div className="mt-5 flex items-center gap-3 font-mono text-sm text-cyan-200/90 sm:text-base">
                <span aria-label="phonetic pronunciation">too-zhog</span>
                <button
                  type="button"
                  onClick={speakName}
                  aria-label="Play pronunciation"
                  className="grid h-9 w-9 place-items-center border border-cyan-300/50 bg-black/40 text-cyan-100 shadow-[0_0_18px_rgba(0,240,255,0.18)] transition-colors hover:bg-cyan-300/10"
                >
                  <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                </button>
              </div>

              <AnimatePresence>
                {showPrompt && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="mt-12 flex flex-col items-center gap-5"
                  >
                    <p className="font-mono text-sm uppercase tracking-[0.24em] text-gray-200">
                      Let me show you around
                    </p>
                    <button
                      type="button"
                      onClick={continueToSite}
                      className="border border-cyan-300/70 bg-black/50 px-6 py-3 text-sm font-bold tracking-wide text-white shadow-[0_0_24px_rgba(0,240,255,0.18)] transition-colors hover:bg-cyan-300/10"
                    >
                      Continue to website
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
