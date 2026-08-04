import React from "react";
import { usePersonalInformation } from "@/hooks/use-personal-information";

export default function Footer() {
  const { data: info } = usePersonalInformation();

  return (
    <footer id="contact" className="py-20 border-t border-white/10 bg-black text-center">
      <h2 className="text-2xl font-bold text-white mb-8">INITIALIZE HANDSHAKE</h2>
      {info && (
        <div className="flex justify-center gap-8 mb-12">
          <a href={`mailto:${info.email}`} className="text-gray-400 hover:text-primary transition-colors font-mono text-sm underline underline-offset-4">EMAIL</a>
          <a href={info.linkedinUrl} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-primary transition-colors font-mono text-sm underline underline-offset-4">LINKEDIN</a>
          <a href={info.githubUrl} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-primary transition-colors font-mono text-sm underline underline-offset-4">GITHUB</a>
        </div>
      )}
      {!info && (
        <p data-testid="footer-config-status" className="mb-12 font-mono text-xs uppercase tracking-widest text-gray-500">
          Personal information is not configured.
        </p>
      )}
      <div className="text-gray-600 text-xs font-mono mb-6 space-y-1">
        <div>
          {info?.name || "Portfolio owner not configured"} © {new Date().getFullYear()}. ALL RIGHTS RESERVED.
        </div>
        <div className="flex justify-center gap-4 text-gray-700">
          <a href="/privacy" className="hover:text-gray-500 transition-colors">Privacy Policy</a>
          <span>•</span>
          <a href="/terms" className="hover:text-gray-500 transition-colors">Terms of Use</a>
        </div>
      </div>
    </footer>
  );
}
