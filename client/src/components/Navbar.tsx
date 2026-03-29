import * as React from "react";
import { Link } from "wouter";
import { Menu, X } from "lucide-react";

export function Navbar() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768 && open) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 sm:px-6 md:px-12 py-3 bg-black/70 border-b border-white/5">
      <Link href="/" className="font-display font-bold text-lg sm:text-xl md:text-2xl tracking-tighter text-white flex-shrink-0">
        2jog<span className="text-primary">.dev</span>
      </Link>

      {/* Desktop links */}
      <div className="hidden md:flex items-center gap-2 sm:gap-4 font-mono text-[10px] md:text-sm tracking-widest text-gray-400">
        <Link href="/" className="hover:text-primary transition-colors px-2">2jog.home</Link>
        <Link href="/tree" className="hover:text-primary transition-colors px-2">2jog.linktree</Link>
        <Link href="/portfolio" className="hover:text-primary transition-colors px-2">2jog.portfolio</Link>
        <Link href="/about" className="hover:text-primary transition-colors px-2">2jog.about</Link>
        <Link href="/activity" className="hover:text-primary transition-colors px-2">2jog.activity</Link>
      </div>

      {/* Mobile hamburger */}
      <div className="md:hidden ml-auto flex items-center">
        <button
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="p-2 rounded-md border border-white/6 bg-black/40 text-gray-300 hover:bg-black/30 transition"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu panel */}
      <div
        className={`absolute top-full right-4 mt-2 w-[min(92vw,320px)] bg-card/95 border border-white/6 rounded-lg shadow-lg p-3 md:hidden transform origin-top-right ${open ? "scale-100 opacity-100" : "scale-95 opacity-0 pointer-events-none"}`}
        style={{ transition: "opacity .18s ease, transform .18s ease" }}
      >
        <nav className="flex flex-col gap-2">
          <Link href="/" className="px-3 py-2 rounded hover:bg-white/3 transition-colors" onClick={() => setOpen(false)}>2jog.home</Link>
          <Link href="/tree" className="px-3 py-2 rounded hover:bg-white/3 transition-colors" onClick={() => setOpen(false)}>2jog.linktree</Link>
          <Link href="/portfolio" className="px-3 py-2 rounded hover:bg-white/3 transition-colors" onClick={() => setOpen(false)}>2jog.portfolio</Link>
          <Link href="/about" className="px-3 py-2 rounded hover:bg-white/3 transition-colors" onClick={() => setOpen(false)}>2jog.about</Link>
          <Link href="/activity" className="px-3 py-2 rounded hover:bg-white/3 transition-colors" onClick={() => setOpen(false)}>2jog.activity</Link>
        </nav>
      </div>
    </nav>
  );
}
