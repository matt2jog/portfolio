import { motion } from "framer-motion";
import { Link } from "wouter";

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-6 py-4 md:px-12 backdrop-blur-xs bg-black/50 border-b border-white/5">
      <div className="font-display font-bold text-xl tracking-tighter text-white">
        SYSTEM<span className="text-primary">.ENG</span>
      </div>

      <div className="hidden md:flex items-center gap-8 font-mono text-xs tracking-widest text-gray-400">
        <a href="#projects" className="hover:text-primary transition-colors hover:underline decoration-1 underline-offset-4">01_PROJECTS</a>
        <a href="#about" className="hover:text-primary transition-colors hover:underline decoration-1 underline-offset-4">02_ABOUT</a>
        <a href="#contact" className="hover:text-primary transition-colors hover:underline decoration-1 underline-offset-4">03_CONTACT</a>
      </div>
    </nav>
  );
}
