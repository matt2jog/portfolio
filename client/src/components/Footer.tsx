import React from "react";

export default function Footer() {
  return (
    <footer id="contact" className="py-20 border-t border-white/10 bg-black text-center">
      <h2 className="text-2xl font-display font-bold text-white mb-8">INITIALIZE HANDSHAKE</h2>
      <div className="flex justify-center gap-8 mb-12">
        <a href="mailto:matthew@2jog.dev" className="text-gray-400 hover:text-primary transition-colors font-mono text-sm underline underline-offset-4">EMAIL</a>
        <a href="https://linkedin.com/in/matthewtujague" target="_blank" rel="noreferrer" className="text-gray-400 hover:text-primary transition-colors font-mono text-sm underline underline-offset-4">LINKEDIN</a>
        <a href="https://github.com/binimal101" target="_blank" rel="noreferrer" className="text-gray-400 hover:text-primary transition-colors font-mono text-sm underline underline-offset-4">GITHUB</a>
      </div>
      <div className="text-gray-600 text-xs font-mono">
        Matthew Tujague © {new Date().getFullYear()}. ALL RIGHTS RESERVED.
      </div>
    </footer>
  );
}
