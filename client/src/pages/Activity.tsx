import { Navbar } from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function Activity() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-24 relative">
        <h1 className="text-4xl font-display font-bold mb-4 inline-flex items-center gap-3">
          2jog.activity
          <span className="px-2 py-1 text-xs font-mono rounded bg-primary/10 text-primary border border-primary/20">WIP</span>
        </h1>
        <p className="text-gray-400 mb-6">Recent commits, deployments, and project activity stream. (placeholder)</p>
        <div className="absolute right-6 top-6 text-[96px] text-white/6 font-display pointer-events-none select-none">WIP</div>

        <div className="space-y-4">
          <div className="p-4 bg-card border border-white/5 rounded-md">• Deployed "Nebula Stream" — 12m ago</div>
          <div className="p-4 bg-card border border-white/5 rounded-md">• Merged PR: add-business-card — 2d ago</div>
          <div className="p-4 bg-card border border-white/5 rounded-md">• New skill added: Rust — 5d ago</div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
