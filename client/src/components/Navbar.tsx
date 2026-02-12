import { motion } from "framer-motion";
import { Link } from "wouter";

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-6 py-4 md:px-12 bg-black/70 border-b border-white/5">
      <a href="#" className="font-display font-bold text-xl tracking-tighter text-white">
        2jog<span className="text-primary">.dev</span>
      </a>

      <div className="flex items-center gap-4 sm:gap-6 font-mono text-[10px] sm:text-xs tracking-widest text-gray-400">
        <Link href="/tree" className="hover:text-primary transition-colors">2jog.tree</Link>
        <Link href="/activity" className="hover:text-primary transition-colors">2jog.activity</Link>
        <Link href="/" className="hover:text-primary transition-colors">2jog.portfolio</Link>
        <Link href="/about" className="hover:text-primary transition-colors">2jog.about</Link>
      </div>
    </nav>
  );
}
