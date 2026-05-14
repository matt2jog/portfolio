import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Speech } from "lucide-react";
import { IntroDither } from "./IntroDither";

export const INTRO_STORAGE_KEY = "__root_intro_seen_until";
export const INTRO_TTL_MS = 3 * 24 * 60 * 60 * 1000;

type IntroStage = "phrase" | "gap" | "name";
type TypingPhase =
  | "introPause"
  | "intro"
  | "namePause"
  | "name"
  | "promptPause"
  | "prompt"
  | "buttonPause"
  | "button";

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

const INTRO_TEXT = "My name is";
const NAME_TEXT = "Matthew Tujague";
const PROMPT_TEXT = "Let me show you around";
const TYPE_DELAY_MS = 92;
const SECTION_PAUSE_MS = 750;

declare global {
  interface Window {
    __FIRST_VISIT_INTRO_TEST_STATE?: {
      stage: IntroStage;
      typingPhase: TypingPhase;
      phrase?: string;
      showPrompt?: boolean;
      typedIntro?: string;
      typedName?: string;
      typedPrompt?: string;
    };
  }
}

export function FirstVisitIntro({ onComplete }: FirstVisitIntroProps) {
  const testState =
    typeof window !== "undefined" ? window.__FIRST_VISIT_INTRO_TEST_STATE : undefined;
  const phrase = useMemo(() => testState?.phrase ?? getTimePhrase(), [testState?.phrase]);
  const [stage, setStage] = useState<IntroStage>(testState?.stage ?? "phrase");
  const [showPrompt, setShowPrompt] = useState(testState?.showPrompt ?? false);
  const [typedIntro, setTypedIntro] = useState(testState?.typedIntro ?? "");
  const [typedName, setTypedName] = useState(testState?.typedName ?? "");
  const [typedPrompt, setTypedPrompt] = useState(testState?.typedPrompt ?? "");
  const [typingPhase, setTypingPhase] = useState<TypingPhase>(testState?.typingPhase ?? "introPause");

  useEffect(() => {
    if (testState) return;

    const gapTimer = window.setTimeout(() => setStage("gap"), 4000);
    const nameTimer = window.setTimeout(() => setStage("name"), 8000);

    return () => {
      window.clearTimeout(gapTimer);
      window.clearTimeout(nameTimer);
    };
  }, [testState]);

  useEffect(() => {
    if (testState) return;
    if (stage !== "name") return;

    setTypedIntro("");
    setTypedName("");
    setTypedPrompt("");
    setShowPrompt(false);
    setTypingPhase("introPause");

    const introStartTimer = window.setTimeout(() => setTypingPhase("intro"), SECTION_PAUSE_MS);
    return () => window.clearTimeout(introStartTimer);
  }, [stage, testState]);

  useEffect(() => {
    if (testState) return;
    if (typingPhase !== "intro") return;

    let index = 0;
    const introTimer = window.setInterval(() => {
      index += 1;
      setTypedIntro(INTRO_TEXT.slice(0, index));

      if (index >= INTRO_TEXT.length) {
        window.clearInterval(introTimer);
        window.setTimeout(() => setTypingPhase("namePause"), SECTION_PAUSE_MS);
      }
    }, TYPE_DELAY_MS);

    return () => window.clearInterval(introTimer);
  }, [testState, typingPhase]);

  useEffect(() => {
    if (testState) return;
    if (typingPhase !== "namePause") return;

    const nameStartTimer = window.setTimeout(() => setTypingPhase("name"), SECTION_PAUSE_MS);
    return () => window.clearTimeout(nameStartTimer);
  }, [testState, typingPhase]);

  useEffect(() => {
    if (testState) return;
    if (typingPhase !== "name") return;

    let index = 0;
    const nameTimer = window.setInterval(() => {
      index += 1;
      setTypedName(NAME_TEXT.slice(0, index));

      if (index >= NAME_TEXT.length) {
        window.clearInterval(nameTimer);
        setShowPrompt(true);
        setTypingPhase("promptPause");
      }
    }, TYPE_DELAY_MS);

    return () => window.clearInterval(nameTimer);
  }, [testState, typingPhase]);

  useEffect(() => {
    if (testState) return;
    if (typingPhase !== "promptPause") return;

    const promptStartTimer = window.setTimeout(() => setTypingPhase("prompt"), SECTION_PAUSE_MS);
    return () => window.clearTimeout(promptStartTimer);
  }, [testState, typingPhase]);

  useEffect(() => {
    if (testState) return;
    if (typingPhase !== "prompt") return;

    let index = 0;
    const promptTimer = window.setInterval(() => {
      index += 1;
      setTypedPrompt(PROMPT_TEXT.slice(0, index));

      if (index >= PROMPT_TEXT.length) {
        window.clearInterval(promptTimer);
        setTypingPhase("buttonPause");
      }
    }, TYPE_DELAY_MS);

    return () => window.clearInterval(promptTimer);
  }, [testState, typingPhase]);

  useEffect(() => {
    if (testState) return;
    if (typingPhase !== "buttonPause") return;

    const buttonTimer = window.setTimeout(() => setTypingPhase("button"), SECTION_PAUSE_MS);
    return () => window.clearTimeout(buttonTimer);
  }, [testState, typingPhase]);

  const speakName = () => {
    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("Matthew too zsaawg");
    utterance.rate = 0.78;
    utterance.pitch = 0.96;
    window.speechSynthesis.speak(utterance);
  };

  const continueToSite = () => {
    storeIntroVisit();
    onComplete();
  };

  const showIntroCursor = typingPhase === "introPause" || typingPhase === "intro";
  const showNameCursor = typingPhase === "namePause" || typingPhase === "name";
  const showPromptCursor = typingPhase === "promptPause" || typingPhase === "prompt";
  const showButtonCursor = typingPhase === "buttonPause";
  const showPhonetic = !["introPause", "intro", "namePause", "name"].includes(typingPhase);

  return (
    <div
      data-testid="first-visit-intro"
      data-intro-stage={stage}
      data-typing-phase={typingPhase}
      className="fixed inset-0 z-[100] overflow-hidden bg-black text-white"
    >
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
        <AnimatePresence mode="wait">
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
          ) : stage === "name" ? (
            <motion.div
              key="name"
              className="flex flex-col items-center"
            >
              <p className="text-balance text-3xl font-black leading-tight tracking-normal text-white sm:text-5xl">
                {typedIntro}
                {showIntroCursor && (
                  <span className="ml-1 inline-block h-[0.9em] w-[0.08em] translate-y-[0.1em] animate-pulse bg-cyan-200" />
                )}
              </p>

              <div className="mt-2 flex max-w-5xl flex-col items-center justify-center">
                <h1 className="text-balance text-4xl font-black leading-tight tracking-normal text-white sm:text-6xl">
                  {typedName}
                  {showNameCursor && (
                    <span className="ml-1 inline-block h-[0.9em] w-[0.08em] translate-y-[0.1em] animate-pulse bg-cyan-200" />
                  )}
                </h1>

                {showPhonetic && (
                  <div className="relative mt-2 w-screen text-center font-mono text-[clamp(0.8rem,2.8vw,1rem)] text-cyan-200/90">
                    <span aria-label="phonetic pronunciation">(too-zsaawg)</span>
                    <button
                      type="button"
                      onClick={speakName}
                      aria-label="Play pronunciation"
                      className="absolute left-[calc(50%+3.8rem)] top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center text-cyan-100 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 sm:left-[calc(50%+4.25rem)]"
                    >
                      <Speech className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>

              <AnimatePresence>
                {showPrompt && (
                  <motion.div className="mt-12 flex flex-col items-center gap-5">
                    <p className="font-mono text-sm uppercase tracking-[0.24em] text-gray-200">
                      {typedPrompt}
                      {showPromptCursor && (
                        <span className="ml-1 inline-block h-[1em] w-[0.12em] translate-y-[0.15em] animate-pulse bg-cyan-200" />
                      )}
                    </p>
                    {showButtonCursor && (
                      <span className="inline-block h-11 w-[0.12em] animate-pulse bg-cyan-200" />
                    )}
                    {typingPhase === "button" && (
                      <button
                        type="button"
                        onClick={continueToSite}
                        className="border border-cyan-300/70 bg-black/50 px-6 py-3 text-sm font-bold tracking-wide text-white shadow-[0_0_24px_rgba(0,240,255,0.18)] transition-colors hover:bg-cyan-300/10"
                      >
                        Continue to website
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
